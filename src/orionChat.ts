import { extractVisibleReply, normalizeOrionVisibleReply } from "./orionVisibleReply.ts";

export type ProviderConfig = {
  id: string;
  name: string;
  kind: string;
  api_protocol: "responses" | "chat-completions" | "anthropic-messages" | "custom-direct";
  base_url: string;
  use_proxy_route: boolean;
  proxy_url: string;
  model: string;
  api_key_ref: string;
};

export type OrionChatRunInput = {
  provider: ProviderConfig;
  owner: string;
  stage: string;
  task: string;
  upstream: string;
};

export function createOrionChatRunInput(input: {
  provider: ProviderConfig;
  task: string;
  chatLines: string[];
  memoryContext?: string;
  processContext?: string;
}): OrionChatRunInput {
  const recentChat = input.chatLines.slice(-10).join("\n");
  const upstream = [
    "这是 ORION 的普通聊天通道，不是 ORCH 工作流节点。",
    input.processContext ? `当前流程/产物/归档上下文：\n${input.processContext}` : "",
    input.memoryContext ? `可用结构化记忆：\n${input.memoryContext}` : "",
    recentChat ? `最近对话：\n${recentChat}` : "",
  ].filter(Boolean).join("\n\n");
  return {
    provider: input.provider,
    owner: "ORION",
    stage: "普通聊天",
    task: [
      `用户当前消息：${input.task}`,
      "",
      "请作为 ORION 直接自然回复用户。不要创建工作流，不要执行本机命令，不要声称已经修改文件或访问网络。",
      "如果用户后续需要执行命令、写文件或联网查询，说明需要通过 ORION 的权限确认流程。",
      "优先输出 JSON：{\"visible_reply\":\"给用户看的自然回复\",\"internal_reason\":\"内部原因\"}。如果无法输出 JSON，也只能输出给用户看的自然回复。",
      "不要输出节点报告、Markdown 表格、可交付产物、风险、下一步建议、节点完成等工作流字段；普通寒暄只回复一句自然问候。",
      "回复使用中文，简洁但要像正常对话。",
    ].join("\n"),
    upstream,
  };
}

export function normalizeOrionChatOutput(output: string) {
  if (extractVisibleReply(output)) return normalizeOrionVisibleReply(output, "ORION锛氭垜鍦ㄣ€?");
  const cleaned = output
    .replace(/\s*\|?\s*\*\*?节点产出摘要\s*[:：]?\*\*?[\s\S]*$/i, "")
    .replace(/\s*\|?\s*节点产出摘要\s*\|[\s\S]*$/i, "")
    .replace(/\s*\|?\s*\*\*?可交付产物\*\*?[\s\S]*$/i, "")
    .replace(/\s*\*\*可交付产物\*\*[:：][\s\S]*$/i, "")
    .replace(/\s*可交付产物[:：][\s\S]*$/i, "")
    .replace(/\s*\*\*风险\*\*[:：][\s\S]*$/i, "")
    .replace(/\s*风险[:：]\s*无[。.]?\s*(?:下一步建议[:：][\s\S]*)?$/i, "")
    .replace(/\s*\*\*下一步建议\*\*[:：][\s\S]*$/i, "")
    .replace(/\s*下一步建议[:：]\s*(?:等待用户|用户可继续|如需执行|后续可|暂无)[\s\S]*$/i, "")
    .replace(/(^|\n)\s*节点完成[。.]?\s*$/g, "")
    .replace(/\s*\*\*节点完成\*\*[。.]?\s*$/g, "")
    .replace(/(^|\n)\s*完成后通知 ORCH[^\n]*$/g, "")
    .trim();
  if (!cleaned) return "ORION：我在。";
  return cleaned.startsWith("ORION：") ? cleaned : `ORION：${cleaned}`;
}
