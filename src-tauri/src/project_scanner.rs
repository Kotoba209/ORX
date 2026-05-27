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
    "ORX.md",
    "AGENTS.md",
    "README.md",
    "package.json",
    "package-lock.json",
    "pnpm-lock.yaml",
    "yarn.lock",
    "Cargo.toml",
    "src-tauri/Cargo.toml",
    "src-tauri/tauri.conf.json",
    "tauri.conf.json",
    "vite.config.ts",
    "vite.config.js",
    "tsconfig.json",
    "pyproject.toml",
    "requirements.txt",
    "go.mod",
    "pom.xml",
    "build.gradle",
    "Dockerfile",
    "docker-compose.yml",
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
    pub project_profile: ProjectProfile,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct ProjectProfile {
    pub detected_stack: Vec<String>,
    pub manifest_files: Vec<String>,
    pub convention_file: Option<String>,
    pub supplemental_convention_files: Vec<String>,
    pub architecture_hints: Vec<String>,
    pub suggested_commands: Vec<String>,
    pub convention_excerpt: Option<String>,
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

    let project_profile = build_project_profile(&canonical, &files);
    let context_brief = build_context_brief(source_count, test_count, &important_files, &project_profile);

    Ok(ProjectSummary {
        root: canonical.to_string_lossy().to_string(),
        files,
        source_count,
        test_count,
        important_files,
        context_brief,
        project_profile,
    })
}

fn build_project_profile(root: &Path, files: &[ProjectFile]) -> ProjectProfile {
    let paths = files.iter().map(|file| file.path.as_str()).collect::<Vec<_>>();
    let manifest_files = files
        .iter()
        .filter(|file| IMPORTANT_FILES.iter().any(|name| file.path == *name || file.path.ends_with(&format!("/{name}"))))
        .map(|file| file.path.clone())
        .collect::<Vec<_>>();
    let convention_file = if paths.contains(&"ORX.md") {
        Some("ORX.md".to_string())
    } else {
        None
    };
    let supplemental_convention_files = ["AGENTS.md", "README.md"]
        .iter()
        .filter(|path| paths.contains(path))
        .map(|path| path.to_string())
        .collect::<Vec<_>>();

    let mut detected_stack = Vec::new();
    push_if(&mut detected_stack, paths.iter().any(|path| path.ends_with(".ts") || path.ends_with(".tsx")), "TypeScript");
    push_if(&mut detected_stack, paths.iter().any(|path| path.ends_with(".js") || path.ends_with(".jsx")), "JavaScript");
    push_if(&mut detected_stack, paths.iter().any(|path| *path == "vite.config.ts" || *path == "vite.config.js"), "Vite");
    push_if(&mut detected_stack, paths.iter().any(|path| path.starts_with("src-tauri/") || *path == "src-tauri/tauri.conf.json"), "Tauri");
    push_if(&mut detected_stack, paths.iter().any(|path| path.ends_with(".rs") || *path == "Cargo.toml" || *path == "src-tauri/Cargo.toml"), "Rust");
    push_if(&mut detected_stack, paths.iter().any(|path| path.ends_with(".py") || *path == "pyproject.toml" || *path == "requirements.txt"), "Python");
    push_if(&mut detected_stack, paths.iter().any(|path| *path == "go.mod"), "Go");
    push_if(&mut detected_stack, paths.iter().any(|path| *path == "pom.xml" || *path == "build.gradle"), "Java");

    let mut suggested_commands = Vec::new();
    if paths.contains(&"package.json") {
        for command in package_script_commands(root) {
            push_unique(&mut suggested_commands, &command);
        }
    }
    if paths.contains(&"src-tauri/tauri.conf.json") || paths.contains(&"src-tauri/Cargo.toml") {
        push_unique(&mut suggested_commands, "npm run tauri -- build");
    }
    if paths.contains(&"Cargo.toml") || paths.contains(&"src-tauri/Cargo.toml") {
        push_unique(&mut suggested_commands, "cargo test");
    }

    let mut architecture_hints = Vec::new();
    if paths.iter().any(|path| path.starts_with("src-tauri/")) {
        architecture_hints.push("src-tauri/ 存放 Tauri/Rust 后端命令与本地能力。".to_string());
    }
    if paths.iter().any(|path| path.starts_with("src/")) {
        architecture_hints.push("src/ 存放前端应用源码。".to_string());
    }

    let convention_excerpt = convention_file
        .as_deref()
        .or_else(|| if paths.contains(&"AGENTS.md") { Some("AGENTS.md") } else { None })
        .and_then(|relative| read_excerpt(root, relative));

    ProjectProfile {
        detected_stack,
        manifest_files,
        convention_file,
        supplemental_convention_files,
        architecture_hints,
        suggested_commands,
        convention_excerpt,
    }
}

fn build_context_brief(source_count: usize, test_count: usize, important_files: &[String], profile: &ProjectProfile) -> String {
    let key_files = if important_files.is_empty() { "未发现".to_string() } else { important_files.join(", ") };
    let stack = if profile.detected_stack.is_empty() { "未识别".to_string() } else { profile.detected_stack.join(", ") };
    let commands = if profile.suggested_commands.is_empty() { "未推断".to_string() } else { profile.suggested_commands.join(", ") };
    let convention = profile.convention_file.as_deref().unwrap_or("未发现");
    let excerpt = profile
        .convention_excerpt
        .as_ref()
        .map(|text| format!(" 约定摘要：{}", compact_line(text)))
        .unwrap_or_default();
    format!(
        "项目包含 {source_count} 个源码文件、{test_count} 个测试文件，关键文件：{key_files}。\n项目画像：技术栈 {stack}；主约定文件 {convention}；建议命令 {commands}。{excerpt}"
    )
}

fn package_script_commands(root: &Path) -> Vec<String> {
    let Ok(content) = fs::read_to_string(root.join("package.json")) else {
        return Vec::new();
    };
    ["workflow:selftest", "test", "build", "dev"]
        .iter()
        .filter(|script| content.contains(&format!("\"{script}\"")))
        .map(|script| format!("npm run {script}"))
        .collect()
}

fn read_excerpt(root: &Path, relative: &str) -> Option<String> {
    let content = fs::read_to_string(root.join(relative)).ok()?;
    let compact = content
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join(" ");
    Some(compact.chars().take(800).collect())
}

fn compact_line(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn push_if(items: &mut Vec<String>, condition: bool, value: &str) {
    if condition {
        push_unique(items, value);
    }
}

fn push_unique(items: &mut Vec<String>, value: &str) {
    if !items.iter().any(|item| item == value) {
        items.push(value.to_string());
    }
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

    #[test]
    fn scan_project_builds_project_profile_from_conventions_and_manifests() {
        let root = std::env::temp_dir().join("workflow_client_scan_project_profile");
        let _ = fs::remove_dir_all(&root);
        create_dir_all(root.join("src-tauri/src")).unwrap();
        create_dir_all(root.join("src")).unwrap();
        write(root.join("ORX.md"), "# ORX\n\n项目主约定。").unwrap();
        write(root.join("AGENTS.md"), "# Agents\n\nAgent 补充约定。").unwrap();
        write(root.join("package.json"), r#"{"scripts":{"dev":"vite","build":"tsc && vite build","workflow:selftest":"node --test"}}"#).unwrap();
        write(root.join("vite.config.ts"), "export default {}").unwrap();
        write(root.join("src-tauri/tauri.conf.json"), "{}").unwrap();
        write(root.join("src-tauri/Cargo.toml"), "[package]\nname='demo'").unwrap();
        write(root.join("src/App.tsx"), "export const App = () => null;").unwrap();

        let summary = scan_project(&root).unwrap();

        assert_eq!(summary.project_profile.convention_file.as_deref(), Some("ORX.md"));
        assert!(summary.project_profile.supplemental_convention_files.contains(&"AGENTS.md".to_string()));
        assert!(summary.project_profile.detected_stack.contains(&"TypeScript".to_string()));
        assert!(summary.project_profile.detected_stack.contains(&"Vite".to_string()));
        assert!(summary.project_profile.detected_stack.contains(&"Tauri".to_string()));
        assert!(summary.project_profile.detected_stack.contains(&"Rust".to_string()));
        assert!(summary.project_profile.suggested_commands.contains(&"npm run build".to_string()));
        assert!(summary.project_profile.suggested_commands.contains(&"npm run workflow:selftest".to_string()));
        assert!(summary.project_profile.suggested_commands.contains(&"npm run tauri -- build".to_string()));
        assert!(summary.context_brief.contains("项目画像"));
        assert!(summary.context_brief.contains("项目主约定"));

        let _ = fs::remove_dir_all(&root);
    }
}

