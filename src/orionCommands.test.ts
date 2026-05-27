import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { OrionAction } from "./orionActions.ts";
import { createOrionAction } from "./orionActions.ts";
import {
  applyOrionNodeInstruction,
  applyOrionPlanModification,
  parseOrionCommand,
  type OrionCommandPlan,
} from "./orionCommands.ts";
import type { WorkflowDefinition } from "./workflowConfig.ts";

function workflow(): WorkflowDefinition {
  return {
    id: "wf",
    name: "Bug Investigation",
    description: "draft",
    steps: [
      { stage: "Intake", owner: "PM Agent", instruction: "收集信息", enabled: true },
      { stage: "BugTrace", owner: "DEV Agent", instruction: "排查 bug", enabled: true },
    ],
  };
}

function plan(actions: OrionAction[] = [
  createOrionAction("workflow.create", "保存工作流", "保存工作流", { workflow: workflow() }),
  createOrionAction("workflow.run", "运行工作流", "运行工作流", { workflow_id: "wf" }),
], draft = workflow()): OrionCommandPlan {
  return { task: "查登录失败 bug", workflow: draft, actions };
}

test("parses @orion text as a create-plan command", () => {
  assert.deepEqual(parseOrionCommand("@orion 帮我查登录失败 bug", false), {
    type: "create_plan",
    task: "帮我查登录失败 bug",
  });
});

test("parses pending approval commands", () => {
  assert.deepEqual(parseOrionCommand("允许", true), { type: "approve_once" });
  assert.deepEqual(parseOrionCommand("本会话始终允许", true), { type: "approve_session" });
  assert.deepEqual(parseOrionCommand("驳回", true), { type: "reject" });
});

test("parses pending plan explanation commands", () => {
  assert.deepEqual(parseOrionCommand("你准备做什么", true), { type: "explain_plan" });
  assert.deepEqual(parseOrionCommand("列出动作", true), { type: "list_actions" });
  assert.deepEqual(parseOrionCommand("为什么需要权限", true), { type: "explain_permission" });
});

test("parses pending plan modification commands", () => {
  assert.deepEqual(parseOrionCommand("可以，但只保存工作流，不要运行", true), {
    type: "modify_plan",
    modification: "save_only",
    note: "可以，但只保存工作流，不要运行",
  });
  assert.deepEqual(parseOrionCommand("加上架构师 code review", true), {
    type: "modify_plan",
    modification: "add_arch_review",
    note: "加上架构师 code review",
  });
  assert.deepEqual(parseOrionCommand("先问我需求", true), {
    type: "modify_plan",
    modification: "add_clarification",
    note: "先问我需求",
  });
  assert.deepEqual(parseOrionCommand("加 QA 全量覆盖", true), {
    type: "modify_plan",
    modification: "add_qa",
    note: "加 QA 全量覆盖",
  });
  assert.deepEqual(parseOrionCommand("不用 QA", true), {
    type: "modify_plan",
    modification: "remove_qa",
    note: "不用 QA",
  });
});

test("parses node-level instructions for a target agent", () => {
  assert.deepEqual(parseOrionCommand("让开发 agent 参考 docs/old-prd.md 来做开发", true), {
    type: "node_instruction",
    targetOwner: "DEV Agent",
    note: "让开发 agent 参考 docs/old-prd.md 来做开发",
  });
  assert.deepEqual(parseOrionCommand("提醒 QA 重点测移动端", true), {
    type: "node_instruction",
    targetOwner: "QA Agent",
    note: "提醒 QA 重点测移动端",
  });
  assert.deepEqual(parseOrionCommand("提醒架构师重点看数据库迁移风险", true), {
    type: "node_instruction",
    targetOwner: "ARCH Agent",
    note: "提醒架构师重点看数据库迁移风险",
  });
});

test("save-only modification removes workflow run action", () => {
  const updated = applyOrionPlanModification(plan(), "save_only");
  assert.equal(updated.actions.some((action) => action.kind === "workflow.run"), false);
  assert.equal(updated.actions.some((action) => action.kind === "workflow.create"), true);
});

test("arch-review modification inserts an ARCH review step and update action", () => {
  const updated = applyOrionPlanModification(plan(), "add_arch_review");
  assert.equal(updated.workflow.steps.some((step) => step.owner === "ARCH Agent" && step.stage === "CodeReview"), true);
  assert.equal(updated.actions.some((action) => action.kind === "workflow.update"), true);
});

test("workflow actions point at the modified workflow payload", () => {
  const updated = applyOrionPlanModification(plan(), "add_arch_review");
  const createAction = updated.actions.find((action) => action.kind === "workflow.create");
  assert.equal((createAction?.payload.workflow as WorkflowDefinition).steps.some((step) => step.stage === "CodeReview"), true);
});

test("clarification modification inserts a Trellis clarification step", () => {
  const updated = applyOrionPlanModification(plan(), "add_clarification");
  const step = updated.workflow.steps.find((item) => item.stage === "Clarification");
  assert.equal(step?.owner, "PD Agent");
  assert.deepEqual(step?.skill_ids, ["trellis"]);
});

test("qa modification inserts a QA test step before retrospective", () => {
  const base = plan([], {
    ...workflow(),
    steps: [
      ...workflow().steps,
      { stage: "Retrospective", owner: "PM Agent", instruction: "总结", enabled: true },
    ],
  });
  const updated = applyOrionPlanModification(base, "add_qa");
  const qaIndex = updated.workflow.steps.findIndex((step) => step.owner === "QA Agent");
  const retrospectiveIndex = updated.workflow.steps.findIndex((step) => step.stage === "Retrospective");
  assert.ok(qaIndex >= 0);
  assert.ok(retrospectiveIndex > qaIndex);
  assert.equal(updated.actions.some((action) => action.kind === "workflow.update"), true);
});

test("qa removal deletes QA test steps from a draft workflow", () => {
  const baseWorkflow = {
    ...workflow(),
    steps: [
      ...workflow().steps,
      { stage: "TestPlan", owner: "QA Agent", instruction: "测试", enabled: true },
    ],
  };
  const updated = applyOrionPlanModification(plan([], baseWorkflow), "remove_qa");
  assert.equal(updated.workflow.steps.some((step) => step.owner === "QA Agent"), false);
  assert.equal(updated.workflow.steps.some((step) => step.stage === "TestPlan"), false);
});

test("applies ORION node instruction to the matching workflow step", () => {
  const updated = applyOrionNodeInstruction(plan(), "DEV Agent", "参考 docs/old-prd.md，先写需求再开发");
  const devStep = updated.workflow.steps.find((step) => step.owner === "DEV Agent");
  assert.deepEqual(devStep?.orion_notes, ["参考 docs/old-prd.md，先写需求再开发"]);
  assert.match(devStep?.instruction ?? "", /ORION 转交/);
  assert.equal(updated.actions.some((action) => action.kind === "workflow.update"), true);
});
