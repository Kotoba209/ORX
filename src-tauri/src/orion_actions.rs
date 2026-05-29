use serde::{Deserialize, Serialize};
use std::error::Error;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Duration;

#[derive(Debug, Clone, Deserialize)]
pub struct ProjectFileReadInput {
    pub project_root: String,
    pub relative_path: String,
    pub max_bytes: u64,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct ProjectFileReadResult {
    pub path: String,
    pub bytes: u64,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct LocalConfigInspectionResult {
    pub settings_path: String,
    pub artifact_output_dir: String,
    pub tasks_dir: String,
    pub current_project: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ProjectSearchInput {
    pub project_root: String,
    pub query: String,
    pub max_results: usize,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct ProjectSearchMatch {
    pub path: String,
    pub line_number: usize,
    pub line: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct ProjectSearchResult {
    pub query: String,
    pub project_root: String,
    pub matches: Vec<ProjectSearchMatch>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct WebSearchInput {
    pub query: String,
    pub max_results: usize,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct WebSearchHit {
    pub title: String,
    pub url: String,
    pub snippet: String,
    pub content_preview: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct WebSearchResult {
    pub query: String,
    pub results: Vec<WebSearchHit>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct GeneratedArtifactWriteInput {
    pub task_dir: String,
    pub relative_path: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct GeneratedArtifactWriteResult {
    pub path: String,
    pub bytes: u64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct WhitelistedCommandInput {
    pub program: String,
    pub args: Vec<String>,
    pub cwd: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct WhitelistedCommandResult {
    pub program: String,
    pub args: Vec<String>,
    pub cwd: String,
    pub status: i32,
    pub stdout: String,
    pub stderr: String,
}

pub fn inspect_local_config(settings_path: PathBuf, artifact_output_dir: String, tasks_dir: PathBuf, current_project: String) -> LocalConfigInspectionResult {
    LocalConfigInspectionResult {
        settings_path: settings_path.display().to_string(),
        artifact_output_dir,
        tasks_dir: tasks_dir.display().to_string(),
        current_project,
    }
}

pub fn read_project_file(input: ProjectFileReadInput) -> Result<ProjectFileReadResult, String> {
    let root = canonical_dir(&input.project_root)?;
    let relative = safe_relative_path(&input.relative_path)?;
    let target = root.join(relative);
    let canonical = target
        .canonicalize()
        .map_err(|error| format!("读取项目文件失败: {error}"))?;
    if !canonical.starts_with(&root) {
        return Err("拒绝读取项目目录外的文件".to_string());
    }
    if !canonical.is_file() {
        return Err("项目路径不是文件".to_string());
    }
    let bytes = fs::metadata(&canonical).map_err(|error| format!("读取项目文件元数据失败: {error}"))?.len();
    let max_bytes = input.max_bytes.max(1);
    if bytes > max_bytes {
        return Err(format!("项目文件超过读取上限: {bytes} > {max_bytes}"));
    }
    let content = fs::read_to_string(&canonical).map_err(|error| format!("读取项目文件内容失败: {error}"))?;
    Ok(ProjectFileReadResult { path: canonical.display().to_string(), bytes, content })
}

pub fn search_project(input: ProjectSearchInput) -> Result<ProjectSearchResult, String> {
    let query = input.query.trim();
    if query.is_empty() {
        return Err("搜索词不能为空".to_string());
    }
    let root = canonical_dir(&input.project_root)?;
    let max_results = input.max_results.clamp(1, 100);
    let mut matches = Vec::new();
    search_dir(&root, &root, query, max_results, &mut matches)?;
    Ok(ProjectSearchResult {
        query: query.to_string(),
        project_root: root.display().to_string(),
        matches,
    })
}

pub fn web_search(input: WebSearchInput) -> Result<WebSearchResult, String> {
    let query = input.query.trim();
    if query.is_empty() {
        return Err("联网查询词不能为空".to_string());
    }
    let max_results = input.max_results.clamp(1, 10);
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(12))
        .user_agent("ORX/0.3 local assistant")
        .build()
        .map_err(|error| format!("创建联网查询客户端失败: {error}"))?;
    let mut errors = Vec::new();
    let mut results = Vec::new();
    match fetch_search_html(&client, "DuckDuckGo", "https://duckduckgo.com/html/", query) {
        Ok(html) => results = parse_duckduckgo_results(&html, max_results),
        Err(error) => errors.push(error),
    }
    if results.is_empty() {
        match fetch_search_html(&client, "Bing", "https://www.bing.com/search", query) {
            Ok(html) => results = parse_bing_results(&html, max_results),
            Err(error) => errors.push(error),
        }
    }
    if results.is_empty() && !errors.is_empty() {
        return Err(format!("联网查询失败，已尝试 DuckDuckGo 和 Bing：{}", errors.join("；")));
    }
    for result in results.iter_mut().take(3) {
        result.content_preview = fetch_page_preview(&client, &result.url).unwrap_or_default();
    }
    Ok(WebSearchResult { query: query.to_string(), results })
}

fn fetch_search_html(client: &reqwest::blocking::Client, engine: &str, base_url: &str, query: &str) -> Result<String, String> {
    let mut url = reqwest::Url::parse(base_url).map_err(|error| format!("构造 {engine} 搜索地址失败: {error}"))?;
    url.query_pairs_mut().append_pair("q", query);
    client
        .get(url.clone())
        .send()
        .map_err(|error| format!("{engine} 请求失败: {}", format_reqwest_error(&error)))?
        .error_for_status()
        .map_err(|error| format!("{engine} 返回错误状态: {}", format_reqwest_error(&error)))?
        .text()
        .map_err(|error| format!("读取 {engine} 搜索结果失败: {}", format_reqwest_error(&error)))
}

pub fn write_generated_artifact(input: GeneratedArtifactWriteInput) -> Result<GeneratedArtifactWriteResult, String> {
    if input.content.is_empty() {
        return Err("generated 产物内容不能为空".to_string());
    }
    let task_dir = canonical_or_create_dir(&input.task_dir)?;
    let generated_dir = task_dir.join("generated");
    fs::create_dir_all(&generated_dir).map_err(|error| format!("创建 generated 目录失败: {error}"))?;
    let relative = safe_relative_path(&input.relative_path)?;
    let target = generated_dir.join(relative);
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|error| format!("创建 generated 子目录失败: {error}"))?;
    }
    fs::write(&target, input.content).map_err(|error| format!("写入 generated 产物失败: {error}"))?;
    let canonical = target.canonicalize().map_err(|error| format!("校验 generated 产物失败: {error}"))?;
    let generated_root = generated_dir.canonicalize().map_err(|error| format!("校验 generated 目录失败: {error}"))?;
    if !canonical.starts_with(&generated_root) {
        return Err("拒绝写入 generated 目录外的文件".to_string());
    }
    let bytes = fs::metadata(&canonical).map_err(|error| format!("读取 generated 产物元数据失败: {error}"))?.len();
    if bytes == 0 {
        return Err("generated 产物为空".to_string());
    }
    Ok(GeneratedArtifactWriteResult { path: canonical.display().to_string(), bytes })
}

pub fn validate_whitelisted_command(program: &str, args: &[String]) -> Result<(), String> {
    let normalized_program = program.trim().to_ascii_lowercase();
    let normalized_args = args.iter().map(|arg| arg.trim().to_ascii_lowercase()).collect::<Vec<_>>();
    let trusted_install_args = trusted_winget_package_ids().iter().any(|package_id| {
        normalized_args == [
            "install",
            "--id",
            package_id,
            "--exact",
            "--accept-package-agreements",
            "--accept-source-agreements",
        ]
    });
    let trusted_status_args = trusted_winget_package_ids().iter().any(|package_id| {
        normalized_args == ["list", "--id", package_id, "--exact"]
    });
    let allowed = (normalized_program == "node" && normalized_args == ["--version"])
        || (normalized_program == "npm" && normalized_args == ["--version"])
        || (normalized_program == "rustc" && normalized_args == ["-v"])
        || (normalized_program == "cargo" && normalized_args == ["-v"])
        || (normalized_program == "git" && normalized_args == ["status", "--short", "--branch"])
        || (normalized_program == "winget" && (trusted_install_args || trusted_status_args))
        || (normalized_program == "npm" && normalized_args == ["run", "workflow:selftest"])
        || (normalized_program == "npm" && normalized_args == ["run", "build"])
        || (normalized_program == "npm" && normalized_args == ["run", "tauri", "--", "build"])
        || (normalized_program == "cargo" && normalized_args == ["test"]);
    if allowed {
        Ok(())
    } else {
        Err(format!("命令不在 ORION 白名单内: {} {}", program, args.join(" ")))
    }
}

fn trusted_winget_package_ids() -> &'static [&'static str] {
    &["bytedance.feishu", "bytedance.lark"]
}

pub fn run_whitelisted_command(input: WhitelistedCommandInput) -> Result<WhitelistedCommandResult, String> {
    validate_whitelisted_command(&input.program, &input.args)?;
    let cwd = match input.cwd.as_ref().map(|value| value.trim()).filter(|value| !value.is_empty()) {
        Some(value) => canonical_dir(value)?,
        None => std::env::current_dir().map_err(|error| format!("读取当前目录失败: {error}"))?,
    };
    let output = Command::new(&input.program)
        .args(&input.args)
        .current_dir(&cwd)
        .output()
        .map_err(|error| format!("执行白名单命令失败: {error}"))?;
    Ok(WhitelistedCommandResult {
        program: input.program,
        args: input.args,
        cwd: cwd.display().to_string(),
        status: output.status.code().unwrap_or(-1),
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
    })
}

pub fn orion_action_risk(kind: &str) -> &'static str {
    match kind {
        "project.inspect"
        | "local.inspectConfig"
        | "workflow.recommend"
        | "workflow.draft"
        | "workflow.create"
        | "workflow.update"
        | "workflow.clone"
        | "workflow.run"
        | "skill.list"
        | "skill.attach"
        | "web.searchPublic"
        | "memory.search"
        | "file.readProjectFile"
        | "file.searchProject"
        | "file.writeGeneratedArtifactAuto" => "direct",
        "skill.detach"
        | "memory.append"
        | "memory.update"
        | "web.searchSensitive"
        | "file.writeGeneratedArtifact"
        | "command.runWhitelisted"
        | "release.build" => "confirm",
        "workflow.delete" | "workflow.setDefault" | "git.commit" | "git.tag" | "git.push" => "strong-confirm",
        _ => "strong-confirm",
    }
}

fn canonical_dir(path: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(path.trim());
    let canonical = path.canonicalize().map_err(|error| format!("目录不可访问: {error}"))?;
    if !canonical.is_dir() {
        return Err("路径必须是目录".to_string());
    }
    Ok(canonical)
}

fn canonical_or_create_dir(path: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(path.trim());
    fs::create_dir_all(&path).map_err(|error| format!("创建目录失败: {error}"))?;
    canonical_dir(path.to_string_lossy().as_ref())
}

fn safe_relative_path(value: &str) -> Result<PathBuf, String> {
    let normalized = value.trim().replace('\\', "/");
    if normalized.is_empty() || normalized.starts_with('/') || normalized.contains("..") {
        return Err(format!("相对路径不安全: {value}"));
    }
    let path = Path::new(&normalized);
    if path.components().any(|component| !matches!(component, std::path::Component::Normal(_))) {
        return Err(format!("相对路径不安全: {value}"));
    }
    Ok(path.to_path_buf())
}

fn search_dir(root: &Path, dir: &Path, query: &str, max_results: usize, matches: &mut Vec<ProjectSearchMatch>) -> Result<(), String> {
    if matches.len() >= max_results {
        return Ok(());
    }
    let entries = fs::read_dir(dir).map_err(|error| format!("读取项目目录失败: {error}"))?;
    for entry in entries {
        if matches.len() >= max_results {
            break;
        }
        let entry = entry.map_err(|error| format!("读取项目目录项失败: {error}"))?;
        let path = entry.path();
        let file_name = entry.file_name().to_string_lossy().to_string();
        if should_skip_search_path(&file_name) {
            continue;
        }
        if path.is_dir() {
            search_dir(root, &path, query, max_results, matches)?;
        } else if path.is_file() {
            search_file(root, &path, query, max_results, matches)?;
        }
    }
    Ok(())
}

fn search_file(root: &Path, path: &Path, query: &str, max_results: usize, matches: &mut Vec<ProjectSearchMatch>) -> Result<(), String> {
    if matches.len() >= max_results || is_probably_binary(path) {
        return Ok(());
    }
    let file = fs::File::open(path).map_err(|error| format!("读取项目文件失败: {error}"))?;
    let reader = BufReader::new(file);
    let query_lower = query.to_lowercase();
    for (index, line) in reader.lines().enumerate() {
        if matches.len() >= max_results {
            break;
        }
        let line = match line {
            Ok(value) => value,
            Err(_) => continue,
        };
        if line.to_lowercase().contains(&query_lower) {
            let relative = path.strip_prefix(root).unwrap_or(path).display().to_string();
            matches.push(ProjectSearchMatch {
                path: relative,
                line_number: index + 1,
                line: line.chars().take(240).collect(),
            });
        }
    }
    Ok(())
}

fn should_skip_search_path(name: &str) -> bool {
    matches!(
        name.to_ascii_lowercase().as_str(),
        "node_modules" | "target" | "target-msvc" | ".git" | "dist" | "build" | ".vite"
    )
}

fn is_probably_binary(path: &Path) -> bool {
    matches!(
        path.extension().and_then(|value| value.to_str()).unwrap_or("").to_ascii_lowercase().as_str(),
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "ico" | "exe" | "dll" | "pdb" | "rlib" | "zip" | "7z" | "gz" | "pdf"
    )
}

fn parse_duckduckgo_results(html: &str, max_results: usize) -> Vec<WebSearchHit> {
    let mut results = Vec::new();
    let mut remaining = html;
    while results.len() < max_results {
        let Some(anchor_index) = remaining.find("result__a") else { break };
        remaining = &remaining[anchor_index..];
        let Some(href_index) = remaining.find("href=\"") else { break };
        let href_start = href_index + "href=\"".len();
        let Some(href_end) = remaining[href_start..].find('"') else { break };
        let raw_url = &remaining[href_start..href_start + href_end];
        let Some(text_start_offset) = remaining[href_start + href_end..].find('>') else { break };
        let text_start = href_start + href_end + text_start_offset + 1;
        let Some(text_end_offset) = remaining[text_start..].find("</a>") else { break };
        let title = clean_html_text(&remaining[text_start..text_start + text_end_offset]);
        let url = clean_duckduckgo_url(raw_url);
        if !title.is_empty() && !url.is_empty() {
            let snippet = extract_following_snippet(&remaining[text_start + text_end_offset..]);
            results.push(WebSearchHit { title, url, snippet, content_preview: String::new() });
        }
        remaining = &remaining[text_start + text_end_offset..];
    }
    results
}

fn parse_bing_results(html: &str, max_results: usize) -> Vec<WebSearchHit> {
    let mut results = Vec::new();
    let mut remaining = html;
    while results.len() < max_results {
        let Some(item_index) = remaining.find("<li class=\"b_algo\"") else { break };
        remaining = &remaining[item_index..];
        let Some(h2_index) = remaining.find("<h2") else { break };
        let h2_html = &remaining[h2_index..];
        let Some(href_index) = h2_html.find("href=\"") else {
            remaining = &remaining[h2_index + 3..];
            continue;
        };
        let href_start = href_index + "href=\"".len();
        let Some(href_end) = h2_html[href_start..].find('"') else { break };
        let url = html_unescape(&h2_html[href_start..href_start + href_end]);
        let Some(title_start_offset) = h2_html[href_start + href_end..].find('>') else { break };
        let title_start = href_start + href_end + title_start_offset + 1;
        let Some(title_end_offset) = h2_html[title_start..].find("</a>") else { break };
        let title = clean_html_text(&h2_html[title_start..title_start + title_end_offset]);
        let snippet = extract_bing_snippet(remaining);
        if !title.is_empty() && url.starts_with("http") {
            results.push(WebSearchHit { title, url, snippet, content_preview: String::new() });
        }
        remaining = &h2_html[title_start + title_end_offset..];
    }
    results
}

fn extract_bing_snippet(html: &str) -> String {
    let Some(caption_index) = html.find("class=\"b_caption\"") else { return String::new() };
    let caption_html = &html[caption_index..];
    let Some(p_index) = caption_html.find("<p") else { return String::new() };
    let p_html = &caption_html[p_index..];
    let Some(start_offset) = p_html.find('>') else { return String::new() };
    let start = start_offset + 1;
    let Some(end_offset) = p_html[start..].find("</p>") else { return String::new() };
    clean_html_text(&p_html[start..start + end_offset])
}

fn extract_following_snippet(html: &str) -> String {
    let Some(snippet_index) = html.find("result__snippet") else { return String::new() };
    let snippet_html = &html[snippet_index..];
    let Some(start_offset) = snippet_html.find('>') else { return String::new() };
    let start = start_offset + 1;
    let Some(end_offset) = snippet_html[start..].find("</a>").or_else(|| snippet_html[start..].find("</div>")) else { return String::new() };
    clean_html_text(&snippet_html[start..start + end_offset])
}

fn clean_duckduckgo_url(raw_url: &str) -> String {
    let decoded = html_unescape(raw_url);
    let parseable = if decoded.starts_with("//") {
        format!("https:{decoded}")
    } else {
        decoded.clone()
    };
    if let Ok(url) = reqwest::Url::parse(&parseable) {
        if let Some(value) = url.query_pairs().find_map(|(key, value)| (key == "uddg").then_some(value.into_owned())) {
            return value;
        }
    }
    decoded
}

fn clean_html_text(value: &str) -> String {
    let mut text = String::new();
    let mut in_tag = false;
    for character in value.chars() {
        match character {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => text.push(character),
            _ => {}
        }
    }
    html_unescape(text.trim()).split_whitespace().collect::<Vec<_>>().join(" ")
}

fn html_unescape(value: &str) -> String {
    value
        .replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&#x27;", "'")
        .replace("&#39;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
}

fn fetch_page_preview(client: &reqwest::blocking::Client, url: &str) -> Result<String, String> {
    let parsed = reqwest::Url::parse(url).map_err(|error| format!("网页地址无效: {error}"))?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err("只读取 http/https 网页".to_string());
    }
    let response = client
        .get(parsed)
        .send()
        .map_err(|error| format!("读取网页失败: {error}"))?
        .error_for_status()
        .map_err(|error| format!("网页返回错误状态: {error}"))?;
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("")
        .to_ascii_lowercase();
    if !content_type.is_empty() && !content_type.contains("text/html") && !content_type.contains("text/plain") {
        return Err("跳过非文本网页".to_string());
    }
    let body = response.text().map_err(|error| format!("读取网页正文失败: {error}"))?;
    Ok(extract_page_text_preview(&body, 700))
}

fn format_reqwest_error(error: &reqwest::Error) -> String {
    let mut parts = vec![error.to_string()];
    let mut source = error.source();
    while let Some(next) = source {
        parts.push(next.to_string());
        source = next.source();
    }
    parts.join(" / caused by: ")
}

fn extract_page_text_preview(html: &str, limit: usize) -> String {
    let mut text = String::new();
    let mut in_tag = false;
    let mut skip_until: Option<&str> = None;
    let mut cursor = html;
    while !cursor.is_empty() && text.chars().count() < limit {
        if let Some(end_tag) = skip_until {
            if let Some(end) = cursor.to_ascii_lowercase().find(end_tag) {
                cursor = &cursor[end + end_tag.len()..];
                skip_until = None;
            } else {
                break;
            }
            continue;
        }
        let lower = cursor.to_ascii_lowercase();
        if lower.starts_with("<script") {
            skip_until = Some("</script>");
            continue;
        }
        if lower.starts_with("<style") {
            skip_until = Some("</style>");
            continue;
        }
        let Some(character) = cursor.chars().next() else { break };
        cursor = &cursor[character.len_utf8()..];
        match character {
            '<' => {
                in_tag = true;
                text.push(' ');
            }
            '>' => in_tag = false,
            _ if !in_tag => text.push(character),
            _ => {}
        }
    }
    clean_html_text(&text).chars().take(limit).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn reads_project_file_only_inside_project_root() {
        let root = std::env::temp_dir().join("orx_orion_read_project");
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("src")).unwrap();
        fs::write(root.join("src").join("main.ts"), "export const ok = true;").unwrap();

        let result = read_project_file(ProjectFileReadInput {
            project_root: root.display().to_string(),
            relative_path: "src/main.ts".to_string(),
            max_bytes: 1024,
        })
        .unwrap();

        assert_eq!(result.content, "export const ok = true;");
        assert!(read_project_file(ProjectFileReadInput {
            project_root: root.display().to_string(),
            relative_path: "../secret.txt".to_string(),
            max_bytes: 1024,
        })
        .is_err());

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn writes_generated_artifact_inside_generated_directory() {
        let task_dir = std::env::temp_dir().join("orx_orion_write_generated");
        let _ = fs::remove_dir_all(&task_dir);
        fs::create_dir_all(&task_dir).unwrap();

        let result = write_generated_artifact(GeneratedArtifactWriteInput {
            task_dir: task_dir.display().to_string(),
            relative_path: "patch/fix.md".to_string(),
            content: "修复说明".to_string(),
        })
        .unwrap();

        assert!(result.path.ends_with("generated\\patch\\fix.md") || result.path.ends_with("generated/patch/fix.md"));
        assert_eq!(fs::read_to_string(task_dir.join("generated").join("patch").join("fix.md")).unwrap(), "修复说明");
        assert!(write_generated_artifact(GeneratedArtifactWriteInput {
            task_dir: task_dir.display().to_string(),
            relative_path: "../src/main.ts".to_string(),
            content: "bad".to_string(),
        })
        .is_err());

        let _ = fs::remove_dir_all(task_dir);
    }

    #[test]
    fn validates_whitelisted_commands() {
        assert!(validate_whitelisted_command("npm", &["run".to_string(), "build".to_string()]).is_ok());
        assert!(validate_whitelisted_command("npm", &["--version".to_string()]).is_ok());
        assert!(validate_whitelisted_command("rustc", &["-V".to_string()]).is_ok());
        assert!(validate_whitelisted_command("cargo", &["-V".to_string()]).is_ok());
        assert!(validate_whitelisted_command("rustc", &["--version".to_string()]).is_err());
        assert!(validate_whitelisted_command("winget", &[
            "install".to_string(),
            "--id".to_string(),
            "ByteDance.Feishu".to_string(),
            "--exact".to_string(),
            "--accept-package-agreements".to_string(),
            "--accept-source-agreements".to_string(),
        ]).is_ok());
        assert!(validate_whitelisted_command("winget", &[
            "list".to_string(),
            "--id".to_string(),
            "ByteDance.Feishu".to_string(),
            "--exact".to_string(),
        ]).is_ok());
        assert!(validate_whitelisted_command("winget", &[
            "install".to_string(),
            "--id".to_string(),
            "Unknown.Client".to_string(),
            "--exact".to_string(),
        ]).is_err());
        assert!(validate_whitelisted_command("cargo", &["test".to_string()]).is_ok());
        assert!(validate_whitelisted_command("git", &["push".to_string()]).is_err());
    }

    #[test]
    fn searches_project_files_inside_project_root() {
        let root = std::env::temp_dir().join("orx_orion_search_project");
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("src")).unwrap();
        fs::create_dir_all(root.join("node_modules")).unwrap();
        fs::write(root.join("src").join("main.ts"), "const token = 'visible';\nconst other = true;").unwrap();
        fs::write(root.join("node_modules").join("hidden.ts"), "const token = 'hidden';").unwrap();

        let result = search_project(ProjectSearchInput {
            project_root: root.display().to_string(),
            query: "token".to_string(),
            max_results: 10,
        })
        .unwrap();

        assert_eq!(result.matches.len(), 1);
        assert!(result.matches[0].path.ends_with("src\\main.ts") || result.matches[0].path.ends_with("src/main.ts"));
        assert_eq!(result.matches[0].line_number, 1);

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn parses_duckduckgo_html_results() {
        let html = r#"
            <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fdoc&amp;rut=abc">Example <b>Docs</b></a>
            <a class="result__snippet">Useful &amp; compact summary.</a>
        "#;

        let results = parse_duckduckgo_results(html, 3);

        assert_eq!(results.len(), 1);
        assert_eq!(results[0].title, "Example Docs");
        assert_eq!(results[0].url, "https://example.com/doc");
        assert_eq!(results[0].snippet, "Useful & compact summary.");
    }

    #[test]
    fn parses_bing_html_results() {
        let html = r#"
            <li class="b_algo"><h2><a href="https://example.com/tauri">Tauri Opener Docs</a></h2>
            <div class="b_caption"><p>Official plugin opener documentation.</p></div></li>
        "#;

        let results = parse_bing_results(html, 3);

        assert_eq!(results.len(), 1);
        assert_eq!(results[0].title, "Tauri Opener Docs");
        assert_eq!(results[0].url, "https://example.com/tauri");
        assert_eq!(results[0].snippet, "Official plugin opener documentation.");
    }

    #[test]
    fn runs_whitelisted_command_and_rejects_unknown_command() {
        let result = run_whitelisted_command(WhitelistedCommandInput {
            program: "node".to_string(),
            args: vec!["--version".to_string()],
            cwd: None,
        })
        .unwrap();

        assert_eq!(result.program, "node");
        assert_eq!(result.args, vec!["--version".to_string()]);
        assert_eq!(result.status, 0);
        assert!(result.stdout.trim().starts_with('v'));

        assert!(run_whitelisted_command(WhitelistedCommandInput {
            program: "git".to_string(),
            args: vec!["push".to_string()],
            cwd: None,
        })
        .is_err());
    }

    #[test]
    fn classifies_orion_action_risk_for_release_and_git() {
        assert_eq!(orion_action_risk("file.readProjectFile"), "direct");
        assert_eq!(orion_action_risk("file.searchProject"), "direct");
        assert_eq!(orion_action_risk("local.inspectConfig"), "direct");
        assert_eq!(orion_action_risk("web.searchPublic"), "direct");
        assert_eq!(orion_action_risk("file.writeGeneratedArtifactAuto"), "direct");
        assert_eq!(orion_action_risk("web.searchSensitive"), "confirm");
        assert_eq!(orion_action_risk("workflow.run"), "direct");
        assert_eq!(orion_action_risk("release.build"), "confirm");
        assert_eq!(orion_action_risk("workflow.delete"), "strong-confirm");
        assert_eq!(orion_action_risk("git.push"), "strong-confirm");
    }
}
