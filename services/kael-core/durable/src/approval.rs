use serde_json::{Value, json};

use crate::policy::confirmable_tools;
use crate::runctx::{Fail, RunContext, text_of};
use crate::store::Outcome;
use crate::tasks::task_view;

pub fn failure_message(code: &str) -> &'static str {
    match code {
        "unauthenticated" => "Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.",
        "invalid_request" => "Yêu cầu không hợp lệ.",
        "rate_limited" => "Kael đang nhận quá nhiều yêu cầu từ tài khoản này. Vui lòng thử lại sau ít phút.",
        "busy" => "Kael vẫn đang xử lý tin nhắn trước trong cuộc trò chuyện này.",
        "provider_unavailable" => "Kael chưa thể kết nối với mô hình AI. Vui lòng thử lại sau.",
        "provider_error" => "Mô hình AI tạm thời gặp lỗi. Chưa có thao tác nào được thực hiện thêm; bạn có thể thử lại.",
        "incomplete_output" => "Phản hồi bị gián đoạn trước khi hoàn tất. Nội dung phía trên có thể chưa đầy đủ.",
        "budget_exhausted" => "Kael đã dừng vì đạt giới hạn xử lý hoặc ngân sách. Các bước đã ghi nhận vẫn được giữ.",
        "approval_invalid" => "Xác nhận này không còn hợp lệ. Chưa có thao tác nào được thực hiện.",
        "consent_required" => "Bạn cần đồng ý chia sẻ dữ liệu với AI trong Kael trước khi tiếp tục. Tin nhắn chưa được gửi tới nhà cung cấp AI.",
        "cancelled" => "Lượt xử lý đã bị dừng.",
        _ => "Kael gặp lỗi nội bộ. Chưa có thao tác nào được báo là thành công.",
    }
}

pub fn is_retryable(code: &str) -> bool {
    matches!(code, "rate_limited" | "busy" | "provider_error" | "incomplete_output" | "internal")
}

fn invalid_approval(status: &str) -> &'static str {
    match status {
        "expired" => "Xác nhận đã hết hạn. Chưa có thao tác nào được thực hiện; hãy yêu cầu Kael chuẩn bị lại.",
        "mismatch" => "Nội dung xác nhận không khớp với bản nháp hiện tại. Chưa có thao tác nào được thực hiện.",
        "stale" => "Bản nháp đã thay đổi sau khi tạo xác nhận. Chưa có thao tác nào được thực hiện.",
        "rejected" => "Bước này đã được hủy trước đó. Chưa có thao tác nào được thực hiện.",
        "consumed" => "Bước này đã được xác nhận trước đó nên không thể hủy nữa.",
        "unconfirmed" => "Bước này chưa được bạn xác nhận nên không có gì để kiểm tra lại. Chưa có thao tác nào được thực hiện.",
        "unresolved" => "Một yêu cầu bạn đã xác nhận trước đó vẫn chưa rõ kết quả. Hãy bấm \"Kiểm tra lại\" trên yêu cầu đó trước; xác nhận này chưa gửi gì và vẫn được giữ đến khi hết hạn.",
        "busy" => "Yêu cầu này đang được kiểm tra ở một lượt khác. Chưa có thao tác nào được thực hiện thêm; vui lòng thử lại sau ít phút.",
        "unavailable" => "Thao tác này hiện không khả dụng cho tài khoản hoặc chế độ đang dùng. Chưa có thao tác nào được thực hiện; bạn vẫn có thể tiếp tục trò chuyện với Kael.",
        _ => "Không tìm thấy xác nhận hợp lệ cho tài khoản này. Chưa có thao tác nào được thực hiện.",
    }
}

const WORKFLOW_REFUSED: &str = "Hệ thống chưa thực hiện thao tác này vì dữ liệu đã thay đổi hoặc không còn hợp lệ. Chưa có gì thay đổi; hãy xem lại trạng thái mới nhất.";
const WORKFLOW_UNCERTAIN: &str = "Chưa xác định được thao tác đã được ghi nhận hay chưa, nên Kael chưa báo là đã xong. Bạn có thể bấm \"Kiểm tra lại\": Kael dùng lại đúng thao tác bạn đã xác nhận. Nếu hệ thống đã ghi nhận, Kael chỉ báo lại kết quả; nếu chưa, chính thao tác đó được hoàn tất. Không có thao tác thứ hai và không cần xác nhận lại.";
const SUBMIT_UNCERTAIN: &str = "Chưa xác định được yêu cầu đã được ghi nhận hay chưa, nên Kael chưa báo là đã gửi. Bạn có thể bấm \"Kiểm tra lại\": Kael dùng lại đúng lần gửi bạn đã xác nhận với cùng mã gửi. Nếu yêu cầu đã được ghi nhận, Kael chỉ báo lại kết quả; nếu chưa, lần gửi đó được hoàn tất. Không có yêu cầu thứ hai và không cần xác nhận lại.";

struct Copy {
    label: &'static str,
    kind: &'static str,
    refused: &'static str,
    uncertain: &'static str,
}

fn effect_copy(tool: &str, args: &Value) -> Copy {
    let flow = |label, kind| Copy { label, kind, refused: WORKFLOW_REFUSED, uncertain: WORKFLOW_UNCERTAIN };
    match tool {
        "service_quote_decision" => {
            if args["decision"] == "accepted" { flow("Đang chấp nhận báo giá", "service_quote") } else { flow("Đang từ chối báo giá", "service_quote") }
        }
        "work_submission_decision" => {
            if args["decision"] == "accepted" { flow("Đang nghiệm thu công việc", "service_submission") } else { flow("Đang gửi yêu cầu sửa lại", "service_submission") }
        }
        "worker_offer_decision" => {
            if args["decision"] == "accept" {
                Copy {
                    label: "Đang nhận việc",
                    kind: "service_job",
                    refused: "Hệ thống chưa giao việc này cho bạn: lời mời đã hết hạn, đã thay đổi hoặc đã có thợ khác nhận trước. Chưa có gì thay đổi.",
                    uncertain: WORKFLOW_UNCERTAIN,
                }
            } else {
                flow("Đang từ chối lời mời", "service_invitation")
            }
        }
        "worker_job_advance" => flow("Đang cập nhật tiến độ", "service_job"),
        _ => Copy {
            label: "Đang gửi yêu cầu dịch vụ",
            kind: "service_request",
            refused: "Hệ thống chưa nhận yêu cầu này. Bản nháp vẫn được giữ; chưa có yêu cầu nào được gửi.",
            uncertain: SUBMIT_UNCERTAIN,
        },
    }
}

fn effect_done(tool: &str, args: &Value, resource_id: &str) -> String {
    match tool {
        "service_quote_decision" => {
            if args["decision"] == "accepted" {
                "Đã chấp nhận báo giá. Đây mới là thỏa thuận về phạm vi và giá: chưa có thợ nhận việc, chưa có lịch hẹn và chưa có thanh toán nào được xác nhận.".to_owned()
            } else {
                "Đã từ chối báo giá này. Yêu cầu của bạn vẫn được giữ.".to_owned()
            }
        }
        "work_submission_decision" => {
            if args["decision"] == "accepted" {
                "Đã nghiệm thu công việc. Việc thanh toán chưa được xác nhận trong ứng dụng.".to_owned()
            } else {
                "Đã gửi yêu cầu thợ sửa lại kèm lý do của bạn. Công việc chưa được nghiệm thu.".to_owned()
            }
        }
        "worker_offer_decision" => {
            if args["decision"] == "accept" {
                "Bạn đã nhận việc; công việc đã được giao cho bạn. Lịch đến nhà khách chưa được hệ thống xác nhận, hãy cập nhật tiến độ khi bắt đầu đi.".to_owned()
            } else {
                "Đã từ chối lời mời này.".to_owned()
            }
        }
        "worker_job_advance" => match args["next"].as_str() {
            Some("en_route") => "Đã cập nhật: bạn đang trên đường tới nhà khách.",
            Some("arrived") => "Đã cập nhật: bạn đã đến nơi.",
            Some("working") => "Đã cập nhật: bạn đã bắt đầu làm việc.",
            _ => "Đã cập nhật tiến độ.",
        }
        .to_owned(),
        _ => format!(
            "Đã gửi yêu cầu dịch vụ (mã {}). Đây mới là bước gửi yêu cầu: chưa có thợ, báo giá hay lịch hẹn nào được xác nhận.",
            resource_id.chars().take(8).collect::<String>()
        ),
    }
}

#[derive(Debug, PartialEq)]
pub enum Effect {
    Succeeded(String),
    Failed(String),
    Uncertain(String),
}

struct Evidence {
    path: String,
    observed: Box<dyn Fn(&Value) -> Option<String>>,
}

struct EffectCall {
    path: String,
    body: Value,
    refusals: &'static [u16],
    sqlstate_refuses: bool,
    integer_resource_job: Option<String>,
    evidence: Option<Evidence>,
}

fn row_read(table: &str, columns: &str, key: &str, value: &Value) -> String {
    format!("{table}?select={columns}&{key}=eq.{}", text_of(value))
}

fn text_id(value: &Value) -> Option<String> {
    value.as_str().map(str::to_owned)
}

fn effect_call(approval_id: &str, tool: &str, args: &Value) -> Option<EffectCall> {
    if tool == "service_request_submit" {
        let description = text_of(&args["description"]);
        let preferred = text_of(&args["preferred_time"]);
        let location = args["location"].as_str().unwrap_or("").to_owned();
        return Some(EffectCall {
            path: "rpc/submit_service_request".into(),
            body: json!({
                "p_submission_key": approval_id,
                "p_description": if preferred.is_empty() || args["preferred_time"].is_null() { description } else { format!("{description}\nThời gian mong muốn: {preferred}") },
                "p_location": location,
            }),
            refusals: &[400, 422],
            sqlstate_refuses: false,
            integer_resource_job: None,
            evidence: None,
        });
    }
    let refusals: &'static [u16] = &[400, 403, 409, 422];
    let build = |path: &str, body: Value, evidence: Option<Evidence>, job: Option<String>| EffectCall {
        path: path.into(),
        body,
        refusals,
        sqlstate_refuses: true,
        integer_resource_job: job,
        evidence,
    };
    match tool {
        "service_quote_decision" => {
            let accepting = args["decision"] == "accepted";
            let column = if accepting { "accepted_at" } else { "rejected_at" };
            Some(build(
                if accepting { "rpc/accept_service_quote" } else { "rpc/reject_service_quote" },
                json!({"p_quote_id": args["quote_id"], "p_version": args["quote_version"]}),
                Some(Evidence {
                    path: row_read("service_quotes", "id,accepted_at,rejected_at", "id", &args["quote_id"]),
                    observed: Box::new(move |row| row[column].is_string().then(|| text_id(&row["id"])).flatten()),
                }),
                None,
            ))
        }
        "work_submission_decision" => {
            let decision = args["decision"].clone();
            Some(build(
                "rpc/decide_service_submission",
                json!({
                    "p_submission_id": args["submission_id"], "p_version": args["job_version"], "p_decision": args["decision"],
                    "p_reason": if args["decision"] == "accepted" { Value::Null } else { args["reason"].clone() },
                }),
                Some(Evidence {
                    path: row_read("service_submissions", "id,decision", "id", &args["submission_id"]),
                    observed: Box::new(move |row| (row["decision"] == decision).then(|| text_id(&row["id"])).flatten()),
                }),
                None,
            ))
        }
        "worker_offer_decision" => {
            let accepting = args["decision"] == "accept";
            let evidence = if accepting {
                Evidence {
                    path: row_read("service_jobs", "id", "invitation_id", &args["invitation_id"]),
                    observed: Box::new(|row| text_id(&row["id"])),
                }
            } else {
                Evidence {
                    path: row_read("service_invitations", "id,state", "id", &args["invitation_id"]),
                    observed: Box::new(|row| (row["state"] == "declined").then(|| text_id(&row["id"])).flatten()),
                }
            };
            Some(build(
                if accepting { "rpc/accept_service_invitation" } else { "rpc/decline_service_invitation" },
                json!({"p_invitation_id": args["invitation_id"], "p_quote_id": args["quote_id"], "p_quote_version": args["quote_version"]}),
                Some(evidence),
                None,
            ))
        }
        "worker_job_advance" => {
            let next = args["next"].clone();
            let version = args["version"].as_i64().unwrap_or(0);
            Some(build(
                "rpc/advance_service_job",
                json!({"p_job_id": args["job_id"], "p_version": args["version"], "p_next": args["next"]}),
                Some(Evidence {
                    path: row_read("service_jobs", "id,stage,version", "id", &args["job_id"]),
                    observed: Box::new(move |row| {
                        (row["stage"] == next && row["version"].as_i64().is_some_and(|current| current > version))
                            .then(|| text_id(&row["id"]))
                            .flatten()
                    }),
                }),
                Some(text_of(&args["job_id"])),
            ))
        }
        _ => None,
    }
}

fn observed_effect(ctx: &RunContext, evidence: &Evidence) -> Option<String> {
    let rows = ctx.get(&evidence.path).ok()?;
    let rows = rows.as_array()?;
    if rows.len() != 1 {
        return None;
    }
    (evidence.observed)(&rows[0])
}

fn database_refused(body: &Value) -> bool {
    body["code"]
        .as_str()
        .is_some_and(|code| code.len() == 5 && code.chars().all(|c| c.is_ascii_digit() || c.is_ascii_uppercase()))
}

pub fn execute_approved_effect(ctx: &RunContext, approval_id: &str, approval: &Value) -> Effect {
    let tool = text_of(&approval["tool"]);
    let Some(call) = effect_call(approval_id, &tool, &approval["args"]) else {
        return Effect::Failed("unknown_effect".into());
    };
    let reply = match ctx.user_reply("POST", &call.path, Some(&call.body)) {
        Ok(reply) => reply,
        Err(Fail::Unavailable) => return Effect::Uncertain("user_session_unavailable".into()),
        Err(_) => return Effect::Uncertain("backend_unreachable".into()),
    };
    if !reply.ok() {
        let reason = format!("backend_http_{}", reply.status);
        if approval["status"] == "reconcile"
            && let Some(evidence) = &call.evidence
        {
            return match observed_effect(ctx, evidence) {
                Some(resource) => Effect::Succeeded(resource),
                None => Effect::Uncertain(reason),
            };
        }
        if call.refusals.contains(&reply.status) {
            return Effect::Failed(reason);
        }
        if !call.sqlstate_refuses {
            return Effect::Uncertain(reason);
        }
        return if database_refused(&reply.body) { Effect::Failed(reason) } else { Effect::Uncertain(reason) };
    }
    match &call.integer_resource_job {
        Some(job) => {
            if reply.body.as_i64().is_some() { Effect::Succeeded(job.clone()) } else { Effect::Uncertain("invalid_backend_response".into()) }
        }
        None => match text_id(&reply.body) {
            Some(resource) => Effect::Succeeded(resource),
            None => Effect::Uncertain("invalid_backend_response".into()),
        },
    }
}

fn closed(status: &str) -> bool {
    matches!(status, "cancelled" | "failed")
}

fn reconcilable(status: &str) -> bool {
    matches!(status, "running" | "paused" | "waiting_for_input" | "cancelled" | "failed")
}

enum Verdict {
    Succeeded(String),
    Failed,
    Uncertain,
}

fn verified_outcome(effect: &Effect, completion: &Value, kind: &str) -> Verdict {
    let status = completion["status"].as_str().unwrap_or("invalid");
    if status != "ok" && status != "final" {
        return Verdict::Uncertain;
    }
    if completion["outcome"] == "failed" {
        return if matches!(effect, Effect::Failed(_)) { Verdict::Failed } else { Verdict::Uncertain };
    }
    if completion["outcome"] != "succeeded" {
        return Verdict::Uncertain;
    }
    let Some(resource) = completion["result"]["resource_id"].as_str() else {
        return Verdict::Uncertain;
    };
    if completion["result"]["resource_kind"] != kind {
        return Verdict::Uncertain;
    }
    let task_status = completion["task"]["status"].as_str().unwrap_or("");
    let recorded = task_status == "completed"
        || (closed(task_status) && completion["task"]["artifact"]["effect_result"]["resource_id"] == resource);
    if !recorded {
        return Verdict::Uncertain;
    }
    if let Effect::Succeeded(observed) = effect
        && observed != resource
    {
        return Verdict::Uncertain;
    }
    Verdict::Succeeded(resource.to_owned())
}

pub struct Resolution<'a> {
    pub approval_id: &'a str,
    pub fingerprint: &'a str,
    pub decision: &'a str,
}

pub fn resolve_approval(ctx: &RunContext, resolution: &Resolution) -> Outcome {
    let mut outcome = Outcome {
        status: "completed".into(),
        text: String::new(),
        complete: true,
        provider: None,
        model: None,
        input_tokens: 0,
        output_tokens: 0,
        steps: 0,
        error: None,
    };
    let say = |outcome: &mut Outcome, text: &str| {
        outcome.text.push_str(text);
        ctx.emit(json!({"type": "message_delta", "text": text}));
    };
    let publish = |task: &Value| {
        if task.is_object() {
            ctx.emit(json!({"type": "task_updated", "task": task_view(task)}));
        }
    };
    let refuse = |outcome: &mut Outcome, status: &str| -> Outcome {
        say(outcome, invalid_approval(status));
        let mut refused = outcome.clone();
        refused.status = "failed".into();
        refused.error = Some("approval_invalid".into());
        refused
    };

    if resolution.decision == "reject" {
        let rejection = ctx.store.call(
            "kael_reject_approval",
            json!({"p_run_id": ctx.run_id, "p_approval_id": resolution.approval_id, "p_fingerprint": resolution.fingerprint}),
        );
        let rejection = match rejection {
            Ok(value) => value,
            Err(error) => {
                ctx.note_store_error(&error);
                return Outcome::failed("internal");
            }
        };
        if rejection["status"] != "ok" {
            return refuse(&mut outcome, rejection["status"].as_str().unwrap_or("invalid"));
        }
        publish(&rejection["task"]);
        say(&mut outcome, "Đã dừng bước gửi theo ý bạn. Bản nháp vẫn được giữ để bạn chỉnh sửa hoặc gửi sau.");
        return outcome;
    }

    let allowed = confirmable_tools(&ctx.catalog, &ctx.actor, &ctx.config);
    let consumed = match ctx.store.call(
        "kael_consume_approval",
        json!({
            "p_run_id": ctx.run_id, "p_approval_id": resolution.approval_id, "p_fingerprint": resolution.fingerprint,
            "p_allowed_tools": allowed, "p_intent": resolution.decision,
        }),
    ) {
        Ok(value) => value,
        Err(error) => {
            ctx.note_store_error(&error);
            return Outcome::failed("internal");
        }
    };
    let status = consumed["status"].as_str().unwrap_or("invalid");
    if status == "consumed" {
        let resource = consumed["result"]["resource_id"].as_str();
        let submitted = consumed["result"]["resource_kind"] == "service_request";
        match (consumed["outcome"] == "succeeded", resource, submitted) {
            (true, Some(resource), true) => say(
                &mut outcome,
                &format!("Yêu cầu này đã được gửi trước đó (mã {}). Kael không gửi lại lần nữa.", resource.chars().take(8).collect::<String>()),
            ),
            _ => say(&mut outcome, "Xác nhận này đã được xử lý trước đó. Kael không thực hiện lại."),
        }
        return outcome;
    }
    if status != "ok" && status != "reconcile" {
        return refuse(&mut outcome, status);
    }

    let tool = text_of(&consumed["tool"]);
    let call_id = format!("approval:{}", resolution.approval_id);
    let copy = effect_copy(&tool, &consumed["args"]);
    let submit = tool == "service_request_submit";
    let label = if status == "reconcile" {
        if submit { "Đang kiểm tra lại yêu cầu đã xác nhận" } else { "Đang kiểm tra lại thao tác đã xác nhận" }
    } else {
        copy.label
    };
    ctx.emit(json!({"type": "tool_started", "call_id": call_id, "tool": tool, "label": label}));
    let effect = execute_approved_effect(ctx, resolution.approval_id, &consumed);
    let (effect_status, effect_result) = match &effect {
        Effect::Succeeded(resource) => ("succeeded", json!({"resource_kind": copy.kind, "resource_id": resource})),
        Effect::Failed(reason) => ("failed", json!({"reason": reason})),
        Effect::Uncertain(reason) => ("uncertain", json!({"reason": reason})),
    };
    let completion = ctx
        .store
        .call(
            "kael_complete_approval",
            json!({"p_run_id": ctx.run_id, "p_approval_id": resolution.approval_id, "p_outcome": effect_status, "p_result": effect_result}),
        )
        .unwrap_or_else(|error| {
            ctx.note_store_error(&error);
            json!({"status": "invalid"})
        });
    let verdict = verified_outcome(&effect, &completion, copy.kind);
    let (verdict_name, resource_id) = match &verdict {
        Verdict::Succeeded(resource) => ("succeeded", resource.clone()),
        Verdict::Failed => ("failed", String::new()),
        Verdict::Uncertain => ("uncertain", String::new()),
    };
    let record_error = if verdict_name == "succeeded" {
        Value::Null
    } else if effect_status == "succeeded" {
        json!("unverified_result")
    } else {
        match &effect {
            Effect::Failed(reason) | Effect::Uncertain(reason) => json!(reason.chars().take(120).collect::<String>()),
            Effect::Succeeded(_) => Value::Null,
        }
    };
    if let Err(error) = ctx.store.call(
        "kael_record_tool",
        json!({
            "p_run_id": ctx.run_id, "p_call_id": call_id, "p_task_id": consumed["task_id"], "p_tool": tool, "p_side_effect": "consequential",
            "p_outcome": verdict_name, "p_fingerprint": resolution.fingerprint, "p_error": record_error,
        }),
    ) {
        ctx.note_store_error(&error);
    }
    ctx.emit(json!({"type": "tool_completed", "call_id": call_id, "tool": tool, "outcome": verdict_name, "label": label}));
    let invalid = completion["status"] == "invalid";
    let task_status = completion["task"]["status"].as_str().unwrap_or("");
    if !invalid && (verdict_name == "succeeded" || task_status != "completed") {
        publish(&completion["task"]);
    }
    let is_closed = !invalid && closed(task_status);
    match verdict {
        Verdict::Succeeded(_) => {
            let done = effect_done(&tool, &consumed["args"], &resource_id);
            let message = if is_closed && submit {
                format!("Yêu cầu dịch vụ bạn đã xác nhận trước đó đã được hệ thống ghi nhận (mã {}). Việc Kael theo dõi yêu cầu này đã được đóng, nhưng điều đó không hủy yêu cầu dịch vụ; Kael không có thao tác hủy yêu cầu đã gửi.", resource_id.chars().take(8).collect::<String>())
            } else if is_closed {
                format!("{done} Việc Kael theo dõi thao tác này đã được đóng trước đó.")
            } else {
                done
            };
            say(&mut outcome, &message);
            outcome
        }
        Verdict::Failed => {
            let message = if is_closed && submit {
                "Hệ thống chưa nhận yêu cầu này nên chưa có yêu cầu nào được gửi. Việc Kael theo dõi yêu cầu này đã được đóng trước đó."
            } else {
                copy.refused
            };
            say(&mut outcome, message);
            outcome.status = "failed".into();
            outcome.error = Some("internal".into());
            outcome
        }
        Verdict::Uncertain => {
            let can_reconcile = invalid || (completion["outcome"] == "uncertain" && reconcilable(task_status));
            if !can_reconcile {
                say(
                    &mut outcome,
                    if submit {
                        "Chưa xác định được yêu cầu đã được ghi nhận hay chưa, và việc này đã thay đổi trong lúc gửi nên Kael không thử lại. Bạn có thể xem danh sách yêu cầu của mình để kiểm tra."
                    } else {
                        "Chưa xác định được thao tác đã được ghi nhận hay chưa, và việc này đã thay đổi trong lúc xử lý nên Kael không thử lại. Hãy mở màn hình liên quan để xem trạng thái mới nhất."
                    },
                );
                return outcome;
            }
            ctx.emit(json!({"type": "approval_required", "approval": {
                "id": resolution.approval_id, "task_id": consumed["task_id"], "tool": tool, "summary": consumed["summary"],
                "details": consumed["details"], "fingerprint": resolution.fingerprint, "kind": "reconcile", "expires_at": Value::Null,
            }}));
            say(&mut outcome, copy.uncertain);
            outcome
        }
    }
}
