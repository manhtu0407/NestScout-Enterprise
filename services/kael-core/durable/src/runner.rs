use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use pi_durable::ai::models::Models;
use pi_durable::cancel::CancelToken;
use pi_durable::errors::Error as PiError;
use pi_durable::harness::agent::{AgentChange, Change};
use pi_durable::harness::harness::{Conversation, Harness};
use pi_durable::harness::registry::Registry;
use pi_durable::harness::submissions::{SubmissionDraft, WhenBusy};
use pi_durable::harness::types::{
    ConversationCreateOptions, Extension, HarnessOptions, ModelRef, Replay, ToolExecutionApi, ToolExecutionResult, ToolRegistration,
};
use pi_durable::ids::ConversationId;
use pi_durable::storage::sqlite::SqliteStorage;
use pi_durable::types::{ConversationOwnership, EntryQuery, ScanOrder};
use serde_json::{Value, json};

use crate::approval::{Resolution, failure_message, is_retryable, resolve_approval};
use crate::backend::{Backend, Lease};
use crate::config::Config;
use crate::context::{build_system_prompt, build_user_input};
use crate::events::EventLog;
use crate::models::{RunModels, primary_ref};
use crate::policy::{Actor, Class, Decision, Tool, evaluate_call, harness_schema, registry, select_tools};
use crate::request::{Action, TurnRequest, user_text_for};
use crate::runctx::{Execution, RunContext, lock};
use crate::store::{Outcome, Store, UserSession};
use crate::tools::execute_tool;
use crate::util::{fingerprint, now_ms, vietnam_date};

const DENIED_NOTICE: &str = "Only this operation was refused. Keep helping with everything else the user asked, without this data or action.";

pub struct LiveRun {
    pub ctx: Arc<RunContext>,
    pub cancel: CancelToken,
    pub stop: AtomicBool,
    pub lease: Lease,
}

#[derive(Clone)]
pub struct Identity {
    pub owner: String,
    pub run_id: String,
    pub conversation_id: String,
    pub mode: String,
    pub capabilities: HashSet<String>,
}

pub enum Admission {
    Stream { run_id: String, log: Arc<EventLog>, replayed: bool },
    Reject { status: u16, code: &'static str },
    LegacyRun,
}

pub struct Runtime {
    pub config: Arc<Config>,
    pub backend: Backend,
    pub models: Arc<dyn Models + Send + Sync>,
    pub catalog: Vec<Tool>,
    pub live: Mutex<HashMap<String, Arc<LiveRun>>>,
}

fn meta_path(config: &Config, run_id: &str) -> PathBuf {
    config.meta_dir().join(format!("{run_id}.json"))
}

pub fn journal_path(config: &Config, run_id: &str) -> PathBuf {
    config.journal_dir().join(format!("{run_id}.sqlite"))
}

fn write_meta(config: &Config, run_id: &str, meta: &Value) -> std::io::Result<()> {
    fs::create_dir_all(config.meta_dir())?;
    let target = meta_path(config, run_id);
    let staging = target.with_extension("json.tmp");
    fs::write(&staging, meta.to_string())?;
    fs::rename(staging, target)
}

pub fn read_meta(config: &Config, run_id: &str) -> Option<Value> {
    serde_json::from_str(&fs::read_to_string(meta_path(config, run_id)).ok()?).ok()
}

fn pi_error(error: impl std::fmt::Debug) -> String {
    format!("{error:?}")
}

fn tool_registrations(ctx: &Arc<RunContext>) -> Result<Vec<ToolRegistration>, String> {
    ctx.offered
        .iter()
        .map(|tool| {
            let definition = serde_json::from_value(json!({"name": tool.id, "description": tool.description, "parameters": harness_schema(&tool.schema)}))
                .map_err(pi_error)?;
            let replay = if tool.class == Class::Read && tool.id != "ask_user_choice" { Replay::Safe } else { Replay::Unsafe };
            let shared = Arc::clone(ctx);
            let selected = tool.clone();
            Ok(ToolRegistration {
                tool: definition,
                replay: Some(replay),
                execution_mode: None,
                output_limits: None,
                prepare_arguments: None,
                execute: Arc::new(move |arguments: Value, api: &dyn ToolExecutionApi, _cancel: &CancelToken| {
                    let execution = run_tool(&shared, &selected, &arguments, api.call_id());
                    let is_error = !matches!(execution.outcome.as_str(), "succeeded" | "approval_required");
                    let mut content = json!({"outcome": execution.outcome});
                    if let (Value::Object(target), Value::Object(extra)) = (&mut content, execution.content) {
                        target.extend(extra);
                    }
                    Ok(ToolExecutionResult {
                        content: Some(vec![serde_json::from_value(json!({"type": "text", "text": content.to_string()}))?]),
                        is_error: Some(is_error),
                        ..Default::default()
                    })
                }),
            })
        })
        .collect()
}

fn run_tool(ctx: &RunContext, tool: &Tool, args: &Value, call_id: &str) -> Execution {
    let decision = evaluate_call(&ctx.catalog, tool.id, args, &ctx.offered, &ctx.actor, &ctx.config, ctx.tool_calls.load(Ordering::SeqCst));
    let call: String = call_id.chars().take(128).collect();
    ctx.emit(json!({"type": "tool_started", "call_id": call_id, "tool": tool.id, "label": tool.label}));
    let key = fingerprint(&json!({"tool": tool.id, "args": args}));
    let execution = match decision {
        Decision::Deny(reason) => Execution {
            outcome: "denied".into(),
            content: json!({"error": reason, "operation": tool.id, "notice": DENIED_NOTICE}),
            task_id: None,
        },
        Decision::Execute | Decision::Approval => {
            let previous = lock(&ctx.executed).get(&key).cloned();
            match previous {
                Some(mut previous) => {
                    previous.content["duplicate_call"] = json!(true);
                    previous
                }
                None => {
                    ctx.tool_calls.fetch_add(1, Ordering::SeqCst);
                    let execution = execute_tool(ctx, tool, args);
                    lock(&ctx.executed).insert(key.clone(), execution.clone());
                    execution
                }
            }
        }
    };
    let error = execution.content["error"].as_str().map(|text| text.chars().take(120).collect::<String>());
    if let Err(failure) = ctx.store.call(
        "kael_record_tool",
        json!({
            "p_run_id": ctx.run_id, "p_call_id": call, "p_task_id": execution.task_id, "p_tool": tool.id,
            "p_side_effect": tool.side_effect, "p_outcome": execution.outcome, "p_fingerprint": key, "p_error": error,
        }),
    ) {
        ctx.note_store_error(&failure);
    }
    ctx.emit(json!({"type": "tool_completed", "call_id": call_id, "tool": tool.id, "outcome": execution.outcome, "label": tool.label}));
    execution
}

fn assistant_summary(entries: &Value) -> (String, Option<String>, Option<String>) {
    let mut texts: Vec<String> = Vec::new();
    let mut last_stop = None;
    let mut last_error = None;
    for entry in entries.as_array().into_iter().flatten() {
        for message in entry["model"].as_array().into_iter().flatten() {
            if message["role"] != "assistant" {
                continue;
            }
            let text: String = message["content"]
                .as_array()
                .into_iter()
                .flatten()
                .filter(|block| block["type"] == "text")
                .filter_map(|block| block["text"].as_str())
                .collect();
            if !text.trim().is_empty() {
                texts.push(text);
            }
            last_stop = message["stopReason"].as_str().map(str::to_owned);
            last_error = message["errorMessage"].as_str().map(str::to_owned);
        }
    }
    (texts.join("\n\n"), last_stop, last_error)
}

fn classify_provider_error(message: &str, emitted: bool) -> &'static str {
    if emitted {
        return "incomplete_output";
    }
    let lowered = message.to_lowercase();
    if ["401", "403", "402", "400", "credential", "unauthorized", "billing"].iter().any(|marker| lowered.contains(marker)) {
        "provider_unavailable"
    } else {
        "provider_error"
    }
}

impl Runtime {
    pub fn new(config: Arc<Config>, models: Arc<dyn Models + Send + Sync>) -> Arc<Self> {
        Arc::new(Self {
            backend: Backend::new(&config),
            config,
            models,
            catalog: registry(),
            live: Mutex::new(HashMap::new()),
        })
    }

    fn lease_store(&self, owner: &str, lease: &Lease) -> Store {
        Store::new(self.backend.clone(), owner, Some(lease.clone()))
    }

    fn context(&self, identity: &Identity, lease: &Lease, log: Arc<EventLog>, token: Option<String>) -> Arc<RunContext> {
        let actor = Actor { user_id: identity.owner.clone(), capabilities: identity.capabilities.clone(), mode: identity.mode.clone() };
        let offered = select_tools(&self.catalog, &actor, &self.config);
        Arc::new(RunContext {
            config: Arc::clone(&self.config),
            backend: self.backend.clone(),
            store: self.lease_store(&identity.owner, lease),
            catalog: self.catalog.clone(),
            offered,
            actor,
            run_id: identity.run_id.clone(),
            conversation_id: identity.conversation_id.clone(),
            log,
            token: Mutex::new(token),
            tasks: Mutex::new(HashMap::new()),
            executed: Mutex::new(HashMap::new()),
            tool_calls: AtomicU32::new(0),
            model_calls: AtomicU32::new(0),
            text_chars: AtomicUsize::new(0),
            overflow: AtomicBool::new(false),
            budget_hit: AtomicBool::new(false),
            lease_lost: AtomicBool::new(false),
            input_tokens: AtomicUsize::new(0),
            output_tokens: AtomicUsize::new(0),
            served: Mutex::new(None),
        })
    }

    pub fn admit(self: &Arc<Self>, token: &str, user_id: &str, turn: &TurnRequest) -> Admission {
        let session = UserSession { backend: &self.backend, token };
        let capabilities = match session.capabilities() {
            Ok(capabilities) => capabilities,
            Err(_) => return Admission::Reject { status: 503, code: "internal" },
        };
        if !capabilities.iter().any(|name| name == "customer") {
            return Admission::Reject { status: 401, code: "unauthenticated" };
        }
        let admission_store = Store::new(self.backend.clone(), user_id, None);
        let started = match admission_store.durable_start_run(
            &turn.request_id,
            turn.conversation_id.as_deref(),
            &turn.mode,
            &user_text_for(&turn.action),
            &self.config.holder,
            self.config.lease_seconds,
        ) {
            Ok(started) => started,
            Err(_) => return Admission::Reject { status: 503, code: "internal" },
        };
        match started["status"].as_str().unwrap_or("invalid") {
            "rate_limited" => return Admission::Reject { status: 429, code: "rate_limited" },
            "busy" => return Admission::Reject { status: 409, code: "busy" },
            "consent_required" => return Admission::Reject { status: 403, code: "consent_required" },
            "started" | "replay" => {}
            _ => return Admission::Reject { status: 400, code: "invalid_request" },
        }
        if started["runtime"] == "legacy" {
            return Admission::LegacyRun;
        }
        let run_id = started["run_id"].as_str().unwrap_or_default().to_owned();
        let conversation_id = started["conversation_id"].as_str().unwrap_or_default().to_owned();
        let identity = Identity {
            owner: user_id.to_owned(),
            run_id: run_id.clone(),
            conversation_id: conversation_id.clone(),
            mode: turn.mode.clone(),
            capabilities: capabilities.into_iter().collect(),
        };
        if started["status"] == "started" {
            let lease = Lease { holder: self.config.holder.clone(), epoch: started["epoch"].as_i64().unwrap_or(1) };
            let log = match EventLog::open(&self.config.event_dir(), &run_id) {
                Ok(log) => Arc::new(log),
                Err(_) => return Admission::Reject { status: 503, code: "internal" },
            };
            let kind = if matches!(turn.action, Action::Message(_)) { "message" } else { "approval" };
            let meta = json!({
                "run_id": run_id, "owner_id": user_id, "conversation_id": conversation_id, "mode": turn.mode,
                "capabilities": identity.capabilities.iter().collect::<Vec<_>>(), "request_id": turn.request_id, "kind": kind,
                "journal_conversation_id": Value::Null, "started_ms": now_ms(),
            });
            if write_meta(&self.config, &run_id, &meta).is_err() {
                return Admission::Reject { status: 503, code: "internal" };
            }
            let ctx = self.context(&identity, &lease, Arc::clone(&log), Some(token.to_owned()));
            ctx.emit(json!({"type": "run_started", "conversation_id": conversation_id, "request_id": turn.request_id, "replayed": false}));
            let live = self.register(ctx, lease);
            let runtime = Arc::clone(self);
            let action = turn.action.clone();
            thread::spawn(move || runtime.drive(&live, Some(action)));
            return Admission::Stream { run_id, log, replayed: false };
        }
        self.replay(token, &started, &identity, turn)
    }

    fn replay(self: &Arc<Self>, token: &str, started: &Value, identity: &Identity, turn: &TurnRequest) -> Admission {
        let run_id = identity.run_id.as_str();
        let user_id = identity.owner.as_str();
        let conversation_id = identity.conversation_id.as_str();
        if let Some(live) = lock(&self.live).get(run_id).cloned() {
            if live.ctx.actor.user_id != user_id {
                return Admission::Reject { status: 400, code: "invalid_request" };
            }
            live.ctx.set_token(Some(token.to_owned()));
            return Admission::Stream { run_id: run_id.to_owned(), log: Arc::clone(&live.ctx.log), replayed: true };
        }
        if started["run_status"] == "running" {
            if started["lease_live"] == Value::Bool(true) {
                return Admission::Reject { status: 409, code: "busy" };
            }
            let store = Store::new(self.backend.clone(), user_id, None);
            let claim = match store.durable_claim(run_id, &self.config.holder, self.config.lease_seconds) {
                Ok(claim) => claim,
                Err(_) => return Admission::Reject { status: 503, code: "internal" },
            };
            return match claim["status"].as_str() {
                Some("claimed") => {
                    let lease = Lease { holder: self.config.holder.clone(), epoch: claim["epoch"].as_i64().unwrap_or(1) };
                    match self.adopt_claimed(identity, lease, Some(token.to_owned())) {
                        Some(log) => Admission::Stream { run_id: run_id.to_owned(), log, replayed: true },
                        None => Admission::Reject { status: 503, code: "internal" },
                    }
                }
                Some("held") => Admission::Reject { status: 409, code: "busy" },
                _ => self.terminal_replay(started, run_id, conversation_id, &turn.request_id),
            };
        }
        self.terminal_replay(started, run_id, conversation_id, &turn.request_id)
    }

    fn terminal_replay(&self, started: &Value, run_id: &str, conversation_id: &str, request_id: &str) -> Admission {
        if let Ok(log) = EventLog::open(&self.config.event_dir(), run_id)
            && log.closed()
        {
            return Admission::Stream { run_id: run_id.to_owned(), log: Arc::new(log), replayed: true };
        }
        let log = EventLog::memory(run_id, Vec::new());
        let _ = log.append(json!({"type": "run_started", "conversation_id": conversation_id, "request_id": request_id, "replayed": true}));
        match (started["run_status"].as_str(), started["assistant_text"].as_str()) {
            (Some("completed"), Some(text)) => {
                let _ = log.append(json!({"type": "run_completed", "text": text}));
            }
            _ => {
                let _ = log.append(json!({
                    "type": "run_failed", "code": "incomplete_output", "message": failure_message("incomplete_output"), "retryable": false,
                }));
            }
        }
        Admission::Stream { run_id: run_id.to_owned(), log: Arc::new(log), replayed: true }
    }

    pub fn adopt_claimed(self: &Arc<Self>, identity: &Identity, lease: Lease, token: Option<String>) -> Option<Arc<EventLog>> {
        let run_id = identity.run_id.as_str();
        let meta = read_meta(&self.config, run_id);
        let kind = meta.as_ref().and_then(|meta| meta["kind"].as_str()).unwrap_or("").to_owned();
        let mut identity = identity.clone();
        if identity.capabilities.is_empty() {
            identity.capabilities = meta
                .as_ref()
                .and_then(|meta| meta["capabilities"].as_array())
                .map(|rows| rows.iter().filter_map(|row| row.as_str().map(str::to_owned)).collect::<HashSet<_>>())?;
        }
        let log = Arc::new(EventLog::open(&self.config.event_dir(), run_id).ok()?);
        let ctx = self.context(&identity, &lease, Arc::clone(&log), token);
        let live = self.register(ctx, lease);
        let runtime = Arc::clone(self);
        let resumable = kind == "message" && journal_path(&self.config, run_id).exists();
        thread::spawn(move || {
            if resumable {
                runtime.drive(&live, None);
            } else {
                runtime.conclude(&live, Outcome::failed("incomplete_output"), "interrupted");
            }
        });
        Some(log)
    }

    fn register(&self, ctx: Arc<RunContext>, lease: Lease) -> Arc<LiveRun> {
        let live = Arc::new(LiveRun { ctx, cancel: CancelToken::new(), stop: AtomicBool::new(false), lease });
        lock(&self.live).insert(live.ctx.run_id.clone(), Arc::clone(&live));
        self.start_heartbeat(&live);
        live
    }

    fn start_heartbeat(&self, live: &Arc<LiveRun>) {
        let live = Arc::clone(live);
        let seconds = self.config.lease_seconds;
        thread::spawn(move || {
            let interval = Duration::from_secs(u64::from((seconds / 3).max(3)));
            let mut last_ok = Instant::now();
            'beat: while !live.stop.load(Ordering::SeqCst) {
                let started = Instant::now();
                while started.elapsed() < interval {
                    if live.stop.load(Ordering::SeqCst) {
                        break 'beat;
                    }
                    thread::sleep(Duration::from_millis(200));
                }
                match live.ctx.store.heartbeat(&live.ctx.run_id, &live.lease, seconds) {
                    Ok(true) => last_ok = Instant::now(),
                    Ok(false) => {
                        live.ctx.lease_lost.store(true, Ordering::SeqCst);
                        live.cancel.cancel();
                        break;
                    }
                    Err(_) if last_ok.elapsed() > Duration::from_secs(u64::from(seconds)) => {
                        live.ctx.lease_lost.store(true, Ordering::SeqCst);
                        live.cancel.cancel();
                        break;
                    }
                    Err(_) => {}
                }
            }
        });
    }

    fn drive(self: &Arc<Self>, live: &Arc<LiveRun>, fresh: Option<Action>) {
        let outcome = match fresh {
            Some(Action::Approval { decision, approval_id, fingerprint }) => {
                resolve_approval(&live.ctx, &Resolution { approval_id: &approval_id, fingerprint: &fingerprint, decision: &decision })
            }
            Some(Action::Message(text)) => self.run_message(live, Some(&text)),
            None => self.run_message(live, None),
        };
        let persisted_status = if live.cancel.is_cancelled() && !live.ctx.lease_lost.load(Ordering::SeqCst) { "interrupted" } else { "" };
        self.conclude(live, outcome, persisted_status);
    }

    fn run_message(&self, live: &Arc<LiveRun>, fresh: Option<&str>) -> Outcome {
        let ctx = &live.ctx;
        let started = Instant::now();
        let Some((provider, model_id)) = primary_ref(&self.config) else {
            return Outcome::failed("provider_unavailable");
        };
        let mut prepared: Option<(String, String)> = None;
        if fresh.is_some() {
            let token = match lock(&ctx.token).clone() {
                Some(token) => token,
                None => return Outcome::failed("internal"),
            };
            let session = UserSession { backend: &self.backend, token: &token };
            let (history, tasks) = match session.load_context(&ctx.conversation_id, &ctx.actor.mode, self.config.limits.history_messages) {
                Ok(loaded) => loaded,
                Err(_) => return Outcome::failed("internal"),
            };
            let mut degraded = Vec::new();
            let personal = session.load_personal(&ctx.conversation_id, &ctx.actor.mode, &history, self.config.limits.history_chars, &mut degraded);
            for part in degraded {
                eprintln!("{}", json!({"event": "kael_context_degraded", "run_id": ctx.run_id, "part": part}));
            }
            for task in &tasks {
                if let Some(id) = task["id"].as_str() {
                    lock(&ctx.tasks).insert(id.to_owned(), task.clone());
                }
            }
            let latest = history.last().and_then(|row| row["content"].as_str()).unwrap_or("").to_owned();
            let system = build_system_prompt(&ctx.actor, &ctx.offered, &tasks, &ctx.conversation_id, &vietnam_date(now_ms()), &personal, &latest);
            let Some(input) = build_user_input(&history, self.config.limits.history_chars, &personal) else {
                return Outcome::failed("invalid_request");
            };
            prepared = Some((system, input));
        }
        let cancel = live.cancel.clone();
        let storage_path = journal_path(&self.config, &ctx.run_id);
        if let Err(error) = fs::create_dir_all(self.config.journal_dir()) {
            eprintln!("{}", json!({"event": "kael_journal_dir_failed", "error": error.to_string()}));
            return Outcome::failed("internal");
        }
        let harness = match self.open_harness(ctx, &storage_path.to_string_lossy()) {
            Ok(harness) => harness,
            Err(error) => {
                eprintln!("{}", json!({"event": "kael_harness_open_failed", "run_id": ctx.run_id, "error": error}));
                return Outcome::failed("internal");
            }
        };
        let conversation = match self.bind_conversation(&harness, ctx, prepared.as_ref().map(|(system, _)| system.as_str()), &provider, &model_id, &cancel) {
            Ok(conversation) => conversation,
            Err(error) => {
                eprintln!("{}", json!({"event": "kael_conversation_bind_failed", "run_id": ctx.run_id, "error": error}));
                let _ = harness.close(&CancelToken::new());
                return Outcome::failed("internal");
            }
        };
        if let Some((_, input)) = &prepared {
            let submitted = serde_json::from_value(json!(input)).map_err(pi_error).and_then(|content| {
                conversation
                    .submit(
                        SubmissionDraft::Input { request_id: Some(ctx.run_id.clone()), content, when_busy: WhenBusy::Reject },
                        &cancel,
                    )
                    .map(|_| ())
                    .map_err(pi_error)
            });
            if let Err(error) = submitted {
                eprintln!("{}", json!({"event": "kael_submit_failed", "run_id": ctx.run_id, "error": error}));
                let _ = harness.close(&CancelToken::new());
                return Outcome::failed("internal");
            }
        }
        let finished = Arc::new(AtomicBool::new(false));
        let deadline_hit = Arc::new(AtomicBool::new(false));
        {
            let finished = Arc::clone(&finished);
            let deadline_hit = Arc::clone(&deadline_hit);
            let cancel = cancel.clone();
            let limit = self.config.limits.run_deadline.saturating_sub(started.elapsed());
            thread::spawn(move || {
                let begun = Instant::now();
                while begun.elapsed() < limit {
                    if finished.load(Ordering::SeqCst) {
                        return;
                    }
                    thread::sleep(Duration::from_millis(100));
                }
                deadline_hit.store(true, Ordering::SeqCst);
                cancel.cancel();
            });
        }
        let idle = harness.wait_for_idle(&cancel);
        finished.store(true, Ordering::SeqCst);
        let fresh_token = CancelToken::new();
        if ctx.lease_lost.load(Ordering::SeqCst) {
            let _ = harness.close(&fresh_token);
            return Outcome::failed("internal");
        }
        if cancel.is_cancelled() {
            let _ = conversation.abort(false, &fresh_token);
        }
        let entries = conversation
            .entries(
                EntryQuery { conversation_id: conversation.id(), min_entry_id: None, max_entry_id: None, order: Some(ScanOrder::Ascending) },
                1000,
                None,
                &fresh_token,
            )
            .ok()
            .and_then(|page| serde_json::to_value(&page.items).ok())
            .unwrap_or(Value::Null);
        let _ = harness.close(&fresh_token);
        let (text, stop, error_message) = assistant_summary(&entries);
        let served = lock(&ctx.served).clone();
        let mut outcome = Outcome {
            status: "failed".into(),
            text,
            complete: false,
            provider: served.as_ref().map(|(provider, _)| provider.clone()),
            model: served.map(|(_, model)| model),
            input_tokens: ctx.input_tokens.load(Ordering::SeqCst) as u64,
            output_tokens: ctx.output_tokens.load(Ordering::SeqCst) as u64,
            steps: ctx.model_calls.load(Ordering::SeqCst).min(self.config.limits.max_model_calls),
            error: None,
        };
        let emitted = ctx.text_chars.load(Ordering::SeqCst) > 0;
        let code = if ctx.budget_hit.load(Ordering::SeqCst) || deadline_hit.load(Ordering::SeqCst) {
            Some("budget_exhausted")
        } else if idle.is_err() {
            Some("internal")
        } else if ctx.overflow.load(Ordering::SeqCst) {
            Some("incomplete_output")
        } else {
            match stop.as_deref() {
                Some("stop") if !outcome.text.trim().is_empty() => None,
                Some("error") | Some("aborted") => Some(classify_provider_error(error_message.as_deref().unwrap_or(""), emitted)),
                _ => Some("incomplete_output"),
            }
        };
        match code {
            None => {
                outcome.status = "completed".into();
                outcome.complete = true;
            }
            Some(code) => outcome.error = Some(code.to_owned()),
        }
        outcome
    }

    fn open_harness(&self, ctx: &Arc<RunContext>, path: &str) -> Result<Harness, String> {
        let registry = Arc::new(Registry::default());
        registry
            .install(Extension { name: "kael".into(), tools: tool_registrations(ctx)?, sections: vec![], wraps: vec![], hooks: vec![], tasks: vec![] })
            .map_err(pi_error)?;
        let storage = SqliteStorage::open(path, &Default::default()).map_err(pi_error)?;
        let models = Arc::new(RunModels::new(Arc::clone(&self.models), &self.config, Arc::clone(ctx)));
        let run_id = ctx.run_id.clone();
        Harness::open(
            Arc::new(storage),
            HarnessOptions {
                models,
                registry,
                settings: None,
                conversation_created: None,
                now: None,
                env: None,
                on_report: Some(Arc::new(move |error: PiError| {
                    eprintln!("{}", json!({"event": "kael_harness_report", "run_id": run_id, "error": error.to_string()}));
                })),
            },
        )
        .map_err(pi_error)
    }

    fn bind_conversation(
        &self,
        harness: &Harness,
        ctx: &RunContext,
        system: Option<&str>,
        provider: &str,
        model_id: &str,
        cancel: &CancelToken,
    ) -> Result<Conversation, String> {
        let meta = read_meta(&self.config, &ctx.run_id);
        let known = meta.as_ref().and_then(|meta| meta["journal_conversation_id"].as_u64());
        if let Some(id) = known {
            return harness
                .conversation(ConversationId(id), cancel)
                .map_err(pi_error)?
                .ok_or_else(|| "journal conversation is missing from the store".to_owned());
        }
        let system = system.ok_or_else(|| "a fresh run needs its system prompt".to_owned())?;
        let conversation = harness
            .create_conversation(
                ConversationCreateOptions {
                    ownership: ConversationOwnership::Ownerless,
                    agent: Some(AgentChange {
                        model: Change::Set(ModelRef { provider: provider.to_owned(), model_id: model_id.to_owned() }),
                        instructions: Change::Set(system.to_owned()),
                        ..Default::default()
                    }),
                    init: None,
                },
                cancel,
            )
            .map_err(pi_error)?;
        if let Some(mut meta) = meta {
            meta["journal_conversation_id"] = json!(conversation.id().0);
            write_meta(&self.config, &ctx.run_id, &meta).map_err(|error| error.to_string())?;
        }
        Ok(conversation)
    }

    fn conclude(&self, live: &Arc<LiveRun>, mut outcome: Outcome, forced_status: &str) {
        let ctx = &live.ctx;
        live.stop.store(true, Ordering::SeqCst);
        if ctx.lease_lost.load(Ordering::SeqCst) {
            lock(&self.live).remove(&ctx.run_id);
            return;
        }
        if !forced_status.is_empty() {
            outcome.status = forced_status.to_owned();
        }
        let persisted = match ctx.store.finish_run(&ctx.run_id, &outcome) {
            Ok(()) => true,
            Err(error) => {
                ctx.note_store_error(&error);
                if ctx.lease_lost.load(Ordering::SeqCst) {
                    lock(&self.live).remove(&ctx.run_id);
                    return;
                }
                if outcome.status == "completed" {
                    outcome.status = "failed".into();
                    outcome.error = Some("internal".into());
                }
                false
            }
        };
        eprintln!(
            "{}",
            json!({
                "event": "kael_run", "run_id": ctx.run_id, "status": outcome.status, "persisted": persisted, "provider": outcome.provider,
                "model": outcome.model, "steps": outcome.steps, "input_tokens": outcome.input_tokens,
                "output_tokens": outcome.output_tokens, "error": outcome.error,
            })
        );
        if outcome.status == "completed" {
            ctx.emit(json!({"type": "run_completed", "text": outcome.text}));
        } else {
            let code = outcome.error.clone().unwrap_or_else(|| "internal".into());
            ctx.emit(json!({"type": "run_failed", "code": code, "message": failure_message(&code), "retryable": is_retryable(&code)}));
        }
        let _ = ctx.store.release(&ctx.run_id, &live.lease);
        lock(&self.live).remove(&ctx.run_id);
    }

    pub fn live_run_ids(&self) -> HashSet<String> {
        lock(&self.live).keys().cloned().collect()
    }
}
