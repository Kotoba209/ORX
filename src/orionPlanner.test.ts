import test from "node:test";
import assert from "node:assert/strict";
import { draftOrionWorkflow, attachCapabilityToStep, createOrionActionPlan } from "./orionPlanner.ts";

test("drafts a bug investigation workflow with capabilities", () => {
  const draft = draftOrionWorkflow("我想查一个登录失败的 bug");

  assert.equal(draft.name, "Bug Investigation");
  assert.deepEqual(draft.steps.map((step) => step.stage), ["Intake", "BugClarification", "BugTrace", "ReproductionTest", "Retrospective"]);
  assert.deepEqual(draft.steps.find((step) => step.stage === "BugClarification")?.skill_ids, ["trellis"]);
  assert.deepEqual(draft.steps.find((step) => step.stage === "BugTrace")?.skill_ids, ["bug-investigation"]);
  assert.deepEqual(draft.steps.find((step) => step.stage === "ReproductionTest")?.skill_ids, ["test-planning"]);
});

test("can attach a capability to an existing workflow step without mutating the input", () => {
  const draft = draftOrionWorkflow("我想查一个 bug");
  const updated = attachCapabilityToStep(draft, "BugTrace", "code-review");

  assert.deepEqual(draft.steps.find((step) => step.stage === "BugTrace")?.skill_ids, ["bug-investigation"]);
  assert.deepEqual(updated.steps.find((step) => step.stage === "BugTrace")?.skill_ids, ["bug-investigation", "code-review"]);
});

test("creates an action plan to save and run a drafted workflow", () => {
  const draft = draftOrionWorkflow("我想查一个 bug");
  const plan = createOrionActionPlan(draft);

  assert.deepEqual(plan.map((action) => action.kind), ["workflow.create", "skill.attach", "skill.attach", "skill.attach", "workflow.run"]);
  assert.equal(plan.every((action) => action.risk === "confirm"), true);
});
