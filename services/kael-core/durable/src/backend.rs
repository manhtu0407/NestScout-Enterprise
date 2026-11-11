use std::time::{Duration, Instant};

use pi_durable::ai::http::{Request, send};
use pi_durable::cancel::CancelToken;
use serde_json::{Value, json};

use crate::config::Config;
use crate::util::valid_uuid;

pub enum Verification {
    User(String),
    Rejected,
    Unavailable,
}

#[derive(Clone)]
pub struct Backend {
    url: String,
    anon_key: String,
    service_key: String,
}

#[derive(Debug, Clone)]
pub struct Reply {
    pub status: u16,
    pub body: Value,
}

impl Reply {
    pub fn ok(&self) -> bool {
        (200..300).contains(&self.status)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Lease {
    pub holder: String,
    pub epoch: i64,
}

impl Lease {
    pub fn header(&self) -> String {
        format!("{}:{}", self.holder, self.epoch)
    }
}

const SLOW_CALL: Duration = Duration::from_secs(1);

impl Backend {
    pub fn new(config: &Config) -> Self {
        Self {
            url: config.supabase_url.clone(),
            anon_key: config.anon_key.clone(),
            service_key: config.service_key.clone(),
        }
    }

    fn execute(target: &str, request: Request, cancel: Option<&CancelToken>) -> Result<Reply, String> {
        let started = Instant::now();
        let outcome = Self::exchange(request, cancel);
        let milliseconds = started.elapsed().as_millis();
        match &outcome {
            Err(error) => eprintln!("{}", json!({"event": "kael_backend_call", "target": target, "outcome": "error", "ms": milliseconds, "error": error})),
            Ok(reply) if milliseconds >= SLOW_CALL.as_millis() || reply.status >= 500 => {
                eprintln!("{}", json!({"event": "kael_backend_call", "target": target, "outcome": reply.status, "ms": milliseconds}));
            }
            Ok(_) => {}
        }
        outcome
    }

    fn exchange(request: Request, cancel: Option<&CancelToken>) -> Result<Reply, String> {
        let response = send(&request, cancel).map_err(|error| format!("transport: {error:?}"))?;
        let status = response.status;
        let text = response.text().map_err(|error| format!("body: {error:?}"))?;
        let body = if text.trim().is_empty() {
            Value::Null
        } else {
            serde_json::from_str(&text).unwrap_or(Value::String(text))
        };
        Ok(Reply { status, body })
    }

    pub fn verify_user(&self, token: &str) -> Verification {
        let request = Request::new("GET", format!("{}/auth/v1/user", self.url))
            .header("apikey", self.anon_key.clone())
            .header("authorization", format!("Bearer {token}"))
            .timeout(Some(Duration::from_secs(5)));
        let Ok(reply) = Self::execute("auth/v1/user", request, None) else { return Verification::Unavailable };
        if !reply.ok() {
            return if (400..500).contains(&reply.status) && reply.status != 429 { Verification::Rejected } else { Verification::Unavailable };
        }
        match reply.body["id"].as_str() {
            Some(id) if valid_uuid(id) && reply.body["is_anonymous"] != Value::Bool(true) => Verification::User(id.to_ascii_lowercase()),
            _ => Verification::Rejected,
        }
    }

    pub fn user(
        &self,
        token: &str,
        method: &str,
        path: &str,
        body: Option<&Value>,
        timeout: Duration,
        cancel: Option<&CancelToken>,
    ) -> Result<Reply, String> {
        let mut request = Request::new(method, format!("{}/rest/v1/{path}", self.url))
            .header("apikey", self.anon_key.clone())
            .header("authorization", format!("Bearer {token}"))
            .timeout(Some(timeout));
        if let Some(body) = body {
            request = request.json(body);
        }
        Self::execute(path.split('?').next().unwrap_or(path), request, cancel)
    }

    pub fn service_rpc(&self, name: &str, body: &Value, lease: Option<&Lease>) -> Result<Reply, String> {
        let mut request = Request::new("POST", format!("{}/rest/v1/rpc/{name}", self.url))
            .header("apikey", self.service_key.clone())
            .timeout(Some(Duration::from_secs(10)))
            .json(body);
        if !self.service_key.starts_with("sb_secret_") {
            request = request.header("authorization", format!("Bearer {}", self.service_key));
        }
        if let Some(lease) = lease {
            request = request.header("x-kael-lease", lease.header());
        }
        Self::execute(&format!("rpc/{name}"), request, None)
    }
}
