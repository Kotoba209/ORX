import assert from "node:assert/strict";
import test from "node:test";
import {
  createDefaultWorkflows,
  deleteWorkflow,
  duplicateWorkflow,
  setDefaultWorkflow,
  updateWorkflowSteps,
} from "./workflowConfig.ts";

test("default workflow collection exposes three selectable workflows with one default", () => {
  const workflows = createDefaultWorkflows();

  assert.deepEqual(workflows.map((workflow) => workflow.id), ["full-development", "bug-fix", "test-only"]);
  assert.equal(workflows.filter((workflow) => workflow.isDefault).length, 1);
  assert.equal(workflows.find((workflow) => workflow.isDefault)?.id, "full-development");
  assert.ok(workflows.every((workflow) => workflow.steps.length > 0));
});

test("full workflow keeps user approval gates while bug-fix skips product PRD approval", () => {
  const workflows = createDefaultWorkflows();
  const full = workflows.find((workflow) => workflow.id === "full-development");
  const bugFix = workflows.find((workflow) => workflow.id === "bug-fix");

  assert.ok(full);
  assert.ok(bugFix);
  assert.equal(full.steps.find((step) => step.stage === "ScenarioRehearsal")?.approval, "user");
  assert.equal(full.steps.find((step) => step.stage === "CodeReview")?.approval, "user");
  assert.equal(bugFix.steps.some((step) => step.stage === "ScenarioRehearsal"), false);
  assert.equal(bugFix.steps.find((step) => step.stage === "CodeReview")?.approval, "user");
});

test("full workflow starts PD with Trellis multi-turn clarification before PRD approval", () => {
  const workflows = createDefaultWorkflows();
  const full = workflows.find((workflow) => workflow.id === "full-development");
  assert.ok(full);

  const stages = full.steps.map((step) => step.stage);
  assert.deepEqual(stages.slice(0, 3), ["Intake", "Clarification", "ScenarioRehearsal"]);

  const clarification = full.steps.find((step) => step.stage === "Clarification");
  assert.equal(clarification?.owner, "PD Agent");
  assert.deepEqual(clarification?.skill_ids, ["trellis"]);
  assert.equal(clarification?.interaction, "multi-turn");
  assert.equal(clarification?.exit_condition, "requirements_ready");
  assert.equal(clarification?.approval, "none");
});

test("duplicating a workflow creates an editable independent copy", () => {
  const { workflows, activeWorkflowId } = duplicateWorkflow(createDefaultWorkflows(), "bug-fix");
  const original = workflows.find((workflow) => workflow.id === "bug-fix");
  const copy = workflows.find((workflow) => workflow.id === activeWorkflowId);

  assert.ok(original);
  assert.ok(copy);
  assert.notEqual(copy.id, original.id);
  assert.match(copy.name, /Copy/);

  const updated = updateWorkflowSteps(workflows, copy.id, [{ ...copy.steps[0], stage: "ChangedStage" }]);

  assert.equal(updated.find((workflow) => workflow.id === copy.id)?.steps[0].stage, "ChangedStage");
  assert.equal(updated.find((workflow) => workflow.id === original.id)?.steps[0].stage, original.steps[0].stage);
});

test("setting a default workflow clears the previous default", () => {
  const workflows = setDefaultWorkflow(createDefaultWorkflows(), "test-only");

  assert.equal(workflows.filter((workflow) => workflow.isDefault).length, 1);
  assert.equal(workflows.find((workflow) => workflow.isDefault)?.id, "test-only");
});

test("delete workflow keeps default workflow and selects a remaining workflow", () => {
  const initial = createDefaultWorkflows();

  const defaultDelete = deleteWorkflow(initial, "full-development", "bug-fix");
  assert.equal(defaultDelete.workflows.length, initial.length);
  assert.equal(defaultDelete.activeWorkflowId, "full-development");

  const normalDelete = deleteWorkflow(initial, "bug-fix", "bug-fix");
  assert.equal(normalDelete.workflows.some((workflow) => workflow.id === "bug-fix"), false);
  assert.equal(normalDelete.activeWorkflowId, "full-development");
});
