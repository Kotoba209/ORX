import type { ProviderConfig } from "./orionChat.ts";
import { draftOrionWorkflow } from "./orionPlanner.ts";
import type { WorkflowDefinition } from "./workflowConfig.ts";
import type { WorkflowStep } from "./workflowState.ts";

export type OrionWorkflowDraftRunInput = {
  provider: ProviderConfig;
  owner: string;
  stage: string;
  task: string;
  upstream: string;
};

export type OrionWorkflowDraftResult = {
  workflow: WorkflowDefinition;
  reason: string;
};

const allowedWorkflowOwners = new Set(["PM Agent", "PD Agent", "DEV Agent", "ARCH Agent", "QA Agent", "ORION"]);

export function createOrionWorkflowDraftRunInput(input: {
  provider: ProviderConfig;
  task: string;
  processContext?: string;
  projectContext?: string;
}): OrionWorkflowDraftRunInput {
  return {
    provider: input.provider,
    owner: "ORION",
    stage: "自定义工作流草案",
    task: [
      "AI 是工作流设计驾驶员，ORX 是驾驶舱。你负责根据用户目标设计一份可审核的自定义工作流草案。",
      `用户目标：${input.task}`,
      "",
      "只输出 JSON，不要输出 Markdown 或解释文字。",
      "JSON 字段：name, description, steps。",
      "steps 是数组，每个节点字段：stage, owner, instruction, approval, rollback_target, skill_ids, interaction, exit_condition。",
      "owner 建议使用 PM Agent、PD Agent、DEV Agent、ARCH Agent、QA Agent 或 ORION。",
      "approval 只能是 none、user、auto；interaction 只能是 single-turn、multi-turn；exit_condition 只能是 node_complete、requirements_ready。",
      "流程应保留用户审核空间：高风险设计、架构审查或安全边界节点可以 approval=user；普通调查/拆解节点 approval=none。",
      "不要直接执行任务，只生成流程草案。",
    ].join("\n"),
    upstream: [
      input.projectContext ? `项目上下文：${input.projectContext}` : "",
      input.processContext ? `当前 ORION 过程记忆：\n${input.processContext}` : "",
    ].filter(Boolean).join("\n\n"),
  };
}

export function parseOrionWorkflowDraft(output: string, options: { task: string; now?: number }): WorkflowDefinition | null {
  const parsed = tryParseJsonObject(output);
  if (!parsed) return null;
  const rawSteps = Array.isArray(parsed.steps) ? parsed.steps : [];
  const steps = rawSteps.map(parseStep).filter((step): step is WorkflowStep => Boolean(step));
  if (steps.length === 0) return null;
  const now = options.now ?? Date.now();
  return {
    id: `orion-model-workflow-${now}`,
    name: stringField(parsed.name, "ORION Model Workflow"),
    description: stringField(parsed.description, `ORION 模型根据用户目标生成：${options.task}`),
    steps,
  };
}

export function createFallbackOrionWorkflowDraft(task: string, reason: string): OrionWorkflowDraftResult {
  return {
    workflow: draftOrionWorkflow(task),
    reason: `fallback: ${reason}`,
  };
}

export function formatOrionWorkflowDraftDecisionForMemory(result: OrionWorkflowDraftResult, options: { source?: "model" | "fallback"; reason?: string } = {}) {
  const prefix = options.source === "fallback" ? "fallback:" : "";
  return {
    decision: `${prefix}${result.workflow.name}`,
    reason: [
      options.source === "fallback" ? "fallback" : "",
      options.reason ?? result.reason,
      `steps=${result.workflow.steps.map((step) => `${step.owner}/${step.stage}`).join(" -> ")}`,
    ].filter(Boolean).join("; "),
    confidence: options.source === "fallback" ? 0.5 : 0.82,
  };
}

function parseStep(value: unknown): WorkflowStep | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const stage = stringField(raw.stage, "");
  const owner = stringField(raw.owner, "");
  const instruction = stringField(raw.instruction, "");
  if (!stage || !allowedWorkflowOwners.has(owner) || !instruction) return null;
  return {
    stage,
    owner,
    instruction,
    enabled: raw.enabled === false ? false : true,
    approval: parseApproval(raw.approval),
    rollback_target: optionalString(raw.rollback_target),
    skill_ids: stringArray(raw.skill_ids),
    interaction: parseInteraction(raw.interaction),
    exit_condition: parseExitCondition(raw.exit_condition),
  };
}

function parseApproval(value: unknown): WorkflowStep["approval"] {
  return value === "user" || value === "auto" || value === "none" ? value : "none";
}

function parseInteraction(value: unknown): WorkflowStep["interaction"] {
  return value === "multi-turn" || value === "single-turn" ? value : "single-turn";
}

function parseExitCondition(value: unknown): WorkflowStep["exit_condition"] {
  return value === "requirements_ready" || value === "node_complete" ? value : "node_complete";
}

function stringArray(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  const items = value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim());
  return items.length > 0 ? Array.from(new Set(items)) : undefined;
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringField(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
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
