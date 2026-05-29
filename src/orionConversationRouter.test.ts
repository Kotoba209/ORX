import test from "node:test";
import assert from "node:assert/strict";
import { createDefaultWorkflows } from "./workflowConfig.ts";
import { resolveOrionConversationRoute } from "./orionConversationRouter.ts";

test("routes development tasks to an existing workflow without draft review", () => {
  const workflows = createDefaultWorkflows();

  const route = resolveOrionConversationRoute("做一个用户设置页面", {
    workflows,
    activeWorkflowId: "full-development",
    projectFiles: ["package.json", "src/App.tsx"],
  });

  assert.equal(route.kind, "existing-workflow");
  assert.equal(route.workflow.id, "full-development");
  assert.equal(route.requiresDraftReview, false);
});

test("routes bug tasks to an existing bug workflow without draft review", () => {
  const workflows = createDefaultWorkflows();

  const route = resolveOrionConversationRoute("修复登录 500 bug 并补回归测试", {
    workflows,
    activeWorkflowId: "full-development",
    projectFiles: ["package.json", "src/App.tsx"],
  });

  assert.equal(route.kind, "existing-workflow");
  assert.equal(route.workflow.id, "bug-fix");
  assert.equal(route.requiresDraftReview, false);
});

test("routes direct ORION development requests to an existing workflow unless workflow customization is explicit", () => {
  const workflows = createDefaultWorkflows();

  const route = resolveOrionConversationRoute("ORION 安排一下修复登录 bug", {
    workflows,
    activeWorkflowId: "full-development",
    projectFiles: ["package.json", "src/App.tsx"],
  });

  assert.equal(route.kind, "existing-workflow");
  assert.equal(route.workflow.id, "bug-fix");
  assert.equal(route.requiresDraftReview, false);
});

test("routes explicit custom workflow requests to ORION draft review", () => {
  const workflows = createDefaultWorkflows();

  const route = resolveOrionConversationRoute("让 ORION 自定义一个适合数据迁移的工作流", {
    workflows,
    activeWorkflowId: "full-development",
    projectFiles: ["package.json"],
  });

  assert.equal(route.kind, "custom-workflow-draft");
  assert.equal(route.requiresDraftReview, true);
});

test("routes local non-development tasks to ORION assistant", () => {
  const workflows = createDefaultWorkflows();

  const route = resolveOrionConversationRoute("检查 Node 和 npm 版本", {
    workflows,
    activeWorkflowId: "full-development",
    projectFiles: ["notes.txt"],
  });

  assert.equal(route.kind, "assistant");
});
