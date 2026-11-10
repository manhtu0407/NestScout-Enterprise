use std::fs::File;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{SocketAddr, TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use kael_durable::backend::Backend;
use kael_durable::config::Config;
use kael_durable::util::random_uuid;
use pi_durable::ai::http::{Request, send};
use serde_json::{Value, json};

#[derive(Clone)]
pub struct Stack {
    pub gateway: String,
    pub anon: String,
    pub service: String,
}

impl Stack {
    pub fn from_env() -> Stack {
        let read = |name: &str| std::env::var(name).unwrap_or_else(|_| panic!("{name} must be set to run the live-stack tests"));
        Stack { gateway: read("KAEL_TEST_GATEWAY"), anon: read("KAEL_TEST_ANON"), service: read("KAEL_TEST_SERVICE") }
    }

    pub fn environment(&self, data_dir: &Path, holder: &str, bind: SocketAddr, model_port: u16, purge_grace: u32) -> Vec<(String, String)> {
        let pairs = [
            ("SUPABASE_URL", self.gateway.clone()),
            ("SUPABASE_ANON_KEY", self.anon.clone()),
            ("SUPABASE_SERVICE_ROLE_KEY", self.service.clone()),
            ("KAEL_DURABLE_DATA_DIR", data_dir.display().to_string()),
            ("KAEL_DURABLE_ALLOW_TEMP", "1".to_owned()),
            ("KAEL_DURABLE_HOLDER", holder.to_owned()),
            ("KAEL_DURABLE_LEASE_SECONDS", "10".to_owned()),
            ("KAEL_DURABLE_BIND", bind.to_string()),
            ("KAEL_DURABLE_PURGE_GRACE_SECONDS", purge_grace.to_string()),
            ("DEEPSEEK_API_KEY", "local-mock-model-key".to_owned()),
            ("KAEL_ENABLED_EFFECTS", "service_request_submit".to_owned()),
            ("KAEL_DEEPSEEK_MODEL", "mock-1".to_owned()),
            ("KAEL_DEEPSEEK_BASE_URL", format!("http://127.0.0.1:{model_port}")),
            ("KAEL_MODEL_ROUTE", "deepseek".to_owned()),
        ];
        pairs.into_iter().map(|(name, value)| (name.to_owned(), value)).collect()
    }

    pub fn backend(&self) -> Backend {
        let environment = self.environment(Path::new("/tmp/kael-test-backend"), "test", "127.0.0.1:1".parse().expect("address"), 1, 1);
        let config = Config::from_env(|name| environment.iter().find(|(key, _)| key == name).map(|(_, value)| value.clone())).expect("test configuration");
        Backend::new(&config)
    }

    pub fn signup(&self) -> User {
        let email = format!("kael-{}@example.test", random_uuid());
        let request = Request::new("POST", format!("{}/auth/v1/signup", self.gateway))
            .header("apikey", self.anon.clone())
            .timeout(Some(Duration::from_secs(10)))
            .json(&json!({"email": email, "password": format!("Kael-{}-Aa1", random_uuid())}));
        let response = send(&request, None).expect("signup transport");
        assert!(response.ok(), "signup failed with HTTP {}", response.status);
        let body: Value = serde_json::from_str(&response.text().expect("signup body")).expect("signup json");
        let token = body["access_token"].as_str().expect("signup returns a session").to_owned();
        let id = body["user"]["id"].as_str().expect("signup returns a user").to_owned();
        let user = User { id, token };
        let consent = self
            .backend()
            .user(&user.token, "POST", "rpc/set_consent", Some(&json!({"p_purpose": "ai_sharing", "p_granted": true, "p_version": "2026-11-09"})), Duration::from_secs(10), None)
            .expect("consent transport");
        assert!(consent.ok(), "consent failed with HTTP {}", consent.status);
        user
    }

    pub fn rows(&self, user: &User, path: &str) -> Vec<Value> {
        let reply = self.backend().user(&user.token, "GET", path, None, Duration::from_secs(10), None).expect("read transport");
        assert!(reply.ok(), "read {path} failed with HTTP {}", reply.status);
        reply.body.as_array().cloned().unwrap_or_default()
    }
}

#[derive(Clone)]
pub struct User {
    pub id: String,
    pub token: String,
}

#[derive(Clone)]
pub enum Step {
    Text(&'static str),
    Tool { name: &'static str, arguments: Value },
    TextThenHang(&'static str),
    Fail(u16),
    Compute(fn(&Value) -> Step),
}

pub struct MockModel {
    pub port: u16,
    pub requests: Arc<Mutex<Vec<Value>>>,
    calls: Arc<AtomicUsize>,
}

fn chunk(delta: Value, finish: Value, usage: Option<Value>) -> String {
    let mut body = json!({"id": "mock", "object": "chat.completion.chunk", "created": 0, "model": "mock-1", "choices": [{"index": 0, "delta": delta, "finish_reason": finish}]});
    if let Some(usage) = usage {
        body["usage"] = usage;
    }
    format!("data: {body}\n\n")
}

fn read_request(stream: &TcpStream) -> Option<Value> {
    let mut reader = BufReader::new(stream.try_clone().ok()?);
    let mut line = String::new();
    reader.read_line(&mut line).ok()?;
    let mut length = 0usize;
    loop {
        let mut header = String::new();
        reader.read_line(&mut header).ok()?;
        if header == "\r\n" || header.is_empty() {
            break;
        }
        if let Some((name, value)) = header.split_once(':')
            && name.eq_ignore_ascii_case("content-length")
        {
            length = value.trim().parse().ok()?;
        }
    }
    let mut body = vec![0u8; length];
    reader.read_exact(&mut body).ok()?;
    serde_json::from_slice(&body).ok()
}

fn serve_model(mut stream: TcpStream, step: Option<&Step>) {
    let usage = json!({"prompt_tokens": 12, "completion_tokens": 6, "total_tokens": 18});
    if let Some(Step::Fail(status)) = step {
        let _ = write!(stream, "HTTP/1.1 {status} Error\r\ncontent-type: application/json\r\ncontent-length: 2\r\nconnection: close\r\n\r\n{{}}");
        return;
    }
    let head = "HTTP/1.1 200 OK\r\ncontent-type: text/event-stream\r\ncache-control: no-store\r\nconnection: close\r\n\r\n";
    if stream.write_all(head.as_bytes()).is_err() {
        return;
    }
    let mut frames: Vec<String> = Vec::new();
    frames.push(chunk(json!({"role": "assistant", "content": ""}), Value::Null, None));
    match step {
        Some(Step::Tool { name, arguments }) => {
            frames.push(chunk(
                json!({"tool_calls": [{"index": 0, "id": "call_mock_1", "type": "function", "function": {"name": name, "arguments": arguments.to_string()}}]}),
                Value::Null,
                None,
            ));
            frames.push(chunk(json!({}), json!("tool_calls"), Some(usage)));
        }
        Some(Step::TextThenHang(text)) => {
            frames.push(chunk(json!({"content": text}), Value::Null, None));
            for frame in frames {
                if stream.write_all(frame.as_bytes()).is_err() || stream.flush().is_err() {
                    return;
                }
            }
            let started = Instant::now();
            while started.elapsed() < Duration::from_secs(600) {
                thread::sleep(Duration::from_millis(250));
                if stream.write_all(b": keep\n\n").is_err() {
                    return;
                }
            }
            return;
        }
        Some(Step::Text(text)) => {
            for part in text.split_inclusive(' ') {
                frames.push(chunk(json!({"content": part}), Value::Null, None));
            }
            frames.push(chunk(json!({}), json!("stop"), Some(usage)));
        }
        _ => {
            frames.push(chunk(json!({"content": "Xin chào, tôi là Kael."}), Value::Null, None));
            frames.push(chunk(json!({}), json!("stop"), Some(usage)));
        }
    }
    frames.push("data: [DONE]\n\n".to_owned());
    for frame in frames {
        if stream.write_all(frame.as_bytes()).is_err() || stream.flush().is_err() {
            return;
        }
        thread::sleep(Duration::from_millis(15));
    }
}

impl MockModel {
    pub fn start(script: Vec<Step>) -> MockModel {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind mock model");
        let port = listener.local_addr().expect("mock address").port();
        let requests = Arc::new(Mutex::new(Vec::new()));
        let calls = Arc::new(AtomicUsize::new(0));
        let script = Arc::new(script);
        let seen = Arc::clone(&requests);
        let counted = Arc::clone(&calls);
        thread::spawn(move || {
            for incoming in listener.incoming().flatten() {
                let index = counted.fetch_add(1, Ordering::SeqCst);
                let script = Arc::clone(&script);
                let seen = Arc::clone(&seen);
                thread::spawn(move || {
                    let body = read_request(&incoming);
                    let step = script.get(index).map(|step| match (step, &body) {
                        (Step::Compute(build), Some(request)) => build(request),
                        (other, _) => other.clone(),
                    });
                    if let Some(body) = body {
                        seen.lock().expect("requests").push(body);
                    }
                    serve_model(incoming, step.as_ref());
                });
            }
        });
        MockModel { port, requests, calls }
    }

    pub fn call_count(&self) -> usize {
        self.calls.load(Ordering::SeqCst)
    }
}

pub struct Service {
    pub child: Child,
    pub addr: SocketAddr,
    pub log: PathBuf,
}

pub fn free_addr() -> SocketAddr {
    TcpListener::bind("127.0.0.1:0").expect("free port").local_addr().expect("free address")
}

impl Service {
    pub fn spawn(stack: &Stack, data_dir: &Path, holder: &str, model_port: u16, purge_grace: u32) -> Service {
        let addr = free_addr();
        let log = data_dir.join(format!("{holder}.log"));
        let sink = File::create(&log).expect("service log");
        let child = Command::new(env!("CARGO_BIN_EXE_kael-durable"))
            .envs(stack.environment(data_dir, holder, addr, model_port, purge_grace))
            .stdout(Stdio::null())
            .stderr(Stdio::from(sink))
            .spawn()
            .expect("spawn kael-durable");
        let service = Service { child, addr, log };
        service.wait_healthy();
        service
    }

    fn wait_healthy(&self) {
        let started = Instant::now();
        while started.elapsed() < Duration::from_secs(20) {
            if let Ok(mut reply) = raw(self.addr, "GET", "/health", None, None)
                && reply.status == 200
                && reply.next_event().is_some()
            {
                return;
            }
            thread::sleep(Duration::from_millis(200));
        }
        panic!("kael-durable did not become healthy; log:\n{}", std::fs::read_to_string(&self.log).unwrap_or_default());
    }

    pub fn signal(&self, name: &str) {
        let status = Command::new("kill").arg(format!("-{name}")).arg(self.child.id().to_string()).status().expect("run kill");
        assert!(status.success(), "kill -{name} failed");
    }

    pub fn kill(&mut self) {
        self.child.kill().expect("kill kael-durable");
        self.child.wait().expect("reap kael-durable");
    }

    pub fn turn(&self, user: &User, body: &Value) -> Reply {
        raw(self.addr, "POST", "/v1/turn", Some(&user.token), Some(&body.to_string())).expect("turn transport")
    }

    pub fn events(&self, user: &User, run_id: &str, after: u64) -> Reply {
        raw(self.addr, "GET", &format!("/v1/runs/{run_id}/events?after={after}"), Some(&user.token), None).expect("events transport")
    }
}

impl Drop for Service {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

pub struct Reply {
    pub status: u16,
    pub headers: Vec<(String, String)>,
    reader: BufReader<TcpStream>,
}

impl Reply {
    pub fn header(&self, name: &str) -> Option<&str> {
        self.headers.iter().find(|(key, _)| key == name).map(|(_, value)| value.as_str())
    }

    pub fn next_event(&mut self) -> Option<Value> {
        loop {
            let mut line = String::new();
            let read = self.reader.read_line(&mut line).ok()?;
            if read == 0 {
                return None;
            }
            if line.trim().is_empty() {
                continue;
            }
            return serde_json::from_str(line.trim()).ok();
        }
    }

    pub fn until(&mut self, limit: Duration, mut done: impl FnMut(&Value) -> bool) -> Vec<Value> {
        let started = Instant::now();
        let mut seen = Vec::new();
        while started.elapsed() < limit {
            let Some(event) = self.next_event() else { break };
            let stop = done(&event);
            seen.push(event);
            if stop {
                break;
            }
        }
        seen
    }

    pub fn drain(&mut self, limit: Duration) -> Vec<Value> {
        self.until(limit, |_| false)
    }
}

pub fn raw(addr: SocketAddr, method: &str, path: &str, token: Option<&str>, body: Option<&str>) -> std::io::Result<Reply> {
    let mut stream = TcpStream::connect_timeout(&addr, Duration::from_secs(5))?;
    stream.set_read_timeout(Some(Duration::from_secs(90)))?;
    let mut head = format!("{method} {path} HTTP/1.1\r\nhost: {addr}\r\nconnection: close\r\n");
    if let Some(token) = token {
        head.push_str(&format!("authorization: Bearer {token}\r\n"));
    }
    let payload = body.unwrap_or("");
    if body.is_some() {
        head.push_str(&format!("content-type: application/json\r\ncontent-length: {}\r\n", payload.len()));
    }
    head.push_str("\r\n");
    stream.write_all(head.as_bytes())?;
    stream.write_all(payload.as_bytes())?;
    let mut reader = BufReader::new(stream);
    let mut status_line = String::new();
    reader.read_line(&mut status_line)?;
    let status = status_line.split_whitespace().nth(1).and_then(|raw| raw.parse().ok()).unwrap_or(0);
    let mut headers = Vec::new();
    loop {
        let mut line = String::new();
        if reader.read_line(&mut line)? == 0 || line == "\r\n" {
            break;
        }
        if let Some((name, value)) = line.split_once(':') {
            headers.push((name.trim().to_ascii_lowercase(), value.trim().to_owned()));
        }
    }
    Ok(Reply { status, headers, reader })
}

pub fn scratch(label: &str) -> PathBuf {
    let path = PathBuf::from(format!("/tmp/kael-it-{label}-{}", random_uuid()));
    std::fs::create_dir_all(&path).expect("scratch directory");
    path
}

pub fn types(events: &[Value]) -> Vec<String> {
    events.iter().map(|event| event["type"].as_str().unwrap_or("?").to_owned()).collect()
}

pub fn assert_contiguous(events: &[Value]) {
    for (index, event) in events.iter().enumerate() {
        assert_eq!(event["seq"].as_u64(), Some(index as u64 + 1), "event sequence must be contiguous: {events:?}");
        assert_eq!(event["v"], json!(1));
    }
}
