use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Deserialize)]
pub struct TaskArchiveStartInput {
    pub task: String,
    pub project_path: String,
    pub workflow_template: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct TaskArtifactInput {
    pub task_id: String,
    pub owner: String,
    pub stage: String,
    pub status: String,
    pub elapsed_ms: u64,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub total_tokens: u64,
    pub output: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct TaskArchiveFinishInput {
    pub task_id: String,
    pub status: String,
    pub total_elapsed_ms: u64,
    pub agent_elapsed_ms: u64,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub total_tokens: u64,
    pub summary: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ApprovalRecordInput {
    pub task_id: String,
    pub stage: String,
    pub owner: String,
    pub decision: String,
    pub note: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct TaskAttachmentInput {
    pub task_id: String,
    pub source_paths: Vec<String>,
    #[serde(default)]
    pub inline_files: Vec<InlineAttachmentInput>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct InlineAttachmentInput {
    pub original_name: String,
    pub bytes: Vec<u8>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct TaskArchiveRef {
    pub id: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TaskAttachmentRecord {
    pub original_name: String,
    pub path: String,
    pub bytes: u64,
    pub kind: String,
    pub text_preview: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct TaskAttachmentSaveResult {
    pub task_id: String,
    pub attachments: Vec<TaskAttachmentRecord>,
    pub context_block: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
struct WorkflowArchive {
    id: String,
    task: String,
    project_path: String,
    workflow_template: String,
    status: String,
    total_elapsed_ms: u64,
    agent_elapsed_ms: u64,
    input_tokens: u64,
    output_tokens: u64,
    total_tokens: u64,
    #[serde(default)]
    artifacts: Vec<ArtifactRecord>,
    #[serde(default)]
    generated_files: Vec<String>,
    #[serde(default)]
    approvals: Vec<ApprovalRecord>,
    #[serde(default)]
    attachments: Vec<TaskAttachmentRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
struct ArtifactRecord {
    owner: String,
    stage: String,
    status: String,
    elapsed_ms: u64,
    input_tokens: u64,
    output_tokens: u64,
    total_tokens: u64,
    path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
struct ApprovalRecord {
    stage: String,
    owner: String,
    decision: String,
    note: String,
}

pub fn default_tasks_dir() -> Result<PathBuf, String> {
    let base = std::env::var_os("APPDATA")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("USERPROFILE").map(PathBuf::from))
        .ok_or_else(|| "无法定位用户配置目录".to_string())?;
    Ok(base.join("WorkflowManagerClient").join("tasks"))
}

pub fn create_task_archive(base_dir: impl AsRef<Path>, input: TaskArchiveStartInput) -> Result<TaskArchiveRef, String> {
    let id = new_task_id();
    let task_dir = base_dir.as_ref().join(&id);
    fs::create_dir_all(task_dir.join("artifacts")).map_err(|error| format!("创建任务档案目录失败: {error}"))?;

    fs::write(
        task_dir.join("task.md"),
        format!(
            "# Task {id}\n\n## 用户任务\n\n{}\n\n## 项目路径\n\n{}\n\n## 工作流模板\n\n{}\n",
            input.task.trim(),
            input.project_path.trim(),
            input.workflow_template.trim()
        ),
    )
    .map_err(|error| format!("写入 task.md 失败: {error}"))?;

    fs::write(
        task_dir.join("constitution.md"),
        "# AI 工作宪法\n\n- 每个任务流程完成后，PM 必须总结节点完成情况、交接结果、阻塞点、证据和改进项。\n",
    )
    .map_err(|error| format!("写入 constitution.md 失败: {error}"))?;

    let archive = WorkflowArchive {
        id: id.clone(),
        task: input.task,
        project_path: input.project_path,
        workflow_template: input.workflow_template,
        status: "running".to_string(),
        total_elapsed_ms: 0,
        agent_elapsed_ms: 0,
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0,
        artifacts: Vec::new(),
        generated_files: Vec::new(),
        approvals: Vec::new(),
        attachments: Vec::new(),
    };
    write_workflow(&task_dir, &archive)?;

    Ok(TaskArchiveRef { id, path: task_dir.display().to_string() })
}

pub fn save_task_artifact(base_dir: impl AsRef<Path>, export_root: Option<String>, input: TaskArtifactInput) -> Result<TaskArchiveRef, String> {
    let task_dir = resolve_task_dir(base_dir, &input.task_id)?;
    let artifact_name = format!("{}-{}.md", sanitize_segment(&input.stage), sanitize_segment(&input.owner));
    let artifact_path = task_dir.join("artifacts").join(&artifact_name);
    let content = format!(
        "# {} / {}\n\n- 状态: {}\n- 耗时: {}ms\n- input tokens: {}\n- output tokens: {}\n- total tokens: {}\n\n## 产物\n\n{}\n",
        input.owner,
        input.stage,
        input.status,
        input.elapsed_ms,
        input.input_tokens,
        input.output_tokens,
        input.total_tokens,
        input.output
    );
    fs::write(&artifact_path, content).map_err(|error| format!("写入节点产物失败: {error}"))?;
    let generated_files = if input.owner.contains("DEV") {
        write_generated_files(&task_dir, &input.stage, &input.output)?
    } else {
        Vec::new()
    };
    export_artifacts(&task_dir, export_root.as_deref(), &input.task_id, &input.owner, &artifact_name, &artifact_path, &generated_files)?;

    let mut archive = read_workflow(&task_dir)?;
    archive.artifacts.push(ArtifactRecord {
        owner: input.owner,
        stage: input.stage,
        status: input.status,
        elapsed_ms: input.elapsed_ms,
        input_tokens: input.input_tokens,
        output_tokens: input.output_tokens,
        total_tokens: input.total_tokens,
        path: format!("artifacts/{artifact_name}"),
    });
    archive.generated_files.extend(generated_files);
    write_workflow(&task_dir, &archive)?;

    Ok(TaskArchiveRef { id: archive.id, path: task_dir.display().to_string() })
}

pub fn save_task_attachments(base_dir: impl AsRef<Path>, input: TaskAttachmentInput) -> Result<TaskAttachmentSaveResult, String> {
    let task_dir = resolve_task_dir(base_dir, &input.task_id)?;
    let attachments_dir = task_dir.join("attachments");
    fs::create_dir_all(&attachments_dir).map_err(|error| format!("创建附件目录失败: {error}"))?;

    let mut saved = Vec::new();
    for source in input.source_paths {
        let source_path = PathBuf::from(source.trim());
        if !source_path.exists() {
            return Err(format!("附件不存在: {}", source_path.display()));
        }
        if source_path.is_dir() {
            return Err(format!("附件必须是文件，不能是目录: {}", source_path.display()));
        }

        let original_name = source_path
            .file_name()
            .and_then(|value| value.to_str())
            .ok_or_else(|| format!("无法读取附件文件名: {}", source_path.display()))?
            .to_string();
        let safe_name = next_available_attachment_name(&attachments_dir, &sanitize_file_segment(&original_name));
        let target = attachments_dir.join(&safe_name);
        fs::copy(&source_path, &target).map_err(|error| format!("复制附件失败: {error}"))?;
        let bytes = fs::metadata(&target).map_err(|error| format!("读取附件元数据失败: {error}"))?.len();
        let kind = attachment_kind(&source_path);
        let text_preview = if kind == "text" { read_attachment_preview(&target)? } else { None };
        saved.push(TaskAttachmentRecord {
            original_name,
            path: format!("attachments/{}", safe_name.replace('\\', "/")),
            bytes,
            kind,
            text_preview,
        });
    }
    for inline_file in input.inline_files {
        if inline_file.bytes.is_empty() {
            return Err(format!("内存附件为空: {}", inline_file.original_name));
        }
        let original_name = if inline_file.original_name.trim().is_empty() {
            "clipboard.png".to_string()
        } else {
            inline_file.original_name.trim().to_string()
        };
        let safe_name = next_available_attachment_name(&attachments_dir, &sanitize_file_segment(&original_name));
        let target = attachments_dir.join(&safe_name);
        fs::write(&target, &inline_file.bytes).map_err(|error| format!("写入内存附件失败: {error}"))?;
        let bytes = fs::metadata(&target).map_err(|error| format!("读取内存附件元数据失败: {error}"))?.len();
        let kind = attachment_kind(Path::new(&safe_name));
        let text_preview = if kind == "text" { read_attachment_preview(&target)? } else { None };
        saved.push(TaskAttachmentRecord {
            original_name,
            path: format!("attachments/{}", safe_name.replace('\\', "/")),
            bytes,
            kind,
            text_preview,
        });
    }

    let mut archive = read_workflow(&task_dir)?;
    archive.attachments.extend(saved.clone());
    write_workflow(&task_dir, &archive)?;
    let context_block = attachment_context_block(&task_dir, &saved);

    Ok(TaskAttachmentSaveResult { task_id: archive.id, attachments: saved, context_block })
}

pub fn finish_task_archive(base_dir: impl AsRef<Path>, input: TaskArchiveFinishInput) -> Result<TaskArchiveRef, String> {
    let task_dir = resolve_task_dir(base_dir, &input.task_id)?;
    let mut archive = read_workflow(&task_dir)?;
    archive.status = input.status;
    archive.total_elapsed_ms = input.total_elapsed_ms;
    archive.agent_elapsed_ms = input.agent_elapsed_ms;
    archive.input_tokens = input.input_tokens;
    archive.output_tokens = input.output_tokens;
    archive.total_tokens = input.total_tokens;
    write_workflow(&task_dir, &archive)?;

    fs::write(task_dir.join("retrospective.md"), input.summary).map_err(|error| format!("写入 retrospective.md 失败: {error}"))?;

    Ok(TaskArchiveRef { id: archive.id, path: task_dir.display().to_string() })
}

pub fn record_approval(base_dir: impl AsRef<Path>, input: ApprovalRecordInput) -> Result<TaskArchiveRef, String> {
    let task_dir = resolve_task_dir(base_dir, &input.task_id)?;
    let mut archive = read_workflow(&task_dir)?;
    archive.approvals.push(ApprovalRecord {
        stage: input.stage,
        owner: input.owner,
        decision: input.decision,
        note: input.note,
    });
    write_workflow(&task_dir, &archive)?;
    Ok(TaskArchiveRef { id: archive.id, path: task_dir.display().to_string() })
}

fn read_workflow(task_dir: &Path) -> Result<WorkflowArchive, String> {
    let content = fs::read_to_string(task_dir.join("workflow.json")).map_err(|error| format!("读取 workflow.json 失败: {error}"))?;
    serde_json::from_str(&content).map_err(|error| format!("解析 workflow.json 失败: {error}"))
}

fn write_workflow(task_dir: &Path, archive: &WorkflowArchive) -> Result<(), String> {
    let content = serde_json::to_string_pretty(archive).map_err(|error| format!("序列化 workflow.json 失败: {error}"))?;
    fs::write(task_dir.join("workflow.json"), content).map_err(|error| format!("写入 workflow.json 失败: {error}"))
}

fn export_artifacts(
    task_dir: &Path,
    export_root: Option<&str>,
    task_id: &str,
    owner: &str,
    artifact_name: &str,
    artifact_path: &Path,
    generated_files: &[String],
) -> Result<(), String> {
    let Some(export_root) = export_root.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(());
    };
    let category = export_category(owner);
    let target_dir = PathBuf::from(export_root).join(sanitize_segment(task_id)).join(category);
    fs::create_dir_all(&target_dir).map_err(|error| format!("创建外部产物目录失败: {error}"))?;

    let artifact_target = target_dir.join(artifact_name);
    fs::copy(artifact_path, &artifact_target).map_err(|error| format!("导出节点文档失败: {error}"))?;

    for generated_file in generated_files {
        let relative = generated_file.strip_prefix("generated/").unwrap_or(generated_file);
        let safe_relative = safe_relative_filename(relative)?;
        let source = task_dir.join(generated_file);
        let target = target_dir.join(&safe_relative);
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).map_err(|error| format!("创建外部 generated 子目录失败: {error}"))?;
        }
        let bytes = fs::metadata(&source).map_err(|error| format!("读取 generated 文件元数据失败: {error}"))?.len();
        if bytes == 0 {
            return Err(format!("generated 文件为空，已拒绝导出: {generated_file}"));
        }
        fs::copy(&source, &target).map_err(|error| format!("导出 generated 文件失败: {error}"))?;
    }
    Ok(())
}

fn export_category(owner: &str) -> &'static str {
    if owner.contains("PD") {
        "pd"
    } else if owner.contains("DEV") {
        "dev"
    } else if owner.contains("ARCH") {
        "arch"
    } else if owner.contains("QA") {
        "qa"
    } else {
        "pm"
    }
}

fn resolve_task_dir(base_dir: impl AsRef<Path>, task_id: &str) -> Result<PathBuf, String> {
    let sanitized = sanitize_segment(task_id);
    if sanitized != task_id {
        return Err("任务 ID 不合法".to_string());
    }
    let path = base_dir.as_ref().join(task_id);
    if !path.exists() {
        return Err(format!("任务档案不存在: {task_id}"));
    }
    Ok(path)
}

fn new_task_id() -> String {
    let millis = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis();
    format!("task-{millis}")
}

fn sanitize_segment(value: &str) -> String {
    value
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' { ch } else { '-' })
        .collect::<String>()
        .trim_matches('-')
        .to_string()
}

fn write_generated_files(task_dir: &Path, stage: &str, output: &str) -> Result<Vec<String>, String> {
    let blocks = extract_code_blocks(output);
    if blocks.is_empty() {
        return Ok(Vec::new());
    }
    let generated_dir = task_dir.join("generated");
    fs::create_dir_all(&generated_dir).map_err(|error| format!("创建 generated 目录失败: {error}"))?;

    let mut saved = Vec::new();
    for (index, block) in blocks.into_iter().enumerate() {
        let filename = block
            .filename
            .unwrap_or_else(|| inferred_filename(stage, index + 1, &block.language));
        let safe_filename = safe_relative_filename(&filename)?;
        let path = generated_dir.join(&safe_filename);
        if block.code.trim().is_empty() {
            return Err(format!("generated 文件为空: {safe_filename}"));
        }
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|error| format!("创建 generated 子目录失败: {error}"))?;
        }
        fs::write(&path, block.code).map_err(|error| format!("写入 generated 文件失败: {error}"))?;
        let bytes = fs::metadata(&path).map_err(|error| format!("校验 generated 文件失败: {error}"))?.len();
        if bytes == 0 {
            let _ = fs::remove_file(&path);
            return Err(format!("generated 文件为空: {safe_filename}"));
        }
        saved.push(format!("generated/{}", safe_filename.replace('\\', "/")));
    }
    Ok(saved)
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct CodeBlock {
    language: String,
    filename: Option<String>,
    code: String,
}

fn extract_code_blocks(output: &str) -> Vec<CodeBlock> {
    let mut blocks = Vec::new();
    let mut in_block = false;
    let mut language = String::new();
    let mut lines = Vec::new();

    for line in output.lines() {
        if let Some(rest) = line.strip_prefix("```") {
            if in_block {
                let raw_code = lines.join("\n");
                let (filename, code) = split_file_marker(&raw_code);
                blocks.push(CodeBlock { language: language.clone(), filename, code });
                lines.clear();
                language.clear();
                in_block = false;
            } else {
                language = rest.trim().to_string();
                in_block = true;
            }
            continue;
        }
        if in_block {
            lines.push(line);
        }
    }
    blocks
}

fn split_file_marker(code: &str) -> (Option<String>, String) {
    let mut lines = code.lines();
    let first = match lines.next() {
        Some(first) => first.trim(),
        None => return (None, String::new()),
    };
    let marker = first
        .strip_prefix("<!-- FILE:")
        .and_then(|value| value.strip_suffix("-->"))
        .or_else(|| first.strip_prefix("// FILE:"))
        .or_else(|| first.strip_prefix("# FILE:"));
    if let Some(filename) = marker {
        return (Some(filename.trim().to_string()), lines.collect::<Vec<_>>().join("\n"));
    }
    (None, code.to_string())
}

fn inferred_filename(stage: &str, index: usize, language: &str) -> String {
    let ext = match language.trim().to_ascii_lowercase().as_str() {
        "html" => "html",
        "css" => "css",
        "js" | "javascript" => "js",
        "ts" | "typescript" => "ts",
        "tsx" => "tsx",
        "jsx" => "jsx",
        "json" => "json",
        "rust" | "rs" => "rs",
        "python" | "py" => "py",
        "markdown" | "md" => "md",
        _ => "txt",
    };
    format!("{}-{index}.{ext}", sanitize_segment(stage))
}

fn safe_relative_filename(filename: &str) -> Result<String, String> {
    let normalized = filename.trim().replace('\\', "/");
    if normalized.is_empty() || normalized.starts_with('/') || normalized.contains("..") {
        return Err(format!("generated 文件名不安全: {filename}"));
    }
    let parts = normalized
        .split('/')
        .filter(|part| !part.is_empty())
        .map(sanitize_file_segment)
        .collect::<Vec<_>>();
    if parts.is_empty() {
        return Err(format!("generated 文件名不安全: {filename}"));
    }
    Ok(parts.join("/"))
}

fn sanitize_file_segment(value: &str) -> String {
    value
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' || ch == '.' { ch } else { '-' })
        .collect::<String>()
        .trim_matches('-')
        .to_string()
}

fn next_available_attachment_name(dir: &Path, filename: &str) -> String {
    let safe = if filename.is_empty() { "attachment" } else { filename };
    let path = Path::new(safe);
    let stem = path.file_stem().and_then(|value| value.to_str()).unwrap_or("attachment");
    let ext = path.extension().and_then(|value| value.to_str()).map(|value| format!(".{value}")).unwrap_or_default();
    let mut candidate = format!("{stem}{ext}");
    let mut index = 2;
    while dir.join(&candidate).exists() {
        candidate = format!("{stem}-{index}{ext}");
        index += 1;
    }
    candidate
}

fn attachment_kind(path: &Path) -> String {
    let ext = path.extension().and_then(|value| value.to_str()).unwrap_or_default().to_ascii_lowercase();
    if matches!(ext.as_str(), "txt" | "md" | "json" | "html" | "css" | "js" | "jsx" | "ts" | "tsx" | "py" | "rs" | "java" | "xml" | "yaml" | "yml" | "toml" | "csv" | "log") {
        "text".to_string()
    } else if matches!(ext.as_str(), "png" | "jpg" | "jpeg" | "gif" | "webp" | "bmp" | "svg") {
        "image".to_string()
    } else {
        "binary".to_string()
    }
}

fn read_attachment_preview(path: &Path) -> Result<Option<String>, String> {
    const PREVIEW_LIMIT: usize = 8192;
    let bytes = fs::read(path).map_err(|error| format!("读取附件预览失败: {error}"))?;
    let preview_bytes = bytes.into_iter().take(PREVIEW_LIMIT).collect::<Vec<_>>();
    let text = String::from_utf8_lossy(&preview_bytes).trim().to_string();
    if text.is_empty() {
        Ok(None)
    } else {
        Ok(Some(text))
    }
}

fn attachment_context_block(task_dir: &Path, records: &[TaskAttachmentRecord]) -> String {
    if records.is_empty() {
        return "对话附件：无。".to_string();
    }
    let mut lines = vec!["对话附件：".to_string()];
    for record in records {
        let readable_path = if record.kind == "image" {
            task_dir.join(&record.path).display().to_string()
        } else {
            record.path.clone()
        };
        lines.push(format!("- {} [{}] {} bytes -> {}", record.original_name, record.kind, record.bytes, readable_path));
        if let Some(preview) = &record.text_preview {
            lines.push("  文本预览：".to_string());
            lines.push(format!("  {}", preview.replace('\n', "\n  ")));
        } else {
            lines.push("  读取方式：请按附件路径读取或引用，不要臆测二进制内容。".to_string());
        }
    }
    lines.push("请 Agent 将这些附件作为用户输入上下文；如需完整内容，优先按归档路径读取。".to_string());
    lines.join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn task_archive_creates_task_files_and_artifacts() {
        let base = std::env::temp_dir().join(format!("workflow_client_task_archive_test_{}", new_task_id()));
        let archive = create_task_archive(
            &base,
            TaskArchiveStartInput {
                task: "做一个登录页".to_string(),
                project_path: "D:\\CodexProjects\\workflow-manager-client".to_string(),
                workflow_template: "完整需求开发流程".to_string(),
            },
        )
        .unwrap();

        let task_dir = PathBuf::from(&archive.path);
        assert!(task_dir.join("task.md").exists());
        assert!(task_dir.join("workflow.json").exists());
        assert!(task_dir.join("constitution.md").exists());

        save_task_artifact(
            &base,
            None,
            TaskArtifactInput {
                task_id: archive.id.clone(),
                owner: "PD Agent".to_string(),
                stage: "ScenarioRehearsal".to_string(),
                status: "done".to_string(),
                elapsed_ms: 1200,
                input_tokens: 10,
                output_tokens: 20,
                total_tokens: 30,
                output: "节点完成".to_string(),
            },
        )
        .unwrap();

        finish_task_archive(
            &base,
            TaskArchiveFinishInput {
                task_id: archive.id.clone(),
                status: "completed".to_string(),
                total_elapsed_ms: 2000,
                agent_elapsed_ms: 1200,
                input_tokens: 10,
                output_tokens: 20,
                total_tokens: 30,
                summary: "复盘完成".to_string(),
            },
        )
        .unwrap();

        let workflow = fs::read_to_string(task_dir.join("workflow.json")).unwrap();
        assert!(workflow.contains("\"status\": \"completed\""));
        assert!(workflow.contains("\"total_tokens\": 30"));
        assert!(task_dir.join("artifacts").join("ScenarioRehearsal-PD-Agent.md").exists());
        assert_eq!(fs::read_to_string(task_dir.join("retrospective.md")).unwrap(), "复盘完成");

        let _ = fs::remove_dir_all(base);
    }

    #[test]
    fn task_archive_records_approval_decisions() {
        let base = std::env::temp_dir().join(format!("workflow_client_approval_test_{}", new_task_id()));
        let archive = create_task_archive(
            &base,
            TaskArchiveStartInput {
                task: "审批流程".to_string(),
                project_path: "D:\\demo".to_string(),
                workflow_template: "完整需求开发流程".to_string(),
            },
        )
        .unwrap();

        record_approval(
            &base,
            ApprovalRecordInput {
                task_id: archive.id.clone(),
                stage: "ScenarioRehearsal".to_string(),
                owner: "PD Agent".to_string(),
                decision: "approved".to_string(),
                note: "需求文档通过".to_string(),
            },
        )
        .unwrap();

        let workflow = fs::read_to_string(PathBuf::from(&archive.path).join("workflow.json")).unwrap();
        assert!(workflow.contains("\"decision\": \"approved\""));
        assert!(workflow.contains("需求文档通过"));

        let _ = fs::remove_dir_all(base);
    }

    #[test]
    fn task_archive_extracts_generated_html_files_from_code_blocks() {
        let base = std::env::temp_dir().join(format!("workflow_client_generated_files_test_{}", new_task_id()));
        let archive = create_task_archive(
            &base,
            TaskArchiveStartInput {
                task: "生成 HTML".to_string(),
                project_path: "D:\\demo".to_string(),
                workflow_template: "完整需求开发流程".to_string(),
            },
        )
        .unwrap();

        save_task_artifact(
            &base,
            None,
            TaskArtifactInput {
                task_id: archive.id.clone(),
                owner: "DEV Agent".to_string(),
                stage: "TaskSplit".to_string(),
                status: "done".to_string(),
                elapsed_ms: 1,
                input_tokens: 1,
                output_tokens: 1,
                total_tokens: 2,
                output: "```html\n<!-- FILE: index.html -->\n<!doctype html><html><body>OK</body></html>\n```".to_string(),
            },
        )
        .unwrap();

        let task_dir = PathBuf::from(&archive.path);
        assert_eq!(
            fs::read_to_string(task_dir.join("generated").join("index.html")).unwrap(),
            "<!doctype html><html><body>OK</body></html>"
        );
        let workflow = fs::read_to_string(task_dir.join("workflow.json")).unwrap();
        assert!(workflow.contains("generated/index.html"));

        let _ = fs::remove_dir_all(base);
    }

    #[test]
    fn task_archive_exports_artifacts_to_configured_root_by_role() {
        let base = std::env::temp_dir().join(format!("workflow_client_export_source_test_{}", new_task_id()));
        let export_root = std::env::temp_dir().join(format!("workflow_client_export_root_test_{}", new_task_id()));
        let archive = create_task_archive(
            &base,
            TaskArchiveStartInput {
                task: "生成 HTML".to_string(),
                project_path: "D:\\demo".to_string(),
                workflow_template: "完整需求开发流程".to_string(),
            },
        )
        .unwrap();

        save_task_artifact(
            &base,
            Some(export_root.display().to_string()),
            TaskArtifactInput {
                task_id: archive.id.clone(),
                owner: "DEV Agent".to_string(),
                stage: "TaskSplit".to_string(),
                status: "done".to_string(),
                elapsed_ms: 1,
                input_tokens: 1,
                output_tokens: 1,
                total_tokens: 2,
                output: "```html\n<!-- FILE: form.html -->\n<form>OK</form>\n```".to_string(),
            },
        )
        .unwrap();

        let export_dir = export_root.join(&archive.id).join("dev");
        assert!(export_dir.join("TaskSplit-DEV-Agent.md").exists());
        assert_eq!(fs::read_to_string(export_dir.join("form.html")).unwrap(), "<form>OK</form>");

        let _ = fs::remove_dir_all(base);
        let _ = fs::remove_dir_all(export_root);
    }

    #[test]
    fn task_archive_does_not_export_non_dev_code_blocks_as_generated_files() {
        let base = std::env::temp_dir().join(format!("workflow_client_non_dev_generated_files_test_{}", new_task_id()));
        let archive = create_task_archive(
            &base,
            TaskArchiveStartInput {
                task: "CR 报告".to_string(),
                project_path: "D:\\demo".to_string(),
                workflow_template: "完整流程".to_string(),
            },
        )
        .unwrap();

        save_task_artifact(
            &base,
            None,
            TaskArtifactInput {
                task_id: archive.id.clone(),
                owner: "ARCH Agent".to_string(),
                stage: "CodeReview".to_string(),
                status: "done".to_string(),
                elapsed_ms: 1,
                input_tokens: 1,
                output_tokens: 1,
                total_tokens: 2,
                output: "```html\n<form action=\"#\"></form>\n```".to_string(),
            },
        )
        .unwrap();

        assert!(!PathBuf::from(&archive.path).join("generated").exists());
        let workflow = fs::read_to_string(PathBuf::from(&archive.path).join("workflow.json")).unwrap();
        assert!(workflow.contains("\"generated_files\": []"));

        let _ = fs::remove_dir_all(base);
    }

    #[test]
    fn task_archive_rejects_empty_generated_files() {
        let base = std::env::temp_dir().join(format!("workflow_client_empty_generated_file_test_{}", new_task_id()));
        let archive = create_task_archive(
            &base,
            TaskArchiveStartInput {
                task: "生成 HTML".to_string(),
                project_path: "D:\\demo".to_string(),
                workflow_template: "完整需求开发流程".to_string(),
            },
        )
        .unwrap();

        let result = save_task_artifact(
            &base,
            None,
            TaskArtifactInput {
                task_id: archive.id.clone(),
                owner: "DEV Agent".to_string(),
                stage: "TaskSplit".to_string(),
                status: "done".to_string(),
                elapsed_ms: 1,
                input_tokens: 1,
                output_tokens: 1,
                total_tokens: 2,
                output: "```html\n<!-- FILE: form.html -->\n```".to_string(),
            },
        );

        assert!(result.is_err());
        assert!(result.unwrap_err().contains("generated 文件为空"));
        assert!(!PathBuf::from(&archive.path).join("generated").join("form.html").exists());

        let _ = fs::remove_dir_all(base);
    }

    #[test]
    fn task_archive_saves_text_attachment_with_context_preview() {
        let base = std::env::temp_dir().join(format!("workflow_client_attachment_text_test_{}", new_task_id()));
        let source_dir = std::env::temp_dir().join(format!("workflow_client_attachment_source_test_{}", new_task_id()));
        fs::create_dir_all(&source_dir).unwrap();
        let source = source_dir.join("brief.md");
        fs::write(&source, "# Brief\n\nNeed a static HTML form with country field.").unwrap();
        let archive = create_task_archive(
            &base,
            TaskArchiveStartInput {
                task: "读取附件".to_string(),
                project_path: "D:\\demo".to_string(),
                workflow_template: "附件流程".to_string(),
            },
        )
        .unwrap();

        let result = save_task_attachments(
            &base,
            TaskAttachmentInput {
                task_id: archive.id.clone(),
                source_paths: vec![source.display().to_string()],
                inline_files: Vec::new(),
            },
        )
        .unwrap();

        assert_eq!(result.attachments.len(), 1);
        assert_eq!(result.attachments[0].original_name, "brief.md");
        assert_eq!(result.attachments[0].kind, "text");
        assert!(result.context_block.contains("Need a static HTML form"));
        assert!(PathBuf::from(&archive.path).join(&result.attachments[0].path).exists());
        let workflow = fs::read_to_string(PathBuf::from(&archive.path).join("workflow.json")).unwrap();
        assert!(workflow.contains("\"attachments\""));
        assert!(workflow.contains("brief.md"));

        let _ = fs::remove_dir_all(base);
        let _ = fs::remove_dir_all(source_dir);
    }

    #[test]
    fn task_archive_saves_binary_attachment_without_text_preview() {
        let base = std::env::temp_dir().join(format!("workflow_client_attachment_binary_test_{}", new_task_id()));
        let source_dir = std::env::temp_dir().join(format!("workflow_client_attachment_binary_source_test_{}", new_task_id()));
        fs::create_dir_all(&source_dir).unwrap();
        let source = source_dir.join("screen.png");
        fs::write(&source, [137, 80, 78, 71, 13, 10, 26, 10]).unwrap();
        let archive = create_task_archive(
            &base,
            TaskArchiveStartInput {
                task: "读取图片附件".to_string(),
                project_path: "D:\\demo".to_string(),
                workflow_template: "附件流程".to_string(),
            },
        )
        .unwrap();

        let result = save_task_attachments(
            &base,
            TaskAttachmentInput {
                task_id: archive.id.clone(),
                source_paths: vec![source.display().to_string()],
                inline_files: Vec::new(),
            },
        )
        .unwrap();

        assert_eq!(result.attachments[0].kind, "image");
        assert_eq!(result.attachments[0].bytes, 8);
        assert_eq!(result.attachments[0].text_preview, None);
        assert!(result.context_block.contains("screen.png"));
        assert!(!result.context_block.contains("文本预览"));

        let _ = fs::remove_dir_all(base);
        let _ = fs::remove_dir_all(source_dir);
    }

    #[test]
    fn task_archive_saves_inline_clipboard_image_without_source_path() {
        let base = std::env::temp_dir().join(format!("workflow_client_attachment_inline_image_test_{}", new_task_id()));
        let archive = create_task_archive(
            &base,
            TaskArchiveStartInput {
                task: "读取剪贴板截图".to_string(),
                project_path: "D:\\demo".to_string(),
                workflow_template: "附件流程".to_string(),
            },
        )
        .unwrap();

        let result = save_task_attachments(
            &base,
            TaskAttachmentInput {
                task_id: archive.id.clone(),
                source_paths: Vec::new(),
                inline_files: vec![InlineAttachmentInput {
                    original_name: "clipboard.png".to_string(),
                    bytes: vec![137, 80, 78, 71, 13, 10, 26, 10],
                }],
            },
        )
        .unwrap();

        assert_eq!(result.attachments.len(), 1);
        assert_eq!(result.attachments[0].original_name, "clipboard.png");
        assert_eq!(result.attachments[0].kind, "image");
        assert_eq!(result.attachments[0].bytes, 8);
        assert!(PathBuf::from(&archive.path).join("attachments").join("clipboard.png").exists());
        assert!(result.context_block.contains("clipboard.png [image]"));

        let _ = fs::remove_dir_all(base);
    }
}
