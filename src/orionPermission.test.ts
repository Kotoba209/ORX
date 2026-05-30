import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { OrionAction } from "./orionActions.ts";
import {
  actionRiskSummary,
  formatOrionPayloadPreview,
  formatOrionToolPayloadPreview,
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
  assert.equal(actionRiskSummary([action("direct"), action("confirm"), action("confirm")]), "direct 1 / confirm 2");
});

test("checks session allowance by risk level", () => {
  assert.equal(isOrionPlanAllowedBySession("confirm", "direct"), true);
  assert.equal(isOrionPlanAllowedBySession("confirm", "confirm"), true);
  assert.equal(isOrionPlanAllowedBySession("confirm", "strong-confirm"), false);
  assert.equal(isOrionPlanAllowedBySession("strong-confirm", "strong-confirm"), true);
  assert.equal(isOrionPlanAllowedBySession(null, "confirm"), false);
  assert.equal(isOrionPlanAllowedBySession(null, "direct"), true);
});

test("labels risks in Chinese for the composer", () => {
  assert.equal(orionRiskLabel("direct"), "直接执行");
  assert.equal(orionRiskLabel("confirm"), "需要确认");
  assert.equal(orionRiskLabel("strong-confirm"), "强确认");
});

test("formats compact ORION payload preview rows", () => {
  assert.deepEqual(formatOrionPayloadPreview({ message: "release", count: 2 }), [
    ["message", "release"],
    ["count", "2"],
  ]);
});

test("summarizes nested ORION payload values", () => {
  assert.deepEqual(formatOrionPayloadPreview({ workflow: { id: "wf" }, files: ["a.ts", "b.ts"] }), [
    ["workflow", "{...}"],
    ["files", "a.ts, b.ts"],
  ]);
});

test("returns a fallback row for empty ORION payload", () => {
  assert.deepEqual(formatOrionPayloadPreview({}), [["参数", "等待执行前生成具体参数"]]);
});

test("formats ORION tool payload previews by registry schema order", () => {
  const previewAction: OrionAction = {
    id: "fetch",
    kind: "web.fetchUrl",
    risk: "direct",
    title: "Fetch URL",
    summary: "Fetch a known page",
    payload: {
      max_bytes: 4096,
      include_headers: true,
      url: "https://hnr.pages.dev/",
      extra_note: "user approved",
    },
  };

  assert.deepEqual(formatOrionToolPayloadPreview(previewAction), [
    ["url", "https://hnr.pages.dev/"],
    ["include_headers", "true"],
    ["max_bytes", "4096"],
    ["extra_note", "user approved"],
  ]);
});

test("shows missing required ORION tool payload fields before execution", () => {
  const previewAction: OrionAction = {
    id: "missing-fetch",
    kind: "web.fetchUrl",
    risk: "direct",
    title: "Fetch URL",
    summary: "Fetch a known page",
    payload: {
      include_headers: true,
    },
  };

  assert.deepEqual(formatOrionToolPayloadPreview(previewAction), [
    ["缺少参数", "url"],
    ["include_headers", "true"],
  ]);
});
