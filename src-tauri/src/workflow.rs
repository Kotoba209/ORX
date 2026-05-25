use serde::Serialize;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub enum WorkflowStage {
    Intake,
    Clarification,
    ScenarioRehearsal,
    BoundaryProbe,
    CodeReview,
    TaskSplit,
    TestPlan,
    Retrospective,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct WorkflowStep {
    pub stage: WorkflowStage,
    pub owner: String,
    pub instruction: String,
    pub skill_ids: Vec<String>,
    pub interaction: String,
    pub exit_condition: String,
}

pub fn default_workflow_steps() -> Vec<WorkflowStep> {
    vec![
        workflow_step(WorkflowStage::Intake, "PM Agent", "收集需求、项目上下文和用户约束。"),
        WorkflowStep {
            stage: WorkflowStage::Clarification,
            owner: "PD Agent".into(),
            instruction: "使用 Trellis 需求澄清法连续追问用户，直到目标用户、核心场景、边界条件、验收标准和不做范围足够明确。一次只问 1-3 个关键问题；需求足够明确时必须明确写出“需求已明确”。".into(),
            skill_ids: vec!["trellis".into()],
            interaction: "multi-turn".into(),
            exit_condition: "requirements_ready".into(),
        },
        workflow_step(WorkflowStage::ScenarioRehearsal, "PD Agent", "输出可预览的需求产品文档，包含场景预演、主路径、异常路径和验收标准。"),
        workflow_step(WorkflowStage::BoundaryProbe, "PD Agent", "做边界探测，识别环境依赖、输入输出、失败条件和打回条件。"),
        workflow_step(WorkflowStage::TaskSplit, "DEV Agent", "拆分接口、数据流、实现任务和测试任务。"),
        workflow_step(WorkflowStage::CodeReview, "ARCH Agent", "对 DEV 产物做代码审查、红蓝质询、架构风险和非功能边界评估，输出可预览 CR 报告。"),
        workflow_step(WorkflowStage::TestPlan, "QA Agent", "优先设计集成测试和端到端测试，记录执行证据。"),
        workflow_step(WorkflowStage::Retrospective, "PM Agent", "失败归因、追责复盘，并沉淀到 AI 工作宪法。每个任务流程处理完后，总结归纳本轮结论、各节点独立完成情况、交接结果、阻塞/打回点、关键证据和下一轮改进项。"),
    ]
}

fn workflow_step(stage: WorkflowStage, owner: &str, instruction: &str) -> WorkflowStep {
    WorkflowStep {
        stage,
        owner: owner.into(),
        instruction: instruction.into(),
        skill_ids: Vec::new(),
        interaction: "single-turn".into(),
        exit_condition: "node_complete".into(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_workflow_covers_probe_challenge_tests_and_retrospective() {
        let instructions = default_workflow_steps()
            .into_iter()
            .map(|step| step.instruction)
            .collect::<Vec<_>>()
            .join("\n");

        assert!(instructions.contains("场景预演"));
        assert!(instructions.contains("Trellis"));
        assert!(instructions.contains("边界探测"));
        assert!(instructions.contains("代码审查"));
        assert!(instructions.contains("集成测试"));
        assert!(instructions.contains("AI 工作宪法"));
        assert!(instructions.contains("每个任务流程处理完后"));
        assert!(instructions.contains("各节点独立完成情况"));
    }

    #[test]
    fn default_workflow_uses_distinct_role_codes() {
        let owners = default_workflow_steps()
            .into_iter()
            .map(|step| step.owner)
            .collect::<Vec<_>>()
            .join("\n");

        assert!(owners.contains("PM Agent"));
        assert!(owners.contains("PD Agent"));
        assert!(owners.contains("DEV Agent"));
        assert!(owners.contains("ARCH Agent"));
        assert!(owners.contains("QA Agent"));
        assert!(!owners.contains("管理员 Agent"));
    }

    #[test]
    fn default_workflow_runs_arch_review_after_dev_before_qa() {
        let stages = default_workflow_steps()
            .into_iter()
            .map(|step| format!("{:?}", step.stage))
            .collect::<Vec<_>>();

        let dev = stages.iter().position(|stage| stage == "TaskSplit").unwrap();
        let clarification = stages.iter().position(|stage| stage == "Clarification").unwrap();
        let scenario = stages.iter().position(|stage| stage == "ScenarioRehearsal").unwrap();
        let arch = stages.iter().position(|stage| stage == "CodeReview").unwrap();
        let qa = stages.iter().position(|stage| stage == "TestPlan").unwrap();
        assert!(clarification < scenario);
        assert!(dev < arch);
        assert!(arch < qa);
    }

    #[test]
    fn default_workflow_marks_trellis_clarification_as_multi_turn() {
        let clarification = default_workflow_steps()
            .into_iter()
            .find(|step| step.stage == WorkflowStage::Clarification)
            .unwrap();

        assert_eq!(clarification.owner, "PD Agent");
        assert_eq!(clarification.skill_ids, vec!["trellis".to_string()]);
        assert_eq!(clarification.interaction, "multi-turn");
        assert_eq!(clarification.exit_condition, "requirements_ready");
    }
}
