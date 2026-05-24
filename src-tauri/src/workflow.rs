use serde::Serialize;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub enum WorkflowStage {
    Intake,
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
}

pub fn default_workflow_steps() -> Vec<WorkflowStep> {
    vec![
        WorkflowStep { stage: WorkflowStage::Intake, owner: "PM Agent".into(), instruction: "收集需求、项目上下文和用户约束。".into() },
        WorkflowStep { stage: WorkflowStage::ScenarioRehearsal, owner: "PD Agent".into(), instruction: "输出可预览的需求产品文档，包含场景预演、主路径、异常路径和验收标准。".into() },
        WorkflowStep { stage: WorkflowStage::BoundaryProbe, owner: "PD Agent".into(), instruction: "做边界探测，识别环境依赖、输入输出、失败条件和打回条件。".into() },
        WorkflowStep { stage: WorkflowStage::TaskSplit, owner: "DEV Agent".into(), instruction: "拆分接口、数据流、实现任务和测试任务。".into() },
        WorkflowStep { stage: WorkflowStage::CodeReview, owner: "ARCH Agent".into(), instruction: "对 DEV 产物做代码审查、红蓝质询、架构风险和非功能边界评估，输出可预览 CR 报告。".into() },
        WorkflowStep { stage: WorkflowStage::TestPlan, owner: "QA Agent".into(), instruction: "优先设计集成测试和端到端测试，记录执行证据。".into() },
        WorkflowStep { stage: WorkflowStage::Retrospective, owner: "PM Agent".into(), instruction: "失败归因、追责复盘，并沉淀到 AI 工作宪法。每个任务流程处理完后，总结归纳本轮结论、各节点独立完成情况、交接结果、阻塞/打回点、关键证据和下一轮改进项。".into() },
    ]
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
        let arch = stages.iter().position(|stage| stage == "CodeReview").unwrap();
        let qa = stages.iter().position(|stage| stage == "TestPlan").unwrap();
        assert!(dev < arch);
        assert!(arch < qa);
    }
}
