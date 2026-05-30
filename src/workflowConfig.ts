import { defaultSteps, type WorkflowStep } from "./workflowState.ts";

export type WorkflowDefinition = {
  id: string;
  name: string;
  description: string;
  steps: WorkflowStep[];
  isDefault?: boolean;
};

function cloneSteps(steps: WorkflowStep[]) {
  return steps.map((step) => ({ ...step }));
}

function defaultCompletionCriteria(stage: string) {
  return defaultSteps.find((step) => step.stage === stage)?.completion_criteria;
}

function uniqueWorkflowId(workflows: WorkflowDefinition[], baseId: string) {
  const existing = new Set(workflows.map((workflow) => workflow.id));
  if (!existing.has(baseId)) return baseId;
  let index = 2;
  while (existing.has(`${baseId}-${index}`)) index += 1;
  return `${baseId}-${index}`;
}

function normalizeDefaults(workflows: WorkflowDefinition[], defaultId?: string | null) {
  if (!defaultId) return workflows.map((workflow) => ({ ...workflow, isDefault: false }));
  const targetId = workflows.some((workflow) => workflow.id === defaultId) ? defaultId : "";
  return workflows.map((workflow) => ({ ...workflow, isDefault: workflow.id === targetId }));
}

export function migrateWorkflowDefinition(workflow: WorkflowDefinition): WorkflowDefinition {
  const steps = cloneSteps(workflow.steps);
  const hasTaskSplit = steps.some((step) => step.stage === "TaskSplit" && step.owner === "DEV Agent");
  const hasImplementation = steps.some((step) => step.stage === "Implementation" && step.owner === "DEV Agent");
  if (hasTaskSplit && !hasImplementation) {
    const taskSplitIndex = steps.findIndex((step) => step.stage === "TaskSplit" && step.owner === "DEV Agent");
    steps.splice(taskSplitIndex + 1, 0, {
      stage: "Implementation",
      owner: "DEV Agent",
      instruction: "根据上游需求和任务拆分实现代码。代码类任务必须输出带 FILE 标记的完整非空代码块，ORCH 会同步写入当前项目路径。",
      enabled: true,
      approval: "auto",
      rollback_target: "Implementation",
      completion_criteria: defaultCompletionCriteria("Implementation"),
    });
  }
  return {
    ...workflow,
    steps: steps.map((step) => {
      if ((step.stage === "CodeReview" || step.stage === "TestPlan") && steps.some((item) => item.stage === "Implementation")) {
        return { ...step, rollback_target: "Implementation", completion_criteria: step.completion_criteria ?? defaultCompletionCriteria(step.stage) };
      }
      return { ...step, completion_criteria: step.completion_criteria ?? defaultCompletionCriteria(step.stage) };
    }),
  };
}

export function createDefaultWorkflows(): WorkflowDefinition[] {
  const fullSteps = cloneSteps(defaultSteps);
  const bugFixSteps = cloneSteps(defaultSteps)
    .filter((step) => ["Intake", "BoundaryProbe", "TaskSplit", "Implementation", "CodeReview", "TestPlan", "Retrospective"].includes(step.stage))
    .map((step) => step.stage === "TaskSplit" ? { ...step, approval: "auto" as const, rollback_target: "TaskSplit" } : step);
  const testOnlySteps = cloneSteps(defaultSteps)
    .filter((step) => ["Intake", "TestPlan", "Retrospective"].includes(step.stage))
    .map((step) => ({ ...step, approval: "none" as const, rollback_target: step.stage === "TestPlan" ? "TestPlan" : step.rollback_target }));

  return normalizeDefaults([
    {
      id: "full-development",
      name: "完整需求开发流程",
      description: "需求澄清、场景预演、边界探测、开发、CR、测试和复盘闭环。",
      steps: fullSteps,
    },
    {
      id: "bug-fix",
      name: "Bug 修复流程",
      description: "跳过产品文档，聚焦问题复现、修复、CR、测试和复盘。",
      steps: bugFixSteps,
    },
    {
      id: "test-only",
      name: "仅测试流程",
      description: "用于已有实现的测试计划、执行记录和复盘。",
      steps: testOnlySteps,
    },
  ], null);
}

export function getDefaultWorkflow(workflows: WorkflowDefinition[]) {
  return workflows.find((workflow) => workflow.isDefault);
}

export function updateWorkflow(workflows: WorkflowDefinition[], workflowId: string, patch: Partial<Omit<WorkflowDefinition, "id" | "steps">>) {
  return workflows.map((workflow) => workflow.id === workflowId ? { ...workflow, ...patch } : workflow);
}

export function updateWorkflowSteps(workflows: WorkflowDefinition[], workflowId: string, steps: WorkflowStep[]) {
  return workflows.map((workflow) => workflow.id === workflowId ? { ...workflow, steps: cloneSteps(steps) } : workflow);
}

export function addWorkflow(workflows: WorkflowDefinition[]) {
  const id = uniqueWorkflowId(workflows, "custom-workflow");
  const workflow: WorkflowDefinition = {
    id,
    name: "自定义流程",
    description: "从空白流程开始配置节点、负责人、审批和打回规则。",
    steps: [
      { stage: "Intake", owner: "PM Agent", instruction: "收集任务目标、项目上下文和约束。", enabled: true, approval: "none" },
    ],
  };
  return { workflows: [...workflows, workflow], activeWorkflowId: id };
}

export function duplicateWorkflow(workflows: WorkflowDefinition[], workflowId: string) {
  const source = workflows.find((workflow) => workflow.id === workflowId) ?? getDefaultWorkflow(workflows) ?? workflows[0];
  if (!source) return addWorkflow(workflows);
  const id = uniqueWorkflowId(workflows, `${source.id}-copy`);
  const workflow: WorkflowDefinition = {
    ...source,
    id,
    name: `${source.name} Copy`,
    isDefault: false,
    steps: cloneSteps(source.steps),
  };
  return { workflows: [...workflows, workflow], activeWorkflowId: id };
}

export function deleteWorkflow(workflows: WorkflowDefinition[], workflowId: string, activeWorkflowId: string) {
  const target = workflows.find((workflow) => workflow.id === workflowId);
  if (!target || target.isDefault || workflows.length <= 1) {
    return { workflows, activeWorkflowId: target?.isDefault ? target.id : activeWorkflowId };
  }
  const nextWorkflows = workflows.filter((workflow) => workflow.id !== workflowId);
  const nextActive = activeWorkflowId === workflowId ? getDefaultWorkflow(nextWorkflows)?.id ?? nextWorkflows[0]?.id ?? "" : activeWorkflowId;
  return { workflows: nextWorkflows, activeWorkflowId: nextActive };
}

export function setDefaultWorkflow(workflows: WorkflowDefinition[], workflowId: string) {
  return normalizeDefaults(workflows, workflowId);
}
