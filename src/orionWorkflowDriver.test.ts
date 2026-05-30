import test from "node:test";
import assert from "node:assert/strict";
import { createDefaultWorkflows } from "./workflowConfig.ts";
import {
  applyOrionWorkflowDriverDecision,
  createOrionWorkflowDriverRunInput,
  createOrionWorkflowDriverHandoff,
  formatOrionWorkflowDriverDecisionForMemory,
  parseOrionWorkflowDriverDecision,
} from "./orionWorkflowDriver.ts";
import type { ProviderConfig } from "./orionChat.ts";

const provider: ProviderConfig = {
  id: "gpt-local",
  name: "GPT Local",
  kind: "openai-compatible",
  api_protocol: "responses",
  base_url: "http://127.0.0.1:8317/v1",
  use_proxy_route: true,
  proxy_url: "http://127.0.0.1:7897",
  model: "gpt-5.5",
  api_key_ref: "GPT_LOCAL_API_KEY",
};

test("creates a development workflow driver input with adjustable flow choices", () => {
  const input = createOrionWorkflowDriverRunInput({
    provider,
    task: "优化登录页面按钮样式",
    workflows: createDefaultWorkflows(),
    projectContext: "root=D:/CodexProjects/ORX; files=30",
  });

  assert.equal(input.owner, "ORION");
  assert.equal(input.stage, "开发流程驾驶决策");
  assert.match(input.task, /AI 是开发流程驾驶员/);
  assert.match(input.task, /lightweight/);
  assert.match(input.task, /add_scout/);
  assert.match(input.task, /只输出 JSON/);
});

test("includes ORION process memory in workflow driver upstream", () => {
  const input = createOrionWorkflowDriverRunInput({
    provider,
    task: "基于刚才网页结果做一个安全测试页面",
    workflows: createDefaultWorkflows(),
    projectContext: "root=D:/CodexProjects/ORX; files=30",
    processContext: "ORION 最终答复：页面运行在 Cloudflare Pages，前端像是静态站点。",
  });

  assert.match(input.upstream, /当前流程\/产物\/记忆上下文/);
  assert.match(input.upstream, /ORION 最终答复：页面运行在 Cloudflare Pages/);
});

test("parses workflow driver decisions", () => {
  const decision = parseOrionWorkflowDriverDecision(JSON.stringify({
    workflow: "lightweight",
    confidence: 0.82,
    needs_clarification: false,
    add_scout: true,
    add_arch_review: false,
    add_qa: true,
    reason: "UI 小改，先只读确认范围，再开发和验证",
  }));

  assert.deepEqual(decision, {
    workflow: "lightweight",
    confidence: 0.82,
    needs_clarification: false,
    add_scout: true,
    add_arch_review: false,
    add_qa: true,
    reason: "UI 小改，先只读确认范围，再开发和验证",
  });
});

test("maps a lightweight driver decision to a controllable workflow draft", () => {
  const result = applyOrionWorkflowDriverDecision("优化登录按钮样式", parseOrionWorkflowDriverDecision(JSON.stringify({
    workflow: "lightweight",
    confidence: 0.8,
    add_scout: true,
    add_qa: true,
    reason: "小范围 UI 改动",
  })), createDefaultWorkflows());

  assert.equal(result.kind, "draft");
  assert.equal(result.workflow.name, "ORION 轻量开发流程");
  assert.deepEqual(result.workflow.steps.map((step) => step.stage), ["Scout", "TaskSplit", "TestPlan", "Retrospective"]);
});

test("maps bug decisions to existing bug workflow", () => {
  const result = applyOrionWorkflowDriverDecision("修复登录 500 bug", parseOrionWorkflowDriverDecision(JSON.stringify({
    workflow: "bug",
    confidence: 0.9,
    reason: "明确缺陷修复",
  })), createDefaultWorkflows());

  assert.equal(result.kind, "existing");
  assert.equal(result.workflow.id, "bug-fix");
});

test("hands model run-workflow decisions to the workflow driver with the requested existing workflow as fallback", () => {
  const handoff = createOrionWorkflowDriverHandoff("修复登录 500 bug", {
    kind: "run_workflow",
    reason: "明确是缺陷修复任务",
    workflow_id: "bug-fix",
  }, createDefaultWorkflows(), "");

  assert.equal(handoff.workflow.id, "bug-fix");
  assert.match(handoff.reason, /明确是缺陷修复任务/);
  assert.match(handoff.reason, /bug-fix/);
});

test("formats fallback workflow driver decisions as explicit model-readable memory", () => {
  const memory = formatOrionWorkflowDriverDecisionForMemory({
    workflow: "full",
    confidence: 0.5,
    needs_clarification: false,
    add_scout: false,
    add_arch_review: false,
    add_qa: true,
    reason: "static workflow fallback after driver model was unavailable",
  }, { source: "fallback" });

  assert.equal(memory.decision, "fallback:full");
  assert.match(memory.reason, /fallback/);
  assert.match(memory.reason, /static workflow fallback/);
  assert.equal(memory.confidence, 0.5);
});
