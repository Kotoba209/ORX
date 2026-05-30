import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyWorkflowNodeFailure,
  createWorkflowNodeFailure,
  formatWorkflowNodeFailureForChat,
} from "./workflowNodeFailure.ts";

test("classifies missing implementation artifacts as a validation failure category", () => {
  assert.equal(classifyWorkflowNodeFailure("DEV Agent / Implementation 未生成有效非空代码产物，请输出 FILE 标记"), "artifact_missing");
});

test("creates a user-facing recovery message for failed workflow nodes", () => {
  const failure = createWorkflowNodeFailure({
    step: { owner: "DEV Agent", stage: "Implementation", instruction: "实现代码" },
    message: "未输出可落盘文件产物",
    now: 1000,
  });

  assert.equal(failure.kind, "artifact_missing");
  assert.equal(failure.title, "缺少代码产物");
  assert.match(failure.recovery, /DEV Implementation/);
  assert.match(formatWorkflowNodeFailureForChat(failure), /未通过验收/);
});

test("classifies provider failures separately from tool execution failures", () => {
  assert.equal(classifyWorkflowNodeFailure("Agent 调用失败: endpoint=https://x timeout=120s error=request failed"), "provider_error");
  assert.equal(classifyWorkflowNodeFailure("命令不在 ORION 白名单内"), "tool_error");
});
