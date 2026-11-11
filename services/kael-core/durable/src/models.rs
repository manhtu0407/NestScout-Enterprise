use std::sync::Arc;
use std::sync::atomic::Ordering;
use std::thread;

use pi_durable::ai::event_stream::AssistantMessageEventStream;
use pi_durable::ai::models::{Models, ModelsError};
use pi_durable::ai::registry::{Auth, Providers};
use pi_durable::ai::stream::error_stream;
use pi_durable::ai::types::{AssistantMessage, AssistantMessageEvent, DeferredHandle, Model, SimpleStreamOptions, TranscriptContext};
use pi_durable::cancel::CancelToken;
use serde_json::{Value, json};

use crate::config::Config;
use crate::runctx::{RunContext, lock};

const TEXT_CAP: usize = 32_000;

pub fn build_providers(config: &Config) -> Providers {
    let mut providers = Providers::builtin();
    let mut custom = Vec::new();
    if let Some(deepseek) = &config.deepseek {
        let mut model = Model::new("deepseek", &deepseek.model, "openai-completions", 128_000, 8192, config.deepseek_thinking);
        model.base_url = deepseek.base_url.clone().unwrap_or_else(|| "https://api.deepseek.com".to_owned());
        custom.push(model);
    }
    if let Some(anthropic) = &config.anthropic {
        let mut model = providers
            .models()
            .iter()
            .find(|known| known.provider == "anthropic" && known.id == anthropic.model)
            .cloned()
            .unwrap_or_else(|| Model::new("anthropic", &anthropic.model, "anthropic-messages", 200_000, 8192, false));
        if let Some(base) = &anthropic.base_url {
            model.base_url = base.clone();
        }
        if !config.anthropic_fallback_models.is_empty() {
            let allowed: Vec<Value> = config.anthropic_fallback_models.iter().map(|id| json!({"model": id})).collect();
            let mut compat = model.compat.take().and_then(|existing| existing.as_object().cloned()).unwrap_or_default();
            compat.insert("allowedFallbackModels".into(), Value::Array(allowed));
            model.compat = Some(Value::Object(compat));
        }
        custom.push(model);
    }
    providers.add_models(custom);
    let deepseek_key = config.deepseek.as_ref().map(|provider| provider.api_key.clone());
    let anthropic_key = config.anthropic.as_ref().map(|provider| provider.api_key.clone());
    providers.set_auth(Arc::new(move |model: &Model| {
        let key = match model.provider.as_str() {
            "deepseek" => deepseek_key.clone(),
            "anthropic" => anthropic_key.clone(),
            _ => None,
        };
        key.map(|api_key| Auth { api_key: Some(api_key), ..Auth::default() })
            .ok_or_else(|| format!("no credential configured for provider {}", model.provider))
    }));
    providers
}

pub fn primary_ref(config: &Config) -> Option<(String, String)> {
    let first = config.route.first()?;
    let model = match first.as_str() {
        "deepseek" => config.deepseek.as_ref()?.model.clone(),
        "anthropic" => config.anthropic.as_ref()?.model.clone(),
        _ => return None,
    };
    Some((first.clone(), model))
}

fn fallback_ref(config: &Config) -> Option<(String, String)> {
    let second = config.route.get(1)?;
    let model = match second.as_str() {
        "anthropic" => config.anthropic.as_ref()?.model.clone(),
        _ => return None,
    };
    Some((second.clone(), model))
}

fn can_fall_back(message: &str) -> bool {
    let lowered = message.to_lowercase();
    ["429", "500", "502", "503", "504", "529", "overloaded", "rate limit", "timed out", "timeout", "connection", "network"]
        .iter()
        .any(|marker| lowered.contains(marker))
}

pub struct RunModels {
    inner: Arc<dyn Models + Send + Sync>,
    fallback: Option<(String, String)>,
    ctx: Arc<RunContext>,
}

impl RunModels {
    pub fn new(inner: Arc<dyn Models + Send + Sync>, config: &Config, ctx: Arc<RunContext>) -> Self {
        Self { inner, fallback: fallback_ref(config), ctx }
    }
}

fn publish_text(ctx: &RunContext, delta: &str, separated: &mut bool) {
    if ctx.overflow.load(Ordering::SeqCst) || ctx.hold_text.load(Ordering::SeqCst) {
        return;
    }
    let mut emitted = ctx.text_chars.load(Ordering::SeqCst);
    if !*separated {
        *separated = true;
        if emitted > 0 {
            ctx.emit(json!({"type": "message_delta", "text": "\n\n"}));
            emitted += 2;
        }
    }
    let remaining = TEXT_CAP.saturating_sub(emitted);
    let kept: String = delta.chars().take(remaining).collect();
    if kept.chars().count() < delta.chars().count() {
        ctx.overflow.store(true, Ordering::SeqCst);
    }
    emitted += kept.chars().count();
    ctx.text_chars.store(emitted, Ordering::SeqCst);
    if !kept.is_empty() {
        ctx.emit(json!({"type": "message_delta", "text": kept}));
    }
}

fn account_usage(ctx: &RunContext, message: &AssistantMessage) {
    let value = serde_json::to_value(message).unwrap_or(Value::Null);
    ctx.input_tokens.fetch_add(value["usage"]["input"].as_u64().unwrap_or(0) as usize, Ordering::SeqCst);
    ctx.output_tokens.fetch_add(value["usage"]["output"].as_u64().unwrap_or(0) as usize, Ordering::SeqCst);
    *lock(&ctx.served) = Some((message.provider.clone(), message.model.clone()));
}

impl Models for RunModels {
    fn get_model(&self, provider: &str, id: &str) -> Option<Model> {
        self.inner.get_model(provider, id)
    }

    fn stream_simple(&self, model: &Model, context: TranscriptContext, options: SimpleStreamOptions) -> AssistantMessageEventStream {
        let calls = self.ctx.model_calls.fetch_add(1, Ordering::SeqCst) + 1;
        if calls > self.ctx.config.limits.max_model_calls {
            self.ctx.budget_hit.store(true, Ordering::SeqCst);
            return error_stream(model, "model call budget exhausted".to_owned());
        }
        let out = AssistantMessageEventStream::new();
        if let Some(signal) = &options.signal {
            out.bind_cancel(signal);
        }
        let inner = Arc::clone(&self.inner);
        let ctx = Arc::clone(&self.ctx);
        let fallback = self.fallback.clone();
        let model = model.clone();
        let sink = out.clone();
        thread::spawn(move || {
            let mut stream = inner.stream_simple(&model, context.clone(), options.clone());
            let mut started = false;
            let mut separated = false;
            let mut switched = false;
            while let Some(event) = stream.next_event() {
                match &event {
                    AssistantMessageEvent::TextDelta { delta, .. } => {
                        started = true;
                        publish_text(&ctx, delta, &mut separated);
                    }
                    AssistantMessageEvent::ToolcallStart { .. } => started = true,
                    AssistantMessageEvent::Done { message, .. } => account_usage(&ctx, message),
                    AssistantMessageEvent::Error { error, .. } => {
                        let message = error.error_message.clone().unwrap_or_default();
                        let next = fallback.as_ref().filter(|_| !started && !switched && can_fall_back(&message));
                        if let Some((provider, id)) = next
                            && let Some(alternative) = inner.get_model(provider, id)
                        {
                            switched = true;
                            let mut unreasoned = options.clone();
                            unreasoned.reasoning = None;
                            stream = inner.stream_simple(&alternative, context.clone(), unreasoned);
                            continue;
                        }
                        account_usage(&ctx, error);
                    }
                    _ => {}
                }
                let terminal = matches!(event, AssistantMessageEvent::Done { .. } | AssistantMessageEvent::Error { .. });
                sink.push(event);
                if terminal {
                    break;
                }
            }
            sink.end(None);
        });
        out
    }

    fn fetch_deferred(&self, model: &Model, handle: &DeferredHandle, signal: &CancelToken) -> Result<AssistantMessage, ModelsError> {
        self.inner.fetch_deferred(model, handle, signal)
    }

    fn cancel_deferred(&self, model: &Model, handle: &DeferredHandle, signal: &CancelToken) -> Result<(), ModelsError> {
        self.inner.cancel_deferred(model, handle, signal)
    }
}
