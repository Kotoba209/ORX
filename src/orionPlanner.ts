import type { WorkflowDefinition } from "./workflowConfig.ts";
import type { WorkflowStep } from "./workflowState.ts";
import { createOrionAction, type OrionAction } from "./orionActions.ts";

export function draftOrionWorkflow(task: string): WorkflowDefinition {
  if (/(bug|缺陷|报错|错误|异常|失败|修复|fix|崩溃)/i.test(task)) {
    return {
      id: `orion-bug-investigation-${Date.now()}`,
      name: "Bug Investigation",
      description: "由 ORION 根据用户目标生成的 Bug 排查工作流。",
      steps: [
        step("Intake", "PM Agent", "收集 bug 现象、影响范围、环境和用户约束。"),
        {
          ...step("BugClarification", "PD Agent", "使用 Trellis 澄清复现路径、期望行为、实际行为、边界条件和验收标准。"),
          skill_ids: ["trellis"],
          interaction: "multi-turn",
          exit_condition: "requirements_ready",
        },
        { ...step("BugTrace", "DEV Agent", "定位可能根因，给出修复方案和需要验证的代码路径。"), skill_ids: ["bug-investigation"] },
        { ...step("ReproductionTest", "QA Agent", "设计复现测试、回归路径和执行证据。"), skill_ids: ["test-planning"] },
        step("Retrospective", "PM Agent", "总结 bug 原因、修复证据、残留风险和可沉淀规则。"),
      ],
    };
  }

  return {
    id: `orion-workflow-${Date.now()}`,
    name: "ORION Custom Workflow",
    description: "由 ORION 根据用户目标生成的自定义工作流。",
    steps: [
      step("Intake", "PM Agent", "收集任务目标、项目上下文和约束。"),
      {
        ...step("Clarification", "PD Agent", "使用 Trellis 澄清目标用户、核心场景、边界和验收标准。"),
        skill_ids: ["trellis"],
        interaction: "multi-turn",
        exit_condition: "requirements_ready",
      },
      step("TaskSplit", "DEV Agent", "拆分实现任务、风险和验证路径。"),
      step("Retrospective", "PM Agent", "总结执行结果、阻塞点和下一步。"),
    ],
  };
}

export function attachCapabilityToStep(workflow: WorkflowDefinition, stage: string, capability: string): WorkflowDefinition {
  return {
    ...workflow,
    steps: workflow.steps.map((workflowStep) => {
      if (workflowStep.stage !== stage) return { ...workflowStep };
      const skills = new Set(workflowStep.skill_ids ?? []);
      skills.add(capability);
      return { ...workflowStep, skill_ids: Array.from(skills) };
    }),
  };
}

export function createOrionActionPlan(workflow: WorkflowDefinition): OrionAction[] {
  const skillActions = workflow.steps
    .flatMap((workflowStep) => (workflowStep.skill_ids ?? []).map((skill) => createOrionAction(
      "skill.attach",
      `挂载 ${skill}`,
      `给 ${workflowStep.owner} / ${workflowStep.stage} 挂载 ${skill} capability。`,
      { workflow_id: workflow.id, stage: workflowStep.stage, skill },
    )));

  return [
    createOrionAction("workflow.create", "保存工作流", `保存 ORION 工作流：${workflow.name}`, { workflow }),
    ...skillActions,
    createOrionAction("workflow.run", "运行工作流", `启动 ORCH 执行：${workflow.name}`, { workflow_id: workflow.id }),
  ];
}

function step(stage: string, owner: string, instruction: string): WorkflowStep {
  return {
    stage,
    owner,
    instruction,
    enabled: true,
    approval: "none",
    interaction: "single-turn",
    exit_condition: "node_complete",
  };
}
