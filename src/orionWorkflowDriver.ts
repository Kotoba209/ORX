import type { ProviderConfig } from "./orionChat.ts";
import type { WorkflowDefinition } from "./workflowConfig.ts";
import { recommendWorkflowForTask } from "./workflowRouter.ts";
import type { WorkflowStep } from "./workflowState.ts";

export type OrionWorkflowDriverChoice = "full" | "bug" | "test" | "lightweight" | "custom";

export type OrionWorkflowDriverDecision = {
  workflow: OrionWorkflowDriverChoice;
  confidence: number;
  needs_clarification: boolean;
  add_scout: boolean;
  add_arch_review: boolean;
  add_qa: boolean;
  reason: string;
};

export type OrionWorkflowDriverRunInput = {
  provider: ProviderConfig;
  owner: string;
  stage: string;
  task: string;
  upstream: string;
};

export type OrionWorkflowDriverApplication =
  | { kind: "existing"; workflow: WorkflowDefinition; reason: string }
  | { kind: "draft"; workflow: WorkflowDefinition; reason: string };

export function createOrionWorkflowDriverHandoff(
  task: string,
  decision: { kind: "run_workflow"; reason: string; workflow_id?: string },
  workflows: WorkflowDefinition[],
  activeWorkflowId: string,
) {
  const requestedWorkflow = decision.workflow_id
    ? workflows.find((workflow) => workflow.id === decision.workflow_id)
    : undefined;
  const workflow = requestedWorkflow ?? recommendWorkflowForTask(task, workflows, activeWorkflowId).workflow;
  return {
    workflow,
    reason: `model-planner run_workflow: ${decision.reason}; requested fallback=${workflow.id}`,
  };
}

export function createOrionWorkflowDriverRunInput(input: {
  provider: ProviderConfig;
  task: string;
  workflows: WorkflowDefinition[];
  projectContext?: string;
  processContext?: string;
}): OrionWorkflowDriverRunInput {
  return {
    provider: input.provider,
    owner: "ORION",
    stage: "开发流程驾驶决策",
    task: [
      "AI 是开发流程驾驶员，ORX 是驾驶舱。你负责判断这次开发任务应该走什么流程；ORX 负责确认、执行、记录和回退。",
      `用户开发任务：${input.task}`,
      "",
      "只输出 JSON，不要输出 Markdown 或解释文字。",
      "字段：workflow, confidence, needs_clarification, add_scout, add_arch_review, add_qa, reason。",
      "workflow 只能是 full, bug, test, lightweight, custom。",
      "- full：完整需求开发闭环。",
      "- bug：缺陷修复。",
      "- test：仅测试/补测试。",
      "- lightweight：小范围开发或 UI/文案/局部调整，建议裁剪流程。",
      "- custom：需要专门定制工作流。",
      "可通过 add_scout 在 DEV 前加入只读调查；add_arch_review 加架构审查；add_qa 保留测试验证；needs_clarification 表示必须先澄清。",
    ].join("\n"),
    upstream: [
      input.projectContext ? `项目上下文：${input.projectContext}` : "",
      input.processContext ? `当前流程/产物/记忆上下文：\n${input.processContext}` : "",
      `可用工作流：${input.workflows.map((workflow) => `${workflow.id}:${workflow.name}`).join("；")}`,
    ].filter(Boolean).join("\n\n"),
  };
}

export function parseOrionWorkflowDriverDecision(output: string): OrionWorkflowDriverDecision {
  const parsed = tryParseJsonObject(output) ?? {};
  return {
    workflow: normalizeWorkflowChoice(parsed.workflow),
    confidence: numberField(parsed.confidence, 0.5),
    needs_clarification: booleanField(parsed.needs_clarification),
    add_scout: booleanField(parsed.add_scout),
    add_arch_review: booleanField(parsed.add_arch_review),
    add_qa: booleanField(parsed.add_qa),
    reason: stringField(parsed.reason, "ORION 根据任务内容选择开发流程。"),
  };
}

export function applyOrionWorkflowDriverDecision(task: string, decision: OrionWorkflowDriverDecision, workflows: WorkflowDefinition[]): OrionWorkflowDriverApplication {
  if (decision.workflow === "bug") {
    const workflow = workflowById(workflows, "bug-fix");
    if (workflow) return { kind: "existing", workflow, reason: decision.reason };
  }
  if (decision.workflow === "test") {
    const workflow = workflowById(workflows, "test-only");
    if (workflow) return { kind: "existing", workflow, reason: decision.reason };
  }
  if (decision.workflow === "full") {
    const workflow = workflowById(workflows, "full-development") ?? workflows[0];
    if (workflow) return { kind: "existing", workflow, reason: decision.reason };
  }
  return { kind: "draft", workflow: createDriverDraftWorkflow(task, decision), reason: decision.reason };
}

export function formatOrionWorkflowDriverDecisionForMemory(decision: OrionWorkflowDriverDecision, options: { source?: "model" | "fallback" } = {}) {
  const prefix = options.source === "fallback" ? "fallback:" : "";
  return {
    decision: `${prefix}${decision.workflow}`,
    reason: [
      options.source === "fallback" ? "fallback" : "",
      decision.reason,
      `needs_clarification=${decision.needs_clarification}`,
      `add_scout=${decision.add_scout}`,
      `add_arch_review=${decision.add_arch_review}`,
      `add_qa=${decision.add_qa}`,
    ].filter(Boolean).join("; "),
    confidence: decision.confidence,
  };
}

function createDriverDraftWorkflow(task: string, decision: OrionWorkflowDriverDecision): WorkflowDefinition {
  const steps: WorkflowStep[] = [];
  if (decision.add_scout) {
    steps.push(step("Scout", "PM Agent", "只读调查相关文件、既有模式、约束和最小改动范围，不写代码。"));
  }
  if (decision.needs_clarification) {
    steps.push({
      ...step("Clarification", "PD Agent", "使用 Trellis 澄清目标、边界、验收标准和风险。"),
      skill_ids: ["trellis"],
      interaction: "multi-turn",
      exit_condition: "requirements_ready",
    });
  }
  steps.push(step("TaskSplit", "DEV Agent", "根据驾驶决策做最小实现拆解并执行开发。"));
  if (decision.add_arch_review) {
    steps.push(step("CodeReview", "ARCH Agent", "审查改动范围、架构风险、可维护性和回退路径。"));
  }
  if (decision.add_qa) {
    steps.push(step("TestPlan", "QA Agent", "验证改动、记录测试证据和残留风险。"));
  }
  steps.push(step("Retrospective", "PM Agent", "总结本次交付、证据、风险和可沉淀规则。"));
  return {
    id: `orion-driver-workflow-${Date.now()}`,
    name: decision.workflow === "lightweight" ? "ORION 轻量开发流程" : "ORION 智能开发流程",
    description: `ORION 开发流程驾驶员生成：${decision.reason}；目标：${task}`,
    steps,
  };
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

function workflowById(workflows: WorkflowDefinition[], id: string) {
  return workflows.find((workflow) => workflow.id === id);
}

function tryParseJsonObject(output: string): Record<string, unknown> | null {
  const text = output.trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const candidate = fenced ?? text.match(/\{[\s\S]*\}/)?.[0] ?? text;
  try {
    const parsed: unknown = JSON.parse(candidate);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function normalizeWorkflowChoice(value: unknown): OrionWorkflowDriverChoice {
  return value === "bug" || value === "test" || value === "lightweight" || value === "custom" || value === "full"
    ? value
    : "full";
}

function numberField(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;
}

function booleanField(value: unknown) {
  return value === true;
}

function stringField(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}
