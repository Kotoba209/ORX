import test from "node:test";
import assert from "node:assert/strict";
import {
  createOrionAssistantContinuationTask,
  shouldContinueOrionAssistantLoop,
} from "./orionAssistantLoop.ts";

test("continues assistant loop only after successful tool results within round limit", () => {
  assert.equal(shouldContinueOrionAssistantLoop({ round: 0, resultCount: 1, stopped: false }), true);
  assert.equal(shouldContinueOrionAssistantLoop({ round: 2, resultCount: 1, stopped: false }), false);
  assert.equal(shouldContinueOrionAssistantLoop({ round: 0, resultCount: 0, stopped: false }), false);
  assert.equal(shouldContinueOrionAssistantLoop({ round: 0, resultCount: 1, stopped: true }), false);
});

test("creates a continuation task that asks the model to decide next step from tool results", () => {
  const task = createOrionAssistantContinuationTask({
    originalTask: "读取 https://example.test 并总结技术栈",
    resultMessages: [
      "web.fetchUrl: 已读取网页：https://example.test；HTML 片段：<html>...</html>",
    ],
  });

  assert.match(task, /原始用户目标/);
  assert.match(task, /工具执行结果/);
  assert.match(task, /继续调用工具/);
  assert.match(task, /最终答复/);
  assert.match(task, /https:\/\/example\.test/);
});
