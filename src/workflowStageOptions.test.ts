import assert from "node:assert/strict";
import test from "node:test";
import { createWorkflowStageOptions } from "./workflowStageOptions.ts";

test("workflow stage options include the agent name in each label", () => {
  const labels = createWorkflowStageOptions().map((option) => option.label);

  assert.ok(labels.includes("ScenarioRehearsal（PD Agent）"));
  assert.ok(labels.includes("CodeReview（ARCH Agent）"));
  assert.ok(labels.every((label) => /（.+ Agent）$/.test(label)));
});
