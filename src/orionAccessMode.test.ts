import test from "node:test";
import assert from "node:assert/strict";
import {
  actionRequiresManualConfirmation,
  formatOrionAccessModeContext,
  getOrionAccessModeOption,
  loadOrionAccessMode,
  normalizeOrionAccessMode,
  saveOrionAccessMode,
  summarizeAccessModeRisk,
} from "./orionAccessMode.ts";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
}

test("normalizes ORION access modes to Codex-style choices", () => {
  assert.equal(normalizeOrionAccessMode("default"), "default");
  assert.equal(normalizeOrionAccessMode("auto-review"), "auto-review");
  assert.equal(normalizeOrionAccessMode("full-access"), "full-access");
  assert.equal(normalizeOrionAccessMode("power"), "default");
  assert.equal(getOrionAccessModeOption("auto-review").label, "自动审查");
});

test("persists ORION access mode locally", () => {
  const storage = memoryStorage();
  saveOrionAccessMode(storage, "full-access");

  assert.equal(loadOrionAccessMode(storage), "full-access");
});

test("maps ORION access modes to manual confirmation policy", () => {
  assert.equal(actionRequiresManualConfirmation({ risk: "direct" }, "default"), false);
  assert.equal(actionRequiresManualConfirmation({ risk: "confirm" }, "default"), true);
  assert.equal(actionRequiresManualConfirmation({ risk: "confirm" }, "auto-review"), false);
  assert.equal(actionRequiresManualConfirmation({ risk: "strong-confirm" }, "auto-review"), true);
  assert.equal(actionRequiresManualConfirmation({ risk: "strong-confirm" }, "full-access"), false);
  assert.equal(actionRequiresManualConfirmation({ kind: "web.fetchUrlInsecure", risk: "strong-confirm" }, "full-access"), true);
});

test("summarizes access mode risk for composer copy", () => {
  assert.equal(summarizeAccessModeRisk([{ risk: "direct" }, { risk: "confirm" }], "auto-review"), "自动审查：本次将自动执行并记录轨迹。");
  assert.equal(summarizeAccessModeRisk([{ risk: "strong-confirm" }], "auto-review"), "自动审查：1 个动作需要确认。");
});

test("formats ORION access mode as model planning context", () => {
  const defaultContext = formatOrionAccessModeContext("default");
  const fullAccessContext = formatOrionAccessModeContext("full-access");

  assert.match(defaultContext, /权限模式：默认权限/);
  assert.match(defaultContext, /写入、命令和敏感动作需要清楚说明并等待确认/);
  assert.match(fullAccessContext, /权限模式：完全访问权限/);
  assert.match(fullAccessContext, /GenericAgent 风格的系统级控制体验/);
  assert.match(fullAccessContext, /优先提出可执行工具动作/);
});
