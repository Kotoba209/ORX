use base64::Engine;
use serde::{Deserialize, Serialize};
use std::error::Error;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

const PROVIDER_TEST_TIMEOUT_SECS: u64 = 45;
const AGENT_RUN_TIMEOUT_SECS: u64 = 240;
const API_PROTOCOL_RESPONSES: &str = "responses";
const API_PROTOCOL_ANTHROPIC_MESSAGES: &str = "anthropic-messages";
const API_PROTOCOL_CUSTOM_DIRECT: &str = "custom-direct";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ProviderConfig {
    pub id: String,
    pub name: String,
    pub kind: String,
    #[serde(default = "default_api_protocol")]
    pub api_protocol: String,
    pub base_url: String,
    #[serde(default)]
    pub use_proxy_route: bool,
    #[serde(default = "default_proxy_url")]
    pub proxy_url: String,
    pub model: String,
    pub api_key_ref: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AgentBinding {
    pub role: String,
    pub provider_id: String,
    pub model: String,
    pub temperature: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ProviderConfigSnapshot {
    pub providers: Vec<ProviderConfig>,
    pub agents: Vec<AgentBinding>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ProviderConfigInput {
    pub id: String,
    pub name: String,
    pub kind: String,
    #[serde(default = "default_api_protocol")]
    pub api_protocol: String,
    pub base_url: String,
    pub use_proxy_route: bool,
    pub proxy_url: String,
    pub model: String,
    pub api_key_ref: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct ProviderConnectionResult {
    pub ok: bool,
    pub status: u16,
    pub endpoint: String,
    pub message: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AgentRunInput {
    pub provider: ProviderConfigInput,
    pub owner: String,
    pub stage: String,
    pub task: String,
    pub upstream: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct DirectProviderRunInput {
    pub provider: ProviderConfigInput,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct AgentRunResult {
    pub owner: String,
    pub stage: String,
    pub endpoint: String,
    pub output: String,
    pub elapsed_ms: u64,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub total_tokens: u64,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
struct TokenUsage {
    input_tokens: u64,
    output_tokens: u64,
    total_tokens: u64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AgentBindingInput {
    pub role: String,
    pub provider_id: String,
    pub model: String,
    pub temperature: f32,
}

pub fn default_config_path() -> Result<PathBuf, String> {
    let base = std::env::var_os("APPDATA")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("USERPROFILE").map(PathBuf::from))
        .ok_or_else(|| "无法定位用户配置目录".to_string())?;
    Ok(base.join("ORX").join("providers.json"))
}

pub fn default_secrets_path() -> Result<PathBuf, String> {
    let base = std::env::var_os("APPDATA")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("USERPROFILE").map(PathBuf::from))
        .ok_or_else(|| "无法定位用户配置目录".to_string())?;
    Ok(base.join("ORX").join("secrets.json"))
}

fn default_proxy_url() -> String {
    "http://127.0.0.1:7897".to_string()
}

fn default_api_protocol() -> String {
    API_PROTOCOL_RESPONSES.to_string()
}

fn provider(
    id: &str,
    name: &str,
    kind: &str,
    api_protocol: &str,
    base_url: &str,
    use_proxy_route: bool,
    model: &str,
    api_key_ref: &str,
) -> ProviderConfig {
    ProviderConfig {
        id: id.to_string(),
        name: name.to_string(),
        kind: kind.to_string(),
        api_protocol: normalized_api_protocol(api_protocol).to_string(),
        base_url: base_url.trim_end_matches('/').to_string(),
        use_proxy_route,
        proxy_url: default_proxy_url(),
        model: model.to_string(),
        api_key_ref: api_key_ref.to_string(),
    }
}

fn binding(role: &str, provider: &ProviderConfig) -> AgentBinding {
    AgentBinding {
        role: role.to_string(),
        provider_id: provider.id.clone(),
        model: provider.model.clone(),
        temperature: if role == "product" { 0.3 } else { 0.2 },
    }
}

fn normalize_role(role: &str) -> String {
    match role.trim() {
        "qa" => "tester".to_string(),
        value => value.to_string(),
    }
}

fn normalize_snapshot(snapshot: ProviderConfigSnapshot) -> ProviderConfigSnapshot {
    let mut providers = Vec::new();
    for provider in snapshot.providers {
        if provider.id.trim().is_empty() || providers.iter().any(|item: &ProviderConfig| item.id == provider.id) {
            continue;
        }
        providers.push(ProviderConfig {
            id: provider.id.trim().to_string(),
            name: provider.name.trim().to_string(),
            kind: provider.kind.trim().to_string(),
            api_protocol: normalized_api_protocol(&provider.api_protocol).to_string(),
            base_url: provider.base_url.trim().trim_end_matches('/').to_string(),
            use_proxy_route: provider.use_proxy_route,
            proxy_url: provider.proxy_url.trim().trim_end_matches('/').to_string(),
            model: provider.model.trim().to_string(),
            api_key_ref: provider.api_key_ref.trim().to_string(),
        });
    }
    if providers.is_empty() {
        return default_config();
    }

    let provider_ids = providers.iter().map(|provider| provider.id.clone()).collect::<std::collections::HashSet<_>>();
    let valid_roles = ["administrator", "product", "developer", "architect", "tester"];
    let mut agents = Vec::new();
    for agent in snapshot.agents {
        let role = normalize_role(&agent.role);
        if !valid_roles.contains(&role.as_str()) || !provider_ids.contains(&agent.provider_id) {
            continue;
        }
        if agents.iter().any(|item: &AgentBinding| item.role == role) {
            continue;
        }
        agents.push(AgentBinding {
            role,
            provider_id: agent.provider_id,
            model: agent.model,
            temperature: agent.temperature,
        });
    }

    let default_snapshot = default_config();
    for role in valid_roles {
        if !agents.iter().any(|agent| agent.role == role) {
            if let Some(default_agent) = default_snapshot.agents.iter().find(|agent| agent.role == role) {
                if provider_ids.contains(&default_agent.provider_id) {
                    agents.push(default_agent.clone());
                    continue;
                }
            }
            agents.push(binding(role, &providers[0]));
        }
    }

    ProviderConfigSnapshot { providers, agents }
}

pub fn load_config(path: impl AsRef<Path>) -> Result<ProviderConfigSnapshot, String> {
    let path = path.as_ref();
    if !path.exists() {
        return Ok(default_config());
    }
    let content = fs::read_to_string(path).map_err(|error| format!("读取 Provider 配置失败: {error}"))?;
    let snapshot = serde_json::from_str(&content).map_err(|error| format!("解析 Provider 配置失败: {error}"))?;
    Ok(normalize_snapshot(snapshot))
}

pub fn save_provider(path: impl AsRef<Path>, input: ProviderConfigInput) -> Result<ProviderConfigSnapshot, String> {
    validate_provider(&input)?;
    let path = path.as_ref();
    let mut snapshot = load_config(path)?;
    let provider = ProviderConfig {
        id: input.id.trim().to_string(),
        name: input.name.trim().to_string(),
        kind: input.kind.trim().to_string(),
        api_protocol: normalized_api_protocol(&input.api_protocol).to_string(),
        base_url: input.base_url.trim().trim_end_matches('/').to_string(),
        use_proxy_route: input.use_proxy_route,
        proxy_url: input.proxy_url.trim().trim_end_matches('/').to_string(),
        model: input.model.trim().to_string(),
        api_key_ref: input.api_key_ref.trim().to_string(),
    };

    if let Some(existing) = snapshot.providers.iter_mut().find(|item| item.id == provider.id) {
        *existing = provider;
    } else {
        snapshot.providers.push(provider);
    }
    if let Some(saved_provider) = snapshot.providers.iter().find(|item| item.id == input.id.trim()) {
        for agent in snapshot.agents.iter_mut().filter(|agent| agent.provider_id == saved_provider.id) {
            agent.model = saved_provider.model.clone();
        }
    }
    snapshot.providers.sort_by(|left, right| left.name.cmp(&right.name));
    write_config(path, &snapshot)?;
    Ok(snapshot)
}

pub fn delete_provider(path: impl AsRef<Path>, provider_id: &str) -> Result<ProviderConfigSnapshot, String> {
    let path = path.as_ref();
    let mut snapshot = load_config(path)?;
    let before = snapshot.providers.len();
    snapshot.providers.retain(|provider| provider.id != provider_id);
    if snapshot.providers.len() == before {
        return Err(format!("Provider 不存在: {provider_id}"));
    }
    snapshot.agents.retain(|agent| agent.provider_id != provider_id);
    if snapshot.providers.is_empty() {
        return Err("至少需要保留一个 Provider".to_string());
    }
    write_config(path, &snapshot)?;
    Ok(snapshot)
}

pub fn bind_agent(path: impl AsRef<Path>, input: AgentBindingInput) -> Result<ProviderConfigSnapshot, String> {
    validate_agent_binding(&input)?;
    let path = path.as_ref();
    let mut snapshot = load_config(path)?;
    if !snapshot.providers.iter().any(|provider| provider.id == input.provider_id) {
        return Err(format!("Provider 不存在: {}", input.provider_id));
    }

    let binding = AgentBinding {
        role: input.role.trim().to_string(),
        provider_id: input.provider_id.trim().to_string(),
        model: input.model.trim().to_string(),
        temperature: input.temperature,
    };

    if let Some(existing) = snapshot.agents.iter_mut().find(|item| item.role == binding.role) {
        *existing = binding;
    } else {
        snapshot.agents.push(binding);
    }
    write_config(path, &snapshot)?;
    Ok(snapshot)
}

pub fn test_provider_connection(input: ProviderConfigInput) -> Result<ProviderConnectionResult, String> {
    validate_provider(&input)?;
    let api_key = resolve_api_key(input.api_key_ref.trim())?;
    if api_key.trim().is_empty() {
        return Err(format!("API Key 引用为空: {}", input.api_key_ref.trim()));
    }

    let endpoint = provider_endpoint_for_model(input.base_url.trim(), &input.api_protocol, input.model.trim());
    let mut client_builder = reqwest::blocking::Client::builder().timeout(Duration::from_secs(PROVIDER_TEST_TIMEOUT_SECS));
    if input.use_proxy_route {
        let proxy = reqwest::Proxy::all(input.proxy_url.trim()).map_err(|error| format!("代理地址无效: {error}"))?;
        client_builder = client_builder.proxy(proxy);
    }
    let client = client_builder.build().map_err(|error| format!("创建 HTTP 客户端失败: {error}"))?;
    let payload = build_provider_payload_with_limit(&input.api_protocol, input.model.trim(), "你是 PM Agent。请只回复 OK，表示 Provider 连接正常。", "", 32)?;
    let request = client.post(&endpoint).json(&payload);
    let response = apply_provider_auth(request, &input.api_protocol, api_key.trim())
        .send()
        .map_err(|error| format!("Provider 连接失败: {}", format_reqwest_error(&error)))?;
    let status = response.status().as_u16();
    let text = response.text().unwrap_or_default();
    if (200..300).contains(&status) {
        Ok(ProviderConnectionResult {
            ok: true,
            status,
            endpoint,
            message: extract_response_output(&text).unwrap_or_else(|| "连接成功，但未解析到文本输出。".to_string()),
        })
    } else {
        Ok(ProviderConnectionResult { ok: false, status, endpoint, message: trim_message(&text) })
    }
}

pub fn run_agent(input: AgentRunInput) -> Result<AgentRunResult, String> {
    let started_at = Instant::now();
    validate_provider(&input.provider)?;
    if input.provider.kind.trim() == "mock" {
        let output = mock_agent_output(&input.owner, &input.stage, &input.task, &input.upstream);
        return Ok(AgentRunResult {
            owner: input.owner,
            stage: input.stage,
            endpoint: "mock://local-agent".to_string(),
            output,
            elapsed_ms: started_at.elapsed().as_millis() as u64,
            input_tokens: input.upstream.chars().count() as u64,
            output_tokens: 64,
            total_tokens: input.upstream.chars().count() as u64 + 64,
        });
    }
    let api_key = resolve_api_key(input.provider.api_key_ref.trim())?;
    if api_key.trim().is_empty() {
        return Err(format!("API Key 引用为空: {}", input.provider.api_key_ref.trim()));
    }

    let endpoint = provider_endpoint_for_model(input.provider.base_url.trim(), &input.provider.api_protocol, input.provider.model.trim());
    let prompt = build_agent_prompt(&input.owner, &input.stage, &input.task, &input.upstream);
    let mut client_builder = reqwest::blocking::Client::builder().timeout(Duration::from_secs(AGENT_RUN_TIMEOUT_SECS));
    if input.provider.use_proxy_route {
        let proxy = reqwest::Proxy::all(input.provider.proxy_url.trim()).map_err(|error| format!("代理地址无效: {error}"))?;
        client_builder = client_builder.proxy(proxy);
    }
    let client = client_builder.build().map_err(|error| format!("创建 HTTP 客户端失败: {error}"))?;
    let payload = build_provider_payload(&input.provider.api_protocol, input.provider.model.trim(), &prompt, &input.upstream)?;
    let request = client.post(&endpoint).json(&payload);
    let response = apply_provider_auth(request, &input.provider.api_protocol, api_key.trim())
        .send()
        .map_err(|error| agent_call_diagnostic(&input, &endpoint, &format_reqwest_error(&error)))?;
    let status = response.status().as_u16();
    let text = response.text().unwrap_or_default();
    if !(200..300).contains(&status) {
        return Err(format!("{} HTTP {status} {}", agent_call_diagnostic(&input, &endpoint, "non-success status"), trim_message(&text)));
    }
    let usage = extract_token_usage(&text);
    let output = extract_response_output(&text).unwrap_or_else(|| {
        if is_image_generation_model(input.provider.model.trim()) {
            format!(
                "图片模型已返回，但 ORX 暂未解析到图片字段。\nendpoint={endpoint}\nresponse_preview={}",
                trim_message(&text)
            )
        } else {
            "Agent 已完成，但未解析到文本输出。".to_string()
        }
    });
    Ok(AgentRunResult {
        owner: input.owner,
        stage: input.stage,
        endpoint,
        output: trim_agent_output(&output),
        elapsed_ms: started_at.elapsed().as_millis() as u64,
        input_tokens: usage.input_tokens,
        output_tokens: usage.output_tokens,
        total_tokens: usage.total_tokens,
    })
}

pub fn run_provider_direct(input: DirectProviderRunInput) -> Result<AgentRunResult, String> {
    let started_at = Instant::now();
    validate_provider(&input.provider)?;
    let message = input.message.trim();
    if message.is_empty() {
        return Err("直连模型消息不能为空".to_string());
    }
    if input.provider.kind.trim() == "mock" {
        return Ok(AgentRunResult {
            owner: "MODEL".to_string(),
            stage: "直连模型".to_string(),
            endpoint: "mock://direct-provider".to_string(),
            output: format!("Mock direct response: {message}"),
            elapsed_ms: started_at.elapsed().as_millis() as u64,
            input_tokens: message.chars().count() as u64,
            output_tokens: 32,
            total_tokens: message.chars().count() as u64 + 32,
        });
    }

    let api_key = resolve_api_key(input.provider.api_key_ref.trim())?;
    if api_key.trim().is_empty() {
        return Err(format!("API Key 引用为空: {}", input.provider.api_key_ref.trim()));
    }

    let endpoint = provider_endpoint_for_model(input.provider.base_url.trim(), &input.provider.api_protocol, input.provider.model.trim());
    let mut client_builder = reqwest::blocking::Client::builder().timeout(Duration::from_secs(AGENT_RUN_TIMEOUT_SECS));
    if input.provider.use_proxy_route {
        let proxy = reqwest::Proxy::all(input.provider.proxy_url.trim()).map_err(|error| format!("代理地址无效: {error}"))?;
        client_builder = client_builder.proxy(proxy);
    }
    let client = client_builder.build().map_err(|error| format!("创建 HTTP 客户端失败: {error}"))?;
    let payload = build_direct_provider_payload(&input.provider.api_protocol, input.provider.model.trim(), message)?;
    let request = client.post(&endpoint).json(&payload);
    let response = apply_provider_auth(request, &input.provider.api_protocol, api_key.trim())
        .send()
        .map_err(|error| direct_call_diagnostic(&input.provider, &endpoint, &format_reqwest_error(&error)))?;
    let status = response.status().as_u16();
    let text = response.text().unwrap_or_default();
    if !(200..300).contains(&status) {
        return Err(format!("{} HTTP {status} {}", direct_call_diagnostic(&input.provider, &endpoint, "non-success status"), trim_message(&text)));
    }
    let usage = extract_token_usage(&text);
    let output = extract_response_output(&text).unwrap_or_else(|| {
        let raw = text.trim();
        if !raw.is_empty() && serde_json::from_str::<serde_json::Value>(raw).is_err() {
            return raw.to_string();
        }
        if is_image_generation_model(input.provider.model.trim()) {
            format!(
                "图片模型已返回，但 ORX 暂未解析到图片字段。\nendpoint={endpoint}\nresponse_preview={}",
                trim_message(&text)
            )
        } else {
            "模型已完成，但未解析到输出。".to_string()
        }
    });
    Ok(AgentRunResult {
        owner: "MODEL".to_string(),
        stage: "直连模型".to_string(),
        endpoint,
        output: trim_agent_output(&output),
        elapsed_ms: started_at.elapsed().as_millis() as u64,
        input_tokens: usage.input_tokens,
        output_tokens: usage.output_tokens,
        total_tokens: usage.total_tokens,
    })
}

fn mock_agent_output(owner: &str, stage: &str, task: &str, upstream: &str) -> String {
    let has_attachments = upstream.contains("对话附件") || upstream.contains("attachments/");
    let has_text_preview = upstream.contains("文本预览");
    let has_image_attachment = upstream.contains("[image]") || upstream.contains(".png") || upstream.contains(".jpg") || upstream.contains(".jpeg") || upstream.contains(".webp");
    let attachment_summary = if has_attachments {
        format!(
            "\n\n附件读取结果：已读取附件上下文；文档预览={}；图片元数据={}。",
            if has_text_preview { "已识别" } else { "未提供" },
            if has_image_attachment { "已识别" } else { "未提供" }
        )
    } else {
        "\n\n附件读取结果：未收到附件上下文。".to_string()
    };
    format!(
        "Mock {owner} / {stage} 节点完成。\n任务：{task}\n上游上下文字符数：{}{}",
        upstream.chars().count(),
        attachment_summary
    )
}

fn build_responses_payload(model: &str, prompt: &str, upstream: &str) -> Result<serde_json::Value, String> {
    let image_urls = collect_image_data_urls(upstream)?;
    if image_urls.is_empty() {
        return Ok(serde_json::json!({
            "model": model,
            "input": prompt,
            "max_output_tokens": 4096
        }));
    }

    let mut content = vec![serde_json::json!({ "type": "input_text", "text": prompt })];
    for image_url in image_urls {
        content.push(serde_json::json!({ "type": "input_image", "image_url": image_url }));
    }
    Ok(serde_json::json!({
        "model": model,
        "input": [{ "role": "user", "content": content }],
        "max_output_tokens": 4096
    }))
}

fn build_provider_payload(protocol: &str, model: &str, prompt: &str, upstream: &str) -> Result<serde_json::Value, String> {
    build_provider_payload_with_limit(protocol, model, prompt, upstream, 4096)
}

fn build_direct_provider_payload(protocol: &str, model: &str, message: &str) -> Result<serde_json::Value, String> {
    let message = message.trim();
    if normalized_api_protocol(protocol) == API_PROTOCOL_CUSTOM_DIRECT && is_image_generation_model(model) {
        return Ok(serde_json::json!({
            "model": model,
            "prompt": message,
            "n": 1
        }));
    }

    match normalized_api_protocol(protocol) {
        API_PROTOCOL_ANTHROPIC_MESSAGES => Ok(serde_json::json!({
            "model": model,
            "messages": [{ "role": "user", "content": message }],
            "max_tokens": 4096
        })),
        API_PROTOCOL_CUSTOM_DIRECT => Ok(serde_json::json!({
            "model": model,
            "messages": [{ "role": "user", "content": message }],
            "max_tokens": 4096
        })),
        _ => build_responses_payload(model, message, ""),
    }
}

fn build_provider_payload_with_limit(protocol: &str, model: &str, prompt: &str, upstream: &str, max_tokens: u64) -> Result<serde_json::Value, String> {
    if normalized_api_protocol(protocol) == API_PROTOCOL_CUSTOM_DIRECT && is_image_generation_model(model) {
        return Ok(serde_json::json!({
            "model": model,
            "prompt": image_generation_prompt(prompt, upstream),
            "n": 1
        }));
    }

    match normalized_api_protocol(protocol) {
        API_PROTOCOL_ANTHROPIC_MESSAGES => Ok(serde_json::json!({
            "model": model,
            "messages": [{ "role": "user", "content": prompt }],
            "max_tokens": max_tokens
        })),
        API_PROTOCOL_CUSTOM_DIRECT => Ok(serde_json::json!({
            "model": model,
            "messages": [{ "role": "user", "content": prompt }],
            "max_tokens": max_tokens
        })),
        _ => {
            let mut payload = build_responses_payload(model, prompt, upstream)?;
            if let Some(object) = payload.as_object_mut() {
                object.insert("max_output_tokens".to_string(), serde_json::json!(max_tokens));
            }
            Ok(payload)
        }
    }
}

fn image_generation_prompt(prompt: &str, upstream: &str) -> String {
    let task = prompt
        .lines()
        .skip_while(|line| !line.contains("ORCH 调度器下发任务如下"))
        .nth(1)
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .unwrap_or_else(|| prompt.trim());
    if upstream.trim().is_empty() {
        task.to_string()
    } else {
        format!("{task}\n\n参考上下文：\n{}", upstream.trim())
    }
}

fn collect_image_data_urls(upstream: &str) -> Result<Vec<String>, String> {
    let mut urls = Vec::new();
    for line in upstream.lines() {
        if !line.contains("[image]") || !line.contains("->") {
            continue;
        }
        let Some(path_text) = line.split("->").last().map(str::trim).filter(|value| !value.is_empty()) else {
            continue;
        };
        let path = PathBuf::from(path_text);
        if !path.exists() || !path.is_file() {
            continue;
        }
        let mime = image_mime_for_path(&path);
        let bytes = fs::read(&path).map_err(|error| format!("读取视觉附件失败: {} {error}", path.display()))?;
        let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);
        urls.push(format!("data:{mime};base64,{encoded}"));
    }
    Ok(urls)
}

fn image_mime_for_path(path: &Path) -> &'static str {
    match path.extension().and_then(|value| value.to_str()).unwrap_or_default().to_ascii_lowercase().as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "bmp" => "image/bmp",
        "svg" => "image/svg+xml",
        _ => "image/png",
    }
}

fn default_config() -> ProviderConfigSnapshot {
    let astrdark = provider(
        "astrdark-grok-imagine-image",
        "AstrDark Grok Imagine Image",
        "openai-compatible",
        API_PROTOCOL_CUSTOM_DIRECT,
        "https://api.astrdark.cyou",
        false,
        "grok-imagine-image",
        "ASTRDARK_API_KEY",
    );
    let sharedchat = provider(
        "sharedchat-codex",
        "SharedChat Code",
        "openai-compatible",
        API_PROTOCOL_CUSTOM_DIRECT,
        "https://new.sharedchat.cc/code",
        false,
        "gpt-5.4",
        "SHAREDCHAT_CODEX_API_KEY",
    );
    let gpt_local = provider(
        "gpt-local",
        "GPT Local",
        "openai-compatible",
        API_PROTOCOL_RESPONSES,
        "http://127.0.0.1:8317/v1",
        true,
        "gpt-5.5",
        "GPT_LOCAL_API_KEY",
    );
    let gpt = provider(
        "provider-1780118391953",
        "GPT",
        "openai-compatible",
        API_PROTOCOL_RESPONSES,
        "https://api.openai.com/v1",
        true,
        "gpt-5.5",
        "GPT_LOCAL_API_KEY",
    );
    let mimo_cn = provider(
        "mimo-token-plan-cn",
        "Mimo Token Plan CN",
        "anthropic",
        API_PROTOCOL_ANTHROPIC_MESSAGES,
        "https://token-plan-sgp.xiaomimimo.com/anthropic",
        false,
        "mimo-v2.5-pro",
        "ANTHROPIC_AUTH_TOKEN",
    );
    let bailian = provider(
        "provider-1780118263362",
        "百炼",
        "openai-compatible",
        API_PROTOCOL_ANTHROPIC_MESSAGES,
        "https://coding.dashscope.aliyuncs.com/v1",
        false,
        "qwen3.6-plus",
        "ALY_LOCAL_API_KEY",
    );
    let mimo = provider(
        "mimo-token-plan",
        "Mimo Token Plan",
        "anthropic-compatible",
        API_PROTOCOL_ANTHROPIC_MESSAGES,
        "https://token-plan-sgp.xiaomimimo.com/anthropic",
        false,
        "mimo-v2.5-pro",
        "MIMO_TOKEN_PLAN_API_KEY",
    );
    let roles = ["administrator", "product", "developer", "architect", "tester"];
    let agents = roles
        .iter()
        .map(|role| {
            if *role == "administrator" {
                binding(role, &astrdark)
            } else {
                binding(role, &sharedchat)
            }
        })
        .collect();

    ProviderConfigSnapshot { providers: vec![astrdark, sharedchat, gpt_local, gpt, mimo_cn, bailian, mimo], agents }
}

fn validate_provider(input: &ProviderConfigInput) -> Result<(), String> {
    if input.id.trim().is_empty() {
        return Err("Provider ID 不能为空".to_string());
    }
    if input.name.trim().is_empty() {
        return Err("Provider 名称不能为空".to_string());
    }
    if !["openai-compatible", "anthropic", "anthropic-compatible", "gemini", "deepseek", "mock"].contains(&input.kind.trim()) {
        return Err("Provider 类型不支持".to_string());
    }
    if ![API_PROTOCOL_RESPONSES, API_PROTOCOL_ANTHROPIC_MESSAGES, API_PROTOCOL_CUSTOM_DIRECT].contains(&normalized_api_protocol(&input.api_protocol)) {
        return Err("API 协议不支持".to_string());
    }
    if input.base_url.trim().is_empty() {
        return Err("Base URL 不能为空".to_string());
    }
    if input.use_proxy_route && input.proxy_url.trim().is_empty() {
        return Err("代理地址不能为空".to_string());
    }
    if input.model.trim().is_empty() {
        return Err("模型不能为空".to_string());
    }
    Ok(())
}

fn provider_responses_endpoint(base_url: &str) -> String {
    format!("{}/responses", base_url.trim_end_matches('/'))
}

fn provider_endpoint(base_url: &str, protocol: &str) -> String {
    match normalized_api_protocol(protocol) {
        API_PROTOCOL_ANTHROPIC_MESSAGES => format!("{}/v1/messages", base_url.trim_end_matches('/')),
        API_PROTOCOL_CUSTOM_DIRECT => base_url.trim_end_matches('/').to_string(),
        _ => provider_responses_endpoint(base_url),
    }
}

fn provider_endpoint_for_model(base_url: &str, protocol: &str, model: &str) -> String {
    let base = base_url.trim_end_matches('/');
    if normalized_api_protocol(protocol) == API_PROTOCOL_CUSTOM_DIRECT && is_image_generation_model(model) {
        if base.ends_with("/images/generations") {
            return base.to_string();
        }
        if base.ends_with("/v1") {
            return format!("{base}/images/generations");
        }
        return format!("{base}/v1/images/generations");
    }
    provider_endpoint(base_url, protocol)
}

fn is_image_generation_model(model: &str) -> bool {
    let normalized = model.to_ascii_lowercase();
    normalized.contains("image") || normalized.contains("imagine")
}

fn normalized_api_protocol(protocol: &str) -> &str {
    let trimmed = protocol.trim();
    if trimmed.is_empty() {
        API_PROTOCOL_RESPONSES
    } else {
        trimmed
    }
}

fn apply_provider_auth(request: reqwest::blocking::RequestBuilder, protocol: &str, api_key: &str) -> reqwest::blocking::RequestBuilder {
    match normalized_api_protocol(protocol) {
        API_PROTOCOL_ANTHROPIC_MESSAGES => request.header("x-api-key", api_key).header("anthropic-version", "2023-06-01"),
        _ => request.bearer_auth(api_key),
    }
}

fn build_agent_prompt(owner: &str, stage: &str, task: &str, upstream: &str) -> String {
    let role_context = role_context_for_owner(owner);
    let file_artifact_rule = if owner.contains("DEV") || owner.contains("开发") {
        "\n\n文件产物规则：如果当前任务或上游附件内容要求生成代码文件、HTML、CSS、JS、脚本或配置，你必须直接输出可落盘的完整文件内容，不能只拆解任务或只给实施建议。请在产物中输出 Markdown 代码块，并在代码块第一行写明文件名，例如 `<!-- FILE: form.html -->`、`<!-- FILE: index.html -->`、`// FILE: src/app.ts` 或 `# FILE: scripts/test.py`。ORCH 会把这些代码块保存到任务档案的 generated/ 目录，并同步写入上游“代码产物同步路径”指定的当前项目根目录；没有实际非空代码块会被视为 DEV 节点失败并打回。"
    } else {
        ""
    };
    let administrator_rule = if owner.contains("PM") || owner.contains("管理员") {
        "\n\nPM 交付总结规则：当当前节点是 Retrospective 或流程收尾时，必须优先输出交付报告，而不是泛泛流程复盘。固定覆盖：1. DEV 改动总结：DEV 做了什么功能/修复/调整，生成了哪些新产物文件，修改了哪些原有文件，未完成或需人工确认的点；2. QA 测试总结：QA 做了哪些测试，覆盖了哪些场景，是否全量覆盖，未覆盖项和残留风险；3. 最终交付结论：是否可以交付、阻塞项、回归风险和下一步。流程治理、节点交接和改进项只作为补充，不得压过 DEV/QA 交付事实。"
    } else {
        ""
    };
    format!(
        "你是{owner}。角色说明：{role_context}\nORCH 调度器下发任务如下：\n{task}\n\n当前流程节点：{stage}\n\n上游产物/上下文：\n{upstream}{file_artifact_rule}{administrator_rule}\n\n请严格完成当前节点职责，输出可交付产物、风险、下一步建议。输出控制：总长度不超过 1200 字，优先保留结论、检查点、阻塞项和下一步。完成后通知 ORCH，明确写出“节点完成”。"
    )
}

fn role_context_for_owner(owner: &str) -> &'static str {
    if owner.contains("PM") || owner.contains("管理员") {
        "PM 是流程管理 Agent，负责 Intake、方案收敛、复盘总结；ORCH 才是程序调度器。"
    } else if owner.contains("PD") || owner.contains("产品") {
        "PD 是产品 Agent，负责需求澄清、场景预演、边界探测和验收口径。"
    } else if owner.contains("DEV") || owner.contains("开发") {
        "DEV 是开发 Agent，负责实现拆解、接口/数据流和测试驱动开发任务。"
    } else if owner.contains("ARCH") || owner.contains("架构") {
        "ARCH 是架构师 Agent，负责代码审查、红蓝质询、架构风险和非功能边界。"
    } else if owner.contains("QA") || owner.contains("测试") {
        "QA 是测试 Agent，负责集成测试、端到端测试、执行证据和回归路径。"
    } else {
        "通用流程 Agent，按当前节点职责产出结果。"
    }
}

fn resolve_api_key(api_key_ref: &str) -> Result<String, String> {
    if let Ok(value) = std::env::var(api_key_ref) {
        return Ok(value);
    }
    let secrets_path = default_secrets_path()?;
    read_api_key_from_secrets(&secrets_path, api_key_ref)
}

fn read_api_key_from_secrets(path: &Path, api_key_ref: &str) -> Result<String, String> {
    let content = fs::read_to_string(path).map_err(|_| format!("无法读取 API Key 引用: {api_key_ref}；环境变量不存在，且未找到密钥文件: {}", path.display()))?;
    let content = content.trim_start_matches('\u{feff}');
    let secrets = serde_json::from_str::<serde_json::Map<String, serde_json::Value>>(content).map_err(|error| format!("解析密钥文件失败: {error}"))?;
    secrets
        .get(api_key_ref)
        .and_then(|value| value.as_str())
        .map(|value| value.to_string())
        .ok_or_else(|| format!("密钥文件中未找到 API Key 引用: {api_key_ref}"))
}

fn extract_response_text(content: &str) -> Option<String> {
    let value = serde_json::from_str::<serde_json::Value>(content).ok()?;
    if let Some(text) = value
        .get("output")
        .and_then(|output| output.as_array())
        .iter()
        .flat_map(|items| items.iter())
        .flat_map(|item| item.get("content").and_then(|content| content.as_array()).into_iter().flatten())
        .find_map(|content| content.get("text").and_then(|text| text.as_str()))
        .map(|text| text.trim().to_string())
    {
        return Some(text);
    }

    if let Some(text) = value
        .get("content")
        .and_then(|content| content.as_array())
        .into_iter()
        .flatten()
        .filter(|item| item.get("type").and_then(|kind| kind.as_str()) == Some("text"))
        .find_map(|item| item.get("text").and_then(|text| text.as_str()))
        .map(|text| text.trim().to_string())
    {
        return Some(text);
    }

    value
        .get("choices")
        .and_then(|choices| choices.as_array())
        .and_then(|choices| choices.first())
        .and_then(|choice| choice.get("message"))
        .and_then(|message| message.get("content"))
        .and_then(|text| text.as_str())
        .map(|text| text.trim().to_string())
}

fn extract_response_output(content: &str) -> Option<String> {
    extract_response_text(content).or_else(|| format_image_response_output(content))
}

fn format_image_response_output(content: &str) -> Option<String> {
    let images = extract_response_images(content);
    if images.is_empty() {
        return None;
    }

    let mut lines = vec!["已生成图片。".to_string()];
    for (index, image) in images.iter().enumerate() {
        lines.push(format!("![生成图片 {}]({image})", index + 1));
    }
    Some(lines.join("\n"))
}

fn extract_response_images(content: &str) -> Vec<String> {
    let Ok(value) = serde_json::from_str::<serde_json::Value>(content) else {
        return Vec::new();
    };
    let mut images = Vec::new();
    collect_response_images(&value, "", &mut images);
    images
}

fn collect_response_images(value: &serde_json::Value, key_hint: &str, images: &mut Vec<String>) {
    match value {
        serde_json::Value::Array(items) => {
            for item in items {
                collect_response_images(item, key_hint, images);
            }
        }
        serde_json::Value::Object(object) => {
            for (key, child) in object {
                collect_response_images(child, key, images);
            }
        }
        serde_json::Value::String(text) => {
            if let Some(image) = normalize_image_reference(key_hint, text) {
                if !images.iter().any(|item| item == &image) {
                    images.push(image);
                }
            }
        }
        _ => {}
    }
}

fn normalize_image_reference(key_hint: &str, value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }
    if trimmed.starts_with("data:image/") {
        return Some(trimmed.to_string());
    }
    if looks_like_image_url(trimmed) {
        return Some(trimmed.to_string());
    }

    let key = key_hint.to_ascii_lowercase();
    let image_key = key.contains("b64") || key.contains("base64") || key.contains("image");
    if image_key && looks_like_base64_image(trimmed) {
        return Some(format!("data:image/png;base64,{trimmed}"));
    }
    None
}

fn looks_like_image_url(value: &str) -> bool {
    let lower = value.to_ascii_lowercase();
    (lower.starts_with("https://") || lower.starts_with("http://"))
        && (lower.contains(".png")
            || lower.contains(".jpg")
            || lower.contains(".jpeg")
            || lower.contains(".webp")
            || lower.contains(".gif")
            || lower.contains("/image")
            || lower.contains("image="))
}

fn looks_like_base64_image(value: &str) -> bool {
    if value.len() < 64 {
        return false;
    }
    value.chars().all(|character| character.is_ascii_alphanumeric() || matches!(character, '+' | '/' | '='))
}

fn extract_token_usage(content: &str) -> TokenUsage {
    let value = match serde_json::from_str::<serde_json::Value>(content) {
        Ok(value) => value,
        Err(_) => return TokenUsage::default(),
    };
    let usage = match value.get("usage") {
        Some(usage) => usage,
        None => return TokenUsage::default(),
    };
    let input_tokens = usage.get("input_tokens").and_then(|value| value.as_u64()).unwrap_or(0);
    let cached_tokens = usage.get("cache_read_input_tokens").and_then(|value| value.as_u64()).unwrap_or(0);
    let output_tokens = usage.get("output_tokens").and_then(|value| value.as_u64()).unwrap_or(0);
    let total_tokens = usage.get("total_tokens").and_then(|value| value.as_u64()).unwrap_or(input_tokens + cached_tokens + output_tokens);
    TokenUsage {
        input_tokens: input_tokens + cached_tokens,
        output_tokens,
        total_tokens,
    }
}

fn trim_message(message: &str) -> String {
    const MAX_LEN: usize = 240;
    let trimmed = message.trim();
    if trimmed.chars().count() <= MAX_LEN {
        return trimmed.to_string();
    }
    trimmed.chars().take(MAX_LEN).collect::<String>() + "..."
}

fn trim_agent_output(output: &str) -> String {
    const MAX_CHARS: usize = 24_000;
    let trimmed = output.trim();
    if trimmed.contains("data:image/") {
        return trimmed.to_string();
    }
    if trimmed.chars().count() <= MAX_CHARS {
        return trimmed.to_string();
    }
    let head = trimmed.chars().take(MAX_CHARS - 80).collect::<String>();
    format!("{head}\n\n[输出已截断：该节点产物超过流程上下文预算，请在独立产物区查看或要求 Agent 继续。]")
}

fn agent_call_diagnostic(input: &AgentRunInput, endpoint: &str, error: &str) -> String {
    format!(
        "Agent 调用失败: stage={} owner={} provider={} model={} endpoint={} proxy={} timeout={}s error={}",
        input.stage.trim(),
        input.owner.trim(),
        input.provider.name.trim(),
        input.provider.model.trim(),
        endpoint,
        if input.provider.use_proxy_route { input.provider.proxy_url.trim() } else { "disabled" },
        AGENT_RUN_TIMEOUT_SECS,
        error
    )
}

fn direct_call_diagnostic(provider: &ProviderConfigInput, endpoint: &str, error: &str) -> String {
    format!(
        "直连模型调用失败: provider={} model={} endpoint={} proxy={} timeout={}s error={}",
        provider.name.trim(),
        provider.model.trim(),
        endpoint,
        if provider.use_proxy_route { provider.proxy_url.trim() } else { "disabled" },
        AGENT_RUN_TIMEOUT_SECS,
        error
    )
}

fn format_reqwest_error(error: &reqwest::Error) -> String {
    let mut parts = vec![error.to_string()];
    let mut source = error.source();
    while let Some(error_source) = source {
        parts.push(error_source.to_string());
        source = error_source.source();
    }
    parts.join(" | caused by: ")
}

fn validate_agent_binding(input: &AgentBindingInput) -> Result<(), String> {
    if !["administrator", "product", "developer", "architect", "tester"].contains(&input.role.trim()) {
        return Err("Agent 角色不支持".to_string());
    }
    if input.provider_id.trim().is_empty() {
        return Err("Provider ID 不能为空".to_string());
    }
    if input.model.trim().is_empty() {
        return Err("模型不能为空".to_string());
    }
    if !(0.0..=2.0).contains(&input.temperature) {
        return Err("Temperature 必须在 0 到 2 之间".to_string());
    }
    Ok(())
}

fn write_config(path: &Path, snapshot: &ProviderConfigSnapshot) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| format!("创建 Provider 配置目录失败: {error}"))?;
    }
    let content = serde_json::to_string_pretty(snapshot).map_err(|error| format!("序列化 Provider 配置失败: {error}"))?;
    fs::write(path, content).map_err(|error| format!("写入 Provider 配置失败: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn save_provider_and_bind_agent_persist_without_plain_api_key() {
        let path = std::env::temp_dir().join("workflow_client_provider_config.json");
        let _ = fs::remove_file(&path);

        let snapshot = save_provider(
            &path,
            ProviderConfigInput {
                id: "deepseek".to_string(),
                name: "DeepSeek".to_string(),
                kind: "openai-compatible".to_string(),
                api_protocol: default_api_protocol(),
                base_url: "https://api.deepseek.com/v1/".to_string(),
                use_proxy_route: true,
                proxy_url: "http://127.0.0.1:7890/".to_string(),
                model: "deepseek-chat".to_string(),
                api_key_ref: "DEEPSEEK_API_KEY".to_string(),
            },
        )
        .unwrap();
        assert!(snapshot.providers.iter().any(|provider| provider.id == "deepseek"));
        let provider = snapshot.providers.iter().find(|provider| provider.id == "deepseek").unwrap();
        assert!(provider.use_proxy_route);
        assert_eq!(provider.proxy_url, "http://127.0.0.1:7890");

        let snapshot = bind_agent(
            &path,
            AgentBindingInput {
                role: "developer".to_string(),
                provider_id: "deepseek".to_string(),
                model: "deepseek-chat".to_string(),
                temperature: 0.2,
            },
        )
        .unwrap();

        let saved = fs::read_to_string(&path).unwrap();
        assert!(saved.contains("DEEPSEEK_API_KEY"));
        assert!(!saved.contains("sk-"));
        assert_eq!(
            snapshot.agents.iter().find(|agent| agent.role == "developer").unwrap().provider_id,
            "deepseek"
        );

        let _ = fs::remove_file(&path);
    }

    #[test]
    fn save_provider_updates_bound_agent_models() {
        let path = std::env::temp_dir().join("workflow_client_provider_model_sync.json");
        let _ = fs::remove_file(&path);

        let _ = save_provider(
            &path,
            ProviderConfigInput {
                id: "sharedchat".to_string(),
                name: "SharedChat".to_string(),
                kind: "openai-compatible".to_string(),
                api_protocol: API_PROTOCOL_CUSTOM_DIRECT.to_string(),
                base_url: "https://new.sharedchat.cc/code".to_string(),
                use_proxy_route: false,
                proxy_url: "http://127.0.0.1:7897".to_string(),
                model: "gpt-5.4".to_string(),
                api_key_ref: "SHAREDCHAT_CODEX_API_KEY".to_string(),
            },
        )
        .unwrap();
        let _ = bind_agent(
            &path,
            AgentBindingInput {
                role: "developer".to_string(),
                provider_id: "sharedchat".to_string(),
                model: "gpt-5.4".to_string(),
                temperature: 0.2,
            },
        )
        .unwrap();

        let snapshot = save_provider(
            &path,
            ProviderConfigInput {
                id: "sharedchat".to_string(),
                name: "SharedChat".to_string(),
                kind: "openai-compatible".to_string(),
                api_protocol: API_PROTOCOL_CUSTOM_DIRECT.to_string(),
                base_url: "https://new.sharedchat.cc/code".to_string(),
                use_proxy_route: false,
                proxy_url: "http://127.0.0.1:7897".to_string(),
                model: "gpt-5.5".to_string(),
                api_key_ref: "SHAREDCHAT_CODEX_API_KEY".to_string(),
            },
        )
        .unwrap();

        assert_eq!(
            snapshot.agents.iter().find(|agent| agent.role == "developer").unwrap().model,
            "gpt-5.5"
        );
        let _ = fs::remove_file(&path);
    }

    #[test]
    fn default_config_binds_all_workflow_roles() {
        let snapshot = load_config(std::env::temp_dir().join("missing_provider_config.json")).unwrap();
        let roles = snapshot.agents.iter().map(|agent| agent.role.as_str()).collect::<Vec<_>>();

        assert_eq!(roles, vec!["administrator", "product", "developer", "architect", "tester"]);
        assert_eq!(snapshot.providers.len(), 7);
        assert_eq!(snapshot.providers[0].id, "astrdark-grok-imagine-image");
        assert_eq!(snapshot.providers[0].kind, "openai-compatible");
        assert_eq!(snapshot.providers[0].api_protocol, API_PROTOCOL_CUSTOM_DIRECT);
        assert_eq!(snapshot.providers[0].base_url, "https://api.astrdark.cyou");
        assert!(!snapshot.providers[0].use_proxy_route);
        assert_eq!(snapshot.providers[0].proxy_url, "http://127.0.0.1:7897");
        assert_eq!(
            snapshot.agents.iter().find(|agent| agent.role == "administrator").unwrap().provider_id,
            "astrdark-grok-imagine-image"
        );
        assert_eq!(
            snapshot.agents.iter().find(|agent| agent.role == "developer").unwrap().provider_id,
            "sharedchat-codex"
        );
    }

    #[test]
    fn delete_provider_removes_provider_and_agent_bindings_from_config_file() {
        let path = std::env::temp_dir().join("workflow_client_provider_delete_config.json");
        let _ = fs::remove_file(&path);
        let _ = save_provider(
            &path,
            ProviderConfigInput {
                id: "one".to_string(),
                name: "One".to_string(),
                kind: "openai-compatible".to_string(),
                api_protocol: default_api_protocol(),
                base_url: "http://127.0.0.1:8317/v1".to_string(),
                use_proxy_route: false,
                proxy_url: "".to_string(),
                model: "model-one".to_string(),
                api_key_ref: "ONE_KEY".to_string(),
            },
        )
        .unwrap();
        let _ = save_provider(
            &path,
            ProviderConfigInput {
                id: "two".to_string(),
                name: "Two".to_string(),
                kind: "openai-compatible".to_string(),
                api_protocol: default_api_protocol(),
                base_url: "http://127.0.0.1:8317/v1".to_string(),
                use_proxy_route: false,
                proxy_url: "".to_string(),
                model: "model-two".to_string(),
                api_key_ref: "TWO_KEY".to_string(),
            },
        )
        .unwrap();
        bind_agent(
            &path,
            AgentBindingInput {
                role: "developer".to_string(),
                provider_id: "two".to_string(),
                model: "model-two".to_string(),
                temperature: 0.2,
            },
        )
        .unwrap();

        let snapshot = delete_provider(&path, "two").unwrap();

        assert!(snapshot.providers.iter().all(|provider| provider.id != "two"));
        assert!(snapshot.agents.iter().all(|agent| agent.provider_id != "two"));
        assert!(!fs::read_to_string(&path).unwrap().contains("\"id\": \"two\""));
        let _ = fs::remove_file(path);
    }

    #[test]
    fn agent_run_timeout_allows_slow_local_models() {
        assert!(AGENT_RUN_TIMEOUT_SECS >= 180);
        assert!(PROVIDER_TEST_TIMEOUT_SECS >= 30);
    }

    #[test]
    fn provider_responses_endpoint_appends_responses() {
        assert_eq!(provider_responses_endpoint("http://127.0.0.1:8317/v1"), "http://127.0.0.1:8317/v1/responses");
        assert_eq!(provider_responses_endpoint("http://127.0.0.1:8317/v1/"), "http://127.0.0.1:8317/v1/responses");
    }

    #[test]
    fn provider_endpoint_uses_anthropic_messages_path() {
        assert_eq!(
            provider_endpoint("https://token-plan-cn.xiaomimimo.com/anthropic", "anthropic-messages"),
            "https://token-plan-cn.xiaomimimo.com/anthropic/v1/messages"
        );
        assert_eq!(
            provider_endpoint("https://token-plan-cn.xiaomimimo.com/anthropic/", "anthropic-messages"),
            "https://token-plan-cn.xiaomimimo.com/anthropic/v1/messages"
        );
    }

    #[test]
    fn provider_endpoint_uses_custom_direct_base_url_without_appending_path() {
        assert_eq!(
            provider_endpoint("https://third-party.example.com/api/chat", "custom-direct"),
            "https://third-party.example.com/api/chat"
        );
    }

    #[test]
    fn provider_endpoint_routes_custom_image_models_to_image_generation_path() {
        assert_eq!(
            provider_endpoint_for_model("https://api.astrdark.cyou", "custom-direct", "grok-imagine-image"),
            "https://api.astrdark.cyou/v1/images/generations"
        );
        assert_eq!(
            provider_endpoint_for_model("https://api.astrdark.cyou/v1", "custom-direct", "grok-imagine-image"),
            "https://api.astrdark.cyou/v1/images/generations"
        );
        assert_eq!(
            provider_endpoint_for_model("https://third-party.example.com/api/chat", "custom-direct", "gpt-5.4"),
            "https://third-party.example.com/api/chat"
        );
    }

    #[test]
    fn custom_direct_image_payload_uses_image_generation_schema() {
        let payload = build_provider_payload(
            "custom-direct",
            "grok-imagine-image",
            "你是 PM Agent。\nORCH 调度器下发任务如下：\n生成一张科技风 ORX 助手图像\n\n当前流程节点：普通聊天",
            "",
        )
        .unwrap();

        assert_eq!(payload.get("model").and_then(|value| value.as_str()), Some("grok-imagine-image"));
        assert_eq!(payload.get("n").and_then(|value| value.as_u64()), Some(1));
        assert!(payload.get("messages").is_none());
        assert_eq!(
            payload.get("prompt").and_then(|value| value.as_str()),
            Some("生成一张科技风 ORX 助手图像")
        );
    }

    #[test]
    fn extract_response_text_reads_responses_output_text() {
        let content = r#"{"output":[{"type":"message","content":[{"type":"output_text","text":"OK"}]}]}"#;
        assert_eq!(extract_response_text(content).unwrap(), "OK");
    }

    #[test]
    fn extract_response_text_reads_anthropic_messages_text() {
        let content = r#"{"content":[{"type":"text","text":"OK"},{"type":"thinking","thinking":"hidden"}]}"#;
        assert_eq!(extract_response_text(content).unwrap(), "OK");
    }

    #[test]
    fn extract_response_text_keeps_full_agent_artifacts() {
        let full_text = format!("{}END", "A".repeat(800));
        let content = serde_json::json!({
            "output": [{
                "type": "message",
                "content": [{ "type": "output_text", "text": full_text }]
            }]
        }).to_string();

        let extracted = extract_response_text(&content).unwrap();

        assert!(extracted.ends_with("END"));
        assert_eq!(extracted.chars().count(), 803);
        assert!(!extracted.ends_with("..."));
    }

    #[test]
    fn extract_response_output_reads_image_urls() {
        let content = serde_json::json!({
            "data": [
                { "url": "https://cdn.example.com/generated/image-1.png" },
                { "image_url": "https://cdn.example.com/generated/image-2.webp" }
            ]
        }).to_string();

        let extracted = extract_response_output(&content).unwrap();

        assert!(extracted.contains("已生成图片"));
        assert!(extracted.contains("![生成图片 1](https://cdn.example.com/generated/image-1.png)"));
        assert!(extracted.contains("![生成图片 2](https://cdn.example.com/generated/image-2.webp)"));
    }

    #[test]
    fn extract_response_output_wraps_base64_images_as_data_urls() {
        let base64_image = "a".repeat(96);
        let content = serde_json::json!({
            "data": [{ "b64_json": base64_image }]
        }).to_string();

        let extracted = extract_response_output(&content).unwrap();

        assert!(extracted.contains("![生成图片 1](data:image/png;base64,"));
    }

    #[test]
    fn extract_token_usage_reads_responses_usage() {
        let content = r#"{"usage":{"input_tokens":123,"output_tokens":45,"total_tokens":168}}"#;
        let usage = extract_token_usage(content);

        assert_eq!(usage.input_tokens, 123);
        assert_eq!(usage.output_tokens, 45);
        assert_eq!(usage.total_tokens, 168);
    }

    #[test]
    fn extract_token_usage_reads_anthropic_messages_usage() {
        let content = r#"{"usage":{"input_tokens":74,"output_tokens":25,"cache_read_input_tokens":192}}"#;
        let usage = extract_token_usage(content);

        assert_eq!(usage.input_tokens, 266);
        assert_eq!(usage.output_tokens, 25);
        assert_eq!(usage.total_tokens, 291);
    }

    #[test]
    fn extract_token_usage_defaults_missing_fields_to_zero() {
        let usage = extract_token_usage(r#"{"output":[]}"#);

        assert_eq!(usage.input_tokens, 0);
        assert_eq!(usage.output_tokens, 0);
        assert_eq!(usage.total_tokens, 0);
    }

    #[test]
    fn trim_agent_output_caps_long_workflow_artifacts() {
        let content = "A".repeat(26_200);
        let trimmed = trim_agent_output(&content);

        assert!(trimmed.chars().count() < content.chars().count());
        assert!(trimmed.contains("输出已截断"));
        assert!(trimmed.chars().count() <= 24_200);
    }

    #[test]
    fn trim_agent_output_keeps_complete_data_url_images() {
        let image = format!("已生成图片。\n![生成图片 1](data:image/png;base64,{})", "a".repeat(30_000));
        let trimmed = trim_agent_output(&image);

        assert_eq!(trimmed, image);
        assert!(!trimmed.contains("输出已截断"));
    }

    #[test]
    fn read_api_key_from_user_secrets_file() {
        let path = std::env::temp_dir().join("workflow_client_test_secrets.json");
        fs::write(&path, r#"{"GPT_LOCAL_API_KEY":"test-key"}"#).unwrap();

        assert_eq!(read_api_key_from_secrets(&path, "GPT_LOCAL_API_KEY").unwrap(), "test-key");

        let _ = fs::remove_file(&path);
    }

    #[test]
    fn read_api_key_from_user_secrets_file_with_utf8_bom() {
        let path = std::env::temp_dir().join("workflow_client_test_secrets_bom.json");
        fs::write(&path, "\u{feff}{\"GPT_LOCAL_API_KEY\":\"test-key\"}").unwrap();

        assert_eq!(read_api_key_from_secrets(&path, "GPT_LOCAL_API_KEY").unwrap(), "test-key");

        let _ = fs::remove_file(&path);
    }

    #[test]
    fn build_agent_prompt_contains_dispatch_context() {
        let prompt = build_agent_prompt(
            "PD Agent",
            "做场景预演",
            "用户任务：做一个贪吃蛇小游戏",
            "ORCH：请输出 PRD",
        );

        assert!(prompt.contains("你是PD Agent"));
        assert!(prompt.contains("角色说明"));
        assert!(prompt.contains("PD 是产品 Agent"));
        assert!(prompt.contains("ORCH 调度器下发任务"));
        assert!(prompt.contains("做场景预演"));
        assert!(prompt.contains("用户任务：做一个贪吃蛇小游戏"));
        assert!(prompt.contains("完成后通知 ORCH"));
        assert!(prompt.contains("输出控制"));
        assert!(prompt.contains("1200 字"));
        assert!(!prompt.contains("PM 长期规则"));
    }

    #[test]
    fn build_agent_prompt_teaches_administrator_to_summarize_finished_workflows() {
        let prompt = build_agent_prompt(
            "PM Agent",
            "Retrospective",
            "跑通工作流",
            "QA Agent：节点完成",
        );

        assert!(prompt.contains("PM 交付总结规则"));
        assert!(prompt.contains("DEV 改动总结"));
        assert!(prompt.contains("生成了哪些新产物文件"));
        assert!(prompt.contains("修改了哪些原有文件"));
        assert!(prompt.contains("QA 测试总结"));
        assert!(prompt.contains("是否全量覆盖"));
        assert!(prompt.contains("最终交付结论"));
        assert!(prompt.contains("ORCH 才是程序调度器"));
    }

    #[test]
    fn build_agent_prompt_teaches_dev_to_emit_file_artifacts() {
        let prompt = build_agent_prompt(
            "DEV Agent",
            "TaskSplit",
            "做一个 HTML 页面",
            "PD Agent：需要 index.html",
        );

        assert!(prompt.contains("文件产物规则"));
        assert!(prompt.contains("FILE: index.html"));
        assert!(prompt.contains("generated/"));
        assert!(prompt.contains("代码产物同步路径"));
    }

    #[test]
    fn mock_agent_run_reports_document_preview_and_image_metadata_from_attachment_context() {
        let result = run_agent(AgentRunInput {
            provider: ProviderConfigInput {
                id: "mock-local".to_string(),
                name: "Mock Local".to_string(),
                kind: "mock".to_string(),
                api_protocol: default_api_protocol(),
                base_url: "mock://local".to_string(),
                use_proxy_route: false,
                proxy_url: "".to_string(),
                model: "mock-agent".to_string(),
                api_key_ref: "".to_string(),
            },
            owner: "PD Agent".to_string(),
            stage: "ScenarioRehearsal".to_string(),
            task: "根据附件生成需求文档".to_string(),
            upstream: "用户任务：根据附件生成需求文档\n对话附件：\n- brief.md [text] 42 bytes -> attachments/brief.md\n  文本预览：\n  需要一个包含国家字段的 HTML 表单。\n- screen.png [image] 8 bytes -> attachments/screen.png\n  读取方式：请按附件路径读取或引用，不要臆测二进制内容。".to_string(),
        })
        .unwrap();

        assert_eq!(result.endpoint, "mock://local-agent");
        assert!(result.output.contains("节点完成"));
        assert!(result.output.contains("已读取附件上下文"));
        assert!(result.output.contains("文档预览=已识别"));
        assert!(result.output.contains("图片元数据=已识别"));
        assert!(result.total_tokens > result.output_tokens);
    }

    #[test]
    fn responses_payload_includes_image_data_url_when_attachment_path_exists() {
        let dir = std::env::temp_dir().join("orx_payload_image_test");
        fs::create_dir_all(&dir).unwrap();
        let image = dir.join("image.png");
        fs::write(&image, [137, 80, 78, 71]).unwrap();
        let upstream = format!("对话附件：\n- image.png [image] 4 bytes -> {}", image.display());

        let payload = build_responses_payload("gpt-5.5", "请读取图片", &upstream).unwrap();
        let content = payload
            .get("input")
            .and_then(|value| value.as_array())
            .and_then(|items| items.first())
            .and_then(|item| item.get("content"))
            .and_then(|value| value.as_array())
            .unwrap();

        assert_eq!(content[0].get("type").and_then(|value| value.as_str()), Some("input_text"));
        assert_eq!(content[1].get("type").and_then(|value| value.as_str()), Some("input_image"));
        assert!(content[1].get("image_url").and_then(|value| value.as_str()).unwrap().starts_with("data:image/png;base64,"));

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn anthropic_messages_payload_uses_messages_and_max_tokens() {
        let payload = build_provider_payload("anthropic-messages", "mimo-v2.5-pro", "请只回复 OK", "").unwrap();

        assert_eq!(payload.get("model").and_then(|value| value.as_str()), Some("mimo-v2.5-pro"));
        assert_eq!(payload.get("max_tokens").and_then(|value| value.as_u64()), Some(4096));
        assert!(payload.get("max_output_tokens").is_none());
        assert_eq!(
            payload
                .get("messages")
                .and_then(|value| value.as_array())
                .and_then(|items| items.first())
                .and_then(|item| item.get("content"))
                .and_then(|value| value.as_str()),
            Some("请只回复 OK")
        );
    }

    #[test]
    fn custom_direct_payload_uses_generic_messages_body() {
        let payload = build_provider_payload("custom-direct", "third-party-model", "请只回复 OK", "").unwrap();

        assert_eq!(payload.get("model").and_then(|value| value.as_str()), Some("third-party-model"));
        assert_eq!(payload.get("max_tokens").and_then(|value| value.as_u64()), Some(4096));
        assert!(payload.get("max_output_tokens").is_none());
        assert_eq!(
            payload
                .get("messages")
                .and_then(|value| value.as_array())
                .and_then(|items| items.first())
                .and_then(|item| item.get("content"))
                .and_then(|value| value.as_str()),
            Some("请只回复 OK")
        );
    }

    #[test]
    fn direct_custom_text_payload_uses_raw_user_message() {
        let payload = build_direct_provider_payload("custom-direct", "third-party-model", "你好，不要添加任何系统提示").unwrap();

        assert_eq!(payload.get("model").and_then(|value| value.as_str()), Some("third-party-model"));
        assert_eq!(payload.get("max_tokens").and_then(|value| value.as_u64()), Some(4096));
        assert_eq!(
            payload
                .get("messages")
                .and_then(|value| value.as_array())
                .and_then(|items| items.first())
                .and_then(|item| item.get("content"))
                .and_then(|value| value.as_str()),
            Some("你好，不要添加任何系统提示")
        );
    }

    #[test]
    fn direct_image_payload_uses_raw_user_prompt() {
        let payload = build_direct_provider_payload("custom-direct", "grok-imagine-image", "生成一张科技风 ORX 助手图像").unwrap();

        assert_eq!(payload.get("model").and_then(|value| value.as_str()), Some("grok-imagine-image"));
        assert_eq!(payload.get("n").and_then(|value| value.as_u64()), Some(1));
        assert_eq!(
            payload.get("prompt").and_then(|value| value.as_str()),
            Some("生成一张科技风 ORX 助手图像")
        );
    }

    #[test]
    fn agent_call_diagnostic_contains_workflow_node_and_endpoint() {
        let input = AgentRunInput {
            provider: ProviderConfigInput {
                id: "gpt-local".to_string(),
                name: "GPT Local".to_string(),
                kind: "openai-compatible".to_string(),
                api_protocol: default_api_protocol(),
                base_url: "http://127.0.0.1:8317/v1".to_string(),
                use_proxy_route: false,
                proxy_url: "http://127.0.0.1:7890".to_string(),
                model: "gpt-5.5".to_string(),
                api_key_ref: "GPT_LOCAL_API_KEY".to_string(),
            },
            owner: "PD Agent".to_string(),
            stage: "ScenarioRehearsal".to_string(),
            task: "任务".to_string(),
            upstream: "上下文".to_string(),
        };

        let diagnostic = agent_call_diagnostic(&input, "http://127.0.0.1:8317/v1/responses", "connection refused");

        assert!(diagnostic.contains("stage=ScenarioRehearsal"));
        assert!(diagnostic.contains("owner=PD Agent"));
        assert!(diagnostic.contains("provider=GPT Local"));
        assert!(diagnostic.contains("endpoint=http://127.0.0.1:8317/v1/responses"));
        assert!(diagnostic.contains("proxy=disabled"));
        assert!(diagnostic.contains("connection refused"));
    }
}
