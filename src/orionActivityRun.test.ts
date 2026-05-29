import test from "node:test";
import assert from "node:assert/strict";
import { createOrionAction } from "./orionActions.ts";
import {
  createOrionActivityRun,
  orionActivityStepStatusLabel,
  shouldShowOrionActivityFloat,
  markOrionActivityActionDone,
  markOrionActivityActionRunning,
} from "./orionActivityRun.ts";

test("creates a temporary activity run for ORION assistant actions", () => {
  const action = createOrionAction(
    "web.searchPublic",
    "联网查询公开资料",
    "联网查询公开资料：https://hnr.pages.dev/",
    { query: "https://hnr.pages.dev/" },
  );

  const run = createOrionActivityRun("帮我抓取这个网页https://hnr.pages.dev/", [action]);

  assert.equal(run.task, "帮我抓取这个网页https://hnr.pages.dev/");
  assert.equal(run.status, "pending");
  assert.deepEqual(run.steps.map((step) => step.status), ["done", "done", "done", "pending", "pending", "pending"]);
  assert.deepEqual(run.steps.map((step) => step.title), [
    "识别任务",
    "生成动作",
    "权限判断",
    "联网查询公开资料",
    "整理结果",
    "完成",
  ]);
});

test("updates an ORION activity action through running and done states", () => {
  const action = createOrionAction(
    "file.searchProject",
    "搜索当前项目",
    "在当前项目内搜索：ORION",
    { query: "ORION" },
  );
  const run = createOrionActivityRun("搜索 ORION", [action]);

  const running = markOrionActivityActionRunning(run, action.id);
  assert.equal(running.status, "running");
  assert.equal(running.steps[3].status, "running");

  const done = markOrionActivityActionDone(running, action.id, "命中 3 处");
  assert.equal(done.status, "done");
  assert.equal(done.steps[3].status, "done");
  assert.equal(done.steps[3].detail, "命中 3 处");
  assert.equal(done.steps[4].status, "done");
  assert.equal(done.steps[5].status, "done");
});

test("shows ORION activity as a float when the inspector is collapsed and no workflow is active", () => {
  const action = createOrionAction("web.searchPublic", "联网查询公开资料", "查询网页", { query: "https://hnr.pages.dev/" });
  const run = createOrionActivityRun("抓取网页", [action]);

  assert.equal(shouldShowOrionActivityFloat({
    run,
    inspectorCollapsed: true,
    workflowMetricCount: 0,
    hasApprovalGate: false,
    hasConfigPanel: false,
    hasPendingPlan: false,
    hasPendingAssistant: false,
    hasPendingMemoryCandidate: false,
  }), true);
  assert.equal(shouldShowOrionActivityFloat({
    run,
    inspectorCollapsed: false,
    workflowMetricCount: 0,
    hasApprovalGate: false,
    hasConfigPanel: false,
    hasPendingPlan: false,
    hasPendingAssistant: false,
    hasPendingMemoryCandidate: false,
  }), false);
});

test("labels temporary ORION activity states with compact workflow-style copy", () => {
  assert.equal(orionActivityStepStatusLabel("pending"), "等待中");
  assert.equal(orionActivityStepStatusLabel("running"), "正在运行");
  assert.equal(orionActivityStepStatusLabel("done"), "已完成");
  assert.equal(orionActivityStepStatusLabel("failed"), "已停止");
});
