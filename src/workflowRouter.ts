import type { WorkflowDefinition } from "./workflowConfig.ts";

export type WorkflowRouteConfidence = "high" | "medium" | "low";

export type WorkflowRouteDecision = {
  workflow: WorkflowDefinition;
  confidence: WorkflowRouteConfidence;
  reason: string;
  matchedKind: "bug-fix" | "test-only" | "full-development" | "current";
};

const bugFixPattern = /(bug|缺陷|报错|错误|异常|失败|修复|fix|500|崩溃|回归)/i;
const testOnlyPattern = /(只.*测试|仅.*测试|补.*测试|测试计划|集成测试|端到端|e2e|回归测试|test only)/i;
const fullDevelopmentPattern = /(新增|创建|实现|开发|页面|功能|需求|prd|表单|组件|生成)/i;

export function recommendWorkflowForTask(task: string, workflows: WorkflowDefinition[], currentWorkflowId?: string): WorkflowRouteDecision {
  const normalizedTask = task.trim();
  const current = workflowById(workflows, currentWorkflowId) ?? defaultWorkflow(workflows);
  const bugFix = workflowById(workflows, "bug-fix");
  const testOnly = workflowById(workflows, "test-only");
  const full = workflowById(workflows, "full-development") ?? current ?? workflows[0];

  if (testOnly && testOnlyPattern.test(normalizedTask) && !bugFixPattern.test(normalizedTask.replace(/回归测试/g, ""))) {
    return {
      workflow: testOnly,
      confidence: "high",
      matchedKind: "test-only",
      reason: "任务主要要求测试产出，直接进入测试计划、执行记录和复盘。",
    };
  }

  if (bugFix && bugFixPattern.test(normalizedTask)) {
    return {
      workflow: bugFix,
      confidence: "high",
      matchedKind: "bug-fix",
      reason: "任务更像缺陷修复，跳过完整 PRD，聚焦复现、修复、CR 和测试。",
    };
  }

  if (fullDevelopmentPattern.test(normalizedTask)) {
    return {
      workflow: full,
      confidence: "medium",
      matchedKind: "full-development",
      reason: "任务包含新功能或实现诉求，保留完整需求、边界、开发、CR 和测试闭环。",
    };
  }

  return {
    workflow: current ?? full,
    confidence: "low",
    matchedKind: "current",
    reason: "任务类型不够明确，沿用当前选择的工作流，避免过度自动切换。",
  };
}

function workflowById(workflows: WorkflowDefinition[], id?: string) {
  if (!id) return undefined;
  return workflows.find((workflow) => workflow.id === id);
}

function defaultWorkflow(workflows: WorkflowDefinition[]) {
  return workflows.find((workflow) => workflow.isDefault);
}
