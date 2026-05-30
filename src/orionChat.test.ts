import test from "node:test";
import assert from "node:assert/strict";
import { createOrionChatRunInput, normalizeOrionChatOutput } from "./orionChat.ts";
import type { ProviderConfig } from "./orionChat.ts";

const provider: ProviderConfig = {
  id: "gpt-local",
  name: "GPT Local",
  kind: "openai-compatible",
  api_protocol: "responses",
  base_url: "http://127.0.0.1:8317/v1",
  use_proxy_route: true,
  proxy_url: "http://127.0.0.1:7897",
  model: "gpt-5.5",
  api_key_ref: "GPT_LOCAL_API_KEY",
};

test("creates a safe ORION ordinary chat agent input", () => {
  const input = createOrionChatRunInput({
    provider,
    task: "你好",
    chatLines: ["ORCH：等待任务。", "你：你好"],
    memoryContext: "trace_id：orion-1\n结果：上一轮结果",
  });

  assert.equal(input.owner, "ORION");
  assert.equal(input.stage, "普通聊天");
  assert.equal(input.provider, provider);
  assert.match(input.task, /用户当前消息：你好/);
  assert.match(input.task, /不要执行本机命令/);
  assert.match(input.upstream, /上一轮结果/);
  assert.match(input.upstream, /你：你好/);
});

test("normalizes model output for chat bubbles", () => {
  assert.equal(normalizeOrionChatOutput("你好，我在。\n节点完成"), "ORION：你好，我在。");
  assert.equal(normalizeOrionChatOutput("ORION：可以"), "ORION：可以");
  assert.equal(normalizeOrionChatOutput(""), "ORION：我在。");
});

test("removes workflow node report tails from ordinary chat output", () => {
  const reply = normalizeOrionChatOutput("你好！我是ORION，很高兴为您服务。 有什么我可以帮助您的吗？ **可交付产物**：本次聊天响应，已自然回复用户问候。 **风险**：无。 **下一步建议**：用户可继续普通对话。 **节点完成**。");

  assert.equal(reply, "ORION：你好！我是ORION，很高兴为您服务。 有什么我可以帮助您的吗？");
});

test("removes plain workflow report labels from ordinary chat output", () => {
  const reply = normalizeOrionChatOutput("你好！我是 ORION，很高兴为你服务。 有什么我可以帮助你的吗？ 可交付产物：普通聊天节点已处理用户问候，回复已发出。 风险：无。 下一步建议：等待用户提供后续指令；如需执行命令、写文件或联网查询，需通过 ORION 的权限确认流程。");

  assert.equal(reply, "ORION：你好！我是 ORION，很高兴为你服务。 有什么我可以帮助你的吗？");
});

test("keeps explicit useful suggestions when the model gives substantive advice", () => {
  const reply = normalizeOrionChatOutput("可以。建议：先把错误日志贴出来，我可以帮你判断是环境问题还是代码问题。");

  assert.equal(reply, "ORION：可以。建议：先把错误日志贴出来，我可以帮你判断是环境问题还是代码问题。");
});
test("removes markdown workflow report tables from ordinary chat output", () => {
  const reply = normalizeOrionChatOutput("你好！👋 这是 ORION 的普通聊天通道，有什么我可以帮你的吗？  **节点产出摘要：** | 项目 | 内容 | | --- | --- | | **可交付产物** | 已向用户发送友好问候，建议连接 | | **风险** | 无 | | **阻塞项** | 无 | | **下一步建议** | 等待用户输入具体需求；如涉及执行命令、文件操作或联网查询，将进入权限确认流程 |");

  assert.equal(reply, "ORION：你好！👋 这是 ORION 的普通聊天通道，有什么我可以帮你的吗？");
});
