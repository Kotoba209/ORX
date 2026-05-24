use base64::Engine;
use serde::{Deserialize, Serialize};
use std::error::Error;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

const PROVIDER_TEST_TIMEOUT_SECS: u64 = 45;
const AGENT_RUN_TIMEOUT_SECS: u64 = 240;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ProviderConfig {
    pub id: String,
    pub name: String,
    pub kind: String,
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

pub fn load_config(path: impl AsRef<Path>) -> Result<ProviderConfigSnapshot, String> {
    let path = path.as_ref();
    if !path.exists() {
        return Ok(default_config());
    }
    let content = fs::read_to_string(path).map_err(|error| format!("读取 Provider 配置失败: {error}"))?;
    serde_json::from_str(&content).map_err(|error| format!("解析 Provider 配置失败: {error}"))
}

pub fn save_provider(path: impl AsRef<Path>, input: ProviderConfigInput) -> Result<ProviderConfigSnapshot, String> {
    validate_provider(&input)?;
    let path = path.as_ref();
    let mut snapshot = load_config(path)?;
    let provider = ProviderConfig {
        id: input.id.trim().to_string(),
        name: input.name.trim().to_string(),
        kind: input.kind.trim().to_string(),
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

    let endpoint = provider_responses_endpoint(input.base_url.trim());
    let mut client_builder = reqwest::blocking::Client::builder().timeout(Duration::from_secs(PROVIDER_TEST_TIMEOUT_SECS));
    if input.use_proxy_route {
        let proxy = reqwest::Proxy::all(input.proxy_url.trim()).map_err(|error| format!("代理地址无效: {error}"))?;
        client_builder = client_builder.proxy(proxy);
    }
    let client = client_builder.build().map_err(|error| format!("创建 HTTP 客户端失败: {error}"))?;
    let payload = serde_json::json!({
        "model": input.model.trim(),
        "input": "你是 PM Agent。请只回复 OK，表示 Provider 连接正常。",
        "max_output_tokens": 32
    });
    let response = client
        .post(&endpoint)
        .bearer_auth(api_key.trim())
        .json(&payload)
        .send()
        .map_err(|error| format!("Provider 连接失败: {}", format_reqwest_error(&error)))?;
    let status = response.status().as_u16();
    let text = response.text().unwrap_or_default();
    if (200..300).contains(&status) {
        Ok(ProviderConnectionResult {
            ok: true,
            status,
            endpoint,
            message: extract_response_text(&text).unwrap_or_else(|| "连接成功，但未解析到文本输出。".to_string()),
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

    let endpoint = provider_responses_endpoint(input.provider.base_url.trim());
    let prompt = build_agent_prompt(&input.owner, &input.stage, &input.task, &input.upstream);
    let mut client_builder = reqwest::blocking::Client::builder().timeout(Duration::from_secs(AGENT_RUN_TIMEOUT_SECS));
    if input.provider.use_proxy_route {
        let proxy = reqwest::Proxy::all(input.provider.proxy_url.trim()).map_err(|error| format!("代理地址无效: {error}"))?;
        client_builder = client_builder.proxy(proxy);
    }
    let client = client_builder.build().map_err(|error| format!("创建 HTTP 客户端失败: {error}"))?;
    let payload = build_responses_payload(input.provider.model.trim(), &prompt, &input.upstream)?;
    let response = client
        .post(&endpoint)
        .bearer_auth(api_key.trim())
        .json(&payload)
        .send()
        .map_err(|error| agent_call_diagnostic(&input, &endpoint, &format_reqwest_error(&error)))?;
    let status = response.status().as_u16();
    let text = response.text().unwrap_or_default();
    if !(200..300).contains(&status) {
        return Err(format!("{} HTTP {status} {}", agent_call_diagnostic(&input, &endpoint, "non-success status"), trim_message(&text)));
    }
    let usage = extract_token_usage(&text);
    Ok(AgentRunResult {
        owner: input.owner,
        stage: input.stage,
        endpoint,
        output: trim_agent_output(&extract_response_text(&text).unwrap_or_else(|| "Agent 已完成，但未解析到文本输出。".to_string())),
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
    let provider = ProviderConfig {
        id: "gpt-local".to_string(),
        name: "GPT Local".to_string(),
        kind: "openai-compatible".to_string(),
        base_url: "http://127.0.0.1:8317/v1".to_string(),
        use_proxy_route: true,
        proxy_url: "http://127.0.0.1:7897".to_string(),
        model: "gpt-5.5".to_string(),
        api_key_ref: "GPT_LOCAL_API_KEY".to_string(),
    };
    let roles = ["administrator", "product", "developer", "architect", "tester"];
    let agents = roles
        .iter()
        .map(|role| AgentBinding {
            role: (*role).to_string(),
            provider_id: provider.id.clone(),
            model: provider.model.clone(),
            temperature: if *role == "product" { 0.3 } else { 0.2 },
        })
        .collect();

    ProviderConfigSnapshot { providers: vec![provider], agents }
}

fn validate_provider(input: &ProviderConfigInput) -> Result<(), String> {
    if input.id.trim().is_empty() {
        return Err("Provider ID 不能为空".to_string());
    }
    if input.name.trim().is_empty() {
        return Err("Provider 名称不能为空".to_string());
    }
    if !["openai-compatible", "anthropic", "gemini", "deepseek", "mock"].contains(&input.kind.trim()) {
        return Err("Provider 类型不支持".to_string());
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

fn build_agent_prompt(owner: &str, stage: &str, task: &str, upstream: &str) -> String {
    let role_context = role_context_for_owner(owner);
    let file_artifact_rule = if owner.contains("DEV") || owner.contains("开发") {
        "\n\n文件产物规则：如果当前任务或上游附件内容要求生成代码文件、HTML、CSS、JS、脚本或配置，你必须直接输出可落盘的完整文件内容，不能只拆解任务或只给实施建议。请在产物中输出 Markdown 代码块，并在代码块第一行写明文件名，例如 `<!-- FILE: form.html -->`、`<!-- FILE: index.html -->`、`// FILE: src/app.ts` 或 `# FILE: scripts/test.py`。ORCH 会把这些代码块保存到任务档案的 generated/ 目录；没有实际非空代码块会被视为 DEV 节点失败并打回。"
    } else {
        ""
    };
    let administrator_rule = if owner.contains("PM") || owner.contains("管理员") {
        "\n\nPM 长期规则：每个任务流程处理完后，你必须输出总结归纳，覆盖：本轮结论、每个节点是否独立完成、节点交接是否成功、失败/打回/阻塞点、关键证据、流程治理问题、下一轮改进项。"
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
    value
        .get("output")?
        .as_array()?
        .iter()
        .flat_map(|item| item.get("content").and_then(|content| content.as_array()).into_iter().flatten())
        .find_map(|content| content.get("text").and_then(|text| text.as_str()))
        .map(|text| text.trim().to_string())
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
    TokenUsage {
        input_tokens: usage.get("input_tokens").and_then(|value| value.as_u64()).unwrap_or(0),
        output_tokens: usage.get("output_tokens").and_then(|value| value.as_u64()).unwrap_or(0),
        total_tokens: usage.get("total_tokens").and_then(|value| value.as_u64()).unwrap_or(0),
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
    fn default_config_binds_all_workflow_roles() {
        let snapshot = load_config(std::env::temp_dir().join("missing_provider_config.json")).unwrap();
        let roles = snapshot.agents.iter().map(|agent| agent.role.as_str()).collect::<Vec<_>>();

        assert_eq!(roles, vec!["administrator", "product", "developer", "architect", "tester"]);
        assert_eq!(snapshot.providers[0].kind, "openai-compatible");
        assert!(snapshot.providers[0].use_proxy_route);
        assert_eq!(snapshot.providers[0].proxy_url, "http://127.0.0.1:7897");
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
    fn extract_response_text_reads_responses_output_text() {
        let content = r#"{"output":[{"type":"message","content":[{"type":"output_text","text":"OK"}]}]}"#;
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
    fn extract_token_usage_reads_responses_usage() {
        let content = r#"{"usage":{"input_tokens":123,"output_tokens":45,"total_tokens":168}}"#;
        let usage = extract_token_usage(content);

        assert_eq!(usage.input_tokens, 123);
        assert_eq!(usage.output_tokens, 45);
        assert_eq!(usage.total_tokens, 168);
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

        assert!(prompt.contains("PM 长期规则"));
        assert!(prompt.contains("每个任务流程处理完后"));
        assert!(prompt.contains("每个节点是否独立完成"));
        assert!(prompt.contains("节点交接是否成功"));
        assert!(prompt.contains("下一轮改进项"));
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
    }

    #[test]
    fn mock_agent_run_reports_document_preview_and_image_metadata_from_attachment_context() {
        let result = run_agent(AgentRunInput {
            provider: ProviderConfigInput {
                id: "mock-local".to_string(),
                name: "Mock Local".to_string(),
                kind: "mock".to_string(),
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
    fn agent_call_diagnostic_contains_workflow_node_and_endpoint() {
        let input = AgentRunInput {
            provider: ProviderConfigInput {
                id: "gpt-local".to_string(),
                name: "GPT Local".to_string(),
                kind: "openai-compatible".to_string(),
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
