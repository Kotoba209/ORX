import assert from "node:assert/strict";
import test from "node:test";
import {
  createDefaultWorkflows,
  deleteWorkflow,
  duplicateWorkflow,
  migrateWorkflowDefinition,
  setDefaultWorkflow,
  updateWorkflowSteps,
} from "./workflowConfig.ts";

test("default workflow collection exposes three selectable workflows without a default selection", () => {
  const workflows = createDefaultWorkflows();

  assert.deepEqual(workflows.map((workflow) => workflow.id), ["full-development", "bug-fix", "test-only"]);
  assert.equal(workflows.filter((workflow) => workflow.isDefault).length, 0);
  assert.ok(workflows.every((workflow) => workflow.steps.length > 0));
});

test("default workflows are temporarily narrowed to FORGE implementation and code review", () => {
  const workflows = createDefaultWorkflows();

  for (const workflow of workflows) {
    assert.deepEqual(workflow.steps.map((step) => step.stage), ["Implementation", "CodeReview"]);
    assert.deepEqual(workflow.steps[0].skill_ids, ["trellis", "grill-me"]);
    assert.match(workflow.steps[0].instruction, /代号 FORGE/);
    assert.match(workflow.steps[0].instruction, /Grill-me 核心/);
    assert.equal(workflow.steps[1].approval, "user");
    assert.equal(workflow.steps[1].rollback_target, "Implementation");
    assert.match(workflow.steps[1].instruction, /GitHub Copilot Code Review/);
    assert.match(workflow.steps[1].instruction, /P0 阻塞/);
    assert.ok(workflow.steps[1].completion_criteria?.some((criterion) => /Security/.test(criterion)));
  }
});

test("migrates saved workflows into the temporary two-node development flow", () => {
  const full = createDefaultWorkflows().find((workflow) => workflow.id === "full-development");
  assert.ok(full);
  const oldWorkflow = {
    ...full,
    steps: full.steps.filter((step) => step.stage !== "CodeReview"),
  };
  const migrated = migrateWorkflowDefinition(oldWorkflow);
  const stages = migrated.steps.map((step) => step.stage);

  assert.deepEqual(stages, ["Implementation", "CodeReview"]);
  assert.equal(migrated.steps.find((step) => step.stage === "CodeReview")?.rollback_target, "Implementation");
  assert.ok(migrated.steps.find((step) => step.stage === "Implementation")?.completion_criteria?.some((criterion) => /FILE artifact/.test(criterion)));
});

test("does not duplicate implementation nodes when migrating current workflows", () => {
  const full = createDefaultWorkflows().find((workflow) => workflow.id === "full-development");
  assert.ok(full);
  const migrated = migrateWorkflowDefinition(full);

  assert.equal(migrated.steps.filter((step) => step.stage === "Implementation").length, 1);
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
  const initial = setDefaultWorkflow(createDefaultWorkflows(), "full-development");

  const defaultDelete = deleteWorkflow(initial, "full-development", "bug-fix");
  assert.equal(defaultDelete.workflows.length, initial.length);
  assert.equal(defaultDelete.activeWorkflowId, "full-development");

  const normalDelete = deleteWorkflow(initial, "bug-fix", "bug-fix");
  assert.equal(normalDelete.workflows.some((workflow) => workflow.id === "bug-fix"), false);
  assert.equal(normalDelete.activeWorkflowId, "full-development");
});
