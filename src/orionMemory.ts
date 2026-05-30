import type { OrionAction, OrionActionKind } from "./orionActions.ts";
import type { OrionWorkflowSummary } from "./orionWorkflowSummary.ts";
import type { OrionWorkflowObservation } from "./orionWorkflowObserver.ts";

export const ORION_MEMORY_STORAGE_KEY = "orx.orion.memory.v1";

export type OrionMemoryKind = OrionActionKind | "chat.summary" | "assistant.question" | "assistant.answer" | "assistant.summary" | "orion.decision" | "user.workflow_event" | "user.assistant_event" | "workflow.node" | "workflow.run" | "workflow.observation" | "workflow.summary";
export type OrionMemorySource = "assistant_action" | "chat_summary" | "assistant_question" | "assistant_answer" | "assistant_summary" | "model_decision" | "user_workflow_event" | "user_assistant_event" | "workflow_node" | "workflow_run" | "workflow_observation" | "workflow_summary";

export type OrionMemoryEntry = {
  id: string;
  createdAt: number;
  traceId: string;
  round: number;
  task: string;
  kind: OrionMemoryKind;
  title: string;
  query?: string;
  message: string;
  urls: string[];
  source?: OrionMemorySource;
  owner?: string;
  stage?: string;
  status?: string;
  archivePath?: string;
  artifactPaths?: string[];
};

type OrionMemoryStorage = Pick<Storage, "getItem" | "setItem">;

export function createOrionMemoryEntry(
  task: string,
  action: OrionAction,
  message: string,
  options: { now?: number; traceId?: string; round?: number } = {},
): OrionMemoryEntry {
  const now = options.now ?? Date.now();
  const query = extractQuery(action);
  return {
    id: `${action.id}-${now}`,
    createdAt: now,
    traceId: options.traceId ?? createTraceId(now),
    round: options.round ?? 1,
    task,
    kind: action.kind,
    title: action.title,
    query,
    message,
    urls: extractUrls(message).filter((url) => url !== query),
    source: "assistant_action",
    artifactPaths: extractArtifactPaths(message),
  };
}

export function createOrionAssistantSummaryMemoryEntry(input: {
  task: string;
  reply: string;
  resultMessages?: string[];
  status?: "completed" | "failed" | "stopped";
  archivePath?: string;
  artifactPaths?: string[];
  now?: number;
  traceId?: string;
  round?: number;
}): OrionMemoryEntry {
  const now = input.now ?? Date.now();
  const artifactPaths = uniqueStrings(input.artifactPaths ?? extractArtifactPaths(`${input.reply}\n${input.resultMessages?.join("\n") ?? ""}`));
  const toolResults = (input.resultMessages ?? []).slice(0, 8);
  const lines = [
    `reply: ${compact(input.reply, 1600)}`,
    toolResults.length > 0 ? `tool_results: ${toolResults.join("；")}` : "",
    artifactPaths.length > 0 ? `artifacts: ${artifactPaths.join("；")}` : "",
  ].filter(Boolean);
  return {
    id: `assistant-summary-${now}`,
    createdAt: now,
    traceId: input.traceId ?? createTraceId(now),
    round: input.round ?? 1,
    task: input.task,
    kind: "assistant.summary",
    title: "ORION assistant summary",
    message: lines.join("\n"),
    urls: extractUrls(lines.join("\n")),
    source: "assistant_summary",
    status: input.status ?? "completed",
    archivePath: input.archivePath,
    artifactPaths,
  };
}

export function createOrionAssistantQuestionMemoryEntry(input: {
  task: string;
  question: string;
  reason?: string;
  now?: number;
  traceId?: string;
  round?: number;
}): OrionMemoryEntry {
  const now = input.now ?? Date.now();
  const lines = [
    `question: ${compact(input.question, 1000)}`,
    input.reason ? `reason: ${compact(input.reason, 800)}` : "",
  ].filter(Boolean);
  return {
    id: `assistant-question-${now}`,
    createdAt: now,
    traceId: input.traceId ?? createTraceId(now),
    round: input.round ?? 1,
    task: input.task,
    kind: "assistant.question",
    title: "ORION assistant question",
    message: lines.join("\n"),
    urls: extractUrls(lines.join("\n")),
    source: "assistant_question",
    status: "waiting_user",
  };
}

export function createOrionAssistantAnswerMemoryEntry(input: {
  task: string;
  answer: string;
  question?: string;
  now?: number;
  traceId?: string;
  round?: number;
}): OrionMemoryEntry {
  const now = input.now ?? Date.now();
  const lines = [
    input.question ? `question: ${compact(input.question, 1000)}` : "",
    `answer: ${compact(input.answer, 1200)}`,
  ].filter(Boolean);
  return {
    id: `assistant-answer-${now}`,
    createdAt: now,
    traceId: input.traceId ?? createTraceId(now),
    round: input.round ?? 1,
    task: input.task,
    kind: "assistant.answer",
    title: "ORION assistant answer",
    message: lines.join("\n"),
    urls: extractUrls(lines.join("\n")),
    source: "assistant_answer",
    status: "answered",
  };
}

export function createOrionDecisionMemoryEntry(input: {
  task: string;
  decisionType: string;
  decision: string;
  reason: string;
  confidence?: number;
  now?: number;
  traceId?: string;
  round?: number;
}): OrionMemoryEntry {
  const now = input.now ?? Date.now();
  const lines = [
    `decision_type: ${compact(input.decisionType, 160)}`,
    `decision: ${compact(input.decision, 240)}`,
    `reason: ${compact(input.reason, 1000)}`,
    typeof input.confidence === "number" ? `confidence: ${input.confidence}` : "",
  ].filter(Boolean);
  return {
    id: `orion-decision-${now}`,
    createdAt: now,
    traceId: input.traceId ?? createTraceId(now),
    round: input.round ?? 1,
    task: input.task,
    kind: "orion.decision",
    title: "ORION model decision",
    message: lines.join("\n"),
    urls: extractUrls(lines.join("\n")),
    source: "model_decision",
    status: input.decision,
  };
}

export function createOrionUserWorkflowEventMemoryEntry(input: {
  task: string;
  eventType: string;
  note: string;
  owner?: string;
  stage?: string;
  now?: number;
  traceId?: string;
  round?: number;
  archivePath?: string;
}): OrionMemoryEntry {
  const now = input.now ?? Date.now();
  const lines = [
    `event_type: ${compact(input.eventType, 160)}`,
    input.owner || input.stage ? `node: ${[input.owner, input.stage].filter(Boolean).join(" / ")}` : "",
    `note: ${compact(input.note, 1200)}`,
  ].filter(Boolean);
  return {
    id: `user-workflow-event-${now}`,
    createdAt: now,
    traceId: input.traceId ?? createTraceId(now),
    round: input.round ?? 1,
    task: input.task,
    kind: "user.workflow_event",
    title: "User workflow event",
    message: lines.join("\n"),
    urls: extractUrls(lines.join("\n")),
    source: "user_workflow_event",
    owner: input.owner,
    stage: input.stage,
    status: input.eventType,
    archivePath: input.archivePath,
  };
}

export function createOrionUserAssistantEventMemoryEntry(input: {
  task: string;
  eventType: string;
  note: string;
  actions?: string[];
  now?: number;
  traceId?: string;
  round?: number;
  archivePath?: string;
}): OrionMemoryEntry {
  const now = input.now ?? Date.now();
  const actionKinds = uniqueStrings(input.actions ?? []);
  const lines = [
    `event_type: ${compact(input.eventType, 160)}`,
    actionKinds.length > 0 ? `actions: ${actionKinds.join(" -> ")}` : "",
    `note: ${compact(input.note, 1200)}`,
  ].filter(Boolean);
  return {
    id: `user-assistant-event-${now}`,
    createdAt: now,
    traceId: input.traceId ?? createTraceId(now),
    round: input.round ?? 1,
    task: input.task,
    kind: "user.assistant_event",
    title: "User assistant event",
    message: lines.join("\n"),
    urls: extractUrls(lines.join("\n")),
    source: "user_assistant_event",
    status: input.eventType,
    archivePath: input.archivePath,
  };
}

export function createOrionChatSummaryMemoryEntry(input: {
  task: string;
  reply: string;
  now?: number;
  traceId?: string;
  round?: number;
}): OrionMemoryEntry {
  const now = input.now ?? Date.now();
  const lines = [
    `user_message: ${compact(input.task, 800)}`,
    `orion_reply: ${compact(input.reply, 1200)}`,
  ];
  return {
    id: `chat-summary-${now}`,
    createdAt: now,
    traceId: input.traceId ?? createTraceId(now),
    round: input.round ?? 1,
    task: input.task,
    kind: "chat.summary",
    title: "ORION chat summary",
    message: lines.join("\n"),
    urls: extractUrls(lines.join("\n")),
    source: "chat_summary",
    status: "completed",
  };
}

export function createOrionWorkflowNodeMemoryEntry(input: {
  task: string;
  owner: string;
  stage: string;
  output: string;
  status?: "done" | "failed";
  archivePath?: string;
  artifactPaths?: string[];
  now?: number;
  traceId?: string;
  round?: number;
}): OrionMemoryEntry {
  const now = input.now ?? Date.now();
  const artifactPaths = uniqueStrings(input.artifactPaths ?? extractArtifactPaths(input.output));
  return {
    id: `workflow-node-${input.owner}-${input.stage}-${now}`.replace(/\s+/g, "-"),
    createdAt: now,
    traceId: input.traceId ?? createTraceId(now),
    round: input.round ?? 1,
    task: input.task,
    kind: "workflow.node",
    title: `${input.owner} / ${input.stage}`,
    message: compact(input.output, 1200),
    urls: extractUrls(input.output),
    source: "workflow_node",
    owner: input.owner,
    stage: input.stage,
    status: input.status ?? "done",
    archivePath: input.archivePath,
    artifactPaths,
  };
}

export function createOrionWorkflowRunMemoryEntry(input: {
  task: string;
  status: "completed" | "failed" | "stopped";
  message: string;
  archivePath?: string;
  artifactPaths?: string[];
  now?: number;
  traceId?: string;
  round?: number;
}): OrionMemoryEntry {
  const now = input.now ?? Date.now();
  const artifactPaths = uniqueStrings(input.artifactPaths ?? extractArtifactPaths(input.message));
  return {
    id: `workflow-run-${input.status}-${now}`,
    createdAt: now,
    traceId: input.traceId ?? createTraceId(now),
    round: input.round ?? 1,
    task: input.task,
    kind: "workflow.run",
    title: `工作流${input.status}`,
    message: compact(input.message, 1600),
    urls: extractUrls(input.message),
    source: "workflow_run",
    status: input.status,
    archivePath: input.archivePath,
    artifactPaths,
  };
}

export function createOrionWorkflowObservationMemoryEntry(input: {
  task: string;
  owner: string;
  stage: string;
  observation: OrionWorkflowObservation;
  archivePath?: string;
  now?: number;
  traceId?: string;
  round?: number;
}): OrionMemoryEntry {
  const now = input.now ?? Date.now();
  const lines = [
    `observer_source: ${input.observation.source ?? "unknown"}`,
    `decision: ${input.observation.decision}`,
    `confidence: ${input.observation.confidence}`,
    `summary: ${input.observation.summary}`,
    input.observation.user_message ? `user_message: ${input.observation.user_message}` : "",
    input.observation.target_stage ? `target_stage: ${input.observation.target_stage}` : "",
    input.observation.rerun_instruction ? `rerun_instruction: ${input.observation.rerun_instruction}` : "",
    input.observation.memory_note ? `memory_note: ${input.observation.memory_note}` : "",
  ].filter(Boolean);
  return {
    id: `workflow-observation-${input.owner}-${input.stage}-${now}`.replace(/\s+/g, "-"),
    createdAt: now,
    traceId: input.traceId ?? createTraceId(now),
    round: input.round ?? 1,
    task: input.task,
    kind: "workflow.observation",
    title: `ORION observation / ${input.owner} / ${input.stage}`,
    message: lines.join("\n"),
    urls: [],
    source: "workflow_observation",
    owner: input.owner,
    stage: input.stage,
    status: input.observation.decision,
    archivePath: input.archivePath,
  };
}

export function createOrionWorkflowSummaryMemoryEntry(input: {
  task: string;
  status: "completed" | "failed" | "stopped";
  summary: OrionWorkflowSummary;
  archivePath?: string;
  now?: number;
  traceId?: string;
  round?: number;
}): OrionMemoryEntry {
  const now = input.now ?? Date.now();
  const artifactPaths = uniqueStrings(input.summary.artifacts);
  const lines = [
    `outcome: ${input.summary.outcome}`,
    `summary: ${input.summary.summary}`,
    input.summary.memory_note ? `memory_note: ${input.summary.memory_note}` : "",
    input.summary.follow_up_hints.length > 0 ? `follow_up_hints: ${input.summary.follow_up_hints.join("；")}` : "",
    artifactPaths.length > 0 ? `artifacts: ${artifactPaths.join("；")}` : "",
  ].filter(Boolean);
  return {
    id: `workflow-summary-${input.status}-${now}`,
    createdAt: now,
    traceId: input.traceId ?? createTraceId(now),
    round: input.round ?? 1,
    task: input.task,
    kind: "workflow.summary",
    title: `ORION workflow summary / ${input.status}`,
    message: lines.join("\n"),
    urls: extractUrls(lines.join("\n")),
    source: "workflow_summary",
    status: input.status,
    archivePath: input.archivePath,
    artifactPaths,
  };
}

export function appendOrionMemoryEntry(entries: OrionMemoryEntry[], entry: OrionMemoryEntry, limit = 48) {
  return [...entries, entry].slice(-limit);
}

export function appendFreshOrionMemoryEntry(
  stateEntries: OrionMemoryEntry[],
  refEntries: OrionMemoryEntry[],
  entry: OrionMemoryEntry,
  limit = 48,
) {
  return appendOrionMemoryEntry(selectFreshOrionMemoryEntries(stateEntries, refEntries), entry, limit);
}

export function loadOrionMemoryEntries(storage: OrionMemoryStorage | null | undefined, limit = 48): OrionMemoryEntry[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(ORION_MEMORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeMemoryEntry).filter((entry): entry is OrionMemoryEntry => Boolean(entry)).slice(-limit);
  } catch {
    return [];
  }
}

export function saveOrionMemoryEntries(storage: OrionMemoryStorage | null | undefined, entries: OrionMemoryEntry[], limit = 48) {
  if (!storage) return;
  storage.setItem(ORION_MEMORY_STORAGE_KEY, JSON.stringify(entries.slice(-limit)));
}

export function selectFreshOrionMemoryEntries(stateEntries: OrionMemoryEntry[], refEntries: OrionMemoryEntry[]) {
  const latestState = latestCreatedAt(stateEntries);
  const latestRef = latestCreatedAt(refEntries);
  if (latestRef >= latestState) return refEntries;
  return stateEntries;
}

export function formatOrionMemoryContext(entries: OrionMemoryEntry[], options: { limit?: number } = {}) {
  const limit = options.limit ?? 24;
  return [...entries]
    .sort((left, right) => left.createdAt - right.createdAt)
    .slice(-limit)
    .map((entry) => {
      if (entry.kind === "chat.summary" || entry.kind === "assistant.question" || entry.kind === "assistant.answer" || entry.kind === "assistant.summary" || entry.kind === "orion.decision" || entry.kind === "user.workflow_event" || entry.kind === "user.assistant_event" || entry.kind === "workflow.summary") {
        return formatSummaryMemoryContext(entry);
      }
      const parts = [
        `trace_id：${entry.traceId}`,
        `round：${entry.round}`,
        `来源：${entry.source ?? "assistant_action"}`,
        `任务：${entry.task}`,
        `类型：${entry.kind}`,
        entry.owner || entry.stage ? `节点：${[entry.owner, entry.stage].filter(Boolean).join(" / ")}` : "",
        entry.status ? `状态：${entry.status}` : "",
        entry.query ? `查询：${entry.query}` : "",
        entry.archivePath ? `任务归档目录：${entry.archivePath}` : "",
        entry.artifactPaths && entry.artifactPaths.length > 0 ? `产物路径：${entry.artifactPaths.join("；")}` : "",
        entry.urls.length > 0 ? `链接：${entry.urls.join("；")}` : "",
        `结果：${entry.message}`,
      ].filter(Boolean);
      return parts.join("\n");
    })
    .join("\n\n");
}

function formatSummaryMemoryContext(entry: OrionMemoryEntry) {
  if (entry.kind === "user.assistant_event") {
    const parts = [
      `trace_id：${entry.traceId}`,
      `round：${entry.round}`,
      `来源：${entry.source ?? "user_assistant_event"}`,
      `任务：${entry.task}`,
      `类型：${entry.kind}`,
      entry.status ? `状态：${entry.status}` : "",
      fieldValue(entry.message, "event_type") ? `User assistant event: ${fieldValue(entry.message, "event_type")}` : "",
      fieldValue(entry.message, "actions") ? `Assistant actions: ${fieldValue(entry.message, "actions")}` : "",
      fieldValue(entry.message, "note") ? `User note: ${fieldValue(entry.message, "note")}` : "",
    ].filter(Boolean);
    return parts.join("\n");
  }
  if (entry.kind === "user.workflow_event") {
    const parts = [
      `trace_id：${entry.traceId}`,
      `round：${entry.round}`,
      `来源：${entry.source ?? "user_workflow_event"}`,
      `任务：${entry.task}`,
      `类型：${entry.kind}`,
      entry.status ? `状态：${entry.status}` : "",
      fieldValue(entry.message, "event_type") ? `User workflow event: ${fieldValue(entry.message, "event_type")}` : "",
      fieldValue(entry.message, "node") ? `Workflow node: ${fieldValue(entry.message, "node")}` : "",
      fieldValue(entry.message, "note") ? `User note: ${fieldValue(entry.message, "note")}` : "",
    ].filter(Boolean);
    return parts.join("\n");
  }
  if (entry.kind === "orion.decision") {
    const decisionType = fieldValue(entry.message, "decision_type");
    const decision = fieldValue(entry.message, "decision");
    const parts = [
      `trace_id：${entry.traceId}`,
      `round：${entry.round}`,
      `来源：${entry.source ?? "model_decision"}`,
      `任务：${entry.task}`,
      `类型：${entry.kind}`,
      entry.status ? `状态：${entry.status}` : "",
      decisionType || decision ? `ORION model decision: ${decisionType}${decision ? ` -> ${decision}` : ""}` : "",
      fieldValue(entry.message, "reason") ? `Decision reason: ${fieldValue(entry.message, "reason")}` : "",
      fieldValue(entry.message, "confidence") ? `Decision confidence: ${fieldValue(entry.message, "confidence")}` : "",
    ].filter(Boolean);
    return parts.join("\n");
  }
  const parts = [
    `trace_id：${entry.traceId}`,
    `round：${entry.round}`,
    `来源：${entry.source ?? "assistant_summary"}`,
    `任务：${entry.task}`,
    `类型：${entry.kind}`,
    entry.status ? `状态：${entry.status}` : "",
    entry.archivePath ? `任务归档目录：${entry.archivePath}` : "",
    entry.artifactPaths && entry.artifactPaths.length > 0 ? `产物路径：${entry.artifactPaths.join("；")}` : "",
    entry.urls.length > 0 ? `链接：${entry.urls.join("；")}` : "",
    ...summaryMemoryLines(entry),
  ].filter(Boolean);
  return parts.join("\n");
}

function summaryMemoryLines(entry: OrionMemoryEntry) {
  if (entry.kind === "assistant.summary") {
    return [
      fieldValue(entry.message, "reply") ? `ORION 最终答复：${fieldValue(entry.message, "reply")}` : "",
      fieldValue(entry.message, "tool_results") ? `工具结果摘要：${fieldValue(entry.message, "tool_results")}` : "",
    ];
  }
  if (entry.kind === "chat.summary") {
    return [
      fieldValue(entry.message, "user_message") ? `用户消息：${fieldValue(entry.message, "user_message")}` : "",
      fieldValue(entry.message, "orion_reply") ? `ORION 普通回复：${fieldValue(entry.message, "orion_reply")}` : "",
    ];
  }
  if (entry.kind === "assistant.question") {
    return [
      fieldValue(entry.message, "question") ? `ORION 追问：${fieldValue(entry.message, "question")}` : "",
      fieldValue(entry.message, "reason") ? `追问原因：${fieldValue(entry.message, "reason")}` : "",
    ];
  }
  if (entry.kind === "assistant.answer") {
    return [
      fieldValue(entry.message, "question") ? `对应 ORION 追问：${fieldValue(entry.message, "question")}` : "",
      fieldValue(entry.message, "answer") ? `用户回答 ORION 追问：${fieldValue(entry.message, "answer")}` : "",
    ];
  }
  return [
    fieldValue(entry.message, "outcome") ? `流程结果：${fieldValue(entry.message, "outcome")}` : "",
    fieldValue(entry.message, "summary") ? `ORION 工作流回顾：${fieldValue(entry.message, "summary")}` : "",
    fieldValue(entry.message, "memory_note") ? `长期记忆提示：${fieldValue(entry.message, "memory_note")}` : "",
    fieldValue(entry.message, "follow_up_hints") ? `后续追问线索：${fieldValue(entry.message, "follow_up_hints")}` : "",
  ];
}

function fieldValue(message: string, field: string) {
  const pattern = new RegExp(`(?:^|\\n)${field}:\\s*([^\\n]+)`);
  return message.match(pattern)?.[1]?.trim() ?? "";
}

export function formatOrionMemoryJson(entries: OrionMemoryEntry[]) {
  return JSON.stringify({
    version: 2,
    updatedAt: new Date().toISOString(),
    entries: entries.slice(-48),
  }, null, 2);
}

export function formatOrionFindingsMarkdown(entries: OrionMemoryEntry[]) {
  const latest = entries.slice(-48);
  const sections = latest.map((entry) => [
    `## ${entry.task}`,
    "",
    `- trace_id: ${entry.traceId}`,
    `- round: ${entry.round}`,
    `- source: ${entry.source ?? "assistant_action"}`,
    `- kind: ${entry.kind}`,
    entry.owner || entry.stage ? `- node: ${[entry.owner, entry.stage].filter(Boolean).join(" / ")}` : "",
    entry.status ? `- status: ${entry.status}` : "",
    entry.archivePath ? `- archive: ${entry.archivePath}` : "",
    entry.query ? `- query: ${entry.query}` : "",
    entry.artifactPaths && entry.artifactPaths.length > 0 ? `- artifacts: ${entry.artifactPaths.join("; ")}` : "",
    entry.urls.length > 0 ? `- sources: ${entry.urls.join("; ")}` : "",
    "",
    "```text",
    entry.message,
    "```",
  ].filter(Boolean).join("\n"));
  return [
    "# ORION Findings",
    "",
    "ORION 自动记录的工具与工作流证据包，用于重启后追问、排查和交接。",
    "",
    ...sections,
    "",
  ].join("\n");
}

function normalizeMemoryEntry(value: unknown): OrionMemoryEntry | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<OrionMemoryEntry>;
  if (typeof item.id !== "string" || typeof item.task !== "string" || typeof item.kind !== "string" || typeof item.title !== "string" || typeof item.message !== "string") {
    return null;
  }
  const createdAt = typeof item.createdAt === "number" ? item.createdAt : Date.now();
  const normalized: OrionMemoryEntry = {
    id: item.id,
    createdAt,
    traceId: typeof item.traceId === "string" && item.traceId ? item.traceId : createTraceId(createdAt),
    round: typeof item.round === "number" && item.round > 0 ? item.round : 1,
    task: item.task,
    kind: item.kind as OrionMemoryKind,
    title: item.title,
    query: typeof item.query === "string" ? item.query : undefined,
    message: item.message,
    urls: Array.isArray(item.urls) ? item.urls.filter((url): url is string => typeof url === "string") : extractUrls(item.message),
  };
  if (isMemorySource(item.source)) normalized.source = item.source;
  if (typeof item.owner === "string") normalized.owner = item.owner;
  if (typeof item.stage === "string") normalized.stage = item.stage;
  if (typeof item.status === "string") normalized.status = item.status;
  if (typeof item.archivePath === "string") normalized.archivePath = item.archivePath;
  const artifactPaths = Array.isArray(item.artifactPaths) ? item.artifactPaths.filter((path): path is string => typeof path === "string") : extractArtifactPaths(item.message);
  if (artifactPaths.length > 0) normalized.artifactPaths = artifactPaths;
  return normalized;
}

function createTraceId(seed: number) {
  return `orion-${seed.toString(36)}`;
}

function extractQuery(action: OrionAction) {
  const query = action.payload.query;
  if (typeof query === "string" && query.trim()) return query.trim();
  const request = action.payload.request;
  if (typeof request === "string" && request.trim()) return request.trim();
  return undefined;
}

function isMemorySource(value: unknown): value is OrionMemorySource {
  return value === "assistant_action" || value === "chat_summary" || value === "assistant_question" || value === "assistant_answer" || value === "assistant_summary" || value === "model_decision" || value === "user_workflow_event" || value === "user_assistant_event" || value === "workflow_node" || value === "workflow_run" || value === "workflow_observation" || value === "workflow_summary";
}

function latestCreatedAt(entries: OrionMemoryEntry[]) {
  return entries.reduce((latest, entry) => Math.max(latest, entry.createdAt), 0);
}

function extractUrls(message: string) {
  return uniqueStrings(message.match(/https?:\/\/[^\s；，。？！、）)"'“”]+/g) ?? []);
}

function extractArtifactPaths(message: string) {
  const matches = [
    ...message.matchAll(/[A-Za-z]:\\[^\n\r；，。]+(?:\\generated(?:\\[^\n\r；，。]+)?|\\tasks\\[^\n\r；，。]+)/g),
    ...message.matchAll(/[A-Za-z]:\\[^\n\r；，。]+\\generated\\[^\n\r；，。]+/g),
  ].map((match) => match[0].trim().replace(/[，。；、)）]+$/, ""));
  return uniqueStrings(matches);
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function compact(value: string, maxLength: number) {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}
