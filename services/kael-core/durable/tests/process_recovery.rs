mod support;

use std::path::Path;
use std::thread;
use std::time::{Duration, Instant};

use serde_json::{Value, json};
use support::{MockModel, Service, Stack, Step, assert_contiguous, scratch, types};

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

    let tasks = stack.rows(&user, "kael_tasks?select=id,title");
    assert_eq!(tasks.len(), 1, "the resumed run must not create the task again");
    let runs = stack.rows(&user, &format!("kael_runs?select=status&id=eq.{run_id}"));
    assert_eq!(runs[0]["status"], json!("completed"));
    assert_eq!(model.call_count(), 3);
    let requests = model.requests.lock().expect("requests").clone();
    let resumed_messages = requests[2]["messages"].as_array().expect("messages");
    assert!(resumed_messages.iter().any(|message| message["role"] == "tool"), "the journaled tool result reaches the resumed model call");
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
    let queue = backend.service_rpc("kael_durable_purge_queue", &json!({"p_limit": 100}), None).expect("transport");
    let pending: Vec<&Value> = queue.body.as_array().into_iter().flatten().filter(|row| row["run_id"] == json!(run_id)).collect();
    assert!(pending.is_empty(), "the run left the purge queue once its files were removed");
}
