import test from "node:test";
import assert from "node:assert/strict";
import { extractVisibleReply, normalizeOrionVisibleReply, stripWorkflowReportTail } from "./orionVisibleReply.ts";

test("extracts visible_reply from structured ORION model output", () => {
  const output = JSON.stringify({
    visible_reply: "你好，我在。",
    internal_reason: "ordinary greeting",
    action_plan: [],
    memory_update: "user greeted ORION",
  });

  assert.equal(extractVisibleReply(output), "你好，我在。");
  assert.equal(normalizeOrionVisibleReply(output), "ORION：你好，我在。");
});

test("removes workflow report tails from chat-visible replies", () => {
  const reply = "你好，有什么我可以帮你的？ 可交付产物：普通聊天回复。风险：无。下一步建议：等待用户输入。";

  assert.equal(stripWorkflowReportTail(reply), "你好，有什么我可以帮你的？");
});

test("keeps substantive advice when it is part of the visible reply", () => {
  const reply = "建议先贴出报错日志，我可以帮你判断是环境问题还是代码问题。";

  assert.equal(normalizeOrionVisibleReply(reply), "ORION：建议先贴出报错日志，我可以帮你判断是环境问题还是代码问题。");
});
