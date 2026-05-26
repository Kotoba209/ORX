import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { OrionAction } from "./orionActions.ts";
import {
  actionRiskSummary,
  highestOrionRisk,
  isOrionPlanAllowedBySession,
  orionRiskLabel,
} from "./orionPermission.ts";

function action(risk: OrionAction["risk"]): OrionAction {
  return {
    id: risk,
    kind: risk === "strong-confirm" ? "git.push" : risk === "confirm" ? "workflow.run" : "workflow.draft",
    risk,
    title: risk,
    summary: risk,
    payload: {},
  };
}

test("finds highest risk in an ORION action plan", () => {
  assert.equal(highestOrionRisk([action("direct"), action("confirm")]), "confirm");
  assert.equal(highestOrionRisk([action("confirm"), action("strong-confirm")]), "strong-confirm");
  assert.equal(highestOrionRisk([]), "direct");
});

test("summarizes risk counts for composer copy", () => {
  assert.equal(actionRiskSummary([action("direct"), action("confirm"), action("confirm")]), "direct 1 · confirm 2");
});

test("checks session allowance by risk level", () => {
  assert.equal(isOrionPlanAllowedBySession("confirm", "direct"), true);
  assert.equal(isOrionPlanAllowedBySession("confirm", "confirm"), true);
  assert.equal(isOrionPlanAllowedBySession("confirm", "strong-confirm"), false);
  assert.equal(isOrionPlanAllowedBySession("strong-confirm", "strong-confirm"), true);
  assert.equal(isOrionPlanAllowedBySession(null, "confirm"), false);
});

test("labels risks in Chinese for the composer", () => {
  assert.equal(orionRiskLabel("direct"), "直接执行");
  assert.equal(orionRiskLabel("confirm"), "需要确认");
  assert.equal(orionRiskLabel("strong-confirm"), "强确认");
});
