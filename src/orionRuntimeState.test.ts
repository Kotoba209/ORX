import test from "node:test";
import assert from "node:assert/strict";
import { deriveOrionRuntimeStatus, runtimeStatusNeedsVisibleProgress } from "./orionRuntimeState.ts";

test("derives a single runtime status from scattered UI flags", () => {
  assert.equal(deriveOrionRuntimeStatus({ assistantRunning: true }), "thinking");
  assert.equal(deriveOrionRuntimeStatus({ activityRunning: true }), "running_tool");
  assert.equal(deriveOrionRuntimeStatus({ workflowRunning: true }), "running_workflow");
  assert.equal(deriveOrionRuntimeStatus({ waitingForUser: true, workflowRunning: true }), "waiting_user");
  assert.equal(deriveOrionRuntimeStatus({ failed: true, workflowRunning: true }), "failed");
  assert.equal(deriveOrionRuntimeStatus({ completed: true }), "completed");
  assert.equal(deriveOrionRuntimeStatus({}), "idle");
});

test("only active, blocked, or failed states require visible progress UI", () => {
  assert.equal(runtimeStatusNeedsVisibleProgress("idle"), false);
  assert.equal(runtimeStatusNeedsVisibleProgress("thinking"), false);
  assert.equal(runtimeStatusNeedsVisibleProgress("completed"), false);
  assert.equal(runtimeStatusNeedsVisibleProgress("running_tool"), true);
  assert.equal(runtimeStatusNeedsVisibleProgress("running_workflow"), true);
  assert.equal(runtimeStatusNeedsVisibleProgress("waiting_user"), true);
  assert.equal(runtimeStatusNeedsVisibleProgress("failed"), true);
});
