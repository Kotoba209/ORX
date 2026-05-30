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

test("routes website technology stack analysis to ORION assistant instead of development workflow", () => {
  const workflows = createDefaultWorkflows();

  const route = resolveOrionConversationRoute("我需要页面 HTML 包括服务器技术栈，地址是 https://hnr.pages.dev/", {
    workflows,
    activeWorkflowId: "full-development",
    projectFiles: ["package.json", "src/App.tsx"],
  });

  assert.equal(route.kind, "assistant");
});

test("routes ambiguous codebase tasks to ORION assistant when no workflow is selected", () => {
  const workflows = createDefaultWorkflows();

  const route = resolveOrionConversationRoute("帮我看一下这个项目", {
    workflows,
    activeWorkflowId: "",
    projectFiles: ["package.json", "src/App.tsx"],
  });

  assert.equal(route.kind, "assistant");
  assert.equal(route.reason, "no_active_workflow_selected");
});

test("routes security practice website html and server stack requests to assistant", () => {
  const workflows = createDefaultWorkflows();

  const route = resolveOrionConversationRoute("是我个人的，主要做安全测试内容以及靶场练习，我需要页面HTML包括服务器技术栈，地址是 https://hnr.pages.dev/", {
    workflows,
    activeWorkflowId: "full-development",
    projectFiles: ["package.json", "src/App.tsx"],
  });

  assert.equal(route.kind, "assistant");
  assert.equal(route.reason, "task_mentions_website_analysis");
});
