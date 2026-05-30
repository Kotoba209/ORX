import type { ProviderConfig } from "./orionChat.ts";

export type OrionWorkflowRunStatus = "completed" | "failed" | "stopped";

export type OrionWorkflowSummaryRunInput = {
  provider: ProviderConfig;
  owner: string;
  stage: string;
  task: string;
  upstream: string;
};

export type OrionWorkflowSummary = {
  outcome: OrionWorkflowRunStatus | "unknown";
  summary: string;
  artifacts: string[];
  memory_note?: string;
  follow_up_hints: string[];
};

export function createOrionWorkflowSummaryRunInput(input: {
  provider: ProviderConfig;
  task: string;
  status: OrionWorkflowRunStatus;
  summaryText: string;
  upstream: string;
  processContext?: string;
}): OrionWorkflowSummaryRunInput {
  return {
    provider: input.provider,
    owner: "ORION",
    stage: "工作流回顾记忆",
    task: [
      "AI 是驾驶员，ORX 是驾驶舱。你正在作为 ORION 对刚结束的工作流做回顾压缩。",
      "你的目标不是重新执行任务，而是把过程、结果、产物、阻塞点和后续追问线索整理成后续对话可直接使用的记忆。",
      "只输出 JSON，不要输出 Markdown，不要输出 JSON 之外的解释文字。",
      "字段：summary, outcome, artifacts, memory_note, follow_up_hints。",
      "outcome 只能是 completed、failed、stopped 或 unknown。",
      "summary 要自然、简洁、可供下一轮对话引用；memory_note 记录最值得长期记住的判断；follow_up_hints 只写用户后续可能会问到的具体线索。",
    ].join("\n"),
    upstream: [
      `用户任务：${input.task}`,
      `状态：${input.status}`,
      `ORCH 结束摘要：\n${input.summaryText}`,
      input.processContext ? `当前流程/产物/记忆上下文：\n${input.processContext}` : "",
      `最终上游过程：\n${input.upstream}`,
    ].filter(Boolean).join("\n\n"),
  };
}

export function parseOrionWorkflowSummary(output: string): OrionWorkflowSummary {
  const parsed = tryParseJsonObject(output);
  if (!parsed) {
    return {
      outcome: "unknown",
      summary: compact(output, 1000) || "工作流已结束，但 ORION 回顾输出为空。",
      artifacts: [],
      follow_up_hints: [],
    };
  }
  return {
    outcome: normalizeOutcome(stringField(parsed.outcome, "unknown")),
    summary: stringField(parsed.summary, "工作流已结束，ORION 已记录过程摘要。"),
    artifacts: stringArray(parsed.artifacts),
    memory_note: optionalString(parsed.memory_note),
    follow_up_hints: stringArray(parsed.follow_up_hints),
  };
}

export function createFallbackOrionWorkflowSummary(input: {
  status: OrionWorkflowRunStatus;
  summaryText: string;
  reason: string;
}): OrionWorkflowSummary {
  return {
    outcome: input.status,
    summary: `fallback: ORION workflow summary model was unavailable; retained ORCH summary. ${compact(input.summaryText, 900)}`,
    artifacts: [],
    memory_note: `summary_fallback: ${input.reason}`,
    follow_up_hints: ["Ask about the workflow result, failure point, artifacts, or next repair step."],
  };
}

function normalizeOutcome(value: string): OrionWorkflowSummary["outcome"] {
  if (value === "completed" || value === "failed" || value === "stopped") return value;
  return "unknown";
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

function stringField(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim());
}

function compact(value: string, maxLength: number) {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}
