import test from "node:test";
import assert from "node:assert/strict";
import {
  createFallbackOrionWorkflowDraft,
  createOrionWorkflowDraftRunInput,
  formatOrionWorkflowDraftDecisionForMemory,
  parseOrionWorkflowDraft,
} from "./orionWorkflowDraft.ts";
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

test("creates a model prompt for custom workflow drafting with process memory", () => {
  const input = createOrionWorkflowDraftRunInput({
    provider,
    task: "给安全靶场网页分析做一个自定义流程",
    processContext: "ORION 记忆：目标网页是 hnr.pages.dev",
  });

  assert.equal(input.owner, "ORION");
  assert.equal(input.stage, "自定义工作流草案");
  assert.match(input.task, /AI 是工作流设计驾驶员/);
  assert.match(input.task, /只输出 JSON/);
  assert.match(input.upstream, /hnr\.pages\.dev/);
});

test("parses model custom workflow drafts into safe workflow definitions", () => {
  const workflow = parseOrionWorkflowDraft(JSON.stringify({
    name: "安全靶场分析流程",
    description: "先采集网页，再分析技术栈和安全练习边界。",
    steps: [
      {
        stage: "Intake",
        owner: "PM Agent",
        instruction: "确认目标网址、授权范围和输出格式。",
        approval: "none",
      },
      {
        stage: "WebRecon",
        owner: "DEV Agent",
        instruction: "只读抓取网页 HTML、响应头和可见技术栈。",
        skill_ids: ["web-recon"],
      },
      {
        stage: "RiskReview",
        owner: "ARCH Agent",
        instruction: "评估安全测试边界和禁止动作。",
        approval: "user",
        rollback_target: "WebRecon",
      },
    ],
  }), { task: "分析网页", now: 123 });

  assert.equal(workflow?.id, "orion-model-workflow-123");
  assert.equal(workflow?.name, "安全靶场分析流程");
  assert.equal(workflow?.steps.length, 3);
  assert.equal(workflow?.steps[1].owner, "DEV Agent");
  assert.deepEqual(workflow?.steps[1].skill_ids, ["web-recon"]);
  assert.equal(workflow?.steps[2].approval, "user");
  assert.equal(workflow?.steps[2].rollback_target, "WebRecon");
});

test("returns null for unsafe or empty workflow drafts", () => {
  assert.equal(parseOrionWorkflowDraft("not json", { task: "x" }), null);
  assert.equal(parseOrionWorkflowDraft(JSON.stringify({ name: "bad", steps: [] }), { task: "x" }), null);
  assert.equal(parseOrionWorkflowDraft(JSON.stringify({ name: "bad", steps: [{ stage: "", owner: "", instruction: "" }] }), { task: "x" }), null);
  assert.equal(parseOrionWorkflowDraft(JSON.stringify({ name: "bad", steps: [{ stage: "Run", owner: "Root Agent", instruction: "以管理员身份执行。" }] }), { task: "x" }), null);
});

test("creates fallback custom workflow drafts with explicit memory markers", () => {
  const fallback = createFallbackOrionWorkflowDraft("修复登录 bug", "model unavailable");
  const memory = formatOrionWorkflowDraftDecisionForMemory(fallback, { source: "fallback", reason: "model unavailable" });

  assert.equal(fallback.workflow.name, "Bug Investigation");
  assert.match(fallback.reason, /model unavailable/);
  assert.equal(memory.decision, "fallback:Bug Investigation");
  assert.match(memory.reason, /fallback/);
  assert.match(memory.reason, /model unavailable/);
});
