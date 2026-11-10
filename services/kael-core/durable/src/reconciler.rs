use std::fs;
use std::path::Path;
use std::sync::Arc;
use std::thread;
use std::time::{Duration, SystemTime};

use serde_json::{Value, json};

use crate::backend::Lease;
use crate::events::remove_event_file;
use crate::runner::{Identity, Runtime, journal_path};
use crate::store::{Outcome, Store};
use crate::util::valid_uuid;

const ORPHAN_AGE: Duration = Duration::from_secs(3600);

fn rpc(runtime: &Runtime, name: &str, body: &Value) -> Result<Value, String> {
    let reply = runtime.backend.service_rpc(name, body, None)?;
    if reply.ok() { Ok(reply.body) } else { Err(format!("{name} failed with HTTP {}", reply.status)) }
}

fn report(event: &str, detail: Value) {
    eprintln!("{}", json!({"event": event, "detail": detail}));
}

fn age(path: &Path) -> Option<Duration> {
    SystemTime::now().duration_since(fs::metadata(path).ok()?.modified().ok()?).ok()
}

fn remove_if_present(path: &Path) -> std::io::Result<()> {
    match fs::remove_file(path) {
        Err(error) if error.kind() != std::io::ErrorKind::NotFound => Err(error),
        _ => Ok(()),
    }
}

pub fn remove_run_files(runtime: &Runtime, run_id: &str) -> std::io::Result<()> {
    let journal = journal_path(&runtime.config, run_id);
    for suffix in ["", "-wal", "-shm", "-journal"] {
        remove_if_present(&Path::new(&format!("{}{suffix}", journal.display())).to_path_buf())?;
    }
    remove_event_file(&runtime.config.event_dir(), run_id)?;
    remove_if_present(&runtime.config.meta_dir().join(format!("{run_id}.json")))
}

pub fn adopt_orphans(runtime: &Arc<Runtime>) -> usize {
    let claimed = match rpc(
        runtime,
        "kael_durable_claim_next",
        &json!({"p_holder": runtime.config.holder, "p_lease_seconds": runtime.config.lease_seconds, "p_limit": 5}),
    ) {
        Ok(rows) => rows,
        Err(error) => {
            report("kael_claim_failed", json!(error));
            return 0;
        }
    };
    let live = runtime.live_run_ids();
    let mut adopted = 0;
    for row in claimed.as_array().into_iter().flatten() {
        let run_id = row["run_id"].as_str().unwrap_or_default().to_owned();
        if live.contains(&run_id) || !valid_uuid(&run_id) {
            continue;
        }
        let identity = Identity {
            owner: row["owner_id"].as_str().unwrap_or_default().to_owned(),
            run_id: run_id.clone(),
            conversation_id: row["conversation_id"].as_str().unwrap_or_default().to_owned(),
            mode: row["mode"].as_str().unwrap_or("client").to_owned(),
            capabilities: Default::default(),
        };
        let lease = Lease { holder: runtime.config.holder.clone(), epoch: row["epoch"].as_i64().unwrap_or(1) };
        if runtime.adopt_claimed(&identity, lease.clone(), None).is_some() {
            adopted += 1;
            continue;
        }
        let store = Store::new(runtime.backend.clone(), &identity.owner, Some(lease.clone()));
        let mut interrupted = Outcome::failed("incomplete_output");
        interrupted.status = "interrupted".into();
        match store.finish_run(&run_id, &interrupted) {
            Ok(()) => {
                let _ = store.release(&run_id, &lease);
                report("kael_orphan_closed", json!(run_id));
            }
            Err(error) => report("kael_orphan_close_failed", json!(error.to_string())),
        }
    }
    adopted
}

pub fn purge_journals(runtime: &Arc<Runtime>) -> usize {
    let queue = match rpc(runtime, "kael_durable_purge_queue", &json!({"p_limit": 50})) {
        Ok(rows) => rows,
        Err(error) => {
            report("kael_purge_queue_failed", json!(error));
            return 0;
        }
    };
    let live = runtime.live_run_ids();
    let mut purged = 0;
    for row in queue.as_array().into_iter().flatten() {
        let run_id = row["run_id"].as_str().unwrap_or_default();
        if !valid_uuid(run_id) || live.contains(run_id) {
            continue;
        }
        let newest = [
            age(&journal_path(&runtime.config, run_id)),
            age(&runtime.config.event_dir().join(format!("{run_id}.ndjson"))),
        ]
        .into_iter()
        .flatten()
        .min();
        if newest.is_some_and(|elapsed| elapsed < runtime.config.purge_grace) {
            continue;
        }
        if let Err(error) = remove_run_files(runtime, run_id) {
            report("kael_purge_failed", json!({"run_id": run_id, "error": error.to_string()}));
            continue;
        }
        match rpc(runtime, "kael_durable_mark_purged", &json!({"p_run_id": run_id})) {
            Ok(_) => purged += 1,
            Err(error) => report("kael_mark_purged_failed", json!(error)),
        }
    }
    purged
}

pub fn reap_orphan_files(runtime: &Arc<Runtime>) -> usize {
    let Ok(entries) = fs::read_dir(runtime.config.journal_dir()) else { return 0 };
    let live = runtime.live_run_ids();
    let candidates: Vec<String> = entries
        .flatten()
        .filter_map(|entry| {
            let name = entry.file_name().to_string_lossy().into_owned();
            let id = name.strip_suffix(".sqlite")?.to_owned();
            (valid_uuid(&id) && !live.contains(&id) && age(&entry.path()).is_some_and(|elapsed| elapsed > ORPHAN_AGE)).then_some(id)
        })
        .collect();
    let mut removed = 0;
    for chunk in candidates.chunks(100) {
        let known = match rpc(runtime, "kael_durable_known", &json!({"p_run_ids": chunk})) {
            Ok(rows) => rows,
            Err(error) => {
                report("kael_known_failed", json!(error));
                return removed;
            }
        };
        let known_ids: Vec<&str> = known.as_array().into_iter().flatten().filter_map(|row| row["run_id"].as_str()).collect();
        for id in chunk.iter().filter(|id| !known_ids.contains(&id.as_str())) {
            if remove_run_files(runtime, id).is_ok() {
                report("kael_orphan_file_removed", json!(id));
                removed += 1;
            }
        }
    }
    removed
}

pub fn tick(runtime: &Arc<Runtime>) {
    if let Err(error) = rpc(runtime, "kael_durable_expire", &json!({"p_max_age": "30 minutes"})) {
        report("kael_expire_failed", json!(error));
    }
    adopt_orphans(runtime);
    purge_journals(runtime);
}

pub fn spawn(runtime: Arc<Runtime>, interval: Duration) {
    thread::spawn(move || {
        let mut rounds = 0u64;
        loop {
            tick(&runtime);
            if rounds % 60 == 0 {
                reap_orphan_files(&runtime);
            }
            rounds += 1;
            thread::sleep(interval);
        }
    });
}
