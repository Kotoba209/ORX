import type { OrionMemoryEntry } from "./orionMemory.ts";

export function findLatestWaitingOrionQuestion(entries: OrionMemoryEntry[]) {
  const answeredTraceIds = new Set(entries
    .filter((entry) => entry.kind === "assistant.answer" && entry.status === "answered")
    .map((entry) => entry.traceId));
  return [...entries]
    .reverse()
    .find((entry) => entry.kind === "assistant.question" && entry.status === "waiting_user" && !answeredTraceIds.has(entry.traceId));
}

export function shouldTreatAsOrionQuestionAnswer(answer: string, question: OrionMemoryEntry | undefined | null) {
  if (!question) return false;
  const text = answer.trim();
  if (!text) return false;
  if (looksLikeRouteClarificationChoice(text)) return true;
  if (looksLikeNewTask(text)) return false;
  return text.length <= 80 || looksLikeDirectAnswer(text);
}

export function createOrionQuestionAnswerTask(question: OrionMemoryEntry, answer: string) {
  return [
    "用户正在回答 ORION 上一轮追问。请结合追问上下文继续判断下一步，而不是把这句话当作全新任务。",
    `原始任务：${question.task}`,
    `ORION 追问：${fieldValue(question.message, "question") || question.message}`,
    fieldValue(question.message, "reason") ? `追问原因：${fieldValue(question.message, "reason")}` : "",
    `用户回答：${answer.trim()}`,
    "Route clarification guidance: if the user answer chooses only answering/plain chat, choose chat. If the user answer chooses tools/direct execution, choose propose_actions when safe. If the user answer chooses development workflow, choose run_workflow or draft_workflow according to the original task.",
  ].filter(Boolean).join("\n");
}

export function createOrionResolvedTaskForOrch(question: OrionMemoryEntry, answer: string) {
  return [
    "ORION 已根据上一轮追问补全用户意图。下面是交给 ORCH 或工具规划器的完整任务描述。",
    "不要只向 ORCH 下发“继续”“是”“可以”这类短命令；必须结合原始任务、ORION 追问和用户回答形成可执行目标。",
    `原始任务：${question.task}`,
    `ORION 追问：${fieldValue(question.message, "question") || question.message}`,
    fieldValue(question.message, "reason") ? `追问原因：${fieldValue(question.message, "reason")}` : "",
    `用户回答：${answer.trim()}`,
    "请把用户回答视为对原始任务的补充约束。如果用户确认继续，就继续执行原始任务；如果用户选择某个方式，就按该方式执行原始任务。",
  ].filter(Boolean).join("\n");
}

function looksLikeNewTask(text: string) {
  return /(重新|新建|创建|做一个|实现|开发|修复|重构|写测试|改代码|帮我查|读取|分析|运行|执行|安装|删除|推送|提交|workflow|工作流)/i.test(text);
}

function looksLikeDirectAnswer(text: string) {
  return /^(就|用|选择|选|是|不是|可以|继续|这个|那个|Chrome|Edge|npm|pnpm|yarn|node|python|rust|java|http|https)/i.test(text);
}

function looksLikeRouteClarificationChoice(text: string) {
  return /^(直接执行|调用工具处理|调用工具|用工具|只是回答|只回答|普通聊天|进入开发流程|走开发流程|用工作流|进入工作流)$/i.test(text.trim());
}

function fieldValue(message: string, field: string) {
  const pattern = new RegExp(`(?:^|\\n)${field}:\\s*([^\\n]+)`);
  return message.match(pattern)?.[1]?.trim() ?? "";
}
