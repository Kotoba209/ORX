import { createOrionAction, type OrionAction } from "./orionActions.ts";
import type { OrionCapabilityGapDraft } from "./orionCapabilityGaps.ts";
import type { ProviderConfig } from "./orionChat.ts";
import {
  formatOrionToolKindList,
  formatOrionToolSchemaSummary,
  getOrionToolAlternative,
  isBlockedOrionToolKind,
  isSupportedOrionToolKind,
} from "./orionToolRegistry.ts";

export type OrionModelPlannerRunInput = {
  provider: ProviderConfig;
  owner: string;
  stage: string;
  task: string;
  upstream: string;
};

export type OrionModelDecision =
  | { kind: "chat"; reply: string; reason: string }
  | { kind: "ask_user"; question: string; reason: string; capability_gap?: OrionCapabilityGapDraft }
  | { kind: "propose_actions"; reason: string; actions: OrionAction[] }
  | { kind: "draft_workflow"; reason: string }
  | { kind: "run_workflow"; reason: string; workflow_id?: string };

type RawModelAction = {
  kind?: unknown;
  title?: unknown;
  summary?: unknown;
  payload?: unknown;
};

export function createOrionModelPlannerRunInput(input: {
  provider: ProviderConfig;
  task: string;
  chatLines: string[];
  memoryContext?: string;
  capabilityGapContext?: string;
  skillContext?: string;
  accessModeContext?: string;
  projectContext?: string;
  processContext?: string;
}): OrionModelPlannerRunInput {
  const recentChat = input.chatLines.slice(-10).join("\n");
  const upstream = [
    input.projectContext ? `当前项目上下文：\n${input.projectContext}` : "",
    input.processContext ? `ORION 当前流程/产物/归档上下文：\n${input.processContext}\n\n如果用户追问“刚才/生成的文件/产物/路径/结果”，优先依据这段上下文回答，不要重新规划 file.searchProject。` : "",
    input.memoryContext ? `ORION 结构化记忆：\n${input.memoryContext}` : "",
    input.capabilityGapContext ? `ORION 近期工具能力缺口：\n${input.capabilityGapContext}\n\n规划动作时优先使用缺口里标注的替代工具，避免再次提出缺口工具名。` : "",
    input.skillContext ? `ORION 已沉淀技能/SOP：\n${input.skillContext}\n\n如果当前目标与已有 Skill 相似，优先复用相同工具路径，并在结果里继续沉淀。` : "",
    input.accessModeContext ? `ORION 当前权限模式：\n${input.accessModeContext}\n\n权限模式代表用户对系统控制力的偏好。权限更开放时，优先规划可执行动作；权限更保守时，说明风险并等待确认。` : "",
    recentChat ? `最近对话：\n${recentChat}` : "",
  ].filter(Boolean).join("\n\n");
  return {
    provider: input.provider,
    owner: "ORION",
    stage: "驾驶员决策",
    task: [
      "AI 是驾驶员，ORX 是驾驶舱。你负责理解用户目标并决定下一步；ORX 负责权限确认、沙箱、执行和记录。",
      `用户当前消息：${input.task}`,
      "Command actions must include payload.program and payload.args. If the user asks to install software but the exact trusted source/package id is unknown, use ask_user instead of command.runWhitelisted.",
      "Only use command.runWhitelisted for ORX allowlisted commands: node --version, npm --version, rustc -V, cargo -V, git status --short --branch, npm run workflow:selftest, npm run build, npm run tauri -- build, cargo test, or trusted winget Feishu/Lark install/list. Do not use curl as command.runWhitelisted; use web.fetchUrl for reading a known public URL.",
      "",
      "只输出 JSON，不要输出 Markdown，不要解释 JSON 之外的文字。",
      "Use a cockpit protocol: put user-visible text only in visible_reply or reply; put reasoning only in reason; put executable work only in actions or workflow fields.",
      "Never place internal fields such as deliverables, risk, next suggestions, memory notes, or node-complete markers inside visible_reply unless the user explicitly asks for a report.",
      "可输出的 kind：",
      "- chat：普通自然对话，不执行工具。字段：reply, reason。",
      "- ask_user：信息不足或风险不清，需要问用户。字段：question, reason。",
      "- propose_actions：需要 ORX 工具执行。字段：reason, actions。",
      "- draft_workflow：需要创建/定制工作流。字段：reason。",
      "- run_workflow：明确是开发/测试/修复任务且应使用已有工作流。字段：reason, workflow_id 可选。",
      "",
      "可提议的 actions.kind 仅限：",
      formatOrionToolKindList(),
      `Tool schema summary: ${formatOrionToolSchemaSummary()}.`,
      "If the required capability is not listed, do not invent a tool name; return ask_user and name the missing capability.",
      "不要提议 git.push、workflow.delete、workflow.setDefault、release.build 等高危动作。命令类动作只提出意图和结构化 program/args，ORX 会决定是否沙箱或确认。",
      "",
      "输出示例：",
      "{\"kind\":\"chat\",\"reply\":\"你好，我在。\",\"reason\":\"普通问候\"}",
    ].join("\n"),
    upstream,
  };
}

export function parseOrionModelDecision(output: string): OrionModelDecision {
  const parsed = tryParseJsonObject(output);
  if (!parsed) {
    return { kind: "chat", reply: output.trim(), reason: "model_returned_plain_text" };
  }
  const kind = typeof parsed.kind === "string" ? parsed.kind : "";
  const reason = typeof parsed.reason === "string" ? parsed.reason : "model_decision";
  if (kind === "chat") {
    return { kind: "chat", reply: stringField(parsed.visible_reply, stringField(parsed.reply, "")), reason };
  }
  if (kind === "ask_user") {
    return { kind: "ask_user", question: stringField(parsed.question, "我需要你再补充一点信息。"), reason };
  }
  if (kind === "draft_workflow") {
    return { kind: "draft_workflow", reason };
  }
  if (kind === "run_workflow") {
    return { kind: "run_workflow", reason, workflow_id: typeof parsed.workflow_id === "string" ? parsed.workflow_id : undefined };
  }
  if (kind === "propose_actions") {
    const rawActions = Array.isArray(parsed.actions) ? parsed.actions as RawModelAction[] : [];
    const actions = rawActions.map(toSafeOrionAction).filter((action): action is OrionAction => Boolean(action));
    if (actions.length === 0) {
      const unsupported = unsupportedToolGap(rawActions);
      if (unsupported) return { kind: "ask_user", question: unsupported.message, reason: "unsupported_tool_capability", capability_gap: unsupported.gap };
      return { kind: "ask_user", question: "ORION 没有可安全执行的动作。请换一种说法，或明确你希望我聊天、查询、写文件还是运行命令。", reason: "no_safe_model_actions" };
    }
    return { kind: "propose_actions", reason, actions };
  }
  return { kind: "chat", reply: stringField(parsed.reply, ""), reason: "unknown_model_decision" };
}

export function formatOrionModelDecisionForMemory(decision: OrionModelDecision, options: { source?: "model" | "fallback" } = {}) {
  const prefix = options.source === "fallback" ? "fallback:" : "";
  const reason = options.source === "fallback" ? `fallback: ${decision.reason}` : decision.reason;
  if (decision.kind === "propose_actions") {
    return {
      decision: `${prefix}${decision.kind}:${decision.actions.map((action) => action.kind).join(" -> ")}`,
      reason,
    };
  }
  if (decision.kind === "run_workflow") {
    return {
      decision: decision.workflow_id ? `${prefix}${decision.kind}:${decision.workflow_id}` : `${prefix}${decision.kind}`,
      reason,
    };
  }
  return {
    decision: `${prefix}${decision.kind}`,
    reason,
  };
}

function toSafeOrionAction(raw: RawModelAction) {
  const kind = typeof raw.kind === "string" && isSupportedOrionToolKind(raw.kind) ? raw.kind : null;
  if (!kind) return null;
  const payload = raw.payload && typeof raw.payload === "object" && !Array.isArray(raw.payload)
    ? raw.payload as Record<string, unknown>
    : {};
  if (kind === "web.fetchUrl" || kind === "web.fetchUrlInsecure") {
    const url = typeof payload.url === "string" ? payload.url.trim() : "";
    const fallbackUrl = url || extractUrlFromText(`${payload.request ?? ""} ${payload.source ?? ""}`) || extractUrlFromText([raw.summary, raw.title].map((item) => typeof item === "string" ? item : "").join(" "));
    if (!fallbackUrl || !looksLikeHttpUrl(fallbackUrl)) return null;
    payload.url = fallbackUrl;
  }
  if (kind === "web.searchPublic" || kind === "web.searchSensitive") {
    const query = typeof payload.query === "string" ? payload.query.trim() : "";
    const fallbackQuery = query || extractQueryFromPayload(payload) || extractUrlFromText([raw.summary, raw.title].map((item) => typeof item === "string" ? item : "").join(" "));
    if (!fallbackQuery) return null;
    payload.query = fallbackQuery;
  }
  if (kind === "command.runWhitelisted" || kind === "command.runWorktreeSandbox") {
    const program = typeof payload.program === "string" ? payload.program.trim() : "";
    const args = Array.isArray(payload.args) && payload.args.every((arg) => typeof arg === "string")
      ? payload.args as string[]
      : null;
    if (!program || !args) return null;
    if (kind === "command.runWhitelisted" && !commandLooksWhitelisted(program, args)) {
      return createOrionAction(
        "command.runWorktreeSandbox",
        stringField(raw.title, "准备沙箱执行"),
        stringField(raw.summary, `命令不在直通白名单内，将在临时沙箱中执行：${program} ${args.join(" ")}`.trim()),
        payload,
      );
    }
  }
  return createOrionAction(
    kind,
    stringField(raw.title, kind),
    stringField(raw.summary, "由 ORION 模型驾驶员提出的工具动作。"),
    payload,
  );
}

function unsupportedToolGap(rawActions: RawModelAction[]) {
  const unsupportedKinds = rawActions
    .map((action) => typeof action.kind === "string" ? action.kind : "")
    .filter((kind) => kind && !isSupportedOrionToolKind(kind) && !isBlockedOrionToolKind(kind));
  if (unsupportedKinds.length === 0) return null;
  const alternatives = unsupportedKinds.map(toolAlternative).filter(Boolean);
  const uniqueKinds = Array.from(new Set(unsupportedKinds)).join("、");
  const alternativeText = alternatives.length > 0
    ? `可替代工具：${Array.from(new Set(alternatives)).join("、")}。`
    : "当前没有自动替代工具。";
  const firstUnsupported = rawActions.find((action) => typeof action.kind === "string" && unsupportedKinds.includes(action.kind));
  return {
    message: `ORX 缺少工具能力：${uniqueKinds}。${alternativeText}我会先暂停这次工具调用，避免执行到未知能力时报错。`,
    gap: {
      toolKind: unsupportedKinds[0],
      alternative: Array.from(new Set(alternatives))[0] ?? "",
      reason: "unsupported_tool_capability",
      payloadPreview: formatPayloadPreview(firstUnsupported?.payload),
    },
  };
}

function toolAlternative(kind: string) {
  return getOrionToolAlternative(kind);
}

function formatPayloadPreview(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return "";
  return Object.entries(payload as Record<string, unknown>)
    .slice(0, 6)
    .map(([key, value]) => `${key}=${Array.isArray(value) ? value.join(" ") : String(value)}`)
    .join("; ");
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

function extractQueryFromPayload(payload: Record<string, unknown>) {
  const request = typeof payload.request === "string" ? payload.request : "";
  const source = typeof payload.source === "string" ? payload.source : "";
  const text = `${request} ${source}`.trim();
  return extractUrlFromText(text) || text;
}

function extractUrlFromText(text: string) {
  return text.match(/https?:\/\/[^\s"'，。！？、）)]+|www\.[^\s"'，。！？、）)]+/i)?.[0] ?? "";
}

function looksLikeHttpUrl(value: string) {
  return /^https?:\/\//i.test(value.trim());
}

function commandLooksWhitelisted(program: string, args: string[]) {
  const normalizedProgram = program.trim().toLowerCase();
  const normalizedArgs = args.map((arg) => arg.trim().toLowerCase());
  const trustedWingetPackageIds = ["bytedance.feishu", "bytedance.lark"];
  const trustedInstallArgs = trustedWingetPackageIds.some((packageId) => normalizedArgs.join(" ") === `install --id ${packageId} --exact --accept-package-agreements --accept-source-agreements`);
  const trustedStatusArgs = trustedWingetPackageIds.some((packageId) => normalizedArgs.join(" ") === `list --id ${packageId} --exact`);
  return (normalizedProgram === "node" && normalizedArgs.length === 1 && normalizedArgs[0] === "--version")
    || (normalizedProgram === "npm" && normalizedArgs.length === 1 && normalizedArgs[0] === "--version")
    || (normalizedProgram === "rustc" && normalizedArgs.length === 1 && normalizedArgs[0] === "-v")
    || (normalizedProgram === "cargo" && normalizedArgs.length === 1 && normalizedArgs[0] === "-v")
    || (normalizedProgram === "git" && normalizedArgs.join(" ") === "status --short --branch")
    || (normalizedProgram === "winget" && (trustedInstallArgs || trustedStatusArgs))
    || (normalizedProgram === "npm" && normalizedArgs.join(" ") === "run workflow:selftest")
    || (normalizedProgram === "npm" && normalizedArgs.join(" ") === "run build")
    || (normalizedProgram === "npm" && normalizedArgs.join(" ") === "run tauri -- build")
    || (normalizedProgram === "cargo" && normalizedArgs.length === 1 && normalizedArgs[0] === "test");
}
