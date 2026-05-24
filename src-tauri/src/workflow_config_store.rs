use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WorkflowConfigSnapshot {
    pub workflows: serde_json::Value,
    pub active_workflow_id: String,
}

pub fn default_workflows_path() -> Result<PathBuf, String> {
    let base = std::env::var_os("APPDATA")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("USERPROFILE").map(PathBuf::from))
        .ok_or_else(|| "无法定位用户配置目录".to_string())?;
    Ok(base.join("ORX").join("workflows.json"))
}

pub fn load_workflows(path: impl AsRef<Path>) -> Result<Option<WorkflowConfigSnapshot>, String> {
    let path = path.as_ref();
    if !path.exists() {
        return Ok(None);
    }
    let content = fs::read_to_string(path).map_err(|error| format!("读取工作流配置失败: {error}"))?;
    serde_json::from_str(&content).map(Some).map_err(|error| format!("解析工作流配置失败: {error}"))
}

pub fn save_workflows(path: impl AsRef<Path>, input: WorkflowConfigSnapshot) -> Result<WorkflowConfigSnapshot, String> {
    if !input.workflows.is_array() {
        return Err("工作流配置必须是数组".to_string());
    }
    let path = path.as_ref();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| format!("创建工作流配置目录失败: {error}"))?;
    }
    let content = serde_json::to_string_pretty(&input).map_err(|error| format!("序列化工作流配置失败: {error}"))?;
    fs::write(path, content).map_err(|error| format!("写入工作流配置失败: {error}"))?;
    Ok(input)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn workflow_config_persists_to_local_file() {
        let path = std::env::temp_dir().join("orx_workflow_config_test.json");
        let _ = fs::remove_file(&path);
        let input = WorkflowConfigSnapshot {
            workflows: serde_json::json!([{ "id": "custom", "name": "Custom", "steps": [] }]),
            active_workflow_id: "custom".to_string(),
        };

        save_workflows(&path, input.clone()).unwrap();
        let loaded = load_workflows(&path).unwrap().unwrap();

        assert_eq!(loaded, input);
        let _ = fs::remove_file(path);
    }
}
