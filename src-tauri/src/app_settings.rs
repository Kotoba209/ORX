use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AppSettings {
    #[serde(default)]
    pub artifact_output_dir: String,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self { artifact_output_dir: String::new() }
    }
}

pub fn default_settings_path() -> Result<PathBuf, String> {
    let base = std::env::var_os("APPDATA")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("USERPROFILE").map(PathBuf::from))
        .ok_or_else(|| "无法定位用户配置目录".to_string())?;
    Ok(base.join("WorkflowManagerClient").join("settings.json"))
}

pub fn load_settings(path: impl AsRef<Path>) -> Result<AppSettings, String> {
    let path = path.as_ref();
    if !path.exists() {
        return Ok(AppSettings::default());
    }
    let content = fs::read_to_string(path).map_err(|error| format!("读取设置失败: {error}"))?;
    serde_json::from_str(&content).map_err(|error| format!("解析设置失败: {error}"))
}

pub fn save_settings(path: impl AsRef<Path>, settings: AppSettings) -> Result<AppSettings, String> {
    let normalized = AppSettings {
        artifact_output_dir: settings.artifact_output_dir.trim().trim_end_matches(['\\', '/']).to_string(),
    };
    if !normalized.artifact_output_dir.is_empty() {
        let target = PathBuf::from(&normalized.artifact_output_dir);
        if target.exists() && !target.is_dir() {
            return Err("产物存放路径必须是文件夹".to_string());
        }
        fs::create_dir_all(&target).map_err(|error| format!("创建产物存放目录失败: {error}"))?;
    }
    write_settings(path.as_ref(), &normalized)?;
    Ok(normalized)
}

fn write_settings(path: &Path, settings: &AppSettings) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| format!("创建设置目录失败: {error}"))?;
    }
    let content = serde_json::to_string_pretty(settings).map_err(|error| format!("序列化设置失败: {error}"))?;
    fs::write(path, content).map_err(|error| format!("写入设置失败: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn settings_persist_artifact_output_dir() {
        let path = std::env::temp_dir().join("workflow_client_settings_test.json");
        let output_dir = std::env::temp_dir().join("workflow_client_settings_artifacts");
        let _ = fs::remove_file(&path);
        let _ = fs::remove_dir_all(&output_dir);

        let saved = save_settings(
            &path,
            AppSettings { artifact_output_dir: format!("{}/", output_dir.display()) },
        )
        .unwrap();
        let loaded = load_settings(&path).unwrap();

        assert_eq!(saved.artifact_output_dir, output_dir.display().to_string());
        assert_eq!(loaded, saved);
        assert!(output_dir.exists());

        let _ = fs::remove_file(&path);
        let _ = fs::remove_dir_all(&output_dir);
    }
}
