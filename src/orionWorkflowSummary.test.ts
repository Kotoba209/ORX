import test from "node:test";
import assert from "node:assert/strict";
import {
  createFallbackOrionWorkflowSummary,
  createOrionWorkflowSummaryRunInput,
  parseOrionWorkflowSummary,
} from "./orionWorkflowSummary.ts";
import type { ProviderConfig } from "./orionChat.ts";

const provider: ProviderConfig = {
  id: "mimo",
  name: "MiMo",
  kind: "openai-compatible",
  api_protocol: "chat-completions",
  base_url: "http://127.0.0.1:8080",
  use_proxy_route: false,
  proxy_url: "",
  model: "mimo",
  api_key_ref: "MIMO_API_KEY",
};

test("creates a workflow summary prompt with process memory and final upstream", () => {
  const input = createOrionWorkflowSummaryRunInput({
    provider,
    task: "实现登录页",
    status: "completed",
    summaryText: "ORCH：全部流程节点已完成。",
    upstream: "[DEV / TaskSplit]\n生成了 generated/index.html",
    processContext: "最近 ORION 流程记忆：DEV 已输出 index.html",
  });

  assert.equal(input.owner, "ORION");
  assert.equal(input.stage, "工作流回顾记忆");
  assert.equal(input.provider, provider);
  assert.match(input.task, /AI 是驾驶员/);
  assert.match(input.task, /只输出 JSON/);
  assert.match(input.upstream, /状态：completed/);
  assert.match(input.upstream, /生成了 generated\/index\.html/);
  assert.match(input.upstream, /DEV 已输出 index\.html/);
});

test("parses workflow summary JSON into a compact memory payload", () => {
  const summary = parseOrionWorkflowSummary(JSON.stringify({
    summary: "登录页流程完成，DEV 生成了 index.html，QA 未发现阻塞问题。",
    outcome: "completed",
    artifacts: ["D:\\ORX\\tasks\\task-1\\generated\\index.html"],
    memory_note: "用户后续追问产物路径时，优先回答 generated/index.html。",
    follow_up_hints: ["可继续询问登录页产物路径", "可要求进入部署检查"],
  }));

  assert.equal(summary.outcome, "completed");
  assert.match(summary.summary, /登录页流程完成/);
  assert.deepEqual(summary.artifacts, ["D:\\ORX\\tasks\\task-1\\generated\\index.html"]);
  assert.match(summary.memory_note, /产物路径/);
  assert.deepEqual(summary.follow_up_hints, ["可继续询问登录页产物路径", "可要求进入部署检查"]);
});

test("falls back to a usable summary when model output is plain text", () => {
  const summary = parseOrionWorkflowSummary("流程失败在 QA，原因是测试命令缺失。");

  assert.equal(summary.outcome, "unknown");
  assert.match(summary.summary, /流程失败在 QA/);
  assert.deepEqual(summary.artifacts, []);
  assert.deepEqual(summary.follow_up_hints, []);
});

test("creates model-readable fallback summaries when summary model is unavailable", () => {
  const summary = createFallbackOrionWorkflowSummary({
    status: "failed",
    summaryText: "workflow failed at QA because npm test was unavailable",
    reason: "summary model request failed",
  });

  assert.equal(summary.outcome, "failed");
  assert.match(summary.summary, /fallback/);
  assert.match(summary.summary, /workflow failed at QA/);
  assert.match(summary.memory_note, /summary model request failed/);
  assert.deepEqual(summary.follow_up_hints, ["Ask about the workflow result, failure point, artifacts, or next repair step."]);
});
