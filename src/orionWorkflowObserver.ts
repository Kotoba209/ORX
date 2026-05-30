import type { ProviderConfig } from "./orionChat.ts";

export type OrionWorkflowObservationDecision = "continue" | "intervene" | "ask_user" | "stop" | "rerun";

export type OrionWorkflowObserverRunInput = {
  provider: ProviderConfig;
  owner: string;
  stage: string;
  task: string;
  upstream: string;
};

export type OrionWorkflowObservation = {
  source?: "model" | "fallback";
  decision: OrionWorkflowObservationDecision;
  confidence: number;
  summary: string;
  user_message?: string;
  memory_note?: string;
  target_stage?: string;
  rerun_instruction?: string;
};

export function createOrionWorkflowObserverRunInput(input: {
  provider: ProviderConfig;
  task: string;
  owner: string;
  stage: string;
  output: string;
  processContext?: string;
}): OrionWorkflowObserverRunInput {
  return {
    provider: input.provider,
    owner: "ORION",
    stage: "工作流观察",
    task: [
      "AI 是驾驶员，ORX 是驾驶舱。你正在作为 ORION 观察工作流节点执行结果。",
      "你的职责不是重新执行节点，而是读取当前节点产出和已有流程记忆，判断是否继续推进、给出干预建议、请求用户补充，或停止避免错误扩散。",
      "只输出 JSON，不要输出 Markdown，不要输出 JSON 之外的解释文字。",
      "字段：decision, confidence, summary, user_message, memory_note, target_stage, rerun_instruction。",
      "decision 只能是 continue、intervene、ask_user、stop、rerun。",
      "continue 表示节点结果足够清楚，可以继续；intervene 表示建议 ORION 提醒但不暂停；ask_user 表示必须向用户追问；stop 表示结果明显失败或继续会造成错误；rerun 表示应带着明确修正要求自动重跑某个节点一次。",
      "如果没有明确问题，优先 decision=continue，并让 user_message 为空。",
    ].join("\n"),
    upstream: [
      `用户任务：${input.task}`,
      `当前节点：${input.owner} / ${input.stage}`,
      input.processContext ? `当前流程记忆：\n${input.processContext}` : "",
      `节点输出：\n${input.output}`,
    ].filter(Boolean).join("\n\n"),
  };
}

export function parseOrionWorkflowObservation(output: string): OrionWorkflowObservation {
  const parsed = tryParseJsonObject(output);
  if (!parsed) {
    return {
      source: "fallback",
      decision: "continue",
      confidence: 0.35,
      summary: compact(output, 240) || "模型观察结果不可解析，默认继续。",
    };
  }
  return {
    source: "model",
    decision: normalizeDecision(stringField(parsed.decision, "continue")),
    confidence: clampConfidence(typeof parsed.confidence === "number" ? parsed.confidence : Number(parsed.confidence)),
    summary: stringField(parsed.summary, "ORION 已观察当前节点结果。"),
    user_message: optionalString(parsed.user_message),
    memory_note: optionalString(parsed.memory_note),
    target_stage: optionalString(parsed.target_stage),
    rerun_instruction: optionalString(parsed.rerun_instruction),
  };
}

export function createFallbackOrionWorkflowObservation(input: { owner: string; stage: string; reason: string }): OrionWorkflowObservation {
  return {
    source: "fallback",
    decision: "continue",
    confidence: 0.2,
    summary: `fallback: ORION workflow observer was unavailable for ${input.owner} / ${input.stage}; ORX continued with recorded node output.`,
    memory_note: `observer_fallback: ${input.reason}`,
  };
}

export function shouldRunFallbackOrionNodeMonitor(observation: OrionWorkflowObservation) {
  return observation.source === "fallback";
}

export function shouldSurfaceOrionWorkflowObservation(observation: OrionWorkflowObservation) {
  return observation.decision === "intervene"
    || observation.decision === "ask_user"
    || observation.decision === "stop"
    || observation.decision === "rerun";
}

export function observationRequiresUserInput(observation: OrionWorkflowObservation) {
  return observation.decision === "ask_user" || observation.decision === "stop";
}

export function observationRequestsRerun(observation: OrionWorkflowObservation) {
  return observation.decision === "rerun";
}

export function formatOrionObservationPrompt(observation: OrionWorkflowObservation) {
  const message = observation.user_message || observation.summary;
  if (observation.decision === "stop") {
    return `${message} 请回复“继续”强制推进，或补充你的处理意见。`;
  }
  return message;
}

export function appendOrionObservationAnswerToUpstream(upstream: string, observation: OrionWorkflowObservation, answer: string) {
  return [
    upstream,
    "",
    "[ORION observation]",
    `decision: ${observation.decision}`,
    `summary: ${observation.summary}`,
    observation.memory_note ? `memory_note: ${observation.memory_note}` : "",
    "",
    "[User answer to ORION observation]",
    answer,
  ].filter((line) => line !== "").join("\n");
}

export function appendOrionObservationToUpstream(upstream: string, observation: OrionWorkflowObservation) {
  return [
    upstream,
    "",
    "[ORION observation]",
    `source: ${observation.source ?? "unknown"}`,
    `decision: ${observation.decision}`,
    `confidence: ${observation.confidence}`,
    `summary: ${observation.summary}`,
    observation.user_message ? `user_message: ${observation.user_message}` : "",
    observation.memory_note ? `memory_note: ${observation.memory_note}` : "",
  ].filter((line) => line !== "").join("\n");
}

export function appendOrionObservationRerunToUpstream(upstream: string, observation: OrionWorkflowObservation) {
  return [
    upstream,
    "",
    "[ORION rerun]",
    `decision: ${observation.decision}`,
    `summary: ${observation.summary}`,
    observation.target_stage ? `target_stage: ${observation.target_stage}` : "",
    observation.rerun_instruction ? `instruction: ${observation.rerun_instruction}` : "",
    observation.memory_note ? `memory_note: ${observation.memory_note}` : "",
  ].filter((line) => line !== "").join("\n");
}

function normalizeDecision(value: string): OrionWorkflowObservationDecision {
  if (value === "intervene" || value === "ask_user" || value === "stop" || value === "rerun") return value;
  return "continue";
}

function clampConfidence(value: number) {
  if (!Number.isFinite(value)) return 0.35;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
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

function compact(value: string, maxLength: number) {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}
