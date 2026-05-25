use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct MemoryRule {
    pub id: String,
    pub title: String,
    pub body: String,
    pub tags: Vec<String>,
    pub scope: String,
    pub source_task_id: String,
    pub created_at: u64,
    pub hits: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct MemoryRuleSnapshot {
    pub rules: Vec<MemoryRule>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct MemoryRuleInput {
    pub title: String,
    pub body: String,
    pub tags: Vec<String>,
    pub scope: String,
    pub source_task_id: String,
}

pub fn default_memory_rules_path() -> Result<PathBuf, String> {
    let base = std::env::var_os("APPDATA")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("USERPROFILE").map(PathBuf::from))
        .ok_or_else(|| "无法定位用户配置目录".to_string())?;
    Ok(base.join("ORX").join("memory_rules.json"))
}

pub fn load_memory_rules(path: impl AsRef<Path>) -> Result<MemoryRuleSnapshot, String> {
    let path = path.as_ref();
    if !path.exists() {
        return Ok(MemoryRuleSnapshot { rules: Vec::new() });
    }
    let content = fs::read_to_string(path).map_err(|error| format!("读取长期记忆规则失败: {error}"))?;
    serde_json::from_str(&content).map_err(|error| format!("解析长期记忆规则失败: {error}"))
}

pub fn save_memory_rules(path: impl AsRef<Path>, input: MemoryRuleSnapshot) -> Result<MemoryRuleSnapshot, String> {
    let path = path.as_ref();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| format!("创建长期记忆目录失败: {error}"))?;
    }
    let normalized = MemoryRuleSnapshot {
        rules: input.rules.into_iter().map(normalize_rule).collect(),
    };
    let content = serde_json::to_string_pretty(&normalized).map_err(|error| format!("序列化长期记忆规则失败: {error}"))?;
    fs::write(path, content).map_err(|error| format!("写入长期记忆规则失败: {error}"))?;
    Ok(normalized)
}

pub fn append_memory_rule(path: impl AsRef<Path>, input: MemoryRuleInput) -> Result<MemoryRuleSnapshot, String> {
    validate_rule_input(&input)?;
    let path = path.as_ref();
    let mut snapshot = load_memory_rules(path)?;
    let now = current_millis();
    let id = unique_rule_id(now, &snapshot.rules);
    snapshot.rules.push(MemoryRule {
        id,
        title: input.title.trim().to_string(),
        body: input.body.trim().to_string(),
        tags: normalize_tags(input.tags),
        scope: normalize_scope(&input.scope),
        source_task_id: input.source_task_id.trim().to_string(),
        created_at: now,
        hits: 0,
    });
    save_memory_rules(path, snapshot)
}

fn normalize_rule(rule: MemoryRule) -> MemoryRule {
    MemoryRule {
        id: rule.id.trim().to_string(),
        title: rule.title.trim().to_string(),
        body: rule.body.trim().to_string(),
        tags: normalize_tags(rule.tags),
        scope: normalize_scope(&rule.scope),
        source_task_id: rule.source_task_id.trim().to_string(),
        created_at: rule.created_at,
        hits: rule.hits,
    }
}

fn validate_rule_input(input: &MemoryRuleInput) -> Result<(), String> {
    if input.title.trim().is_empty() {
        return Err("规则标题不能为空".to_string());
    }
    if input.body.trim().is_empty() {
        return Err("规则内容不能为空".to_string());
    }
    Ok(())
}

fn normalize_scope(scope: &str) -> String {
    if scope.trim() == "project" {
        "project".to_string()
    } else {
        "global".to_string()
    }
}

fn normalize_tags(tags: Vec<String>) -> Vec<String> {
    let mut normalized = tags
        .into_iter()
        .map(|tag| tag.trim().to_ascii_lowercase())
        .filter(|tag| !tag.is_empty())
        .collect::<Vec<_>>();
    normalized.sort();
    normalized.dedup();
    normalized
}

fn current_millis() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as u64
}

fn unique_rule_id(now: u64, rules: &[MemoryRule]) -> String {
    let base = format!("rule-{now}");
    if !rules.iter().any(|rule| rule.id == base) {
        return base;
    }
    let mut index = 2;
    loop {
        let candidate = format!("{base}-{index}");
        if !rules.iter().any(|rule| rule.id == candidate) {
            return candidate;
        }
        index += 1;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn memory_rules_start_empty_then_persist() {
        let path = std::env::temp_dir().join("orx_memory_rules_empty_then_persist.json");
        let _ = fs::remove_file(&path);

        let empty = load_memory_rules(&path).unwrap();
        assert!(empty.rules.is_empty());

        let saved = save_memory_rules(
            &path,
            MemoryRuleSnapshot {
                rules: vec![MemoryRule {
                    id: "rule-1".to_string(),
                    title: "表单字段必须回看验收标准".to_string(),
                    body: "DEV 实现表单前必须逐项核对 PD 验收标准里的必填字段。".to_string(),
                    tags: vec!["form".to_string(), "acceptance".to_string()],
                    scope: "global".to_string(),
                    source_task_id: "task-1".to_string(),
                    created_at: 1,
                    hits: 0,
                }],
            },
        )
        .unwrap();

        assert_eq!(saved.rules.len(), 1);
        let loaded = load_memory_rules(&path).unwrap();
        assert_eq!(loaded.rules[0].id, "rule-1");

        let _ = fs::remove_file(&path);
    }

    #[test]
    fn append_memory_rule_assigns_stable_metadata() {
        let path = std::env::temp_dir().join("orx_memory_rules_append.json");
        let _ = fs::remove_file(&path);

        let saved = append_memory_rule(
            &path,
            MemoryRuleInput {
                title: "Provider 超时要记录代理信息".to_string(),
                body: "模型调用超时时，诊断必须包含 endpoint、proxy 和 timeout。".to_string(),
                tags: vec!["provider".to_string()],
                scope: "global".to_string(),
                source_task_id: "task-2".to_string(),
            },
        )
        .unwrap();

        assert_eq!(saved.rules.len(), 1);
        assert!(saved.rules[0].id.starts_with("rule-"));
        assert!(saved.rules[0].created_at > 0);
        assert_eq!(saved.rules[0].hits, 0);

        let _ = fs::remove_file(&path);
    }

    #[test]
    fn append_memory_rule_keeps_ids_unique_when_called_quickly() {
        let path = std::env::temp_dir().join("orx_memory_rules_unique_ids.json");
        let _ = fs::remove_file(&path);

        append_memory_rule(
            &path,
            MemoryRuleInput {
                title: "第一条规则".to_string(),
                body: "第一条规则内容".to_string(),
                tags: vec!["dev".to_string()],
                scope: "global".to_string(),
                source_task_id: "task-1".to_string(),
            },
        )
        .unwrap();
        let saved = append_memory_rule(
            &path,
            MemoryRuleInput {
                title: "第二条规则".to_string(),
                body: "第二条规则内容".to_string(),
                tags: vec!["dev".to_string()],
                scope: "global".to_string(),
                source_task_id: "task-2".to_string(),
            },
        )
        .unwrap();

        assert_eq!(saved.rules.len(), 2);
        assert_ne!(saved.rules[0].id, saved.rules[1].id);

        let _ = fs::remove_file(&path);
    }
}
