mod support;

use std::path::Path;
use std::thread;
use std::time::{Duration, Instant};

use serde_json::{Value, json};
use support::{Gateway, MockModel, Service, Stack, Step, assert_contiguous, scratch, types};

fn turn_body(request_id: &str, text: &str) -> Value {
    json!({"request_id": request_id, "conversation_id": null, "mode": "client", "action": {"type": "message", "text": text}})
}

fn task_id_from(request: &Value) -> String {
    let messages = request["messages"].as_array().expect("messages");
    let tool = messages.iter().rev().find(|message| message["role"] == "tool").expect("tool result");
    let content = tool["content"].as_str().expect("tool content");
    let at = content.find("\"id\":\"").expect("task id in tool result") + 6;
    content[at..at + 36].to_owned()
}

fn draft_step(request: &Value) -> Step {
    Step::Tool {
        name: "service_request_draft",
        arguments: json!({
            "task_id": task_id_from(request), "description": "Sửa vòi nước bị rỉ trong bếp", "location": "Quận 1, TP.HCM",
            "preferred_time": "Sáng mai", "missing": [],
        }),
    }
}

fn submit_step(request: &Value) -> Step {
    Step::Tool { name: "service_request_submit", arguments: json!({"task_id": task_id_from(request)}) }
}

fn run_id_of(reply: &support::Reply) -> String {
    reply.header("x-kael-run-id").expect("run id header").to_owned()
}

fn files_for(data_dir: &Path, run_id: &str) -> Vec<String> {
    [format!("journals/{run_id}.sqlite"), format!("events/{run_id}.ndjson"), format!("meta/{run_id}.json")]
        .into_iter()
        .filter(|relative| data_dir.join(relative).exists())
        .collect()
}

#[test]
#[ignore = "needs the live Supabase fixture stack (KAEL_TEST_GATEWAY, KAEL_TEST_ANON, KAEL_TEST_SERVICE)"]
fn a_message_turn_streams_persists_and_replays() {
    let stack = Stack::from_env();
    let model = MockModel::start(vec![Step::Text("Xin chào bạn, mình giúp được gì?")]);
    let data = scratch("stream");
    let service = Service::spawn(&stack, &data, "holder-stream", model.port, 120);
    let user = stack.signup();
    let request_id = kael_durable::util::random_uuid();

    let mut reply = service.turn(&user, &turn_body(&request_id, "Xin chào"));
    assert_eq!(reply.status, 200);
    assert_eq!(reply.header("x-kael-runtime"), Some("durable"));
    let run_id = run_id_of(&reply);
    let events = reply.drain(Duration::from_secs(60));
    assert_contiguous(&events);
    let kinds = types(&events);
    assert_eq!(kinds.first().map(String::as_str), Some("run_started"));
    assert_eq!(kinds.last().map(String::as_str), Some("run_completed"));
    assert!(kinds.iter().any(|kind| kind == "message_delta"));
    assert_eq!(events.last().expect("terminal")["text"], json!("Xin chào bạn, mình giúp được gì?"));

    let runs = stack.rows(&user, &format!("kael_runs?select=status,owner_id&id=eq.{run_id}"));
    assert_eq!(runs.len(), 1);
    assert_eq!(runs[0]["status"], json!("completed"));
    assert_eq!(runs[0]["owner_id"], json!(user.id));
    let conversation_id = events[0]["conversation_id"].as_str().expect("conversation id").to_owned();
    let messages = stack.rows(&user, &format!("kael_messages?select=role,content&conversation_id=eq.{conversation_id}&order=created_at.asc"));
    assert_eq!(messages.iter().map(|row| row["role"].as_str().unwrap_or("")).collect::<Vec<_>>(), vec!["user", "assistant"]);

    let mut again = service.turn(&user, &turn_body(&request_id, "Xin chào"));
    assert_eq!(again.status, 200);
    let replayed = again.drain(Duration::from_secs(30));
    assert_eq!(replayed[0]["replayed"], json!(true));
    assert_eq!(replayed.last().expect("terminal")["text"], events.last().expect("terminal")["text"]);
    assert_eq!(model.call_count(), 1, "a replay must not call the model again");

    let mut tail = service.events(&user, &run_id, 2);
    assert_eq!(tail.status, 200);
    let rest = tail.drain(Duration::from_secs(30));
    assert_eq!(rest.first().expect("resumed event")["seq"], json!(3));
    assert_eq!(rest.last().expect("terminal")["type"], json!("run_completed"));
}

#[test]
#[ignore = "needs the live Supabase fixture stack (KAEL_TEST_GATEWAY, KAEL_TEST_ANON, KAEL_TEST_SERVICE)"]
fn a_killed_process_resumes_the_run_without_repeating_effects() {
    let stack = Stack::from_env();
    let model = MockModel::start(vec![
        Step::Tool { name: "task_create", arguments: json!({"title": "Dọn nhà cuối tuần", "kind": "general", "status": "running", "note": ""}) },
        Step::TextThenHang("Đang xử lý"),
        Step::Text("Mình đã ghi nhận việc cần làm."),
    ]);
    let data = scratch("kill");
    let mut first = Service::spawn(&stack, &data, "holder-first", model.port, 120);
    let user = stack.signup();
    let request_id = kael_durable::util::random_uuid();

    let mut reply = first.turn(&user, &turn_body(&request_id, "Tạo việc dọn nhà cuối tuần giúp mình"));
    assert_eq!(reply.status, 200);
    let run_id = run_id_of(&reply);
    let before = reply.until(Duration::from_secs(60), |event| event["type"] == "message_delta" && event["text"] == "Đang xử lý");
    assert!(types(&before).iter().any(|kind| kind == "tool_completed"), "the effect completed before the crash: {before:?}");
    first.kill();
    drop(reply);

    let tasks = stack.rows(&user, "kael_tasks?select=id,title");
    assert_eq!(tasks.len(), 1, "exactly one task exists at the crash point");

    let second = Service::spawn(&stack, &data, "holder-second", model.port, 120);
    let started = Instant::now();
    let mut resumed = loop {
        let attempt = second.turn(&user, &turn_body(&request_id, "Tạo việc dọn nhà cuối tuần giúp mình"));
        if attempt.status == 200 {
            break attempt;
        }
        assert!(started.elapsed() < Duration::from_secs(90), "the run was never taken over; last status {}", attempt.status);
        thread::sleep(Duration::from_secs(2));
    };
    let events = resumed.drain(Duration::from_secs(90));
    assert_contiguous(&events);
    let terminal = events.last().expect("terminal event");
    assert_eq!(terminal["type"], json!("run_completed"), "events: {events:?}");
    assert_eq!(terminal["text"], json!("Mình đã ghi nhận việc cần làm."));
    assert_eq!(events.iter().filter(|event| event["type"] == "run_completed").count(), 1);
    assert_eq!(events.iter().filter(|event| event["type"] == "tool_completed").count(), 1);
    let streamed: String = events.iter().filter(|event| event["type"] == "message_delta").filter_map(|event| event["text"].as_str()).collect();
    assert_eq!(streamed, "Đang xử lý", "text streamed after the takeover must not be appended to the interrupted partial reply: {events:?}");

    let tasks = stack.rows(&user, "kael_tasks?select=id,title");
    assert_eq!(tasks.len(), 1, "the resumed run must not create the task again");
    let runs = stack.rows(&user, &format!("kael_runs?select=status&id=eq.{run_id}"));
    assert_eq!(runs[0]["status"], json!("completed"));
    assert_eq!(model.call_count(), 3);
    let requests = model.requests.lock().expect("requests").clone();
    let resumed_messages = requests[2]["messages"].as_array().expect("messages");
    assert!(resumed_messages.iter().any(|message| message["role"] == "tool"), "the journaled tool result reaches the resumed model call");
}

fn holds_task_creation(method: &str, path: &str, body: &str) -> bool {
    method == "POST" && path.ends_with("/rpc/kael_save_task") && body.contains("\"p_task_id\":null")
}

#[test]
#[ignore = "needs the live Supabase fixture stack (KAEL_TEST_GATEWAY, KAEL_TEST_ANON, KAEL_TEST_SERVICE)"]
fn a_tool_in_flight_at_the_crash_never_repeats_its_effect() {
    let stack = Stack::from_env();
    let gateway = Gateway::start(&stack.gateway, holds_task_creation);
    let model = MockModel::start(vec![
        Step::Tool { name: "task_create", arguments: json!({"title": "Lắp quạt trần", "kind": "general", "status": "running", "note": ""}) },
        Step::Text("Mình đã kiểm tra lại việc cần làm."),
        Step::Text("Mình đã kiểm tra lại việc cần làm."),
    ]);
    let data = scratch("inflight");
    let mut first = Service::spawn(&stack.through(&gateway), &data, "holder-inflight-a", model.port, 120);
    let user = stack.signup();
    let request_id = kael_durable::util::random_uuid();

    gateway.arm();
    let reply = first.turn(&user, &turn_body(&request_id, "Tạo việc lắp quạt trần giúp mình"));
    assert_eq!(reply.status, 200);
    assert!(gateway.wait_held(Duration::from_secs(60)), "the task write never reached the database");
    first.kill();
    drop(reply);
    assert_eq!(stack.rows(&user, "kael_tasks?select=id,title").len(), 1, "the effect committed although its result never reached the runtime");

    let second = Service::spawn(&stack, &data, "holder-inflight-b", model.port, 120);
    let started = Instant::now();
    let mut resumed = loop {
        let attempt = second.turn(&user, &turn_body(&request_id, "Tạo việc lắp quạt trần giúp mình"));
        if attempt.status == 200 {
            break attempt;
        }
        assert!(started.elapsed() < Duration::from_secs(90), "the run was never taken over; last status {}", attempt.status);
        thread::sleep(Duration::from_secs(2));
    };
    let events = resumed.drain(Duration::from_secs(90));
    assert_contiguous(&events);
    let terminal = events.last().expect("terminal event");
    assert!(is_terminal_event(terminal), "the resumed run must reach a terminal event: {events:?}");
    assert_eq!(stack.rows(&user, "kael_tasks?select=id,title").len(), 1, "the interrupted creation must not run a second time: {events:?}");
    let creations = events.iter().filter(|event| event["type"] == "tool_started" && event["tool"] == "task_create").count();
    assert_eq!(creations, 1, "the unfinished tool call is reported once and not re-executed: {events:?}");
    assert_eq!(terminal["type"], json!("run_completed"), "events: {events:?}");
    let requests = model.requests.lock().expect("requests").clone();
    let reported: Vec<&Value> = requests
        .last()
        .and_then(|request| request["messages"].as_array())
        .into_iter()
        .flatten()
        .filter(|message| message["role"] == "tool")
        .collect();
    assert_eq!(reported.len(), 1);
    assert!(
        reported[0]["content"].as_str().is_some_and(|text| text.contains("interrupted and may have partially run")),
        "the model is told the outcome is unknown instead of receiving an invented result: {reported:?}"
    );
}

fn is_terminal_event(event: &Value) -> bool {
    matches!(event["type"].as_str(), Some("run_completed" | "run_failed"))
}

#[test]
#[ignore = "needs the live Supabase fixture stack (KAEL_TEST_GATEWAY, KAEL_TEST_ANON, KAEL_TEST_SERVICE)"]
fn deepseek_thinking_mode_is_requested_only_when_enabled() {
    let stack = Stack::from_env();
    let model = MockModel::start(vec![Step::Text("Chào bạn."), Step::Text("Chào bạn.")]);
    let user = stack.signup();
    let thinking = |extra: &[(&str, &str)], label: &str| -> Value {
        let data = scratch(label);
        let service = Service::spawn_with(&stack, &data, &format!("holder-{label}"), model.port, 120, extra);
        let before = model.requests.lock().expect("requests").len();
        let mut reply = service.turn(&user, &turn_body(&kael_durable::util::random_uuid(), "Xin chào"));
        let events = reply.drain(Duration::from_secs(60));
        assert_eq!(events.last().expect("terminal")["type"], json!("run_completed"), "events: {events:?}");
        model.requests.lock().expect("requests")[before].clone()
    };
    let enabled = thinking(&[("KAEL_DEEPSEEK_THINKING", "enabled")], "think-on");
    assert_eq!(enabled["thinking"]["type"], json!("enabled"), "request: {enabled}");
    assert!(enabled.get("reasoning_effort").is_some(), "request: {enabled}");
    let plain = thinking(&[], "think-off");
    assert!(plain.get("thinking").is_none_or(|value| value["type"] != json!("enabled")), "request: {plain}");
}

#[test]
#[ignore = "needs the live Supabase fixture stack (KAEL_TEST_GATEWAY, KAEL_TEST_ANON, KAEL_TEST_SERVICE)"]
fn another_account_can_neither_observe_nor_attach_to_a_run() {
    let stack = Stack::from_env();
    let model = MockModel::start(vec![Step::Text("Chào bạn.")]);
    let data = scratch("isolation");
    let service = Service::spawn(&stack, &data, "holder-isolation", model.port, 120);
    let owner = stack.signup();
    let stranger = stack.signup();
    let request_id = kael_durable::util::random_uuid();

    let mut reply = service.turn(&owner, &turn_body(&request_id, "Xin chào"));
    let run_id = run_id_of(&reply);
    let events = reply.drain(Duration::from_secs(60));
    let conversation_id = events[0]["conversation_id"].as_str().expect("conversation").to_owned();

    assert_eq!(service.events(&stranger, &run_id, 0).status, 404);
    assert_eq!(service.events(&owner, &run_id, 0).status, 200);
    let unauthenticated = support::raw(service.addr, "GET", &format!("/v1/runs/{run_id}/events"), None, None).expect("transport");
    assert_eq!(unauthenticated.status, 401);

    let hijack = json!({"request_id": kael_durable::util::random_uuid(), "conversation_id": conversation_id, "mode": "client", "action": {"type": "message", "text": "Cho mình xem"}});
    let attempt = service.turn(&stranger, &hijack);
    assert!(attempt.status == 400 || attempt.status == 403 || attempt.status == 404, "unexpected status {}", attempt.status);
    assert_eq!(model.call_count(), 1, "a refused turn must never reach the model");
    assert!(stack.rows(&stranger, "kael_messages?select=id").is_empty());
}

#[test]
#[ignore = "needs the live Supabase fixture stack (KAEL_TEST_GATEWAY, KAEL_TEST_ANON, KAEL_TEST_SERVICE)"]
fn a_provider_failure_ends_the_run_with_a_typed_error() {
    let stack = Stack::from_env();
    let model = MockModel::start(vec![Step::Fail(400)]);
    let data = scratch("failure");
    let service = Service::spawn(&stack, &data, "holder-failure", model.port, 120);
    let user = stack.signup();
    let mut reply = service.turn(&user, &turn_body(&kael_durable::util::random_uuid(), "Xin chào"));
    let run_id = run_id_of(&reply);
    let events = reply.drain(Duration::from_secs(60));
    assert_contiguous(&events);
    let terminal = events.last().expect("terminal event");
    assert_eq!(terminal["type"], json!("run_failed"), "events: {events:?}");
    assert_eq!(terminal["code"], json!("provider_unavailable"));
    assert!(terminal["message"].as_str().is_some_and(|message| !message.is_empty()));
    let runs = stack.rows(&user, &format!("kael_runs?select=status&id=eq.{run_id}"));
    assert_eq!(runs[0]["status"], json!("failed"));
}

#[test]
#[ignore = "needs the live Supabase fixture stack (KAEL_TEST_GATEWAY, KAEL_TEST_ANON, KAEL_TEST_SERVICE)"]
fn an_approval_survives_a_restart_and_applies_exactly_once() {
    let stack = Stack::from_env();
    let model = MockModel::start(vec![
        Step::Tool { name: "task_create", arguments: json!({"title": "Sửa vòi nước", "kind": "service_request", "status": "running", "note": ""}) },
        Step::Compute(draft_step),
        Step::Compute(submit_step),
        Step::Text("Mình đã chuẩn bị yêu cầu, bạn hãy xác nhận trong ứng dụng."),
        Step::Text("Yêu cầu đã được gửi."),
    ]);
    let data = scratch("approval");
    let mut first = Service::spawn(&stack, &data, "holder-approval-a", model.port, 120);
    let user = stack.signup();
    let mut reply = first.turn(&user, &turn_body(&kael_durable::util::random_uuid(), "Gửi yêu cầu sửa vòi nước nhà mình"));
    assert_eq!(reply.status, 200);
    let events = reply.drain(Duration::from_secs(90));
    let approval = events.iter().find(|event| event["type"] == "approval_required").unwrap_or_else(|| panic!("no approval requested: {events:?}"))["approval"].clone();
    assert_eq!(events.last().expect("terminal")["type"], json!("run_completed"), "events: {events:?}");
    assert!(stack.rows(&user, "service_requests?select=id").is_empty(), "nothing is submitted before the user approves");
    let conversation_id = events[0]["conversation_id"].as_str().expect("conversation").to_owned();
    first.kill();

    let second = Service::spawn(&stack, &data, "holder-approval-b", model.port, 120);
    let decision = |request_id: &str| {
        json!({
            "request_id": request_id, "conversation_id": conversation_id, "mode": "client",
            "action": {"type": "approve", "approval_id": approval["id"], "fingerprint": approval["fingerprint"]},
        })
    };
    let mut approved = second.turn(&user, &decision(&kael_durable::util::random_uuid()));
    assert_eq!(approved.status, 200);
    let applied = approved.drain(Duration::from_secs(90));
    assert_eq!(applied.last().expect("terminal")["type"], json!("run_completed"), "events: {applied:?}");
    assert_eq!(stack.rows(&user, "service_requests?select=id").len(), 1, "the approved effect ran once");

    let mut repeated = second.turn(&user, &decision(&kael_durable::util::random_uuid()));
    let again = repeated.drain(Duration::from_secs(90));
    assert!(again.iter().all(|event| event["type"] != "tool_completed" || event["outcome"] != json!("succeeded")), "a consumed approval cannot apply twice: {again:?}");
    assert_eq!(stack.rows(&user, "service_requests?select=id").len(), 1, "no duplicate business record after a repeated approval");

    let mut forged = approval.clone();
    forged["fingerprint"] = json!("0".repeat(64));
    let tampered = json!({
        "request_id": kael_durable::util::random_uuid(), "conversation_id": conversation_id, "mode": "client",
        "action": {"type": "approve", "approval_id": forged["id"], "fingerprint": forged["fingerprint"]},
    });
    let mut refused = second.turn(&user, &tampered);
    let outcome = refused.drain(Duration::from_secs(60));
    assert_eq!(stack.rows(&user, "service_requests?select=id").len(), 1, "a wrong fingerprint changes nothing: {outcome:?}");
}

#[test]
#[ignore = "needs the live Supabase fixture stack (KAEL_TEST_GATEWAY, KAEL_TEST_ANON, KAEL_TEST_SERVICE)"]
fn a_stalled_instance_is_fenced_out_after_another_takes_the_run() {
    let stack = Stack::from_env();
    let model = MockModel::start(vec![Step::TextThenHang("Bản nháp của máy A"), Step::Text("Câu trả lời cuối từ máy B")]);
    let data = scratch("fencing");
    let first = Service::spawn(&stack, &data, "holder-stalled", model.port, 120);
    let user = stack.signup();
    let request_id = kael_durable::util::random_uuid();
    let mut reply = first.turn(&user, &turn_body(&request_id, "Xin chào"));
    let run_id = run_id_of(&reply);
    reply.until(Duration::from_secs(60), |event| event["type"] == "message_delta");
    first.signal("STOP");

    let second = Service::spawn(&stack, &data, "holder-taker", model.port, 120);
    let started = Instant::now();
    let mut taken = loop {
        let attempt = second.turn(&user, &turn_body(&request_id, "Xin chào"));
        if attempt.status == 200 {
            break attempt;
        }
        assert!(started.elapsed() < Duration::from_secs(90), "the stalled run was never taken over; last status {}", attempt.status);
        thread::sleep(Duration::from_secs(2));
    };
    let events = taken.drain(Duration::from_secs(90));
    assert_eq!(events.last().expect("terminal")["type"], json!("run_completed"), "events: {events:?}");
    assert_eq!(events.last().expect("terminal")["text"], json!("Câu trả lời cuối từ máy B"));

    first.signal("CONT");
    thread::sleep(Duration::from_secs(15));
    let runs = stack.rows(&user, &format!("kael_runs?select=status&id=eq.{run_id}"));
    assert_eq!(runs[0]["status"], json!("completed"));
    let conversation_id = events[0]["conversation_id"].as_str().expect("conversation").to_owned();
    let messages = stack.rows(&user, &format!("kael_messages?select=role,content&conversation_id=eq.{conversation_id}&order=created_at.asc"));
    assert_eq!(messages.iter().filter(|row| row["role"] == "assistant").count(), 1, "the fenced instance wrote nothing: {messages:?}");
    assert_eq!(messages.last().expect("message")["content"], json!("Câu trả lời cuối từ máy B"));
}

#[test]
#[ignore = "needs the live Supabase fixture stack (KAEL_TEST_GATEWAY, KAEL_TEST_ANON, KAEL_TEST_SERVICE)"]
fn concurrent_accounts_run_side_by_side_without_crossing() {
    let stack = Stack::from_env();
    let model = MockModel::start(vec![Step::Text("Trả lời một."), Step::Text("Trả lời hai."), Step::Text("Trả lời ba."), Step::Text("Trả lời bốn.")]);
    let data = scratch("concurrent");
    let service = Service::spawn(&stack, &data, "holder-concurrent", model.port, 120);
    let accounts: Vec<support::User> = (0..4).map(|_| stack.signup()).collect();
    let results: Vec<(String, Vec<Value>)> = thread::scope(|scope| {
        let handles: Vec<_> = accounts
            .iter()
            .map(|user| {
                let service = &service;
                scope.spawn(move || {
                    let mut reply = service.turn(user, &turn_body(&kael_durable::util::random_uuid(), "Xin chào"));
                    assert_eq!(reply.status, 200);
                    (run_id_of(&reply), reply.drain(Duration::from_secs(90)))
                })
            })
            .collect();
        handles.into_iter().map(|handle| handle.join().expect("turn thread")).collect()
    });
    let mut run_ids: Vec<&String> = results.iter().map(|(run_id, _)| run_id).collect();
    run_ids.sort();
    run_ids.dedup();
    assert_eq!(run_ids.len(), 4);
    for (user, (run_id, events)) in accounts.iter().zip(&results) {
        assert_contiguous(events);
        assert_eq!(events.last().expect("terminal")["type"], json!("run_completed"));
        assert_eq!(stack.rows(user, "kael_runs?select=id").len(), 1);
        assert_eq!(stack.rows(user, &format!("kael_runs?select=status&id=eq.{run_id}"))[0]["status"], json!("completed"));
    }
    assert_eq!(model.call_count(), 4);
}

#[test]
#[ignore = "needs the live Supabase fixture stack (KAEL_TEST_GATEWAY, KAEL_TEST_ANON, KAEL_TEST_SERVICE)"]
fn account_erasure_purges_the_runtime_journals() {
    let stack = Stack::from_env();
    let model = MockModel::start(vec![Step::Text("Đã rõ.")]);
    let data = scratch("erasure");
    let service = Service::spawn(&stack, &data, "holder-erasure", model.port, 1);
    let user = stack.signup();
    let mut reply = service.turn(&user, &turn_body(&kael_durable::util::random_uuid(), "Xin chào"));
    let run_id = run_id_of(&reply);
    reply.drain(Duration::from_secs(60));
    assert_eq!(files_for(&data, &run_id).len(), 3, "the run left its journal, events and metadata on disk");

    let backend = stack.backend();
    let requested = backend.user(&user.token, "POST", "rpc/request_account_deletion", Some(&json!({})), Duration::from_secs(10), None).expect("transport");
    assert!(requested.ok(), "deletion request failed with HTTP {}", requested.status);
    let processed = backend.service_rpc("process_account_deletions", &json!({"p_grace": "0 seconds"}), None).expect("transport");
    assert!(processed.ok(), "deletion processing failed with HTTP {}", processed.status);

    let started = Instant::now();
    while !files_for(&data, &run_id).is_empty() {
        assert!(started.elapsed() < Duration::from_secs(60), "journals were not purged: {:?}", files_for(&data, &run_id));
        thread::sleep(Duration::from_secs(2));
    }
    let queued = Instant::now();
    loop {
        let queue = backend.service_rpc("kael_durable_purge_queue", &json!({"p_limit": 100}), None).expect("transport");
        let pending = queue.body.as_array().into_iter().flatten().filter(|row| row["run_id"] == json!(run_id)).count();
        if pending == 0 {
            break;
        }
        assert!(queued.elapsed() < Duration::from_secs(30), "the run stayed in the purge queue after its files were removed");
        thread::sleep(Duration::from_secs(1));
    }
}

#[test]
#[ignore = "needs the live Supabase fixture stack (KAEL_TEST_GATEWAY, KAEL_TEST_ANON, KAEL_TEST_SERVICE)"]
fn a_second_instance_streams_a_run_owned_by_another_instance_on_the_shared_volume() {
    let stack = Stack::from_env();
    let model = MockModel::start(vec![Step::Paced("một hai ba bốn năm sáu bảy tám chín mười mười-một mười-hai")]);
    let data = scratch("cross-instance");
    let owner = Service::spawn(&stack, &data, "holder-owner", model.port, 120);
    let follower = Service::spawn(&stack, &data, "holder-follower", model.port, 120);
    let user = stack.signup();
    let other = stack.signup();
    let request_id = kael_durable::util::random_uuid();
    let mut original = owner.turn(&user, &turn_body(&request_id, "Xin chào"));
    let run_id = run_id_of(&original);
    original.until(Duration::from_secs(60), |event| event["type"] == "message_delta");

    let mut reattached = follower.turn(&user, &turn_body(&request_id, "Xin chào"));
    assert_eq!(reattached.status, 200, "the other instance must stream the run, not refuse it");
    assert_eq!(run_id_of(&reattached), run_id);
    let replayed = reattached.drain(Duration::from_secs(60));
    assert_contiguous(&replayed);
    assert_eq!(replayed[0]["type"], json!("run_started"));
    assert_eq!(replayed[0]["replayed"], json!(true));
    assert_eq!(replayed.last().expect("terminal")["type"], json!("run_completed"), "events: {replayed:?}");

    let mut tail = follower.events(&user, &run_id, 0);
    assert_eq!(tail.status, 200);
    let again = tail.drain(Duration::from_secs(30));
    assert_eq!(types(&again), types(&replayed));
    assert_eq!(follower.events(&other, &run_id, 0).status, 404, "another account cannot read the run through any instance");

    let finished = original.drain(Duration::from_secs(60));
    assert_eq!(finished.last().expect("terminal")["type"], json!("run_completed"));
    assert_eq!(model.call_count(), 1, "the follower never started a second model call");
    let conversation_id = replayed[0]["conversation_id"].as_str().expect("conversation").to_owned();
    let messages = stack.rows(&user, &format!("kael_messages?select=role&conversation_id=eq.{conversation_id}"));
    assert_eq!(messages.iter().filter(|row| row["role"] == "assistant").count(), 1);
}

#[test]
#[ignore = "needs the live Supabase fixture stack (KAEL_TEST_GATEWAY, KAEL_TEST_ANON, KAEL_TEST_SERVICE)"]
fn an_events_reader_on_another_instance_keeps_following_the_live_log() {
    let stack = Stack::from_env();
    let model = MockModel::start(vec![Step::Paced("một hai ba bốn năm sáu bảy tám chín mười mười-một mười-hai")]);
    let data = scratch("cross-events");
    let owner = Service::spawn(&stack, &data, "holder-owner", model.port, 120);
    let follower = Service::spawn(&stack, &data, "holder-follower", model.port, 120);
    let user = stack.signup();
    let request_id = kael_durable::util::random_uuid();
    let mut original = owner.turn(&user, &turn_body(&request_id, "Xin chào"));
    let run_id = run_id_of(&original);
    original.until(Duration::from_secs(60), |event| event["type"] == "message_delta");

    let mut tail = follower.events(&user, &run_id, 0);
    assert_eq!(tail.status, 200);
    let seen = tail.drain(Duration::from_secs(60));
    assert_contiguous(&seen);
    assert_eq!(seen.last().expect("terminal")["type"], json!("run_completed"), "events: {seen:?}");
    let finished = original.drain(Duration::from_secs(60));
    assert_eq!(finished.last().expect("terminal")["seq"], seen.last().expect("terminal")["seq"], "both instances saw the same final sequence");
}

#[test]
#[ignore = "needs the live Supabase fixture stack (KAEL_TEST_GATEWAY, KAEL_TEST_ANON, KAEL_TEST_SERVICE)"]
fn deleting_a_session_waits_for_the_run_then_purges_its_files_and_refuses_new_turns() {
    let stack = Stack::from_env();
    let model = MockModel::start(vec![Step::Paced("một hai ba bốn năm sáu bảy tám chín mười")]);
    let data = scratch("session-delete");
    let service = Service::spawn(&stack, &data, "holder-delete", model.port, 1);
    let user = stack.signup();
    let other = stack.signup();
    let backend = stack.backend();
    let delete = |account: &support::User, conversation_id: &str| {
        backend.user(&account.token, "POST", "rpc/kael_delete_conversation", Some(&json!({"p_conversation_id": conversation_id})), Duration::from_secs(10), None).expect("transport")
    };

    let mut reply = service.turn(&user, &turn_body(&kael_durable::util::random_uuid(), "Xin chào"));
    let run_id = run_id_of(&reply);
    let started = reply.until(Duration::from_secs(60), |event| event["type"] == "message_delta");
    let conversation_id = started[0]["conversation_id"].as_str().expect("conversation").to_owned();
    assert!(!delete(&user, &conversation_id).ok(), "a conversation with a live run cannot be deleted");
    assert!(!delete(&other, &conversation_id).ok(), "another account cannot delete the conversation");

    let events = reply.drain(Duration::from_secs(60));
    assert_eq!(events.last().expect("terminal")["type"], json!("run_completed"));
    assert_eq!(files_for(&data, &run_id).len(), 3);
    let deleted = delete(&user, &conversation_id);
    assert!(deleted.ok(), "deleting a finished conversation failed with HTTP {}", deleted.status);

    let waited = Instant::now();
    while !files_for(&data, &run_id).is_empty() {
        assert!(waited.elapsed() < Duration::from_secs(60), "journals were not purged: {:?}", files_for(&data, &run_id));
        thread::sleep(Duration::from_secs(2));
    }
    assert_eq!(service.events(&user, &run_id, 0).status, 404, "the purged run has no event stream");
    let resumed = service.turn(&user, &json!({"request_id": kael_durable::util::random_uuid(), "conversation_id": conversation_id, "mode": "client", "action": {"type": "message", "text": "Tiếp tục"}}));
    assert_ne!(resumed.status, 200, "a deleted conversation accepts no new turn");
    assert_eq!(model.call_count(), 1);
}
