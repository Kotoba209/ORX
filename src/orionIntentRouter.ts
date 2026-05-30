import type { ProviderConfig } from "./orionChat.ts";

export type OrionIntentRouteKind = "chat" | "assistant" | "workflow" | "custom_workflow" | "ask_user";

export type OrionIntentRouterRunInput = {
  provider: ProviderConfig;
  owner: string;
  stage: string;
  task: string;
  upstream: string;
};

export type OrionIntentRouteDecision = {
  route: OrionIntentRouteKind;
  confidence: number;
  reason: string;
  question?: string;
  facts?: OrionIntentFacts;
};

export type OrionIntentFacts = {
  target: string;
  operation: string;
  mentions_url: boolean;
  requires_code_change: boolean;
  requires_local_tool: boolean;
  destructive: boolean;
  missing_critical_target: boolean;
};

export function createOrionIntentRouterRunInput(input: {
  provider: ProviderConfig;
  task: string;
  chatLines: string[];
  projectContext?: string;
  processContext?: string;
  activeWorkflowName?: string;
}): OrionIntentRouterRunInput {
  const recentChat = input.chatLines.slice(-8).join("\n");
  const upstream = [
    input.projectContext ? `当前项目上下文：\n${input.projectContext}` : "",
    input.processContext ? `当前流程/产物/记忆上下文：\n${input.processContext}\n\n如果当前消息是在追问最近任务、产物路径、执行结果或刚才内容，优先选择 chat 或 assistant，不要误判为新的开发 workflow。` : "",
    input.activeWorkflowName ? `当前选中的工作流：${input.activeWorkflowName}` : "当前未预选工作流。",
    recentChat ? `最近对话：\n${recentChat}` : "",
  ].filter(Boolean).join("\n\n");
  return {
    provider: input.provider,
    owner: "ORION",
    stage: "Intent Router",
    task: [
      "你是 ORX 的意图路由模型。你的职责只是判断用户目的，不要生成执行动作，不要开始工作流，不要回答业务内容。",
      "AI 是驾驶员，ORX 提供方向盘、刹车、导航、记录仪、沙箱和安全带。你只决定下一步应该交给哪条路线。",
      "",
      `用户当前消息：${input.task}`,
      "",
      "先提取事实再选择路线。JSON facts 必须包含：target, operation, mentions_url, requires_code_change, requires_local_tool, destructive, missing_critical_target。",
      "只有缺少关键目标且任务无法继续时才 ask_user。普通不确定情况优先 assistant。只有 requires_code_change=true 才能 workflow。",
      "只输出 JSON，不要输出 Markdown，不要解释 JSON 之外的文字。",
      "字段：route, confidence, reason, question, facts。",
      "route 只能是以下之一：",
      "- chat：普通聊天、问候、闲聊、解释概念；不需要工具，不显示流程。",
      "- assistant：非开发任务但可能需要 ORION 工具处理，例如查询资料、分析已有网址、读取网页、检查本机环境、运行命令、写文件草案。",
      "- workflow：明确的软件开发、修 bug、写测试、改代码、实现功能任务。",
      "- custom_workflow：用户明确要求创建、设计、调整工作流或流程节点。",
      "- ask_user：意图不清或风险边界不清，需要先追问。",
      "",
      "重要边界：",
      "1. 用户只是问候或普通对话时，必须 route=chat。",
      "2. 用户给出已有 URL，要求分析网站、页面 HTML、服务器/技术栈、安全测试或靶场信息时，route=assistant，不要因为出现“页面/HTML/技术栈”就当作开发任务。",
      "3. 只有明确要求开发、实现、新增、修复、重构、写测试、改代码时，route=workflow。",
      "4. 如果用户说“做一个页面/实现一个功能/修复 bug”，route=workflow。",
      "5. confidence 介于 0.45 和 0.75 时优先 route=assistant，不要重复确认。只有 missing_critical_target=true 才 route=ask_user。",
      "6. 如果用户是在追问刚才/上次/最近的结果、产物路径、来源、总结或解释，且不需要重新调用工具，route=chat，facts.target=recent_memory，facts.operation=follow_up。",
      "",
      "示例：",
      "{\"route\":\"chat\",\"confidence\":0.95,\"reason\":\"用户只是问候\"}",
      "{\"route\":\"chat\",\"confidence\":0.88,\"reason\":\"用户追问最近任务结果\",\"facts\":{\"target\":\"recent_memory\",\"operation\":\"follow_up\",\"mentions_url\":false,\"requires_code_change\":false,\"requires_local_tool\":false,\"destructive\":false,\"missing_critical_target\":false}}",
      "{\"route\":\"assistant\",\"confidence\":0.9,\"reason\":\"用户要分析已有网址的 HTML 和技术栈\",\"facts\":{\"target\":\"existing_website\",\"operation\":\"inspect\",\"mentions_url\":true,\"requires_code_change\":false,\"requires_local_tool\":true,\"destructive\":false,\"missing_critical_target\":false}}",
      "{\"route\":\"workflow\",\"confidence\":0.88,\"reason\":\"用户明确要求实现页面功能\",\"facts\":{\"target\":\"project\",\"operation\":\"implement\",\"mentions_url\":false,\"requires_code_change\":true,\"requires_local_tool\":true,\"destructive\":false,\"missing_critical_target\":false}}",
    ].join("\n"),
    upstream,
  };
}

export function parseOrionIntentRouteDecision(output: string): OrionIntentRouteDecision | null {
  const parsed = tryParseJsonObject(output);
  if (!parsed) return null;
  const route = typeof parsed.route === "string" ? parsed.route : "";
  if (!isRouteKind(route)) return null;
  const confidence = clampConfidence(typeof parsed.confidence === "number" ? parsed.confidence : Number(parsed.confidence));
  const reason = stringField(parsed.reason, "model_intent_route");
  const question = typeof parsed.question === "string" && parsed.question.trim() ? parsed.question.trim() : undefined;
  const facts = parseFacts(parsed.facts);
  return { route, confidence, reason, question, ...(facts ? { facts } : {}) };
}

export function normalizeOrionIntentRouteDecision(decision: OrionIntentRouteDecision): OrionIntentRouteDecision {
  const facts = decision.facts;
  if (!facts) return decision;
  if (facts.missing_critical_target) {
    return { ...decision, route: "ask_user" };
  }
  if (isRecentMemoryFollowUp(facts)) {
    return { ...decision, route: "chat", reason: `${decision.reason}; ORX normalized: recent memory follow-up without tool need` };
  }
  if (decision.route === "workflow" && !facts.requires_code_change) {
    return { ...decision, route: "assistant", reason: `${decision.reason}; ORX normalized: no explicit code-change evidence` };
  }
  if (decision.route === "ask_user") {
    return {
      ...decision,
      route: facts.requires_code_change ? "workflow" : "assistant",
      reason: `${decision.reason}; ORX normalized: non-critical ambiguity`,
    };
  }
  return decision;
}

function isRecentMemoryFollowUp(facts: OrionIntentFacts) {
  const looksLikeFollowUp = /recent|memory|previous|last|history|context|刚才|上次|上一轮|最近/.test(facts.target)
    || /follow|summary|explain|recall|where|source|path|result|追问|总结|解释|来源|路径|结果/.test(facts.operation);
  return looksLikeFollowUp && !facts.requires_code_change && !facts.requires_local_tool && !facts.destructive;
}

export function intentRouteIsActionable(decision: OrionIntentRouteDecision, threshold = 0.45) {
  return decision.route === "chat" || decision.route === "ask_user" || decision.confidence >= threshold;
}

export function createOrionIntentClarificationQuestion(_decision: OrionIntentRouteDecision) {
  return "我还不能确定这是普通聊天、助手任务还是开发流程。你希望我只是回答，还是需要我调用工具/进入开发流程？";
}

export function formatOrionIntentRouteForMemory(decision: OrionIntentRouteDecision, options: { source?: "model" | "fallback" } = {}) {
  const prefix = options.source === "fallback" ? "fallback:" : "";
  return {
    decision: `${prefix}${decision.route}`,
    reason: options.source === "fallback" ? `fallback: ${decision.reason}` : decision.reason,
    confidence: decision.confidence,
  };
}

function isRouteKind(value: string): value is OrionIntentRouteKind {
  return value === "chat"
    || value === "assistant"
    || value === "workflow"
    || value === "custom_workflow"
    || value === "ask_user";
}

function clampConfidence(value: number) {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function parseFacts(value: unknown): OrionIntentFacts | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const facts = value as Record<string, unknown>;
  return {
    target: stringField(facts.target, "unknown"),
    operation: stringField(facts.operation, "unknown"),
    mentions_url: facts.mentions_url === true,
    requires_code_change: facts.requires_code_change === true,
    requires_local_tool: facts.requires_local_tool === true,
    destructive: facts.destructive === true,
    missing_critical_target: facts.missing_critical_target === true,
  };
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
