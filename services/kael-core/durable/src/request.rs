use serde_json::Value;

use crate::util::valid_uuid;

#[derive(Debug, Clone, PartialEq)]
pub enum Action {
    Message(String),
    Approval { decision: String, approval_id: String, fingerprint: String },
}

#[derive(Debug, Clone, PartialEq)]
pub struct TurnRequest {
    pub request_id: String,
    pub conversation_id: Option<String>,
    pub mode: String,
    pub action: Action,
}

pub const MAX_BODY_CHARS: usize = 16_384;

pub fn parse_turn_request(raw: &str, max_input_chars: usize) -> Option<TurnRequest> {
    let body: Value = serde_json::from_str(raw).ok()?;
    let record = body.as_object()?;
    let request_id = record.get("request_id")?.as_str().filter(|id| valid_uuid(id))?.to_ascii_lowercase();
    let conversation_id = match record.get("conversation_id")? {
        Value::Null => None,
        Value::String(id) if valid_uuid(id) => Some(id.to_ascii_lowercase()),
        _ => return None,
    };
    let mode = record.get("mode")?.as_str().filter(|mode| *mode == "client" || *mode == "worker")?.to_owned();
    let action = record.get("action")?.as_object()?;
    match action.get("type")?.as_str()? {
        "message" => {
            let text = action.get("text")?.as_str()?.trim().to_owned();
            let length = text.encode_utf16().count();
            if length == 0 || length > max_input_chars {
                return None;
            }
            Some(TurnRequest { request_id, conversation_id, mode, action: Action::Message(text) })
        }
        decision @ ("approve" | "reject" | "reconcile") => {
            if conversation_id.is_none() && decision != "reconcile" {
                return None;
            }
            let approval_id = action.get("approval_id")?.as_str().filter(|id| valid_uuid(id))?.to_ascii_lowercase();
            let fingerprint = action
                .get("fingerprint")?
                .as_str()
                .filter(|value| value.len() == 64 && value.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)))?
                .to_owned();
            Some(TurnRequest {
                request_id,
                conversation_id,
                mode,
                action: Action::Approval { decision: decision.to_owned(), approval_id, fingerprint },
            })
        }
        _ => None,
    }
}

pub fn user_text_for(action: &Action) -> String {
    match action {
        Action::Message(text) => text.clone(),
        Action::Approval { decision, .. } => match decision.as_str() {
            "reconcile" => "Kiểm tra lại thao tác đã xác nhận trước đó.".to_owned(),
            "approve" => "Đồng ý thực hiện thao tác Kael đề xuất.".to_owned(),
            _ => "Không thực hiện thao tác Kael đề xuất.".to_owned(),
        },
    }
}
