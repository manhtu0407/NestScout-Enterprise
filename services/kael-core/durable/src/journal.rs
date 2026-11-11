use std::fs::{self, File};
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

use rusqlite::backup::Backup;
use rusqlite::{Connection, OpenFlags};

use crate::config::Config;

const COMPANIONS: [&str; 4] = ["", "-wal", "-shm", "-journal"];
const SEED_SUFFIX: &str = ".seed";
const SOURCE_BUSY: Duration = Duration::from_secs(5);
const PAGES_PER_STEP: i32 = 128;
const PAUSE_BETWEEN_STEPS: Duration = Duration::from_millis(5);

pub fn path(config: &Config, run_id: &str, epoch: i64) -> PathBuf {
    config.journal_dir().join(format!("{run_id}.e{epoch}.sqlite"))
}

pub fn run_id_of(file_name: &str) -> Option<&str> {
    let stem = file_name.strip_suffix(".sqlite")?;
    let (run_id, epoch) = stem.rsplit_once(".e")?;
    epoch.parse::<i64>().ok()?;
    Some(run_id)
}

fn epoch_of(file_name: &str, run_id: &str) -> Option<i64> {
    let epoch = file_name.strip_prefix(run_id)?.strip_prefix(".e")?.strip_suffix(".sqlite")?;
    epoch.parse().ok()
}

pub fn epochs(config: &Config, run_id: &str) -> Vec<i64> {
    let Ok(entries) = fs::read_dir(config.journal_dir()) else { return Vec::new() };
    let mut found: Vec<i64> = entries
        .flatten()
        .filter_map(|entry| epoch_of(&entry.file_name().to_string_lossy(), run_id))
        .collect();
    found.sort_unstable();
    found
}

pub fn exists(config: &Config, run_id: &str) -> bool {
    !epochs(config, run_id).is_empty()
}

pub fn newest_age(config: &Config, run_id: &str) -> Option<Duration> {
    epochs(config, run_id)
        .into_iter()
        .filter_map(|epoch| {
            let modified = fs::metadata(path(config, run_id, epoch)).ok()?.modified().ok()?;
            SystemTime::now().duration_since(modified).ok()
        })
        .min()
}

fn remove_family(base: &Path) -> std::io::Result<()> {
    for suffix in COMPANIONS {
        match fs::remove_file(format!("{}{suffix}", base.display())) {
            Err(error) if error.kind() != std::io::ErrorKind::NotFound => return Err(error),
            _ => {}
        }
    }
    Ok(())
}

pub fn remove_all(config: &Config, run_id: &str) -> std::io::Result<()> {
    let Ok(entries) = fs::read_dir(config.journal_dir()) else { return Ok(()) };
    let prefix = format!("{run_id}.e");
    for entry in entries.flatten() {
        if entry.file_name().to_string_lossy().starts_with(&prefix) {
            match fs::remove_file(entry.path()) {
                Err(error) if error.kind() != std::io::ErrorKind::NotFound => return Err(error),
                _ => {}
            }
        }
    }
    Ok(())
}

pub fn retire_before(config: &Config, run_id: &str, epoch: i64) {
    for older in epochs(config, run_id).into_iter().filter(|candidate| *candidate < epoch) {
        let _ = remove_family(&path(config, run_id, older));
    }
}

fn describe(error: impl std::fmt::Display) -> String {
    error.to_string()
}

fn seed(from: &Path, to: &Path) -> Result<(), String> {
    let staging = PathBuf::from(format!("{}{SEED_SUFFIX}", to.display()));
    remove_family(&staging).map_err(describe)?;
    let source = Connection::open_with_flags(from, OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_NO_MUTEX).map_err(describe)?;
    source.busy_timeout(SOURCE_BUSY).map_err(describe)?;
    let mut target = Connection::open(&staging).map_err(describe)?;
    Backup::new(&source, &mut target)
        .map_err(describe)?
        .run_to_completion(PAGES_PER_STEP, PAUSE_BETWEEN_STEPS, None)
        .map_err(describe)?;
    target.close().map_err(|(_, error)| describe(error))?;
    drop(source);
    File::open(&staging).and_then(|file| file.sync_all()).map_err(describe)?;
    fs::rename(&staging, to).map_err(describe)
}

pub fn prepare(config: &Config, run_id: &str, epoch: i64) -> Result<PathBuf, String> {
    fs::create_dir_all(config.journal_dir()).map_err(describe)?;
    let target = path(config, run_id, epoch);
    if target.exists() {
        return Ok(target);
    }
    if let Some(previous) = epochs(config, run_id).into_iter().rev().find(|candidate| *candidate < epoch) {
        seed(&path(config, run_id, previous), &target)?;
    }
    Ok(target)
}
