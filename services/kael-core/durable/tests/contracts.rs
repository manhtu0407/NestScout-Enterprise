use std::collections::HashSet;
use std::fs;
use std::io::{Read, Write};
use std::net::{SocketAddr, TcpListener, TcpStream};
use std::process::{Child, Command, Stdio};
use std::time::{Duration, Instant};

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
fn a_write_torn_inside_a_multibyte_character_keeps_every_complete_event() {
    let dir = tempfile::tempdir().expect("directory");
    {
        let log = EventLog::open(dir.path(), REQUEST).expect("open");
        log.append(json!({"type": "run_started"})).expect("append");
        log.append(json!({"type": "message_delta", "text": "một"})).expect("append");
    }
    let path = event_path(dir.path(), REQUEST);
    let mut bytes = fs::read(&path).expect("read");
    let torn = "{\"v\":1,\"text\":\"ệ".as_bytes();
    bytes.extend_from_slice(&torn[..torn.len() - 1]);
    fs::write(&path, bytes).expect("write torn bytes");
    let reopened = EventLog::open(dir.path(), REQUEST).expect("reopen");
    assert_eq!(reopened.len(), 2);
    assert_eq!(reopened.append(json!({"type": "message_delta", "text": "hai"})).expect("append"), 3);
    let raw = fs::read_to_string(&path).expect("the file is valid UTF-8 again");
    assert_eq!(raw.lines().count(), 3);
    assert!(raw.lines().all(|line| serde_json::from_str::<Value>(line).is_ok()));
}

#[test]
fn an_unreadable_event_log_is_an_error_not_an_empty_log() {
    let dir = tempfile::tempdir().expect("directory");
    fs::create_dir(event_path(dir.path(), REQUEST)).expect("a directory where the log should be");
    assert!(EventLog::open(dir.path(), REQUEST).is_err());
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
fn dispatch_recovery_effects_are_customer_only_gated_and_argument_bound() {
    let catalog = registry();
    let offered = |actor: &Actor, settings: &Config| select_tools(&catalog, actor, settings).iter().map(|tool| tool.id.to_owned()).collect::<Vec<_>>();
    let customer = actor("client", &["customer"]);
    let worker = actor("worker", &["customer", "worker"]);
    let off = offered(&customer, &config(&[]));
    assert!(!off.contains(&"service_request_redispatch".to_owned()) && !off.contains(&"service_request_cancel".to_owned()));
    let enabled = config(&[("KAEL_ENABLED_EFFECTS", "service_request_redispatch,service_request_cancel")]);
    let on = offered(&customer, &enabled);
    assert!(on.contains(&"service_request_redispatch".to_owned()) && on.contains(&"service_request_cancel".to_owned()));
    let for_worker = offered(&worker, &enabled);
    assert!(!for_worker.contains(&"service_request_redispatch".to_owned()) && !for_worker.contains(&"service_request_cancel".to_owned()));
    let redispatch = catalog.iter().find(|tool| tool.id == "service_request_redispatch").expect("redispatch tool");
    let cancel = catalog.iter().find(|tool| tool.id == "service_request_cancel").expect("cancel tool");
    let valid = json!({"task_id": OWNER, "request_id": REQUEST, "rounds": 1});
    assert!(validate_arguments(redispatch, &valid));
    assert!(!validate_arguments(redispatch, &json!({"task_id": OWNER, "request_id": REQUEST})));
    assert!(!validate_arguments(redispatch, &json!({"task_id": OWNER, "request_id": REQUEST, "rounds": 1, "force": true})));
    assert!(validate_arguments(cancel, &json!({"task_id": OWNER, "request_id": REQUEST})));
    assert!(!validate_arguments(cancel, &json!({"task_id": OWNER, "request_id": "short"})));
}

fn knowledge_item(kind: &str) -> Value {
    let hash = "a".repeat(64);
    let source_id = if kind == "product_fact" { "product.payment-policy" } else { "case.leaking-tap" };
    let mut item = json!({
        "source_id": source_id, "source_revision": 2, "content_hash": hash,
        "citation_ref": format!("kael:{source_id}@2#{hash}"), "title": "Tiêu đề", "excerpt": "Nội dung ngắn",
        "corpus_version": "2026-11-04", "locale": "vi-VN", "valid_as_of": "2026-11-04",
        "relevance_score": 0.8, "retrieval_method": "lexical", "source_kind": kind,
        "provenance": "repository_contract", "trust_tier": "repository_verified", "source_uri": "repo:docs/policy.md", "case_data": null,
    });
    if kind == "synthetic_case" {
        item["provenance"] = json!("synthetic_seed");
        item["trust_tier"] = json!("provisional");
        item["source_uri"] = Value::Null;
        item["case_data"] = json!({
            "case_id": source_id, "revision": 2, "price_prior": null,
            "questions": ["Vòi rỉ ở đâu?"], "safety_tags": ["water"], "safe_response": "Khoá van nước trước.",
        });
    }
    item
}

#[test]
fn knowledge_tools_are_offered_validated_and_compacted() {
    use kael_durable::knowledge::{Retrieval, parse_retrieval, tool_result, valid_item};
    let catalog = registry();
    let customer = actor("client", &["customer"]);
    let offered = |settings: &Config| select_tools(&catalog, &customer, settings).iter().map(|tool| tool.id.to_owned()).collect::<Vec<_>>();
    let on = offered(&config(&[]));
    assert!(on.contains(&"knowledge_search".to_owned()) && on.contains(&"price_estimate_preview".to_owned()));
    let off = offered(&config(&[("KAEL_KNOWLEDGE", "disabled")]));
    assert!(!off.contains(&"knowledge_search".to_owned()) && !off.contains(&"price_estimate_preview".to_owned()));
    let worker = select_tools(&catalog, &actor("worker", &["worker"]), &config(&[]));
    assert!(!worker.iter().any(|tool| tool.id == "knowledge_search"), "knowledge retrieval needs the customer capability");

    let fact = knowledge_item("product_fact");
    let case = knowledge_item("synthetic_case");
    assert!(valid_item(&fact) && valid_item(&case));
    let mut forged = fact.clone();
    forged["trust_tier"] = json!("provisional");
    assert!(!valid_item(&forged), "a product fact cannot claim a provisional tier");
    let mut mismatched = fact.clone();
    mismatched["citation_ref"] = json!("kael:product.payment-policy@1#".to_owned() + &"a".repeat(64));
    assert!(!valid_item(&mismatched), "the citation must bind source, revision and hash");
    let mut priced = case.clone();
    priced["case_data"]["price_prior"] = json!({"min": 1});
    assert!(!valid_item(&priced), "retrieval never exposes price priors");

    let matched = json!({"status": "matched", "items": [fact.clone(), case.clone()]});
    let Retrieval::Found { status, items } = parse_retrieval(&matched) else { panic!("a valid response is accepted") };
    assert_eq!((status, items.len()), ("matched", 2));
    assert!(matches!(parse_retrieval(&json!({"status": "matched", "items": []})), Retrieval::Unavailable("invalid_retrieval_response")));
    assert!(matches!(parse_retrieval(&json!({"status": "no_reliable_match", "items": [fact.clone()]})), Retrieval::Unavailable(_)));
    assert!(matches!(parse_retrieval(&json!({"status": "matched", "items": [fact.clone(), fact.clone()]})), Retrieval::Unavailable(_)));
    assert!(matches!(parse_retrieval(&json!({"status": "no_reliable_match", "items": []})), Retrieval::Found { .. }));

    let rendered = tool_result("matched", &items);
    assert_eq!(rendered["context_truncated"], json!(false));
    assert!(rendered["notice"].as_str().is_some_and(|notice| notice.contains("untrusted")));
    assert!(rendered["items"][1].get("case_data").is_none(), "raw case data is replaced by its compact fields");
    assert_eq!(rendered["items"][1]["safe_response"], json!("Khoá van nước trước."));
    let mut heavy = case.clone();
    heavy["excerpt"] = json!("x".repeat(1600));
    heavy["title"] = json!("t".repeat(200));
    heavy["case_data"]["questions"] = json!(vec!["q".repeat(300); 4]);
    heavy["case_data"]["safety_tags"] = json!(vec!["s".repeat(100); 8]);
    heavy["case_data"]["safe_response"] = json!("r".repeat(900));
    let many = vec![heavy; 5];
    let truncated = tool_result("matched", &many);
    assert_eq!(truncated["context_truncated"], json!(true));
    let kept = truncated["items"].as_array().expect("items");
    assert!(!kept.is_empty() && kept.len() < 5);
    assert_eq!(kept[0]["excerpt"].as_str().map(|text| text.chars().count()), Some(1000));
    assert_eq!(kept[0]["questions"].as_array().map(Vec::len), Some(3));
    assert_eq!(kept[0]["safety_tags"].as_array().map(Vec::len), Some(6));
    assert!(truncated["items"].to_string().chars().count() <= 10_000);
}

#[test]
fn the_estimate_preview_stays_disabled_and_the_unsupported_mode_is_refused() {
    use kael_durable::knowledge::{estimate_preview_disabled, price_estimate_preview};
    let stub = estimate_preview_disabled();
    assert!(stub["min_vnd"].is_null() && stub["max_vnd"].is_null());
    assert_eq!(stub["binding"], json!(false));
    assert_eq!(stub["quote_created"], json!(false));
    assert_eq!(price_estimate_preview().outcome, "succeeded");
    assert!(Config::from_env(environment(&[("KAEL_ESTIMATE_PREVIEW", "local_only")])).is_err());
    assert!(Config::from_env(environment(&[("KAEL_ESTIMATE_PREVIEW", "disabled")])).is_ok());
    let catalog = registry();
    let tool = catalog.iter().find(|tool| tool.id == "price_estimate_preview").expect("price_estimate_preview");
    let args = json!({"case_id": "case.leaking-tap", "scope_confirmed": true, "area_m2": 3, "units": 1, "material": "tile",
        "floor_access": true, "clear_surface": true, "no_visible_damage": true});
    assert!(validate_arguments(tool, &args));
    let mut unknown_material = args.clone();
    unknown_material["material"] = json!("gold");
    assert!(!validate_arguments(tool, &unknown_material));
    let mut bad_case = args.clone();
    bad_case["case_id"] = json!("Not A Case");
    assert!(!validate_arguments(tool, &bad_case));
    let reduced = harness_schema(&tool.schema).to_string();
    assert!(reduced.contains("enum") && !reduced.contains("pattern"));
}

#[test]
fn provider_settings_cover_thinking_and_the_server_side_fallback() {
    let plain = config(&[]);
    assert!(!plain.deepseek_thinking && plain.anthropic_fallback_models.is_empty());
    assert!(config(&[("KAEL_DEEPSEEK_THINKING", "enabled")]).deepseek_thinking);
    let anthropic = [("ANTHROPIC_API_KEY", "anthropic-key-value"), ("KAEL_ANTHROPIC_MODEL", "claude-opus-5-5")];
    let with = |extra: &[(&str, &str)]| {
        let mut pairs = anthropic.to_vec();
        pairs.extend_from_slice(extra);
        Config::from_env(environment(&pairs))
    };
    assert!(with(&[]).expect("valid").anthropic_fallback_models.is_empty(), "the fallback is opt-in");
    assert!(with(&[("KAEL_ANTHROPIC_SERVER_FALLBACK", "enabled")]).is_err(), "enabling it needs an explicit model list");
    assert!(with(&[("KAEL_ANTHROPIC_SERVER_FALLBACK", "enabled"), ("KAEL_ANTHROPIC_FALLBACK_MODELS", "gpt-4")]).is_err());
    assert!(with(&[("KAEL_ANTHROPIC_SERVER_FALLBACK", "enabled"), ("KAEL_ANTHROPIC_FALLBACK_MODELS", "claude-a,claude-b,claude-c,claude-d,claude-e")]).is_err());
    let listed = with(&[("KAEL_ANTHROPIC_SERVER_FALLBACK", "enabled"), ("KAEL_ANTHROPIC_FALLBACK_MODELS", "claude-sonnet-5-5, claude-opus-5")]).expect("valid");
    assert_eq!(listed.anthropic_fallback_models, vec!["claude-sonnet-5-5".to_owned(), "claude-opus-5".to_owned()]);
    let unsupported = Config::from_env(environment(&[
        ("ANTHROPIC_API_KEY", "anthropic-key-value"), ("KAEL_ANTHROPIC_MODEL", "claude-haiku-5-5"),
        ("KAEL_ANTHROPIC_SERVER_FALLBACK", "enabled"),
    ]))
    .expect("valid");
    assert!(unsupported.anthropic_fallback_models.is_empty(), "only models that support the server fallback receive it");
    assert!(Config::from_env(environment(&[("KAEL_ANTHROPIC_BASE_URL", "http://api.example.com")])).is_err());
}

#[test]
fn provider_models_carry_the_thinking_flag_the_fallback_list_and_the_base_urls() {
    use kael_durable::models::build_providers;
    let find = |providers: &pi_durable::ai::registry::Providers, provider: &str| {
        let wanted = if provider == "anthropic" { "claude-opus-5-5" } else { "deepseek-flash" };
        providers.models().iter().find(|model| model.provider == provider && model.id == wanted).cloned()
    };
    let plain = build_providers(&config(&[("KAEL_DEEPSEEK_BASE_URL", "http://127.0.0.1:9999")]));
    let deepseek = find(&plain, "deepseek").expect("deepseek model");
    assert!(!deepseek.reasoning);
    assert_eq!(deepseek.base_url, "http://127.0.0.1:9999");
    let thinking = build_providers(&config(&[("KAEL_DEEPSEEK_THINKING", "enabled")]));
    assert!(find(&thinking, "deepseek").expect("deepseek model").reasoning);

    let anthropic = [("ANTHROPIC_API_KEY", "anthropic-key-value"), ("KAEL_ANTHROPIC_MODEL", "claude-opus-5-5"), ("KAEL_ANTHROPIC_BASE_URL", "http://127.0.0.1:9998")];
    let without = build_providers(&config(&anthropic));
    let model = find(&without, "anthropic").expect("anthropic model");
    assert_eq!(model.base_url, "http://127.0.0.1:9998");
    assert!(model.compat.as_ref().is_none_or(|compat| compat.get("allowedFallbackModels").is_none()));
    let mut listed = anthropic.to_vec();
    listed.extend([("KAEL_ANTHROPIC_SERVER_FALLBACK", "enabled"), ("KAEL_ANTHROPIC_FALLBACK_MODELS", "claude-sonnet-5-5")]);
    let with = build_providers(&config(&listed));
    let model = find(&with, "anthropic").expect("anthropic model");
    assert_eq!(model.compat.as_ref().expect("compat")["allowedFallbackModels"], json!([{"model": "claude-sonnet-5-5"}]));
}

#[test]
fn an_interrupted_partial_reply_is_not_part_of_the_final_answer_unless_it_is_the_last() {
    use kael_durable::runner::assistant_summary;
    let message = |text: &str, stop: &str| json!({"role": "assistant", "content": [{"type": "text", "text": text}], "stopReason": stop});
    let entries = |messages: Vec<Value>| Value::Array(messages.into_iter().map(|message| json!({"model": [message]})).collect());
    let recovered = assistant_summary(&entries(vec![message("Đang xử lý", "aborted"), message("Câu trả lời đầy đủ.", "stop")]));
    assert_eq!(recovered, ("Câu trả lời đầy đủ.".to_owned(), Some("stop".to_owned()), None));
    let steps = assistant_summary(&entries(vec![message("Bước một.", "toolUse"), message("Bước hai.", "stop")]));
    assert_eq!(steps.0, "Bước một.\n\nBước hai.");
    let errored = assistant_summary(&entries(vec![message("Bản nháp", "error"), message("Bản cuối", "stop")]));
    assert_eq!(errored.0, "Bản cuối");
    let interrupted = assistant_summary(&entries(vec![message("Đang xử lý", "aborted")]));
    assert_eq!((interrupted.0.as_str(), interrupted.1.as_deref()), ("Đang xử lý", Some("aborted")), "an interrupted final message stays visible so the run is reported incomplete");
    assert_eq!(assistant_summary(&Value::Null), (String::new(), None, None));
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

struct Daemon {
    child: Child,
    addr: SocketAddr,
}

impl Drop for Daemon {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

fn start_daemon(label: &str) -> Daemon {
    let addr = TcpListener::bind("127.0.0.1:0").expect("free port").local_addr().expect("free address");
    let data = std::env::temp_dir().join(format!("kael-contract-{label}-{}", std::process::id()));
    let child = Command::new(env!("CARGO_BIN_EXE_kael-durable"))
        .env("SUPABASE_URL", "http://127.0.0.1:1")
        .env("SUPABASE_ANON_KEY", "anon-key-value")
        .env("SUPABASE_SERVICE_ROLE_KEY", "service-key-value")
        .env("DEEPSEEK_API_KEY", "deepseek-key-value")
        .env("KAEL_DURABLE_DATA_DIR", &data)
        .env("KAEL_DURABLE_ALLOW_TEMP", "1")
        .env("KAEL_DURABLE_BIND", addr.to_string())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .expect("spawn kael-durable");
    let daemon = Daemon { child, addr };
    let started = Instant::now();
    while started.elapsed() < Duration::from_secs(20) {
        if exchange(addr, get_health("").as_bytes()).starts_with("HTTP/1.1 200") {
            return daemon;
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    panic!("kael-durable did not become healthy");
}

fn get_health(extra_headers: &str) -> String {
    format!("GET /health HTTP/1.1\r\nhost: kael\r\nconnection: close\r\n{extra_headers}\r\n")
}

fn exchange(addr: SocketAddr, request: &[u8]) -> String {
    let Ok(mut stream) = TcpStream::connect_timeout(&addr, Duration::from_secs(2)) else { return String::new() };
    stream.set_read_timeout(Some(Duration::from_secs(10))).expect("read timeout");
    let _ = stream.write_all(request);
    let mut reply = Vec::new();
    let _ = stream.read_to_end(&mut reply);
    String::from_utf8_lossy(&reply).into_owned()
}

#[test]
fn request_headers_are_capped_at_32_kib_and_the_connection_is_dropped_without_a_reply() {
    let daemon = start_daemon("headers");

    let within = format!("x-fill: {}\r\n", "a".repeat(30 * 1024));
    assert!(exchange(daemon.addr, get_health(&within).as_bytes()).starts_with("HTTP/1.1 200"), "a header block under the cap is served");

    let one_long_line = format!("x-fill: {}\r\n", "a".repeat(33 * 1024));
    assert_eq!(exchange(daemon.addr, get_health(&one_long_line).as_bytes()), "", "a single header line over the cap gets no reply");

    let many_short_lines: String = (0..800).map(|index| format!("x-pad-{index}: {}\r\n", "b".repeat(50))).collect();
    assert!(many_short_lines.len() > 32 * 1024);
    assert_eq!(exchange(daemon.addr, get_health(&many_short_lines).as_bytes()), "", "many short lines adding up past the cap get no reply");

    let unterminated = format!("GET /health HTTP/1.1\r\nx-fill: {}", "c".repeat(64 * 1024));
    assert_eq!(exchange(daemon.addr, unterminated.as_bytes()), "", "an endless header line gets no reply");

    assert!(exchange(daemon.addr, get_health("").as_bytes()).starts_with("HTTP/1.1 200"), "the service stays healthy after refusing oversized headers");
}

#[test]
fn a_follower_reads_complete_lines_written_by_another_log_and_never_truncates_them() {
    let dir = std::env::temp_dir().join(format!("kael-follow-{}", std::process::id()));
    fs::create_dir_all(&dir).expect("dir");
    let run = "40000000-0000-4000-8000-000000000001";
    let follower = EventLog::follow(&dir, run);
    assert!(follower.is_follower());
    follower.refresh().expect("a missing file is not an error");
    assert!(follower.is_empty());

    let writer = EventLog::open(&dir, run).expect("writer");
    assert!(!writer.is_follower());
    writer.append(json!({"type": "run_started"})).expect("append");
    writer.append(json!({"type": "message_delta", "text": "một"})).expect("append");
    follower.refresh().expect("refresh");
    assert_eq!(follower.len(), 2);

    let path = event_path(&dir, run);
    let mut tail = fs::OpenOptions::new().append(true).open(&path).expect("open");
    tail.write_all(b"{\"v\":1,\"seq\":3,\"type\":\"message_de").expect("partial write");
    follower.refresh().expect("refresh over a partial line");
    assert_eq!(follower.len(), 2, "an incomplete line is not delivered");
    assert!(fs::read(&path).expect("read").ends_with(b"message_de"), "the follower never truncates the owner's file");

    tail.write_all(b"lta\",\"text\":\"hai\"}\n").expect("finish the line");
    follower.refresh().expect("refresh");
    assert_eq!(follower.len(), 3);
    assert!(!follower.closed());

    tail.write_all(b"{\"v\":1,\"seq\":4,\"type\":\"run_completed\",\"text\":\"xong\"}\n").expect("terminal");
    follower.refresh().expect("refresh");
    assert_eq!(follower.len(), 4);
    assert!(follower.closed());
    let (lines, closed) = follower.after(2);
    assert!(closed);
    assert_eq!(lines.len(), 2);
    fs::remove_dir_all(&dir).expect("cleanup");
}

fn auth_stub() -> SocketAddr {
    let listener = TcpListener::bind("127.0.0.1:0").expect("bind auth stub");
    let addr = listener.local_addr().expect("stub address");
    std::thread::spawn(move || {
        for incoming in listener.incoming().flatten() {
            let mut stream = incoming;
            let mut buffer = [0u8; 4096];
            let read = stream.read(&mut buffer).unwrap_or(0);
            let request = String::from_utf8_lossy(&buffer[..read]).into_owned();
            let (status, body) = if request.contains("Bearer good-token") {
                ("200 OK", format!("{{\"id\":\"{OWNER}\"}}"))
            } else if request.contains("Bearer anonymous-token") {
                ("200 OK", format!("{{\"id\":\"{OWNER}\",\"is_anonymous\":true}}"))
            } else if request.contains("Bearer expired-token") {
                ("401 Unauthorized", "{}".to_owned())
            } else {
                ("503 Service Unavailable", "{}".to_owned())
            };
            let _ = write!(stream, "HTTP/1.1 {status}\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{body}", body.len());
        }
    });
    addr
}

#[test]
fn a_rejected_token_is_unauthenticated_but_an_unreachable_auth_service_is_not() {
    use kael_durable::backend::{Backend, Verification};
    let stub = auth_stub();
    let url = format!("http://{stub}");
    let settings = config(&[("SUPABASE_URL", url.as_str())]);
    let backend = Backend::new(&settings);
    assert!(matches!(backend.verify_user("good-token"), Verification::User(id) if id == OWNER));
    assert!(matches!(backend.verify_user("expired-token"), Verification::Rejected));
    assert!(matches!(backend.verify_user("anonymous-token"), Verification::Rejected));
    assert!(matches!(backend.verify_user("flaky-token"), Verification::Unavailable));

    let closed = TcpListener::bind("127.0.0.1:0").expect("bind").local_addr().expect("address");
    let unreachable = Backend::new(&config(&[("SUPABASE_URL", format!("http://{closed}").as_str())]));
    assert!(matches!(unreachable.verify_user("good-token"), Verification::Unavailable));
}

const JOURNAL_RUN: &str = "50000000-0000-4000-8000-000000000001";

fn journal_config(dir: &std::path::Path) -> Config {
    config(&[("KAEL_DURABLE_DATA_DIR", dir.to_str().expect("utf-8 path")), ("KAEL_DURABLE_ALLOW_TEMP", "1")])
}

fn committed_rows(path: &std::path::Path) -> Vec<String> {
    let connection = rusqlite::Connection::open(path).expect("open journal");
    let mut statement = connection.prepare("SELECT value FROM entries ORDER BY id").expect("prepare");
    statement.query_map([], |row| row.get::<_, String>(0)).expect("query").collect::<Result<_, _>>().expect("rows")
}

#[test]
fn a_takeover_journal_is_a_snapshot_that_does_not_need_the_frozen_holders_write_lock() {
    use kael_durable::journal;
    let dir = tempfile::tempdir().expect("directory");
    let settings = journal_config(dir.path());
    let first = journal::prepare(&settings, JOURNAL_RUN, 1).expect("first journal");
    {
        let connection = rusqlite::Connection::open(&first).expect("create");
        connection.pragma_update(None, "journal_mode", "WAL").expect("wal");
        connection.execute_batch("CREATE TABLE entries (id INTEGER PRIMARY KEY, value TEXT NOT NULL); INSERT INTO entries (value) VALUES ('committed-one'), ('committed-two');").expect("seed rows");
    }

    let frozen = rusqlite::Connection::open(&first).expect("frozen holder connection");
    frozen.execute_batch("BEGIN IMMEDIATE; INSERT INTO entries (value) VALUES ('in-flight');").expect("frozen holder starts writing");

    let blocked = rusqlite::Connection::open(&first).expect("successor connection");
    blocked.busy_timeout(Duration::from_millis(200)).expect("timeout");
    let refusal = blocked.execute_batch("BEGIN IMMEDIATE").expect_err("the frozen holder owns the write lock");
    assert!(refusal.to_string().contains("locked"), "unexpected refusal: {refusal}");

    let second = journal::prepare(&settings, JOURNAL_RUN, 2).expect("takeover journal despite the frozen writer");
    assert_ne!(first, second);
    assert_eq!(committed_rows(&second), vec!["committed-one", "committed-two"], "only committed state is carried over");

    let successor = rusqlite::Connection::open(&second).expect("successor journal");
    successor.execute_batch("INSERT INTO entries (value) VALUES ('successor-write')").expect("the successor writes without waiting for the frozen holder");

    frozen.execute_batch("COMMIT").expect("the holder resumes and commits to its own file");
    assert_eq!(committed_rows(&second), vec!["committed-one", "committed-two", "successor-write"]);
    assert_eq!(committed_rows(&first), vec!["committed-one", "committed-two", "in-flight"]);
}

#[test]
fn journals_are_kept_per_epoch_retired_when_superseded_and_purged_with_their_companions() {
    use kael_durable::journal;
    let dir = tempfile::tempdir().expect("directory");
    let settings = journal_config(dir.path());
    let other = "50000000-0000-4000-8000-000000000002";
    assert!(!journal::exists(&settings, JOURNAL_RUN));
    for (run, epoch) in [(JOURNAL_RUN, 3), (JOURNAL_RUN, 1), (JOURNAL_RUN, 2), (other, 1)] {
        fs::create_dir_all(settings.journal_dir()).expect("journals directory");
        fs::write(journal::path(&settings, run, epoch), b"journal").expect("write journal");
    }
    fs::write(settings.journal_dir().join(format!("{JOURNAL_RUN}.e3.sqlite-wal")), b"log").expect("write companion");
    fs::write(settings.journal_dir().join(format!("{JOURNAL_RUN}.e4.sqlite.seed")), b"partial").expect("write partial seed");

    assert_eq!(journal::epochs(&settings, JOURNAL_RUN), vec![1, 2, 3]);
    assert_eq!(journal::run_id_of(&format!("{JOURNAL_RUN}.e3.sqlite")), Some(JOURNAL_RUN));
    assert_eq!(journal::run_id_of(&format!("{JOURNAL_RUN}.sqlite")), None);
    assert_eq!(journal::run_id_of(&format!("{JOURNAL_RUN}.e3.sqlite-wal")), None);
    assert!(journal::newest_age(&settings, JOURNAL_RUN).is_some());

    journal::retire_before(&settings, JOURNAL_RUN, 3);
    assert_eq!(journal::epochs(&settings, JOURNAL_RUN), vec![3]);
    assert_eq!(journal::epochs(&settings, other), vec![1], "other runs are untouched");

    journal::remove_all(&settings, JOURNAL_RUN).expect("purge");
    assert!(!journal::exists(&settings, JOURNAL_RUN));
    assert!(journal::newest_age(&settings, JOURNAL_RUN).is_none());
    let left: Vec<String> = fs::read_dir(settings.journal_dir()).expect("list").flatten().map(|entry| entry.file_name().to_string_lossy().into_owned()).collect();
    assert_eq!(left, vec![format!("{other}.e1.sqlite")]);
}
