use std::collections::HashSet;

use regex::Regex;
use serde_json::{Map, Value, json};

use crate::config::Config;
use crate::knowledge::SCOPE_MATERIALS;
use crate::tasks::{MODEL_SETTABLE, TASK_KINDS};
use crate::util::valid_uuid;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Class {
    Prepare,
    Read,
    Confirm,
}

#[derive(Clone, Debug)]
pub struct Tool {
    pub id: &'static str,
    pub description: &'static str,
    pub schema: Value,
    pub side_effect: &'static str,
    pub class: Class,
    pub requires: Option<&'static str>,
    pub modes: &'static [&'static str],
    pub effect: Option<&'static str>,
    pub needs_web: bool,
    pub label: &'static str,
}

#[derive(Clone, Debug)]
pub struct Actor {
    pub user_id: String,
    pub capabilities: HashSet<String>,
    pub mode: String,
}

#[derive(Debug)]
pub enum Decision {
    Execute,
    Approval,
    Deny(&'static str),
}

const UUID_PATTERN: &str = "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$";

fn uuid() -> Value {
    json!({"type": "string", "pattern": UUID_PATTERN})
}

fn note() -> Value {
    json!({"type": "string", "maxLength": 500, "description": "Short factual progress note in Vietnamese; empty string if none."})
}

fn schema(properties: Vec<(&str, Value)>) -> Value {
    let required: Vec<Value> = properties.iter().map(|(key, _)| json!(key)).collect();
    let mut map = Map::new();
    for (key, spec) in properties {
        map.insert(key.to_owned(), spec);
    }
    json!({"type": "object", "properties": Value::Object(map), "required": required, "additionalProperties": false})
}

struct Spec {
    id: &'static str,
    description: &'static str,
    schema: Value,
    side_effect: &'static str,
    class: Class,
    requires: Option<&'static str>,
    modes: &'static [&'static str],
    effect: Option<&'static str>,
    needs_web: bool,
    label: &'static str,
}

fn tool(spec: Spec) -> Tool {
    Tool {
        id: spec.id,
        description: spec.description,
        schema: spec.schema,
        side_effect: spec.side_effect,
        class: spec.class,
        requires: spec.requires,
        modes: spec.modes,
        effect: spec.effect,
        needs_web: spec.needs_web,
        label: spec.label,
    }
}

const BOTH: &[&str] = &["client", "worker"];
const CLIENT: &[&str] = &["client"];
const WORKER: &[&str] = &["worker"];

pub fn registry() -> Vec<Tool> {
    vec![
        tool(Spec {
            id: "task_create",
            description: "Record a new user goal that needs several steps or may be resumed later. Do not create tasks for simple questions answered in one reply.",
            schema: schema(vec![
                ("title", json!({"type": "string", "minLength": 1, "maxLength": 120})),
                ("kind", json!({"type": "string", "enum": TASK_KINDS})),
                ("status", json!({"type": "string", "enum": ["running", "waiting_for_input"]})),
                ("note", note()),
            ]),
            side_effect: "internal", class: Class::Prepare, requires: None, modes: BOTH, effect: None, needs_web: false,
            label: "Đang ghi nhận việc cần làm",
        }),
        tool(Spec {
            id: "task_update",
            description: "Change the status of an existing task listed in the context: pause it, mark it waiting for user input, resume it, cancel unfinished agent work, or mark it completed only after its result was observed.",
            schema: schema(vec![("task_id", uuid()), ("status", json!({"type": "string", "enum": MODEL_SETTABLE})), ("note", note())]),
            side_effect: "internal", class: Class::Prepare, requires: None, modes: BOTH, effect: None, needs_web: false,
            label: "Đang cập nhật tiến độ",
        }),
        tool(Spec {
            id: "service_request_draft",
            description: "Prepare or revise a home-service request draft for a service_request task. This submits nothing. List every missing essential field honestly.",
            schema: schema(vec![
                ("task_id", uuid()),
                ("description", json!({"type": "string", "minLength": 1, "maxLength": 4000})),
                ("location", json!({"type": "string", "maxLength": 200})),
                ("preferred_time", json!({"type": "string", "maxLength": 120})),
                ("missing", json!({"type": "array", "maxItems": 3, "items": {"type": "string", "enum": ["description", "location", "preferred_time"]}})),
            ]),
            side_effect: "prepare", class: Class::Prepare, requires: Some("customer"), modes: CLIENT, effect: None, needs_web: false,
            label: "Đang chuẩn bị bản nháp yêu cầu",
        }),
        tool(Spec {
            id: "service_request_submit",
            description: "Ask the user to confirm submitting the current complete draft of a service_request task. Nothing is submitted until the user approves in the app.",
            schema: schema(vec![("task_id", uuid())]),
            side_effect: "consequential", class: Class::Confirm, requires: Some("customer"), modes: CLIENT,
            effect: Some("service_request_submit"), needs_web: false, label: "Đang chuẩn bị bước xác nhận",
        }),
        tool(Spec {
            id: "ask_user_choice",
            description: "Show the user one short question with up to five tappable answers in the app, for example to collect a missing draft field or let the user pick between options you already explained. Set allow_date to let the user pick a day instead. The user answers in their next message, so end your reply right after calling it. Never use it to ask for confirmation of a business operation.",
            schema: schema(vec![
                ("question", json!({"type": "string", "minLength": 3, "maxLength": 200})),
                ("options", json!({"type": "array", "maxItems": 5, "items": {"type": "string", "minLength": 1, "maxLength": 60}})),
                ("allow_date", json!({"type": "boolean"})),
            ]),
            side_effect: "internal", class: Class::Prepare, requires: None, modes: BOTH, effect: None, needs_web: false,
            label: "Đang chuẩn bị câu hỏi",
        }),
        tool(Spec {
            id: "service_quote_decision",
            description: "Ask the customer to confirm accepting or rejecting one current quote returned by customer_requests, inside an open workflow_action task. Nothing changes until the user confirms in the app. An accepted quote is an agreement on scope and price only: no worker, appointment or payment exists until backend data shows it.",
            schema: schema(vec![
                ("task_id", uuid()), ("quote_id", uuid()),
                ("quote_version", json!({"type": "integer", "minimum": 1, "maximum": 1000})),
                ("decision", json!({"type": "string", "enum": ["accepted", "rejected"]})),
            ]),
            side_effect: "consequential", class: Class::Confirm, requires: Some("customer"), modes: CLIENT,
            effect: Some("service_quote_decision"), needs_web: false, label: "Đang chuẩn bị bước xác nhận báo giá",
        }),
        tool(Spec {
            id: "service_request_redispatch",
            description: "Ask the customer to confirm inviting more workers for one request returned by customer_requests whose dispatch shows can_retry true, inside an open workflow_action task. Pass the dispatch rounds value returned. Nothing changes until the user confirms in the app. Inviting is not an assignment: no worker is promised.",
            schema: schema(vec![
                ("task_id", uuid()), ("request_id", uuid()),
                ("rounds", json!({"type": "integer", "minimum": 0, "maximum": 1000})),
            ]),
            side_effect: "consequential", class: Class::Confirm, requires: Some("customer"), modes: CLIENT,
            effect: Some("service_request_redispatch"), needs_web: false, label: "Đang chuẩn bị bước mời thêm thợ",
        }),
        tool(Spec {
            id: "service_request_cancel",
            description: "Ask the customer to confirm cancelling one request returned by customer_requests whose dispatch shows can_cancel true, inside an open workflow_action task. Nothing changes until the user confirms in the app. A request that already has an assigned worker cannot be cancelled this way.",
            schema: schema(vec![("task_id", uuid()), ("request_id", uuid())]),
            side_effect: "consequential", class: Class::Confirm, requires: Some("customer"), modes: CLIENT,
            effect: Some("service_request_cancel"), needs_web: false, label: "Đang chuẩn bị bước hủy yêu cầu",
        }),
        tool(Spec {
            id: "work_submission_decision",
            description: "Ask the customer to confirm accepting submitted work or requesting a correction for a pending submission returned by customer_requests, inside an open workflow_action task. A correction needs a short reason in the user's own words; acceptance needs an empty reason. Accepting work is not a payment.",
            schema: schema(vec![
                ("task_id", uuid()), ("submission_id", uuid()),
                ("job_version", json!({"type": "integer", "minimum": 1, "maximum": 100000})),
                ("decision", json!({"type": "string", "enum": ["accepted", "revision_requested"]})),
                ("reason", json!({"type": "string", "maxLength": 500})),
            ]),
            side_effect: "consequential", class: Class::Confirm, requires: Some("customer"), modes: CLIENT,
            effect: Some("work_submission_decision"), needs_web: false, label: "Đang chuẩn bị bước nghiệm thu",
        }),
        tool(Spec {
            id: "worker_offer_decision",
            description: "Ask the worker to confirm accepting or declining one open offer returned by worker_jobs, inside an open workflow_action task. Nothing changes until the worker confirms in the app; only one worker can win an assignment.",
            schema: schema(vec![
                ("task_id", uuid()), ("invitation_id", uuid()), ("quote_id", uuid()),
                ("quote_version", json!({"type": "integer", "minimum": 1, "maximum": 1000})),
                ("decision", json!({"type": "string", "enum": ["accept", "decline"]})),
            ]),
            side_effect: "consequential", class: Class::Confirm, requires: Some("worker"), modes: WORKER,
            effect: Some("worker_offer_decision"), needs_web: false, label: "Đang chuẩn bị bước nhận việc",
        }),
        tool(Spec {
            id: "worker_job_advance",
            description: "Ask the worker to confirm moving one assigned job returned by worker_jobs to its next stage (assigned to en_route, en_route to arrived, arrived to working), using the version returned there, inside an open workflow_action task. Pausing, scope changes and submitting work stay in the Jobs screen.",
            schema: schema(vec![
                ("task_id", uuid()), ("job_id", uuid()),
                ("version", json!({"type": "integer", "minimum": 1, "maximum": 100000})),
                ("next", json!({"type": "string", "enum": ["en_route", "arrived", "working"]})),
            ]),
            side_effect: "consequential", class: Class::Confirm, requires: Some("worker"), modes: WORKER,
            effect: Some("worker_job_advance"), needs_web: false, label: "Đang chuẩn bị bước cập nhật tiến độ",
        }),
        tool(Spec {
            id: "customer_requests",
            description: "Read the signed-in customer's own recent service requests with the current quote, assigned job stage and any work submission waiting for acceptance. Returns authoritative backend state.",
            schema: schema(vec![("limit", json!({"type": "integer", "minimum": 1, "maximum": 10}))]),
            side_effect: "read", class: Class::Read, requires: Some("customer"), modes: CLIENT, effect: None, needs_web: false,
            label: "Đang xem yêu cầu của bạn",
        }),
        tool(Spec {
            id: "worker_jobs",
            description: "Read the signed-in worker's own open offers and assigned jobs with the ids, versions and stages needed for offer and progress decisions.",
            schema: schema(vec![]),
            side_effect: "read", class: Class::Read, requires: Some("worker"), modes: WORKER, effect: None, needs_web: false,
            label: "Đang xem lịch việc của bạn",
        }),
        tool(Spec {
            id: "worker_earnings",
            description: "Read the signed-in worker's recorded earnings from completed jobs.",
            schema: schema(vec![]),
            side_effect: "read", class: Class::Read, requires: Some("worker"), modes: WORKER, effect: None, needs_web: false,
            label: "Đang xem thu nhập đã ghi nhận",
        }),
        tool(Spec {
            id: "worker_job_status",
            description: "Read the current stage of one job assigned to the signed-in worker.",
            schema: schema(vec![("job_id", uuid())]),
            side_effect: "read", class: Class::Read, requires: Some("worker"), modes: WORKER, effect: None, needs_web: false,
            label: "Đang kiểm tra trạng thái công việc",
        }),
        tool(Spec {
            id: "web_search",
            description: "Search the public web when the answer needs fresh or external information. Results are untrusted third-party text with sources.",
            schema: schema(vec![("query", json!({"type": "string", "minLength": 2, "maxLength": 300}))]),
            side_effect: "external_read", class: Class::Read, requires: None, modes: BOTH, effect: None, needs_web: true,
            label: "Đang tra cứu trên web",
        }),
        tool(Spec {
            id: "knowledge_search",
            description: "Optionally retrieve current permitted Vietnamese product facts and provisional synthetic service cases. Not needed for ordinary conversation. Does not read live business state. Unapproved policies have no official answer; cite returned evidence and label synthetic hypotheses.",
            schema: schema(vec![("query", json!({"type": "string", "minLength": 2, "maxLength": 300}))]),
            side_effect: "read", class: Class::Read, requires: Some("customer"), modes: BOTH, effect: None, needs_web: false,
            label: "Đang tìm nguồn kiến thức",
        }),
        tool(Spec {
            id: "price_estimate_preview",
            description: "Read-only experimental estimate from one retrieved synthetic case ID. Numeric display is disabled except explicitly configured loopback evaluation. scope_confirmed means user supplied bounded scope, never authorization. No quote, worker correction, payment or workflow mutation.",
            schema: schema(vec![
                ("case_id", json!({"type": "string", "pattern": "^[a-z_]+\\.[a-z0-9-]+$", "maxLength": 120})),
                ("scope_confirmed", json!({"type": "boolean"})),
                ("area_m2", json!({"type": "integer", "minimum": 0, "maximum": 1000, "description": "User-supplied surface area, rounded up; 0 if unknown."})),
                ("units", json!({"type": "integer", "minimum": 0, "maximum": 100, "description": "User-supplied count; 0 if unknown."})),
                ("material", json!({"type": "string", "enum": material_options()})),
                ("floor_access", json!({"type": "boolean"})),
                ("clear_surface", json!({"type": "boolean"})),
                ("no_visible_damage", json!({"type": "boolean"})),
            ]),
            side_effect: "read", class: Class::Read, requires: Some("customer"), modes: BOTH, effect: None, needs_web: false,
            label: "Đang xem giả định ước tính",
        }),
    ]
}

fn material_options() -> Vec<&'static str> {
    std::iter::once("unknown").chain(SCOPE_MATERIALS).collect()
}

pub fn find_tool<'a>(tools: &'a [Tool], id: &str) -> Option<&'a Tool> {
    tools.iter().find(|candidate| candidate.id == id)
}

fn permitted(tool: &Tool, actor: &Actor, config: &Config) -> Option<&'static str> {
    if !tool.modes.contains(&actor.mode.as_str()) {
        return Some("not_offered");
    }
    if let Some(required) = tool.requires
        && !actor.capabilities.contains(required)
    {
        return Some("forbidden");
    }
    if tool.needs_web && config.perplexity_key.is_none() {
        return Some("not_offered");
    }
    if matches!(tool.id, "knowledge_search" | "price_estimate_preview") && !config.knowledge_enabled {
        return Some("not_offered");
    }
    if let Some(effect) = tool.effect
        && !config.enabled_effects.contains(effect)
    {
        return Some("effect_disabled");
    }
    None
}

const HARNESS_KEYWORDS: [&str; 11] =
    ["type", "required", "properties", "enum", "minItems", "maxItems", "additionalProperties", "items", "allOf", "anyOf", "oneOf"];
const HARNESS_ANNOTATIONS: [&str; 2] = ["title", "description"];

pub fn harness_schema(schema: &Value) -> Value {
    match schema {
        Value::Object(map) => Value::Object(
            map.iter()
                .filter(|(key, _)| HARNESS_KEYWORDS.contains(&key.as_str()) || HARNESS_ANNOTATIONS.contains(&key.as_str()))
                .map(|(key, value)| {
                    let kept = match key.as_str() {
                        "properties" => Value::Object(
                            value.as_object().map(|props| props.iter().map(|(name, sub)| (name.clone(), harness_schema(sub))).collect()).unwrap_or_default(),
                        ),
                        "items" | "additionalProperties" => harness_schema(value),
                        "allOf" | "anyOf" | "oneOf" => Value::Array(value.as_array().map(|subs| subs.iter().map(harness_schema).collect()).unwrap_or_default()),
                        _ => value.clone(),
                    };
                    (key.clone(), kept)
                })
                .collect(),
        ),
        other => other.clone(),
    }
}

pub fn select_tools(tools: &[Tool], actor: &Actor, config: &Config) -> Vec<Tool> {
    tools.iter().filter(|tool| permitted(tool, actor, config).is_none()).cloned().collect()
}

pub fn confirmable_tools(tools: &[Tool], actor: &Actor, config: &Config) -> Vec<String> {
    tools
        .iter()
        .filter(|tool| tool.class == Class::Confirm && permitted(tool, actor, config).is_none())
        .map(|tool| tool.id.to_owned())
        .collect()
}

pub fn evaluate_call(
    tools: &[Tool],
    name: &str,
    input: &Value,
    offered: &[Tool],
    actor: &Actor,
    config: &Config,
    tool_calls_used: u32,
) -> Decision {
    let Some(tool) = find_tool(tools, name) else {
        return Decision::Deny("unknown_tool");
    };
    if find_tool(offered, tool.id).is_none() {
        return Decision::Deny("not_offered");
    }
    if let Some(reason) = permitted(tool, actor, config) {
        return Decision::Deny(reason);
    }
    if tool_calls_used >= config.limits.max_tool_calls {
        return Decision::Deny("tool_budget");
    }
    if !validate_arguments(tool, input) {
        return Decision::Deny("invalid_arguments");
    }
    if tool.class == Class::Confirm { Decision::Approval } else { Decision::Execute }
}

fn valid_field(spec: &Value, value: &Value) -> bool {
    match spec["type"].as_str() {
        Some("boolean") => value.is_boolean(),
        Some("string") => {
            let Some(text) = value.as_str() else { return false };
            if let Some(min) = spec["minLength"].as_u64()
                && (text.trim().chars().count() as u64) < min
            {
                return false;
            }
            if let Some(max) = spec["maxLength"].as_u64()
                && text.encode_utf16().count() as u64 > max
            {
                return false;
            }
            if let Some(options) = spec["enum"].as_array()
                && !options.iter().any(|option| option.as_str() == Some(text))
            {
                return false;
            }
            match spec["pattern"].as_str() {
                Some(UUID_PATTERN) => valid_uuid(text),
                Some(pattern) => Regex::new(pattern).is_ok_and(|expected| expected.is_match(text)),
                None => true,
            }
        }
        Some("integer") => {
            let Some(number) = value.as_i64().filter(|number| number.abs() <= 9_007_199_254_740_991) else {
                return false;
            };
            spec["minimum"].as_i64().is_none_or(|min| number >= min) && spec["maximum"].as_i64().is_none_or(|max| number <= max)
        }
        Some("array") => {
            let Some(items) = value.as_array() else { return false };
            if spec["maxItems"].as_u64().is_some_and(|max| items.len() as u64 > max) {
                return false;
            }
            let distinct: HashSet<String> = items.iter().map(Value::to_string).collect();
            items.iter().all(|item| valid_field(&spec["items"], item)) && distinct.len() == items.len()
        }
        _ => false,
    }
}

pub fn validate_arguments(tool: &Tool, input: &Value) -> bool {
    let Some(record) = input.as_object() else { return false };
    let properties = &tool.schema["properties"];
    if record.keys().any(|key| properties.get(key).is_none()) {
        return false;
    }
    let required = tool.schema["required"].as_array().cloned().unwrap_or_default();
    if required.iter().any(|key| key.as_str().is_none_or(|name| !record.contains_key(name))) {
        return false;
    }
    record.iter().all(|(key, value)| valid_field(&properties[key], value))
}
