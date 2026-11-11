use serde_json::{Value, json};

pub const TASK_KINDS: [&str; 7] = [
    "general",
    "service_request",
    "customer_lookup",
    "worker_assist",
    "research",
    "writing",
    "workflow_action",
];

pub const MODEL_SETTABLE: [&str; 6] = ["running", "waiting_for_input", "paused", "completed", "failed", "cancelled"];

fn transitions(from: &str) -> &'static [&'static str] {
    match from {
        "pending" => &["running", "waiting_for_input", "cancelled"],
        "running" => &["waiting_for_input", "waiting_for_approval", "paused", "completed", "failed", "cancelled"],
        "waiting_for_input" => &["running", "waiting_for_approval", "paused", "cancelled"],
        "waiting_for_approval" => &["running", "waiting_for_input", "paused", "cancelled"],
        "paused" => &["running", "waiting_for_input", "cancelled"],
        _ => &[],
    }
}

pub fn can_transition(from: &str, to: &str) -> bool {
    from == to || transitions(from).contains(&to)
}

pub fn is_terminal(status: &str) -> bool {
    transitions(status).is_empty()
}

pub fn check_model_transition(task: &Value, to: &str) -> Result<(), &'static str> {
    let status = task["status"].as_str().unwrap_or("");
    if !MODEL_SETTABLE.contains(&to) {
        return Err("not_model_settable");
    }
    if status == "waiting_for_approval" && to == "running" {
        return Err("not_model_settable");
    }
    if !can_transition(status, to) {
        return Err("invalid_transition");
    }
    if to == "completed"
        && task["artifact"]["effect_required"] == Value::Bool(true)
        && task["artifact"]["effect_result"]["status"] != "succeeded"
    {
        return Err("effect_not_observed");
    }
    Ok(())
}

pub fn task_view(task: &Value) -> Value {
    json!({
        "id": task["id"], "title": task["title"], "kind": task["kind"],
        "status": task["status"], "version": task["version"], "summary": task["summary"],
    })
}
