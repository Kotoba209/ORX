use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

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
        | "workflow.recommend"
        | "workflow.draft"
        | "workflow.create"
        | "workflow.update"
        | "workflow.clone"
        | "workflow.run"
        | "skill.list"
        | "skill.attach"
        | "memory.search"
        | "file.readProjectFile" => "direct",
        "skill.detach"
        | "memory.append"
        | "memory.update"
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
        assert_eq!(orion_action_risk("workflow.run"), "direct");
        assert_eq!(orion_action_risk("release.build"), "confirm");
        assert_eq!(orion_action_risk("workflow.delete"), "strong-confirm");
        assert_eq!(orion_action_risk("git.push"), "strong-confirm");
    }
}
