use std::fs::{self, File, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::{Condvar, Mutex, MutexGuard, PoisonError};
use std::time::Duration;

use serde_json::{Map, Value, json};

pub const PROTOCOL_VERSION: u64 = 1;

pub fn is_terminal(body: &Value) -> bool {
    matches!(body["type"].as_str(), Some("run_completed" | "run_failed"))
}

struct State {
    lines: Vec<String>,
    closed: bool,
    file: Option<File>,
}

pub struct EventLog {
    run_id: String,
    path: Option<PathBuf>,
    state: Mutex<State>,
    signal: Condvar,
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(PoisonError::into_inner)
}

pub fn event_path(dir: &Path, run_id: &str) -> PathBuf {
    dir.join(format!("{run_id}.ndjson"))
}

impl EventLog {
    pub fn open(dir: &Path, run_id: &str) -> io::Result<Self> {
        fs::create_dir_all(dir)?;
        let path = event_path(dir, run_id);
        let existing = match fs::read(&path) {
            Ok(bytes) => bytes,
            Err(error) if error.kind() == io::ErrorKind::NotFound => Vec::new(),
            Err(error) => return Err(error),
        };
        let complete = existing.iter().rposition(|byte| *byte == b'\n').map_or(0, |index| index + 1);
        let intact = std::str::from_utf8(&existing[..complete])
            .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))?;
        let file = OpenOptions::new().create(true).append(true).read(true).open(&path)?;
        if complete < existing.len() {
            file.set_len(complete as u64)?;
            file.sync_data()?;
        }
        let lines: Vec<String> = intact.lines().map(str::to_owned).collect();
        let closed = lines
            .last()
            .and_then(|line| serde_json::from_str::<Value>(line).ok())
            .is_some_and(|value| is_terminal(&value));
        Ok(Self {
            run_id: run_id.to_owned(),
            path: Some(path),
            state: Mutex::new(State { lines, closed, file: Some(file) }),
            signal: Condvar::new(),
        })
    }

    pub fn memory(run_id: &str, lines: Vec<String>) -> Self {
        let closed = lines
            .last()
            .and_then(|line| serde_json::from_str::<Value>(line).ok())
            .is_some_and(|value| is_terminal(&value));
        Self {
            run_id: run_id.to_owned(),
            path: None,
            state: Mutex::new(State { lines, closed, file: None }),
            signal: Condvar::new(),
        }
    }

    pub fn append(&self, body: Value) -> io::Result<u64> {
        let mut state = lock(&self.state);
        if state.closed {
            return Ok(state.lines.len() as u64);
        }
        let seq = state.lines.len() as u64 + 1;
        let mut envelope = Map::new();
        envelope.insert("v".into(), json!(PROTOCOL_VERSION));
        envelope.insert("run_id".into(), json!(self.run_id));
        envelope.insert("seq".into(), json!(seq));
        if let Value::Object(fields) = &body {
            for (key, value) in fields {
                envelope.insert(key.clone(), value.clone());
            }
        }
        let line = Value::Object(envelope).to_string();
        if let Some(file) = state.file.as_mut() {
            file.write_all(format!("{line}\n").as_bytes())?;
            file.flush()?;
            if is_terminal(&body) {
                file.sync_data()?;
            }
        }
        state.lines.push(line);
        state.closed = is_terminal(&body);
        self.signal.notify_all();
        Ok(seq)
    }

    pub fn last_event_type(&self) -> Option<String> {
        let state = lock(&self.state);
        let last = state.lines.last()?;
        serde_json::from_str::<Value>(last).ok()?["type"].as_str().map(str::to_owned)
    }

    pub fn closed(&self) -> bool {
        lock(&self.state).closed
    }

    pub fn len(&self) -> u64 {
        lock(&self.state).lines.len() as u64
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    pub fn after(&self, after: u64) -> (Vec<String>, bool) {
        let state = lock(&self.state);
        let from = (after as usize).min(state.lines.len());
        (state.lines[from..].to_vec(), state.closed)
    }

    pub fn wait_after(&self, after: u64, timeout: Duration) -> (Vec<String>, bool) {
        let mut state = lock(&self.state);
        if state.lines.len() as u64 <= after && !state.closed {
            state = self
                .signal
                .wait_timeout(state, timeout)
                .unwrap_or_else(PoisonError::into_inner)
                .0;
        }
        let from = (after as usize).min(state.lines.len());
        (state.lines[from..].to_vec(), state.closed)
    }

    pub fn path(&self) -> Option<&Path> {
        self.path.as_deref()
    }
}

pub fn remove_event_file(dir: &Path, run_id: &str) -> io::Result<bool> {
    match fs::remove_file(event_path(dir, run_id)) {
        Ok(()) => Ok(true),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(error),
    }
}
