use std::fmt;
use std::time::Duration;

use serde_json::{Value, json};

use crate::backend::{Backend, Lease};
use crate::context::{memory_correction, relevant_preference, select_history};

#[derive(Debug, Clone)]
pub struct StoreError {
    pub operation: String,
    pub status: u16,
}

impl fmt::Display for StoreError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "Kael persistence operation {} failed with HTTP {}.", self.operation, self.status)
    }
}

impl std::error::Error for StoreError {}

fn failure(operation: &str, status: u16) -> StoreError {
    StoreError { operation: operation.to_owned(), status }
}

#[derive(Debug, Clone, PartialEq)]
pub struct Outcome {
    pub status: String,
    pub text: String,
    pub complete: bool,
    pub provider: Option<String>,
    pub model: Option<String>,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub steps: u32,
    pub error: Option<String>,
}

impl Outcome {
    pub fn failed(code: &str) -> Self {
        Self {
            status: if code == "cancelled" { "cancelled" } else { "failed" }.to_owned(),
            text: String::new(),
            complete: false,
            provider: None,
            model: None,
            input_tokens: 0,
            output_tokens: 0,
            steps: 0,
            error: Some(code.to_owned()),
        }
    }
}

#[derive(Clone)]
pub struct Store {
    backend: Backend,
    actor: String,
    lease: Option<Lease>,
}

impl Store {
    pub fn new(backend: Backend, actor: &str, lease: Option<Lease>) -> Self {
        Self { backend, actor: actor.to_owned(), lease }
    }

    pub fn call(&self, operation: &str, mut fields: Value) -> Result<Value, StoreError> {
        if let Value::Object(map) = &mut fields {
            map.insert("p_actor".into(), json!(self.actor));
        }
        let reply = self
            .backend
            .service_rpc(operation, &fields, self.lease.as_ref())
            .map_err(|_| failure(operation, 0))?;
        if reply.ok() { Ok(reply.body) } else { Err(failure(operation, reply.status)) }
    }

    pub fn durable_start_run(
        &self,
        request_id: &str,
        conversation_id: Option<&str>,
        mode: &str,
        user_text: &str,
        holder: &str,
        lease_seconds: u32,
    ) -> Result<Value, StoreError> {
        self.call(
            "kael_durable_start_run",
            json!({
                "p_request_id": request_id, "p_conversation_id": conversation_id, "p_mode": mode,
                "p_user_text": user_text, "p_holder": holder, "p_lease_seconds": lease_seconds,
            }),
        )
    }

    pub fn durable_claim(&self, run_id: &str, holder: &str, lease_seconds: u32) -> Result<Value, StoreError> {
        self.call(
            "kael_durable_claim",
            json!({"p_run_id": run_id, "p_holder": holder, "p_lease_seconds": lease_seconds}),
        )
    }

    pub fn heartbeat(&self, run_id: &str, lease: &Lease, lease_seconds: u32) -> Result<bool, StoreError> {
        let value = self.call(
            "kael_durable_heartbeat",
            json!({"p_run_id": run_id, "p_holder": lease.holder, "p_epoch": lease.epoch, "p_lease_seconds": lease_seconds}),
        )?;
        Ok(value == Value::Bool(true))
    }

    pub fn release(&self, run_id: &str, lease: &Lease) -> Result<bool, StoreError> {
        let value = self.call(
            "kael_durable_release",
            json!({"p_run_id": run_id, "p_holder": lease.holder, "p_epoch": lease.epoch}),
        )?;
        Ok(value == Value::Bool(true))
    }

    pub fn finish_run(&self, run_id: &str, outcome: &Outcome) -> Result<(), StoreError> {
        let finished = self.call(
            "kael_finish_run",
            json!({
                "p_run_id": run_id, "p_status": outcome.status, "p_text": outcome.text, "p_complete": outcome.complete,
                "p_provider": outcome.provider, "p_model": outcome.model, "p_input_tokens": outcome.input_tokens,
                "p_output_tokens": outcome.output_tokens, "p_steps": outcome.steps, "p_error": outcome.error,
            }),
        )?;
        if finished == Value::Bool(true) { Ok(()) } else { Err(failure("kael_finish_run", 409)) }
    }
}

pub struct UserSession<'a> {
    pub backend: &'a Backend,
    pub token: &'a str,
}

impl UserSession<'_> {
    const TIMEOUT: Duration = Duration::from_secs(10);

    pub fn get(&self, path: &str) -> Result<Value, StoreError> {
        let reply = self
            .backend
            .user(self.token, "GET", path, None, Self::TIMEOUT, None)
            .map_err(|_| failure(path, 0))?;
        if reply.ok() { Ok(reply.body) } else { Err(failure(path, reply.status)) }
    }

    pub fn rpc(&self, name: &str, body: &Value) -> Result<Value, StoreError> {
        let reply = self
            .backend
            .user(self.token, "POST", &format!("rpc/{name}"), Some(body), Self::TIMEOUT, None)
            .map_err(|_| failure(name, 0))?;
        if reply.ok() { Ok(reply.body) } else { Err(failure(name, reply.status)) }
    }

    pub fn capabilities(&self) -> Result<Vec<String>, StoreError> {
        let value = self.rpc("kael_actor_capabilities", &json!({}))?;
        Ok(["customer", "worker"]
            .into_iter()
            .filter(|name| value[*name] == Value::Bool(true))
            .map(str::to_owned)
            .collect())
    }

    pub fn load_context(&self, conversation_id: &str, mode: &str, limit: usize) -> Result<(Vec<Value>, Vec<Value>), StoreError> {
        let rows = self.get(&format!(
            "kael_messages?select=seq,role,content,status&conversation_id=eq.{conversation_id}&order=seq.desc&limit={limit}"
        ))?;
        let mut history = rows.as_array().cloned().unwrap_or_default();
        history.reverse();
        let tasks = self.rpc("kael_context_tasks", &json!({"p_conversation_id": conversation_id, "p_mode": mode}))?;
        Ok((history, tasks.as_array().cloned().unwrap_or_default()))
    }

    pub fn load_personal(
        &self,
        conversation_id: &str,
        mode: &str,
        history: &[Value],
        max_history_chars: usize,
        degraded: &mut Vec<&'static str>,
    ) -> Value {
        let selected = select_history(history, max_history_chars);
        let before = selected.first().and_then(|row| row["seq"].as_i64()).unwrap_or(1);
        let query = history
            .last()
            .filter(|row| row["role"] == "user")
            .and_then(|row| row["content"].as_str())
            .unwrap_or("")
            .to_owned();
        let correction = memory_correction(&query);
        let mut memory_change = correction.as_ref().map(|_| "not_saved");
        let summary = if before > 1 {
            self.rpc(
                "kael_context_summary",
                &json!({"p_conversation_id": conversation_id, "p_mode": mode, "p_before_seq": before}),
            )
            .unwrap_or_else(|_| {
                degraded.push("summary");
                Value::Null
            })
        } else {
            Value::Null
        };
        if let Some(correction) = correction {
            let saved = self
                .rpc(
                    "kael_manage_memory",
                    &json!({
                        "p_mode": mode,
                        "p_action": if correction.previous.is_some() { "correct" } else { "remember" },
                        "p_preference": correction.preference, "p_value": correction.value, "p_previous": correction.previous,
                    }),
                )
                .unwrap_or_else(|_| {
                    degraded.push("preference_update");
                    Value::Bool(false)
                });
            if saved == Value::Bool(true) {
                memory_change = Some("saved");
            }
        }
        let preferences = self
            .get(&format!("kael_memory_preferences?select=preference,value,updated_at,source&mode=eq.{mode}&order=preference"))
            .unwrap_or_else(|_| {
                degraded.push("preferences");
                json!([])
            });
        let preferences: Vec<Value> = preferences
            .as_array()
            .cloned()
            .unwrap_or_default()
            .into_iter()
            .filter(|row| relevant_preference(row["preference"].as_str().unwrap_or(""), &query))
            .collect();
        let usable_summary = summary["version"] == 1 && summary["items"].as_array().is_some_and(|items| !items.is_empty());
        let mut personal = json!({"summary": if usable_summary { summary } else { Value::Null }, "preferences": preferences});
        if let Some(change) = memory_change {
            personal["memoryChange"] = json!(change);
        }
        personal
    }
}
