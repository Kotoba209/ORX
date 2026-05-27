import test from "node:test";
import assert from "node:assert/strict";
import {
  nextRuntimeAfterClarificationAnswer,
  parseClarificationOutput,
  stepUsesInteractiveClarification,
} from "./clarificationState.ts";
import type { WorkflowRuntimeState, WorkflowStep } from "./workflowState.ts";

const trellisStep: WorkflowStep = {
  stage: "Clarification",
  owner: "PD Agent",
  instruction: "持续追问直到需求明确。",
  enabled: true,
  approval: "none",
  skill_ids: ["trellis"],
  interaction: "multi-turn",
  exit_condition: "requirements_ready",
};

test("detects Trellis multi-turn clarification steps", () => {
  assert.equal(stepUsesInteractiveClarification(trellisStep), true);
  assert.equal(stepUsesInteractiveClarification({ ...trellisStep, interaction: "single-turn" }), false);
});

test("pauses when Trellis asks another clarification question", () => {
  const decision = parseClarificationOutput("还需要确认：管理员是否可以批量禁用用户？");

  assert.equal(decision.status, "needs_user_input");
  assert.match(decision.prompt, /批量禁用用户/);
});

test("continues when Trellis marks requirements ready", () => {
  const decision = parseClarificationOutput("需求已明确：用户管理页包含查询、禁用、重置密码。");

  assert.equal(decision.status, "requirements_ready");
});

test("continues when Trellis summarizes a confirmed baseline", () => {
  const decision = parseClarificationOutput("节点总结：用户已明确确认需求基线，所有澄清项均已收敛。本节点（Clarification）的核心职责已完成。请 ORCH 将最终需求基线下发至方案设计节点。");

  assert.equal(decision.status, "requirements_ready");
});

test("adds user clarification answer to upstream and reruns same step", () => {
  const runtime: WorkflowRuntimeState = { nextIndex: 1, upstream: "用户任务：做用户管理页" };

  const next = nextRuntimeAfterClarificationAnswer(runtime, trellisStep, "需要批量禁用，但必须二次确认。", 1);

  assert.equal(next.nextIndex, 1);
  assert.match(next.upstream, /Trellis clarification answer/);
  assert.match(next.upstream, /需要批量禁用/);
});
