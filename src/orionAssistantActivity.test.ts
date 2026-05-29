import test from "node:test";
import assert from "node:assert/strict";
import { composerSendState, assistantActivityLine } from "./orionAssistantActivity.ts";

test("composer send state shows loading while ORION assistant action is running", () => {
  const state = composerSendState({
    workflowRunning: false,
    assistantRunning: true,
    approvalGate: false,
    clarificationGate: false,
  });

  assert.equal(state.disabled, true);
  assert.equal(state.className, "assistant-loading-button");
  assert.equal(state.ariaLabel, "ORION 正在执行本机助手动作");
  assert.equal(state.title, "ORION 正在执行");
  assert.equal(state.content, "");
});

test("assistant activity line reports the current action count", () => {
  assert.equal(assistantActivityLine(2), "ORION 正在执行 2 个本机助手动作");
});

test("composer send state keeps workflow stop behavior above assistant loading", () => {
  const state = composerSendState({
    workflowRunning: true,
    assistantRunning: true,
    approvalGate: false,
    clarificationGate: false,
  });

  assert.equal(state.disabled, false);
  assert.equal(state.className, "stop-workflow-button");
  assert.equal(state.ariaLabel, "终止当前流程");
});
