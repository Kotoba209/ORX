import test from "node:test";
import assert from "node:assert/strict";
import { createDefaultWorkflows } from "./workflowConfig.ts";
import { recommendWorkflowForTask } from "./workflowRouter.ts";

test("recommends bug-fix workflow for defect repair tasks", () => {
  const workflows = createDefaultWorkflows();

  const decision = recommendWorkflowForTask("修复登录页提交后 500 的 bug，并补回归测试", workflows);

  assert.equal(decision.workflow.id, "bug-fix");
  assert.equal(decision.reason, "任务更像缺陷修复，跳过完整 PRD，聚焦复现、修复、CR 和测试。");
  assert.equal(decision.confidence, "high");
});

test("recommends test-only workflow when the user asks only for tests", () => {
  const workflows = createDefaultWorkflows();

  const decision = recommendWorkflowForTask("只需要给现有订单模块补充集成测试和端到端测试", workflows);

  assert.equal(decision.workflow.id, "test-only");
  assert.equal(decision.confidence, "high");
});

test("keeps current workflow when task type is ambiguous", () => {
  const workflows = createDefaultWorkflows();
  const current = workflows.find((workflow) => workflow.id === "full-development");
  assert.ok(current);

  const decision = recommendWorkflowForTask("整理一下这个模块的下一步计划", workflows, current.id);

  assert.equal(decision.workflow.id, "full-development");
  assert.equal(decision.confidence, "low");
});
