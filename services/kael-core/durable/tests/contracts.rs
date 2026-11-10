use std::collections::HashSet;
use std::fs;
use std::time::Duration;

use kael_durable::config::Config;
use kael_durable::events::{EventLog, event_path, is_terminal, remove_event_file};
use kael_durable::policy::{Actor, Decision, evaluate_call, harness_schema, registry, select_tools, validate_arguments};
use kael_durable::request::{Action, parse_turn_request};
use kael_durable::tasks::{can_transition, check_model_transition, is_terminal as task_is_terminal};
use kael_durable::util::{canonical_json, fingerprint, valid_uuid};
use serde_json::{Value, json};

const OWNER: &str = "00000000-0000-4000-8000-0000000000a1";
const REQUEST: &str = "30000000-0000-4000-8000-000000000001";

fn environment(extra: &[(&str, &str)]) -> impl Fn(&str) -> Option<String> {
    let mut pairs: Vec<(String, String)> = [
        ("SUPABASE_URL", "https://project.supabase.co"),
        ("SUPABASE_ANON_KEY", "anon-key-value"),
        ("SUPABASE_SERVICE_ROLE_KEY", "service-key-value"),
        ("KAEL_DURABLE_DATA_DIR", "/var/lib/kael"),
        ("DEEPSEEK_API_KEY", "deepseek-key-value"),
    ]
    .into_iter()
    .map(|(name, value)| (name.to_owned(), value.to_owned()))
    .collect();
    for (name, value) in extra {
        pairs.retain(|(existing, _)| existing != name);
        pairs.push(((*name).to_owned(), (*value).to_owned()));
    }
    move |name: &str| pairs.iter().find(|(key, _)| key == name).map(|(_, value)| value.clone())
}

fn config(extra: &[(&str, &str)]) -> Config {
    Config::from_env(environment(extra)).expect("valid configuration")
}

fn actor(mode: &str, capabilities: &[&str]) -> Actor {
    Actor { user_id: OWNER.to_owned(), capabilities: capabilities.iter().map(|name| (*name).to_owned()).collect::<HashSet<_>>(), mode: mode.to_owned() }
}

#[test]
fn the_approval_fingerprint_matches_the_legacy_runtime() {
    let bound = json!({
        "tool": "service_request_submit", "actor": OWNER, "task_id": "11111111-1111-4111-8111-111111111111",
        "base_version": 3, "args": {"b": 1, "a": [2, 1], "note": "Dọn nhà"},
    });
    assert_eq!(
        canonical_json(&bound),
        r#"{"actor":"00000000-0000-4000-8000-0000000000a1","args":{"a":[2,1],"b":1,"note":"Dọn nhà"},"base_version":3,"task_id":"11111111-1111-4111-8111-111111111111","tool":"service_request_submit"}"#
    );
    assert_eq!(fingerprint(&bound), "1ef4da3ea0d362a0111265d730761e7cb2f7cfaa2ed687a23debc1d57a5e3c4e");
}

#[test]
fn identifiers_must_be_canonical_uuids() {
    assert!(valid_uuid(OWNER));
    assert!(!valid_uuid("not-a-uuid"));
    assert!(!valid_uuid(&format!("{OWNER}0")));
    assert!(!valid_uuid(&OWNER.replace('-', "")));
}

#[test]
fn the_event_log_numbers_events_and_closes_on_a_terminal_event() {
    let dir = tempfile::tempdir().expect("directory");
    let log = EventLog::open(dir.path(), REQUEST).expect("open");
    assert_eq!(log.append(json!({"type": "run_started"})).expect("append"), 1);
    assert_eq!(log.append(json!({"type": "message_delta", "text": "Xin"})).expect("append"), 2);
    assert!(!log.closed());
    assert_eq!(log.append(json!({"type": "run_completed", "text": "Xin chào"})).expect("append"), 3);
    assert!(log.closed());
    let (lines, closed) = log.after(1);
    assert!(closed);
    assert_eq!(lines.len(), 2);
    let first: Value = serde_json::from_str(&lines[0]).expect("json line");
    assert_eq!((first["v"].clone(), first["seq"].clone(), first["run_id"].clone()), (json!(1), json!(2), json!(REQUEST)));
}

#[test]
fn a_torn_final_line_is_dropped_when_the_log_is_reopened() {
    let dir = tempfile::tempdir().expect("directory");
    {
        let log = EventLog::open(dir.path(), REQUEST).expect("open");
        log.append(json!({"type": "run_started"})).expect("append");
        log.append(json!({"type": "message_delta", "text": "một"})).expect("append");
    }
    let path = event_path(dir.path(), REQUEST);
    let mut content = fs::read_to_string(&path).expect("read");
    content.push_str("{\"v\":1,\"run_id\":\"torn");
    fs::write(&path, content).expect("write torn line");
    let reopened = EventLog::open(dir.path(), REQUEST).expect("reopen");
    assert_eq!(reopened.len(), 2);
    assert_eq!(reopened.append(json!({"type": "message_delta", "text": "hai"})).expect("append"), 3);
    let raw = fs::read_to_string(&path).expect("read");
    assert!(raw.lines().all(|line| serde_json::from_str::<Value>(line).is_ok()), "every persisted line is whole JSON");
}

#[test]
fn a_waiting_reader_is_woken_by_new_events() {
    let dir = tempfile::tempdir().expect("directory");
    let log = std::sync::Arc::new(EventLog::open(dir.path(), REQUEST).expect("open"));
    let writer = std::sync::Arc::clone(&log);
    let handle = std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(100));
        writer.append(json!({"type": "run_started"})).expect("append");
    });
    let (lines, closed) = log.wait_after(0, Duration::from_secs(5));
    handle.join().expect("writer");
    assert_eq!(lines.len(), 1);
    assert!(!closed);
    assert!(is_terminal(&json!({"type": "run_failed"})));
    assert!(!is_terminal(&json!({"type": "tool_started"})));
    assert!(remove_event_file(dir.path(), REQUEST).expect("remove"));
    assert!(!remove_event_file(dir.path(), REQUEST).expect("remove again"));
}

#[test]
fn turn_requests_follow_the_legacy_contract() {
    let message = |extra: Value| {
        let mut body = json!({"request_id": REQUEST, "conversation_id": null, "mode": "client", "action": {"type": "message", "text": "  Xin chào  "}});
        if let (Some(target), Some(fields)) = (body.as_object_mut(), extra.as_object()) {
            target.extend(fields.clone());
        }
        body.to_string()
    };
    let parsed = parse_turn_request(&message(json!({})), 4000).expect("valid message");
    assert_eq!(parsed.action, Action::Message("Xin chào".to_owned()));
    assert_eq!(parsed.mode, "client");
    assert!(parse_turn_request(&message(json!({"mode": "admin"})), 4000).is_none());
    assert!(parse_turn_request(&message(json!({"request_id": "short"})), 4000).is_none());
    assert!(parse_turn_request(&message(json!({"conversation_id": "x"})), 4000).is_none());
    assert!(parse_turn_request(&message(json!({"action": {"type": "message", "text": "   "}})), 4000).is_none());
    assert!(parse_turn_request(&message(json!({"action": {"type": "message", "text": "x".repeat(4001)}})), 4000).is_none());
    assert!(parse_turn_request(&message(json!({"action": {"type": "delete"}})), 4000).is_none());
    let approval = json!({"request_id": REQUEST, "conversation_id": null, "mode": "client",
        "action": {"type": "approve", "approval_id": OWNER, "fingerprint": "a".repeat(64)}});
    assert!(parse_turn_request(&approval.to_string(), 4000).is_none(), "an approval must name its conversation");
    let reconcile = json!({"request_id": REQUEST, "conversation_id": null, "mode": "client",
        "action": {"type": "reconcile", "approval_id": OWNER, "fingerprint": "a".repeat(64)}});
    assert!(parse_turn_request(&reconcile.to_string(), 4000).is_some());
}

#[test]
fn configuration_refuses_unsafe_deployments() {
    assert!(Config::from_env(environment(&[("SUPABASE_URL", "http://project.supabase.co")])).is_err());
    assert!(Config::from_env(environment(&[("KAEL_DURABLE_DATA_DIR", "relative/path")])).is_err());
    assert!(Config::from_env(environment(&[("KAEL_DURABLE_DATA_DIR", "/tmp/kael")])).is_err());
    assert!(Config::from_env(environment(&[("KAEL_DURABLE_HOLDER", "bad holder")])).is_err());
    assert!(Config::from_env(environment(&[("KAEL_DURABLE_LEASE_SECONDS", "5")])).is_err());
    assert!(Config::from_env(environment(&[("KAEL_DEEPSEEK_BASE_URL", "http://models.example.com")])).is_err());
    let local = config(&[("SUPABASE_URL", "http://127.0.0.1:54321"), ("KAEL_DEEPSEEK_BASE_URL", "http://127.0.0.1:9999/")]);
    assert_eq!(local.deepseek.as_ref().and_then(|provider| provider.base_url.clone()).as_deref(), Some("http://127.0.0.1:9999"));
    assert_eq!(config(&[]).route, vec!["deepseek".to_owned()]);
    assert!(config(&[("DEEPSEEK_API_KEY", "")]).route.is_empty(), "no provider credential means no route");
}

#[test]
fn tool_offers_follow_mode_capability_and_enabled_effects() {
    let catalog = registry();
    let settings = config(&[]);
    let offered_ids = |actor: &Actor| select_tools(&catalog, actor, &settings).iter().map(|tool| tool.id.to_owned()).collect::<Vec<_>>();
    let customer = offered_ids(&actor("client", &["customer"]));
    let worker = offered_ids(&actor("worker", &["customer", "worker"]));
    assert!(customer.contains(&"task_create".to_owned()));
    assert!(!customer.iter().any(|id| id.starts_with("worker_")), "client mode never sees worker tools: {customer:?}");
    assert!(worker.iter().any(|id| id.starts_with("worker_")));
    assert!(!customer.contains(&"service_request_submit".to_owned()), "a disabled consequential effect is not offered");
    let enabled = config(&[("KAEL_ENABLED_EFFECTS", "service_request_submit")]);
    assert!(select_tools(&catalog, &actor("client", &["customer"]), &enabled).iter().any(|tool| tool.id == "service_request_submit"));
}

#[test]
fn tool_calls_are_checked_against_the_offer_and_the_schema() {
    let catalog = registry();
    let settings = config(&[]);
    let caller = actor("client", &["customer"]);
    let offered = select_tools(&catalog, &caller, &settings);
    let valid = json!({"title": "Dọn nhà", "kind": "general", "status": "running", "note": ""});
    assert!(matches!(evaluate_call(&catalog, "task_create", &valid, &offered, &caller, &settings, 0), Decision::Execute));
    assert!(matches!(evaluate_call(&catalog, "task_create", &valid, &offered, &caller, &settings, 8), Decision::Deny("tool_budget")));
    assert!(matches!(evaluate_call(&catalog, "drop_database", &valid, &offered, &caller, &settings, 0), Decision::Deny("unknown_tool")));
    assert!(matches!(evaluate_call(&catalog, "worker_earnings", &json!({}), &offered, &caller, &settings, 0), Decision::Deny("not_offered")));
    let long_title = json!({"title": "x".repeat(121), "kind": "general", "status": "running", "note": ""});
    assert!(matches!(evaluate_call(&catalog, "task_create", &long_title, &offered, &caller, &settings, 0), Decision::Deny("invalid_arguments")));
    let extra = json!({"title": "ok", "kind": "general", "status": "running", "note": "", "owner": OWNER});
    assert!(matches!(evaluate_call(&catalog, "task_create", &extra, &offered, &caller, &settings, 0), Decision::Deny("invalid_arguments")));
    let task_create = catalog.iter().find(|tool| tool.id == "task_create").expect("task_create");
    assert!(validate_arguments(task_create, &valid));
    assert!(!validate_arguments(task_create, &json!({"title": "ok"})));
}

#[test]
fn the_harness_schema_keeps_only_keywords_the_harness_validates() {
    let catalog = registry();
    let task_create = catalog.iter().find(|tool| tool.id == "task_create").expect("task_create");
    assert!(task_create.schema.to_string().contains("maxLength"));
    let reduced = harness_schema(&task_create.schema).to_string();
    for keyword in ["maxLength", "minLength", "pattern", "minimum", "maximum"] {
        assert!(!reduced.contains(keyword), "{keyword} must not reach the harness");
    }
    assert!(reduced.contains("required") && reduced.contains("additionalProperties") && reduced.contains("enum"));
}

#[test]
fn task_transitions_never_leave_a_terminal_state() {
    for terminal in ["completed", "failed", "cancelled"] {
        assert!(task_is_terminal(terminal));
        assert!(!can_transition(terminal, "running"));
    }
    assert!(can_transition("paused", "running"));
    assert!(check_model_transition(&json!({"status": "running", "artifact": {}}), "completed").is_ok());
    assert_eq!(check_model_transition(&json!({"status": "running", "artifact": {}}), "waiting_for_approval"), Err("not_model_settable"));
    assert_eq!(check_model_transition(&json!({"status": "waiting_for_approval", "artifact": {}}), "running"), Err("not_model_settable"));
    let unobserved = json!({"status": "running", "artifact": {"effect_required": true, "effect_result": {"status": "pending"}}});
    assert_eq!(check_model_transition(&unobserved, "completed"), Err("effect_not_observed"));
}
