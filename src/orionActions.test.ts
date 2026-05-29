import test from "node:test";
import assert from "node:assert/strict";
import {
  actionNeedsConfirmation,
  getOrionActionRisk,
  groupOrionActionsByRisk,
  type OrionAction,
} from "./orionActions.ts";

test("maps ORION direct actions to direct risk", () => {
  assert.equal(getOrionActionRisk("file.readProjectFile"), "direct");
  assert.equal(getOrionActionRisk("file.searchProject"), "direct");
  assert.equal(getOrionActionRisk("local.inspectConfig"), "direct");
  assert.equal(getOrionActionRisk("web.searchPublic"), "direct");
  assert.equal(getOrionActionRisk("file.writeGeneratedArtifactAuto"), "direct");
  assert.equal(getOrionActionRisk("workflow.recommend"), "direct");
  assert.equal(getOrionActionRisk("workflow.create"), "direct");
  assert.equal(getOrionActionRisk("workflow.run"), "direct");
  assert.equal(getOrionActionRisk("skill.attach"), "direct");
  assert.equal(getOrionActionRisk("memory.search"), "direct");
});

test("maps ORION local mutation and build actions to confirm risk", () => {
  assert.equal(getOrionActionRisk("file.writeGeneratedArtifact"), "confirm");
  assert.equal(getOrionActionRisk("web.searchSensitive"), "confirm");
  assert.equal(getOrionActionRisk("command.runWhitelisted"), "confirm");
  assert.equal(getOrionActionRisk("release.build"), "confirm");
  assert.equal(getOrionActionRisk("memory.append"), "confirm");
});

test("maps ORION destructive and git actions to strong confirmation risk", () => {
  assert.equal(getOrionActionRisk("workflow.delete"), "strong-confirm");
  assert.equal(getOrionActionRisk("workflow.setDefault"), "strong-confirm");
  assert.equal(getOrionActionRisk("git.commit"), "strong-confirm");
  assert.equal(getOrionActionRisk("git.tag"), "strong-confirm");
  assert.equal(getOrionActionRisk("git.push"), "strong-confirm");
});

test("confirmation helper treats direct actions as immediately executable", () => {
  assert.equal(actionNeedsConfirmation("file.readProjectFile"), false);
  assert.equal(actionNeedsConfirmation("web.searchPublic"), false);
  assert.equal(actionNeedsConfirmation("web.searchSensitive"), true);
  assert.equal(actionNeedsConfirmation("release.build"), true);
  assert.equal(actionNeedsConfirmation("git.push"), true);
});

test("groups action plans by risk for preview UI", () => {
  const actions: OrionAction[] = [
    { id: "a1", kind: "file.readProjectFile", risk: "direct", title: "读取文件", summary: "读取 README", payload: {} },
    { id: "a2", kind: "release.build", risk: "confirm", title: "打包", summary: "生成安装包", payload: {} },
    { id: "a3", kind: "git.push", risk: "strong-confirm", title: "推送", summary: "推送 main", payload: {} },
  ];

  const grouped = groupOrionActionsByRisk(actions);

  assert.deepEqual(grouped.direct.map((action) => action.id), ["a1"]);
  assert.deepEqual(grouped.confirm.map((action) => action.id), ["a2"]);
  assert.deepEqual(grouped["strong-confirm"].map((action) => action.id), ["a3"]);
});
