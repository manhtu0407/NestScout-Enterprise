use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};
use std::time::Duration;

use serde_json::{Value, json};

use crate::backend::{Backend, Reply};
use crate::config::Config;
use crate::events::EventLog;
use crate::policy::{Actor, Tool};
use crate::store::{Store, StoreError};
use crate::tasks::task_view;

#[derive(Debug, Clone)]
pub struct Execution {
    pub outcome: String,
    pub content: Value,
    pub task_id: Option<String>,
}

pub fn succeeded(content: Value, task_id: Option<String>) -> Execution {
    Execution { outcome: "succeeded".into(), content, task_id }
}

pub fn failed_with(error: &str, task_id: Option<String>, outcome: &str) -> Execution {
    Execution { outcome: outcome.into(), content: json!({"error": error}), task_id }
}

pub fn failed(error: &str, task_id: Option<String>) -> Execution {
    failed_with(error, task_id, "failed")
}

#[derive(Debug)]
pub enum Fail {
    Unavailable,
    Http(u16),
    Other,
}

pub struct RunContext {
    pub config: Arc<Config>,
    pub backend: Backend,
    pub store: Store,
    pub catalog: Vec<Tool>,
    pub offered: Vec<Tool>,
    pub actor: Actor,
    pub run_id: String,
    pub conversation_id: String,
    pub log: Arc<EventLog>,
    pub token: Mutex<Option<String>>,
    pub tasks: Mutex<HashMap<String, Value>>,
    pub executed: Mutex<HashMap<String, Execution>>,
    pub tool_calls: AtomicU32,
    pub model_calls: AtomicU32,
    pub text_chars: AtomicUsize,
    pub overflow: AtomicBool,
    pub budget_hit: AtomicBool,
    pub lease_lost: AtomicBool,
    pub input_tokens: AtomicUsize,
    pub output_tokens: AtomicUsize,
    pub served: Mutex<Option<(String, String)>>,
}

pub fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(PoisonError::into_inner)
}

impl RunContext {
    pub fn emit(&self, body: Value) {
        if let Err(error) = self.log.append(body) {
            eprintln!("{}", json!({"event": "kael_event_log_failed", "run_id": self.run_id, "error": error.to_string()}));
        }
    }

    pub fn set_token(&self, token: Option<String>) {
        *lock(&self.token) = token;
    }

    pub fn note_store_error(&self, error: &StoreError) {
        if error.status == 403 {
            self.lease_lost.store(true, Ordering::SeqCst);
        }
    }

    pub fn remember_task(&self, task: &Value) {
        if let Some(id) = task["id"].as_str() {
            lock(&self.tasks).insert(id.to_owned(), task.clone());
        }
        self.emit(json!({"type": "task_updated", "task": task_view(task)}));
    }

    pub fn known_task(&self, id: &Value) -> Option<Value> {
        id.as_str().and_then(|key| lock(&self.tasks).get(key).cloned())
    }

    pub fn user_reply(&self, method: &str, path: &str, body: Option<&Value>) -> Result<Reply, Fail> {
        let token = lock(&self.token).clone().ok_or(Fail::Unavailable)?;
        self.backend
            .user(&token, method, path, body, Duration::from_secs(10), None)
            .map_err(|_| Fail::Other)
    }

    pub fn user_json(&self, method: &str, path: &str, body: Option<&Value>) -> Result<Value, Fail> {
        let reply = self.user_reply(method, path, body)?;
        if reply.ok() { Ok(reply.body) } else { Err(Fail::Http(reply.status)) }
    }

    pub fn get(&self, path: &str) -> Result<Value, Fail> {
        self.user_json("GET", path, None)
    }

    pub fn post(&self, path: &str, body: &Value) -> Result<Value, Fail> {
        self.user_json("POST", path, Some(body))
    }
}

pub fn text_of(value: &Value) -> String {
    match value {
        Value::String(text) => text.clone(),
        Value::Null => "null".to_owned(),
        other => other.to_string(),
    }
}
