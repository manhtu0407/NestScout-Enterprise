use std::io::{self, BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};

use serde_json::{Value, json};

use crate::approval::{failure_message, is_retryable};
use crate::backend::Verification;
use crate::events::{EventLog, event_path};
use crate::request::{MAX_BODY_CHARS, parse_turn_request};
use crate::runner::{Admission, Runtime, read_meta};
use crate::util::valid_uuid;

const MAX_HEADER_BYTES: usize = 32 * 1024;
const MAX_BODY_BYTES: usize = 4 * MAX_BODY_CHARS;
const IDLE_STREAM_LIMIT: Duration = Duration::from_secs(15 * 60);

struct Parsed {
    method: String,
    path: String,
    query: String,
    headers: Vec<(String, String)>,
    body: Vec<u8>,
}

impl Parsed {
    fn header(&self, name: &str) -> Option<&str> {
        self.headers.iter().find(|(key, _)| key == name).map(|(_, value)| value.as_str())
    }
}

fn read_request(stream: &TcpStream) -> io::Result<Option<Parsed>> {
    stream.set_read_timeout(Some(Duration::from_secs(15)))?;
    let mut reader = BufReader::new(stream.try_clone()?);
    let mut head = String::new();
    let mut total = 0usize;
    loop {
        let mut line = String::new();
        let allowance = (MAX_HEADER_BYTES - total + 1) as u64;
        let read = (&mut reader).take(allowance).read_line(&mut line)?;
        if read == 0 {
            return Ok(None);
        }
        total += read;
        if total > MAX_HEADER_BYTES {
            return Ok(None);
        }
        let blank = line == "\r\n" || line == "\n";
        head.push_str(&line);
        if blank {
            break;
        }
    }
    let mut lines = head.lines();
    let Some(request_line) = lines.next() else { return Ok(None) };
    let mut parts = request_line.split_whitespace();
    let (Some(method), Some(target)) = (parts.next(), parts.next()) else { return Ok(None) };
    let (path, query) = target.split_once('?').unwrap_or((target, ""));
    let headers: Vec<(String, String)> = lines
        .filter_map(|line| line.split_once(':'))
        .map(|(key, value)| (key.trim().to_ascii_lowercase(), value.trim().to_owned()))
        .collect();
    let length = headers
        .iter()
        .find(|(key, _)| key == "content-length")
        .and_then(|(_, value)| value.parse::<usize>().ok())
        .unwrap_or(0);
    if length > MAX_BODY_BYTES {
        return Ok(Some(Parsed { method: method.into(), path: path.into(), query: query.into(), headers, body: vec![0; MAX_BODY_BYTES + 1] }));
    }
    let mut body = vec![0u8; length];
    reader.read_exact(&mut body)?;
    Ok(Some(Parsed { method: method.into(), path: path.into(), query: query.into(), headers, body }))
}

const CORS: &str = "access-control-allow-origin: *\r\naccess-control-allow-headers: authorization, apikey, content-type, x-client-info, x-kael-readiness\r\naccess-control-allow-methods: GET, POST, OPTIONS\r\n";

fn status_text(status: u16) -> &'static str {
    match status {
        200 => "OK",
        204 => "No Content",
        400 => "Bad Request",
        401 => "Unauthorized",
        403 => "Forbidden",
        404 => "Not Found",
        405 => "Method Not Allowed",
        409 => "Conflict",
        413 => "Payload Too Large",
        421 => "Misdirected Request",
        429 => "Too Many Requests",
        _ => "Service Unavailable",
    }
}

fn respond(stream: &mut TcpStream, status: u16, content_type: &str, extra: &str, body: &str) -> io::Result<()> {
    write!(
        stream,
        "HTTP/1.1 {status} {}\r\n{CORS}content-type: {content_type}\r\ncache-control: no-store\r\ncontent-length: {}\r\nconnection: close\r\n{extra}\r\n{body}",
        status_text(status),
        body.len()
    )?;
    stream.flush()
}

fn respond_json(stream: &mut TcpStream, status: u16, body: &Value, extra: &str) -> io::Result<()> {
    respond(stream, status, "application/json", extra, &body.to_string())
}

fn failure(stream: &mut TcpStream, status: u16, code: &str) -> io::Result<()> {
    respond_json(
        stream,
        status,
        &json!({"error": {"code": code, "message": failure_message(code), "retryable": is_retryable(code)}}),
        "",
    )
}

fn bearer(request: &Parsed) -> Option<String> {
    let value = request.header("authorization")?.strip_prefix("Bearer ")?;
    let valid = (20..=4096).contains(&value.len())
        && value.bytes().all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'_' | b'~' | b'+' | b'/' | b'=' | b'-'));
    valid.then(|| value.to_owned())
}

fn stream_log(
    stream: &mut TcpStream,
    initial: &Arc<EventLog>,
    successor: &dyn Fn() -> Option<Arc<EventLog>>,
    mut after: u64,
    replayed: bool,
    run_id: &str,
) -> io::Result<()> {
    write!(
        stream,
        "HTTP/1.1 200 OK\r\n{CORS}content-type: application/x-ndjson; charset=utf-8\r\ncache-control: no-store\r\nx-kael-run-id: {run_id}\r\nx-kael-runtime: durable\r\nconnection: close\r\n\r\n"
    )?;
    stream.flush()?;
    let mut log = Arc::clone(initial);
    let mut quiet_since = Instant::now();
    loop {
        if !log.closed()
            && let Some(live) = successor()
            && !Arc::ptr_eq(&live, &log)
        {
            log = live;
        }
        let follower = log.is_follower();
        if follower {
            log.refresh()?;
        }
        let (lines, closed) = log.wait_after(after, Duration::from_millis(if follower { 150 } else { 500 }));
        for line in &lines {
            let rendered = if replayed && after == 0 {
                match serde_json::from_str::<Value>(line) {
                    Ok(mut event) if event["type"] == "run_started" => {
                        event["replayed"] = json!(true);
                        event.to_string()
                    }
                    _ => line.clone(),
                }
            } else {
                line.clone()
            };
            stream.write_all(rendered.as_bytes())?;
            stream.write_all(b"\n")?;
            after += 1;
        }
        if !lines.is_empty() {
            stream.flush()?;
            quiet_since = Instant::now();
        }
        if closed {
            return Ok(());
        }
        if quiet_since.elapsed() > IDLE_STREAM_LIMIT {
            return Ok(());
        }
    }
}

fn handle_turn(runtime: &Arc<Runtime>, stream: &mut TcpStream, request: &Parsed) -> io::Result<()> {
    let Some(token) = bearer(request) else { return failure(stream, 401, "unauthenticated") };
    let Ok(raw) = String::from_utf8(request.body.clone()) else { return failure(stream, 400, "invalid_request") };
    if raw.chars().count() > MAX_BODY_CHARS {
        return failure(stream, 413, "invalid_request");
    }
    let Some(turn) = parse_turn_request(&raw, runtime.config.limits.max_input_chars) else {
        return failure(stream, 400, "invalid_request");
    };
    let user_id = match runtime.backend.verify_user(&token) {
        Verification::User(id) => id,
        Verification::Rejected => return failure(stream, 401, "unauthenticated"),
        Verification::Unavailable => return failure(stream, 503, "internal"),
    };
    match runtime.admit(&token, &user_id, &turn) {
        Admission::Reject { status, code } => failure(stream, status, code),
        Admission::LegacyRun => respond_json(
            stream,
            421,
            &json!({"error": {"code": "invalid_request", "message": "This request belongs to the legacy runtime.", "retryable": false}}),
            "x-kael-runtime: legacy-run\r\n",
        ),
        Admission::Stream { run_id, log, replayed } => {
            let successor = || runtime.live.lock().unwrap_or_else(std::sync::PoisonError::into_inner).get(&run_id).map(|live| Arc::clone(&live.ctx.log));
            stream_log(stream, &log, &successor, 0, replayed, &run_id)
        }
    }
}

fn handle_events(runtime: &Arc<Runtime>, stream: &mut TcpStream, request: &Parsed) -> io::Result<()> {
    let run_id = request.path.trim_start_matches("/v1/runs/").trim_end_matches("/events").to_owned();
    if !valid_uuid(&run_id) {
        return failure(stream, 404, "invalid_request");
    }
    let Some(token) = bearer(request) else { return failure(stream, 401, "unauthenticated") };
    let user_id = match runtime.backend.verify_user(&token) {
        Verification::User(id) => id,
        Verification::Rejected => return failure(stream, 401, "unauthenticated"),
        Verification::Unavailable => return failure(stream, 503, "internal"),
    };
    let owner = read_meta(&runtime.config, &run_id).and_then(|meta| meta["owner_id"].as_str().map(str::to_owned));
    if owner.as_deref() != Some(user_id.as_str()) {
        return failure(stream, 404, "invalid_request");
    }
    let after = request
        .query
        .split('&')
        .find_map(|pair| pair.strip_prefix("after="))
        .and_then(|value| value.parse::<u64>().ok())
        .unwrap_or(0);
    let find_live = || runtime.live.lock().unwrap_or_else(std::sync::PoisonError::into_inner).get(&run_id).cloned();
    let live = find_live();
    if let Some(live) = &live {
        live.ctx.set_token(Some(token.clone()));
    }
    let log = match live {
        Some(live) => Arc::clone(&live.ctx.log),
        None => {
            if !event_path(&runtime.config.event_dir(), &run_id).exists() {
                return failure(stream, 404, "invalid_request");
            }
            Arc::new(EventLog::follow(&runtime.config.event_dir(), &run_id))
        }
    };
    let successor = || {
        find_live().map(|live| {
            live.ctx.set_token(Some(token.clone()));
            Arc::clone(&live.ctx.log)
        })
    };
    stream_log(stream, &log, &successor, after, true, &run_id)
}

fn handle_ready(runtime: &Arc<Runtime>, stream: &mut TcpStream) -> io::Result<()> {
    let database = match runtime.backend.service_rpc("kael_runtime_ready", &json!({}), None) {
        Ok(reply) if reply.ok() && reply.body == Value::Bool(true) => "verified",
        Ok(reply) if reply.status == 401 || reply.status == 403 => "authorization_failed",
        _ => "unavailable",
    };
    let probe = runtime.config.data_dir.join(".kael-durable-probe");
    let storage = if std::fs::write(&probe, b"ok").and_then(|()| std::fs::remove_file(&probe)).is_ok() { "writable" } else { "unavailable" };
    let route = runtime.config.route.clone();
    let ready = database == "verified" && storage == "writable" && !route.is_empty();
    respond_json(
        stream,
        if ready { 200 } else { 503 },
        &json!({"ready": ready, "database": database, "storage": storage, "route": route, "holder": runtime.config.holder, "provider_probe": "not_run"}),
        "",
    )
}

fn handle(runtime: &Arc<Runtime>, mut stream: TcpStream) -> io::Result<()> {
    let Some(request) = read_request(&stream)? else { return Ok(()) };
    if request.body.len() > MAX_BODY_BYTES {
        return failure(&mut stream, 413, "invalid_request");
    }
    match (request.method.as_str(), request.path.as_str()) {
        ("OPTIONS", _) => respond(&mut stream, 204, "text/plain", "", ""),
        ("GET", "/health") => respond_json(&mut stream, 200, &json!({"status": "ok"}), ""),
        ("GET", "/ready") => handle_ready(runtime, &mut stream),
        ("POST", "/v1/turn") => handle_turn(runtime, &mut stream, &request),
        ("GET", path) if path.starts_with("/v1/runs/") && path.ends_with("/events") => handle_events(runtime, &mut stream, &request),
        (_, "/v1/turn" | "/ready" | "/health") => failure(&mut stream, 405, "invalid_request"),
        _ => failure(&mut stream, 404, "invalid_request"),
    }
}

pub fn serve_listener(runtime: Arc<Runtime>, listener: TcpListener) {
    for incoming in listener.incoming() {
        match incoming {
            Ok(stream) => {
                let runtime = Arc::clone(&runtime);
                thread::spawn(move || {
                    if let Err(error) = handle(&runtime, stream)
                        && error.kind() != io::ErrorKind::BrokenPipe
                        && error.kind() != io::ErrorKind::ConnectionReset
                    {
                        eprintln!("{}", json!({"event": "kael_connection_error", "error": error.to_string()}));
                    }
                });
            }
            Err(error) => eprintln!("{}", json!({"event": "kael_accept_failed", "error": error.to_string()})),
        }
    }
}
