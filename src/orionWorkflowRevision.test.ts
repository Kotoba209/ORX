import test from "node:test";
import assert from "node:assert/strict";
import {
  applyOrionWorkflowRevision,
  createOrionWorkflowRevisionRunInput,
  parseOrionWorkflowRevision,
} from "./orionWorkflowRevision.ts";
import { createOrionActionPlan } from "./orionPlanner.ts";
import type { ProviderConfig } from "./orionChat.ts";
import type { WorkflowDefinition } from "./workflowConfig.ts";

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

const workflow: WorkflowDefinition = {
  id: "draft-1",
  name: "安全靶场分析流程",
  description: "只读分析网页。",
  steps: [
    {
      stage: "WebRecon",
      owner: "DEV Agent",
      instruction: "抓取网页响应头和 HTML。",
      enabled: true,
      approval: "none",
      interaction: "single-turn",
      exit_condition: "node_complete",
    },
  ],
};

test("creates a model prompt for natural-language workflow revision with current draft and memory", () => {
  const input = createOrionWorkflowRevisionRunInput({
    provider,
    task: "分析安全靶场网页",
    revision: "抓取后增加一环，让架构师判断 TLS 风险，但不要执行扫描",
    workflow,
    processContext: "已确认网页属于用户自己的靶场。",
  });

  assert.equal(input.owner, "ORION");
  assert.equal(input.stage, "自定义工作流修订");
  assert.match(input.task, /AI 是工作流设计驾驶员/);
  assert.match(input.task, /TLS 风险/);
  assert.match(input.task, /安全靶场分析流程/);
  assert.match(input.upstream, /用户自己的靶场/);
});

test("parses model workflow revisions while preserving the pending workflow id", () => {
  const revised = parseOrionWorkflowRevision(JSON.stringify({
    name: "安全靶场 TLS 分析流程",
    description: "先抓取，再审查 TLS 风险。",
    steps: [
      {
        stage: "WebRecon",
        owner: "DEV Agent",
        instruction: "抓取网页响应头和 HTML。",
      },
      {
        stage: "TlsReview",
        owner: "ARCH Agent",
        instruction: "只读判断 TLS 风险，不执行扫描。",
        approval: "user",
      },
    ],
  }), workflow);

  assert.equal(revised?.id, "draft-1");
  assert.equal(revised?.name, "安全靶场 TLS 分析流程");
  assert.equal(revised?.steps.length, 2);
  assert.equal(revised?.steps[1].owner, "ARCH Agent");
  assert.equal(revised?.steps[1].approval, "user");
});

test("returns null instead of replacing the pending workflow with an unsafe revision", () => {
  assert.equal(parseOrionWorkflowRevision("not json", workflow), null);
  assert.equal(parseOrionWorkflowRevision(JSON.stringify({ name: "bad", steps: [] }), workflow), null);
});

test("preserves save-only intent when applying a model workflow revision", () => {
  const revised = {
    ...workflow,
    name: "修订后的安全靶场分析流程",
  };
  const saveOnlyActions = createOrionActionPlan(workflow).filter((action) => action.kind !== "workflow.run");
  const plan = applyOrionWorkflowRevision({ task: "分析安全靶场网页", workflow, actions: saveOnlyActions }, revised);

  assert.equal(plan.workflow.name, "修订后的安全靶场分析流程");
  assert.equal(plan.actions.some((action) => action.kind === "workflow.run"), false);
});
