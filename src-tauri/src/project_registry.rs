use crate::project_scanner::{scan_project, ProjectSummary};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct RegisteredProject {
    pub id: String,
    pub name: String,
    pub path: String,
    pub source_count: usize,
    pub test_count: usize,
    pub context_brief: String,
    pub updated_at: u64,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct ProjectRegistryFile {
    projects: Vec<RegisteredProject>,
}

pub fn default_registry_path() -> Result<PathBuf, String> {
    let base = std::env::var_os("APPDATA")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("USERPROFILE").map(PathBuf::from))
        .ok_or_else(|| "无法定位用户配置目录".to_string())?;
    Ok(base.join("ORX").join("projects.json"))
}

pub fn add_project(path: impl AsRef<Path>, registry_path: impl AsRef<Path>) -> Result<(RegisteredProject, ProjectSummary), String> {
    let summary = scan_project(path)?;
    let registry_path = registry_path.as_ref();
    let mut registry = read_registry(registry_path)?;
    let now = unix_timestamp();
    let name = Path::new(&summary.root)
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_else(|| summary.root.clone());
    let id = stable_project_id(&summary.root);
    let record = RegisteredProject {
        id: id.clone(),
        name,
        path: summary.root.clone(),
        source_count: summary.source_count,
        test_count: summary.test_count,
        context_brief: summary.context_brief.clone(),
        updated_at: now,
    };

    if let Some(existing) = registry.projects.iter_mut().find(|project| project.id == id) {
        *existing = record.clone();
    } else {
        registry.projects.push(record.clone());
    }
    registry.projects.sort_by(|left, right| left.name.cmp(&right.name));
    write_registry(registry_path, &registry)?;
    Ok((record, summary))
}

pub fn list_projects(registry_path: impl AsRef<Path>) -> Result<Vec<RegisteredProject>, String> {
    Ok(read_registry(registry_path.as_ref())?.projects)
}

pub fn remove_project(project_id: &str, registry_path: impl AsRef<Path>) -> Result<Vec<RegisteredProject>, String> {
    let registry_path = registry_path.as_ref();
    let mut registry = read_registry(registry_path)?;
    let original_len = registry.projects.len();
    registry.projects.retain(|project| project.id != project_id);
    if registry.projects.len() == original_len {
        return Err(format!("项目不存在: {project_id}"));
    }
    write_registry(registry_path, &registry)?;
    Ok(registry.projects)
}

fn read_registry(path: &Path) -> Result<ProjectRegistryFile, String> {
    if !path.exists() {
        return Ok(ProjectRegistryFile::default());
    }
    let content = fs::read_to_string(path).map_err(|error| format!("读取项目列表失败: {error}"))?;
    serde_json::from_str(&content).map_err(|error| format!("解析项目列表失败: {error}"))
}

fn write_registry(path: &Path, registry: &ProjectRegistryFile) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| format!("创建项目列表目录失败: {error}"))?;
    }
    let content = serde_json::to_string_pretty(registry).map_err(|error| format!("序列化项目列表失败: {error}"))?;
    fs::write(path, content).map_err(|error| format!("写入项目列表失败: {error}"))
}

fn stable_project_id(path: &str) -> String {
    let normalized = path.replace('\\', "/").to_lowercase();
    let mut hash: u64 = 1469598103934665603;
    for byte in normalized.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(1099511628211);
    }
    format!("project-{hash:x}")
}

fn unix_timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::{create_dir_all, write};

    #[test]
    fn add_project_persists_scanned_context_and_updates_existing_path() {
        let root = std::env::temp_dir().join("workflow_client_registry_project");
        let registry = std::env::temp_dir().join("workflow_client_registry_project.json");
        let _ = fs::remove_dir_all(&root);
        let _ = fs::remove_file(&registry);
        create_dir_all(root.join("src")).unwrap();
        write(root.join("README.md"), "# client").unwrap();
        write(root.join("src/lib.rs"), "pub fn ok() {}").unwrap();
        write(root.join("src/lib_test.rs"), "#[test] fn ok() {}").unwrap();

        let (project, summary) = add_project(&root, &registry).unwrap();
        let (again, _) = add_project(&root, &registry).unwrap();
        let projects = list_projects(&registry).unwrap();

        assert_eq!(project.id, again.id);
        assert_eq!(projects.len(), 1);
        assert_eq!(projects[0].path, summary.root);
        assert_eq!(projects[0].source_count, 1);
        assert_eq!(projects[0].test_count, 1);
        assert!(projects[0].context_brief.contains("关键文件"));

        let _ = fs::remove_dir_all(&root);
        let _ = fs::remove_file(&registry);
    }

    #[test]
    fn remove_project_deletes_registry_entry_without_touching_project_files() {
        let root = std::env::temp_dir().join("workflow_client_registry_remove_project");
        let registry = std::env::temp_dir().join("workflow_client_registry_remove_project.json");
        let _ = fs::remove_dir_all(&root);
        let _ = fs::remove_file(&registry);
        create_dir_all(root.join("src")).unwrap();
        write(root.join("README.md"), "# client").unwrap();
        write(root.join("src/main.ts"), "export const ok = true;").unwrap();

        let (project, _) = add_project(&root, &registry).unwrap();
        let projects = remove_project(&project.id, &registry).unwrap();

        assert!(projects.is_empty());
        assert!(root.join("README.md").exists());

        let _ = fs::remove_dir_all(&root);
        let _ = fs::remove_file(&registry);
    }
}

