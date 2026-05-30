import test from "node:test";
import assert from "node:assert/strict";
import { activityFloatShouldAutoExpand, activityFloatSummary, shouldCollapseActivityFloat } from "./activityFloat.ts";

test("auto collapses a completed activity float after a short delay", () => {
  assert.equal(shouldCollapseActivityFloat({
    activityActive: false,
    lastChangedAt: 1000,
    now: 4600,
    delayMs: 3200,
  }), true);
});

test("keeps an active activity float expanded while work is running", () => {
  assert.equal(shouldCollapseActivityFloat({
    activityActive: true,
    lastChangedAt: 1000,
    now: 9000,
    delayMs: 3200,
  }), false);
});

test("summarizes collapsed activity float progress", () => {
  assert.deepEqual(activityFloatSummary({
    title: "任务进度",
    subtitle: "ORION 临时任务",
    done: 3,
    total: 5,
    active: false,
  }), {
    title: "任务进度",
    subtitle: "ORION 临时任务",
    progress: "3/5",
    status: "已收纳",
  });
});

test("does not auto expand stale activity for ordinary chat without a new task signature", () => {
  assert.equal(activityFloatShouldAutoExpand({
    previousSignature: "old-task",
    nextSignature: "old-task",
    hasTaskActivity: false,
  }), false);
});

test("auto expands when a new task activity signature arrives", () => {
  assert.equal(activityFloatShouldAutoExpand({
    previousSignature: "old-task",
    nextSignature: "new-task",
    hasTaskActivity: true,
  }), true);
});
