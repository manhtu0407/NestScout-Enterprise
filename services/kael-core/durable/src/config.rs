use std::collections::HashSet;
use std::path::PathBuf;
use std::time::Duration;

pub const CONSEQUENTIAL_EFFECTS: [&str; 5] = [
    "service_request_submit",
    "service_quote_decision",
    "work_submission_decision",
    "worker_offer_decision",
    "worker_job_advance",
];

#[derive(Clone, Debug)]
pub struct Limits {
    pub max_model_calls: u32,
    pub max_tool_calls: u32,
    pub max_output_tokens: u64,
    pub run_deadline: Duration,
    pub history_messages: usize,
    pub history_chars: usize,
    pub approval_ttl_seconds: u64,
    pub max_input_chars: usize,
}

impl Default for Limits {
    fn default() -> Self {
        Self {
            max_model_calls: 6,
            max_tool_calls: 8,
            max_output_tokens: 4096,
            run_deadline: Duration::from_secs(60),
            history_messages: 16,
            history_chars: 24_000,
            approval_ttl_seconds: 900,
            max_input_chars: 4000,
        }
    }
}

#[derive(Clone, Debug)]
pub struct ProviderConfig {
    pub api_key: String,
    pub model: String,
    pub base_url: Option<String>,
}

#[derive(Clone, Debug)]
pub struct Config {
    pub supabase_url: String,
    pub anon_key: String,
    pub service_key: String,
    pub deepseek: Option<ProviderConfig>,
    pub anthropic: Option<ProviderConfig>,
    pub route: Vec<String>,
    pub perplexity_key: Option<String>,
    pub enabled_effects: HashSet<String>,
    pub data_dir: PathBuf,
    pub bind: String,
    pub holder: String,
    pub lease_seconds: u32,
    pub purge_grace: Duration,
    pub limits: Limits,
}

fn local_http(url: &str) -> bool {
    ["http://127.0.0.1", "http://localhost", "http://[::1]", "http://host.docker.internal"]
        .iter()
        .any(|prefix| {
            url.strip_prefix(prefix)
                .is_some_and(|rest| rest.is_empty() || rest.starts_with(':') || rest.starts_with('/'))
        })
        || url.strip_prefix("http://").is_some_and(|rest| {
            let host = rest.split([':', '/']).next().unwrap_or("");
            !host.is_empty() && !host.contains('.') && host.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
        })
}

pub fn valid_holder(holder: &str) -> bool {
    !holder.is_empty()
        && holder.len() <= 80
        && holder.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'))
}

impl Config {
    pub fn from_env(read: impl Fn(&str) -> Option<String>) -> Result<Config, String> {
        let value = |name: &str| read(name).map(|raw| raw.trim().to_owned()).filter(|raw| !raw.is_empty());
        let supabase_url = value("SUPABASE_URL").ok_or("SUPABASE_URL is required")?;
        let supabase_url = supabase_url.trim_end_matches('/').to_owned();
        if !(supabase_url.starts_with("https://") || local_http(&supabase_url)) {
            return Err("SUPABASE_URL must be https or a local development host".into());
        }
        let anon_key = value("SUPABASE_PUBLISHABLE_KEY")
            .or_else(|| value("SUPABASE_ANON_KEY"))
            .ok_or("SUPABASE_PUBLISHABLE_KEY or SUPABASE_ANON_KEY is required")?;
        let service_key = value("SUPABASE_SECRET_KEY")
            .or_else(|| value("SUPABASE_SERVICE_ROLE_KEY"))
            .ok_or("SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY is required")?;
        let data_dir = PathBuf::from(value("KAEL_DURABLE_DATA_DIR").ok_or("KAEL_DURABLE_DATA_DIR is required")?);
        if !data_dir.is_absolute() {
            return Err("KAEL_DURABLE_DATA_DIR must be an absolute path".into());
        }
        let temporary = data_dir.starts_with("/tmp") || data_dir.starts_with("/var/tmp");
        if temporary && value("KAEL_DURABLE_ALLOW_TEMP").as_deref() != Some("1") {
            return Err("KAEL_DURABLE_DATA_DIR must be persistent storage, not a temporary directory".into());
        }
        let holder = value("KAEL_DURABLE_HOLDER").unwrap_or_else(|| format!("kael-{}", std::process::id()));
        if !valid_holder(&holder) {
            return Err("KAEL_DURABLE_HOLDER must match [A-Za-z0-9._-]{1,80}".into());
        }
        let lease_seconds = value("KAEL_DURABLE_LEASE_SECONDS")
            .map(|raw| raw.parse::<u32>().map_err(|_| "KAEL_DURABLE_LEASE_SECONDS must be an integer"))
            .transpose()?
            .unwrap_or(30);
        if !(10..=600).contains(&lease_seconds) {
            return Err("KAEL_DURABLE_LEASE_SECONDS must be between 10 and 600".into());
        }
        let provider = |key: &str, model: &str, default_model: Option<&str>| {
            let api_key = value(key)?;
            if !api_key.bytes().all(|b| (0x21..=0x7e).contains(&b)) {
                return None;
            }
            let model = value(model).or_else(|| default_model.map(str::to_owned))?;
            Some(ProviderConfig { api_key, model, base_url: None })
        };
        let deepseek_base = value("KAEL_DEEPSEEK_BASE_URL").map(|raw| raw.trim_end_matches('/').to_owned());
        if let Some(base) = &deepseek_base
            && !(base.starts_with("https://") || local_http(base))
        {
            return Err("KAEL_DEEPSEEK_BASE_URL must be https or a local development host".into());
        }
        let deepseek = provider("DEEPSEEK_API_KEY", "KAEL_DEEPSEEK_MODEL", Some("deepseek-flash"))
            .map(|configured| ProviderConfig { base_url: deepseek_base, ..configured });
        let anthropic = provider("ANTHROPIC_API_KEY", "KAEL_ANTHROPIC_MODEL", None);
        let requested: Vec<String> = value("KAEL_MODEL_ROUTE")
            .unwrap_or_else(|| "deepseek,anthropic".into())
            .split(',')
            .map(|item| item.trim().to_owned())
            .collect();
        let valid_route = requested.first().map(String::as_str) == Some("deepseek")
            && requested.iter().all(|id| id == "deepseek" || id == "anthropic")
            && requested.iter().collect::<HashSet<_>>().len() == requested.len();
        let mut route = Vec::new();
        if valid_route && deepseek.is_some() {
            route.push("deepseek".to_owned());
            if requested.iter().any(|id| id == "anthropic") && anthropic.is_some() {
                route.push("anthropic".to_owned());
            }
        }
        let perplexity_key = if value("KAEL_WEB_SEARCH").as_deref() == Some("enabled") {
            value("PERPLEXITY_API_KEY")
        } else {
            None
        };
        let enabled_effects = value("KAEL_ENABLED_EFFECTS")
            .unwrap_or_default()
            .split(',')
            .map(|item| item.trim().to_owned())
            .filter(|item| CONSEQUENTIAL_EFFECTS.contains(&item.as_str()))
            .collect();
        Ok(Config {
            supabase_url,
            anon_key,
            service_key,
            deepseek,
            anthropic,
            route,
            perplexity_key,
            enabled_effects,
            data_dir,
            bind: value("KAEL_DURABLE_BIND").unwrap_or_else(|| "127.0.0.1:8787".into()),
            holder,
            lease_seconds,
            purge_grace: Duration::from_secs(
                value("KAEL_DURABLE_PURGE_GRACE_SECONDS").and_then(|raw| raw.parse().ok()).unwrap_or(120),
            ),
            limits: Limits::default(),
        })
    }

    pub fn journal_dir(&self) -> PathBuf {
        self.data_dir.join("journals")
    }

    pub fn event_dir(&self) -> PathBuf {
        self.data_dir.join("events")
    }

    pub fn meta_dir(&self) -> PathBuf {
        self.data_dir.join("meta")
    }
}
