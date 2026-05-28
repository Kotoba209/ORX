mod project_registry;
mod app_settings;
mod project_scanner;
mod provider_config;
mod task_archive;
mod workflow;
mod workflow_config_store;
mod memory_rule_store;
mod orion_actions;

use project_registry::RegisteredProject;
use project_scanner::ProjectSummary;
use provider_config::{AgentBindingInput, AgentRunInput, AgentRunResult, ProviderConfigInput, ProviderConfigSnapshot, ProviderConnectionResult};
use serde::Serialize;
use app_settings::AppSettings;
use memory_rule_store::{MemoryRuleInput, MemoryRuleSnapshot};
use orion_actions::{GeneratedArtifactWriteInput, GeneratedArtifactWriteResult, ProjectFileReadInput, ProjectFileReadResult, WhitelistedCommandInput, WhitelistedCommandResult};
use task_archive::{ApprovalRecordInput, TaskArchiveFinishInput, TaskArchiveRef, TaskArchiveStartInput, TaskArtifactInput, TaskAttachmentInput, TaskAttachmentSaveResult};
use workflow_config_store::WorkflowConfigSnapshot;
use workflow::WorkflowStep;

#[derive(Debug, Serialize)]
struct AddProjectResult {
    project: RegisteredProject,
    summary: ProjectSummary,
}

#[tauri::command]
fn scan_project(path: String) -> Result<ProjectSummary, String> {
    project_scanner::scan_project(path)
}

#[tauri::command]
fn add_project(path: String) -> Result<AddProjectResult, String> {
    let registry_path = project_registry::default_registry_path()?;
    let (project, summary) = project_registry::add_project(path, registry_path)?;
    Ok(AddProjectResult { project, summary })
}

#[tauri::command]
fn list_projects() -> Result<Vec<RegisteredProject>, String> {
    let registry_path = project_registry::default_registry_path()?;
    project_registry::list_projects(registry_path)
}

#[tauri::command]
fn remove_project(project_id: String) -> Result<Vec<RegisteredProject>, String> {
    let registry_path = project_registry::default_registry_path()?;
    project_registry::remove_project(&project_id, registry_path)
}

#[tauri::command]
fn get_app_settings() -> Result<AppSettings, String> {
    let settings_path = app_settings::default_settings_path()?;
    app_settings::load_settings(settings_path)
}

#[tauri::command]
fn save_app_settings(input: AppSettings) -> Result<AppSettings, String> {
    let settings_path = app_settings::default_settings_path()?;
    app_settings::save_settings(settings_path, input)
}

#[tauri::command]
fn get_provider_config() -> Result<ProviderConfigSnapshot, String> {
    let config_path = provider_config::default_config_path()?;
    provider_config::load_config(config_path)
}

#[tauri::command]
fn save_provider(input: ProviderConfigInput) -> Result<ProviderConfigSnapshot, String> {
    let config_path = provider_config::default_config_path()?;
    provider_config::save_provider(config_path, input)
}

#[tauri::command]
fn delete_provider(provider_id: String) -> Result<ProviderConfigSnapshot, String> {
    let config_path = provider_config::default_config_path()?;
    provider_config::delete_provider(config_path, &provider_id)
}

#[tauri::command]
fn bind_agent_provider(input: AgentBindingInput) -> Result<ProviderConfigSnapshot, String> {
    let config_path = provider_config::default_config_path()?;
    provider_config::bind_agent(config_path, input)
}

#[tauri::command]
fn test_provider_connection(input: ProviderConfigInput) -> Result<ProviderConnectionResult, String> {
    provider_config::test_provider_connection(input)
}

#[tauri::command]
async fn run_agent(input: AgentRunInput) -> Result<AgentRunResult, String> {
    tauri::async_runtime::spawn_blocking(move || provider_config::run_agent(input))
        .await
        .map_err(|error| format!("Agent 后台任务失败: {error}"))?
}

#[tauri::command]
fn start_task_archive(input: TaskArchiveStartInput) -> Result<TaskArchiveRef, String> {
    let tasks_dir = task_archive::default_tasks_dir()?;
    task_archive::create_task_archive(tasks_dir, input)
}

#[tauri::command]
fn save_task_artifact(input: TaskArtifactInput) -> Result<TaskArchiveRef, String> {
    let tasks_dir = task_archive::default_tasks_dir()?;
    let settings = app_settings::load_settings(app_settings::default_settings_path()?)?;
    let export_root = if settings.artifact_output_dir.trim().is_empty() {
        None
    } else {
        Some(settings.artifact_output_dir)
    };
    task_archive::save_task_artifact(tasks_dir, export_root, input)
}

#[tauri::command]
fn save_task_attachments(input: TaskAttachmentInput) -> Result<TaskAttachmentSaveResult, String> {
    let tasks_dir = task_archive::default_tasks_dir()?;
    task_archive::save_task_attachments(tasks_dir, input)
}

#[tauri::command]
fn finish_task_archive(input: TaskArchiveFinishInput) -> Result<TaskArchiveRef, String> {
    let tasks_dir = task_archive::default_tasks_dir()?;
    task_archive::finish_task_archive(tasks_dir, input)
}

#[tauri::command]
fn record_approval(input: ApprovalRecordInput) -> Result<TaskArchiveRef, String> {
    let tasks_dir = task_archive::default_tasks_dir()?;
    task_archive::record_approval(tasks_dir, input)
}

#[tauri::command]
fn workflow_blueprint() -> Vec<WorkflowStep> {
    workflow::default_workflow_steps()
}

#[tauri::command]
fn get_workflow_config() -> Result<Option<WorkflowConfigSnapshot>, String> {
    let path = workflow_config_store::default_workflows_path()?;
    workflow_config_store::load_workflows(path)
}

#[tauri::command]
fn save_workflow_config(input: WorkflowConfigSnapshot) -> Result<WorkflowConfigSnapshot, String> {
    let path = workflow_config_store::default_workflows_path()?;
    workflow_config_store::save_workflows(path, input)
}

#[tauri::command]
fn get_memory_rules() -> Result<MemoryRuleSnapshot, String> {
    let path = memory_rule_store::default_memory_rules_path()?;
    memory_rule_store::load_memory_rules(path)
}

#[tauri::command]
fn save_memory_rules(input: MemoryRuleSnapshot) -> Result<MemoryRuleSnapshot, String> {
    let path = memory_rule_store::default_memory_rules_path()?;
    memory_rule_store::save_memory_rules(path, input)
}

#[tauri::command]
fn append_memory_rule(input: MemoryRuleInput) -> Result<MemoryRuleSnapshot, String> {
    let path = memory_rule_store::default_memory_rules_path()?;
    memory_rule_store::append_memory_rule(path, input)
}

#[tauri::command]
fn orion_read_project_file(input: ProjectFileReadInput) -> Result<ProjectFileReadResult, String> {
    orion_actions::read_project_file(input)
}

#[tauri::command]
fn orion_write_generated_artifact(input: GeneratedArtifactWriteInput) -> Result<GeneratedArtifactWriteResult, String> {
    orion_actions::write_generated_artifact(input)
}

#[tauri::command]
fn orion_validate_whitelisted_command(program: String, args: Vec<String>) -> Result<(), String> {
    orion_actions::validate_whitelisted_command(&program, &args)
}

#[tauri::command]
fn orion_run_whitelisted_command(input: WhitelistedCommandInput) -> Result<WhitelistedCommandResult, String> {
    orion_actions::run_whitelisted_command(input)
}

#[tauri::command]
fn orion_action_risk(kind: String) -> String {
    orion_actions::orion_action_risk(&kind).to_string()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            scan_project,
            add_project,
            list_projects,
            remove_project,
            get_app_settings,
            save_app_settings,
            get_provider_config,
            save_provider,
            delete_provider,
            bind_agent_provider,
            test_provider_connection,
            run_agent,
            start_task_archive,
            save_task_artifact,
            save_task_attachments,
            finish_task_archive,
            record_approval,
            workflow_blueprint,
            get_workflow_config,
            save_workflow_config,
            get_memory_rules,
            save_memory_rules,
            append_memory_rule,
            orion_read_project_file,
            orion_write_generated_artifact,
            orion_validate_whitelisted_command,
            orion_run_whitelisted_command,
            orion_action_risk
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn local_mock_flow_archives_attachments_and_agent_reads_document_and_image_context() {
        let base = std::env::temp_dir().join(format!("orx_mock_flow_{}", millis()));
        let source_dir = std::env::temp_dir().join(format!("orx_mock_flow_sources_{}", millis()));
        fs::create_dir_all(&source_dir).unwrap();
        let doc = source_dir.join("brief.md");
        let image = source_dir.join("screen.png");
        fs::write(&doc, "# 需求\n\n请根据截图和说明生成一个带国家字段的 HTML 表单。").unwrap();
        fs::write(&image, [137, 80, 78, 71, 13, 10, 26, 10]).unwrap();

        let archive = task_archive::create_task_archive(
            &base,
            TaskArchiveStartInput {
                task: "根据附件跑一遍需求流程".to_string(),
                project_path: "D:\\demo".to_string(),
                workflow_template: "附件验证流程".to_string(),
            },
        )
        .unwrap();
        let attachment_result = task_archive::save_task_attachments(
            &base,
            TaskAttachmentInput {
                task_id: archive.id.clone(),
                source_paths: vec![doc.display().to_string(), image.display().to_string()],
                inline_files: Vec::new(),
            },
        )
        .unwrap();
        let upstream = format!("用户任务：根据附件跑一遍需求流程\n{}", attachment_result.context_block);

        let agent_result = provider_config::run_agent(AgentRunInput {
            provider: ProviderConfigInput {
                id: "mock-local".to_string(),
                name: "Mock Local".to_string(),
                kind: "mock".to_string(),
                api_protocol: "responses".to_string(),
                base_url: "mock://local".to_string(),
                use_proxy_route: false,
                proxy_url: "".to_string(),
                model: "mock-agent".to_string(),
                api_key_ref: "".to_string(),
            },
            owner: "PD Agent".to_string(),
            stage: "ScenarioRehearsal".to_string(),
            task: "根据附件跑一遍需求流程".to_string(),
            upstream,
        })
        .unwrap();

        assert!(PathBuf::from(&archive.path).join("attachments").join("brief.md").exists());
        assert!(PathBuf::from(&archive.path).join("attachments").join("screen.png").exists());
        assert!(attachment_result.context_block.contains("带国家字段"));
        assert!(attachment_result.context_block.contains("screen.png [image]"));
        assert!(agent_result.output.contains("已读取附件上下文"));
        assert!(agent_result.output.contains("文档预览=已识别"));
        assert!(agent_result.output.contains("图片元数据=已识别"));

        let _ = fs::remove_dir_all(base);
        let _ = fs::remove_dir_all(source_dir);
    }

    fn millis() -> u128 {
        SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis()
    }
}
