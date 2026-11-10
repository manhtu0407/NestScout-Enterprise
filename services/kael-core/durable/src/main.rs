use std::fs;
use std::net::TcpListener;
use std::process::ExitCode;
use std::sync::Arc;
use std::time::Duration;

use kael_durable::config::Config;
use kael_durable::models::build_providers;
use kael_durable::reconciler;
use kael_durable::runner::Runtime;
use kael_durable::server::serve_listener;

fn main() -> ExitCode {
    let config = match Config::from_env(|name| std::env::var(name).ok()) {
        Ok(config) => Arc::new(config),
        Err(error) => {
            eprintln!("kael-durable configuration error: {error}");
            return ExitCode::from(2);
        }
    };
    for directory in [config.journal_dir(), config.event_dir(), config.meta_dir()] {
        if let Err(error) = fs::create_dir_all(&directory) {
            eprintln!("kael-durable cannot prepare {}: {error}", directory.display());
            return ExitCode::from(2);
        }
    }
    let listener = match TcpListener::bind(&config.bind) {
        Ok(listener) => listener,
        Err(error) => {
            eprintln!("kael-durable cannot bind {}: {error}", config.bind);
            return ExitCode::from(2);
        }
    };
    let models = Arc::new(build_providers(&config));
    let runtime = Runtime::new(Arc::clone(&config), models);
    eprintln!(
        "{}",
        serde_json::json!({"event": "kael_durable_started", "bind": config.bind, "holder": config.holder, "route": config.route})
    );
    reconciler::spawn(Arc::clone(&runtime), Duration::from_secs(5));
    serve_listener(runtime, listener);
    ExitCode::SUCCESS
}
