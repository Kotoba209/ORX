use serde::Serialize;
use std::fs;
use std::path::Path;

const IGNORED_DIRS: &[&str] = &[
    ".git",
    "node_modules",
    "dist",
    "build",
    "target",
    ".next",
    "coverage",
    ".tauri",
];

const IMPORTANT_FILES: &[&str] = &[
    "README.md",
    "package.json",
    "Cargo.toml",
    "tauri.conf.json",
    "vite.config.ts",
    "tsconfig.json",
];

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct ProjectFile {
    pub path: String,
    pub kind: String,
    pub bytes: u64,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct ProjectSummary {
    pub root: String,
    pub files: Vec<ProjectFile>,
    pub source_count: usize,
    pub test_count: usize,
    pub important_files: Vec<String>,
    pub context_brief: String,
}

pub fn scan_project(root: impl AsRef<Path>) -> Result<ProjectSummary, String> {
    let root = root.as_ref();
    let canonical = root
        .canonicalize()
        .map_err(|error| format!("项目路径不可访问: {error}"))?;

    if !canonical.is_dir() {
        return Err("项目路径必须是目录".to_string());
    }

    let mut files = Vec::new();
    visit_dir(&canonical, &canonical, 0, &mut files)?;
    files.sort_by(|left, right| left.path.cmp(&right.path));

    let source_count = files.iter().filter(|file| file.kind == "source").count();
    let test_count = files.iter().filter(|file| file.kind == "test").count();
    let important_files = files
        .iter()
        .filter(|file| IMPORTANT_FILES.iter().any(|name| file.path.ends_with(name)))
        .map(|file| file.path.clone())
        .collect::<Vec<_>>();

    let context_brief = format!(
        "项目包含 {source_count} 个源码文件、{test_count} 个测试文件，关键文件：{}。",
        if important_files.is_empty() {
            "未发现".to_string()
        } else {
            important_files.join(", ")
        }
    );

    Ok(ProjectSummary {
        root: canonical.to_string_lossy().to_string(),
        files,
        source_count,
        test_count,
        important_files,
        context_brief,
    })
}

fn visit_dir(root: &Path, current: &Path, depth: usize, files: &mut Vec<ProjectFile>) -> Result<(), String> {
    if depth > 8 {
        return Ok(());
    }

    let entries = fs::read_dir(current).map_err(|error| format!("读取目录失败 {}: {error}", current.display()))?;
    for entry in entries {
        let entry = entry.map_err(|error| format!("读取目录项失败: {error}"))?;
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();

        if path.is_dir() {
            if IGNORED_DIRS.contains(&name.as_str()) {
                continue;
            }
            visit_dir(root, &path, depth + 1, files)?;
            continue;
        }

        let metadata = entry
            .metadata()
            .map_err(|error| format!("读取文件元数据失败 {}: {error}", path.display()))?;
        if metadata.len() > 512 * 1024 {
            continue;
        }

        let relative = relative_path(root, &path);
        files.push(ProjectFile {
            kind: classify_file(&relative),
            path: relative,
            bytes: metadata.len(),
        });
    }

    Ok(())
}

fn relative_path(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .components()
        .map(|component| component.as_os_str().to_string_lossy().to_string())
        .collect::<Vec<_>>()
        .join("/")
}

fn classify_file(relative: &str) -> String {
    let lower = relative.to_lowercase();
    if lower.contains("test") || lower.contains("spec") {
        return "test".to_string();
    }
    if lower.ends_with(".rs")
        || lower.ends_with(".ts")
        || lower.ends_with(".tsx")
        || lower.ends_with(".js")
        || lower.ends_with(".jsx")
        || lower.ends_with(".vue")
        || lower.ends_with(".svelte")
        || lower.ends_with(".py")
        || lower.ends_with(".java")
    {
        return "source".to_string();
    }
    "support".to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::{create_dir_all, write};

    #[test]
    fn scan_project_skips_generated_directories() {
        let root = std::env::temp_dir().join("workflow_client_scan_project_skips_generated_directories");
        let _ = fs::remove_dir_all(&root);
        create_dir_all(root.join("src")).unwrap();
        create_dir_all(root.join("node_modules/pkg")).unwrap();
        create_dir_all(root.join(".git/objects")).unwrap();
        write(root.join("src/main.ts"), "export const ok = true;").unwrap();
        write(root.join("src/main.test.ts"), "test('ok', () => {});").unwrap();
        write(root.join("node_modules/pkg/index.js"), "ignored").unwrap();
        write(root.join("README.md"), "# demo").unwrap();

        let summary = scan_project(&root).unwrap();

        assert!(summary.files.iter().any(|file| file.path == "src/main.ts"));
        assert!(summary.files.iter().any(|file| file.path == "src/main.test.ts"));
        assert!(!summary.files.iter().any(|file| file.path.contains("node_modules")));
        assert!(!summary.files.iter().any(|file| file.path.contains(".git")));
        assert_eq!(summary.source_count, 1);
        assert_eq!(summary.test_count, 1);
        assert!(summary.important_files.contains(&"README.md".to_string()));

        let _ = fs::remove_dir_all(&root);
    }
}

