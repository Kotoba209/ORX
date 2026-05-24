import assert from "node:assert/strict";
import test from "node:test";
import { toChatTimelineItems } from "./chatTimeline.ts";

test("chat timeline keeps user approval inline with workflow events", () => {
  const items = toChatTimelineItems([
    "ORCH：ARCH Agent / CodeReview 需要你预览确认。",
    "你：同意，CR 结论可以继续。",
    "ORCH：审批通过，继续推进 TestPlan 节点。",
  ]);

  assert.deepEqual(items.map((item) => item.side), ["system", "user", "system"]);
  assert.deepEqual(items.map((item) => item.text), [
    "ORCH：ARCH Agent / CodeReview 需要你预览确认。",
    "同意，CR 结论可以继续。",
    "ORCH：审批通过，继续推进 TestPlan 节点。",
  ]);
});
