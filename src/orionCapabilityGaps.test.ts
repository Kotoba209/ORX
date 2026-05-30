import test from "node:test";
import assert from "node:assert/strict";
import {
  appendOrionCapabilityGap,
  createOrionCapabilityGap,
  formatOrionCapabilityGapContext,
  formatOrionCapabilityGapLine,
  loadOrionCapabilityGaps,
  recommendOrionCapability,
  saveOrionCapabilityGaps,
} from "./orionCapabilityGaps.ts";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
}

test("creates traceable ORION capability gaps from unsupported tools", () => {
  const gap = createOrionCapabilityGap("读取网页", {
    toolKind: "browser.fetchUrl",
    alternative: "web.fetchUrl",
    reason: "unsupported_tool_capability",
    payloadPreview: "url=https://hnr.pages.dev/",
  }, { now: 1000 });

  assert.equal(gap.id, "gap:browser.fetchurl:web.fetchurl");
  assert.equal(gap.count, 1);
  assert.equal(gap.latestTask, "读取网页");
  assert.equal(gap.updatedAt, 1000);
});

test("merges repeated ORION capability gaps instead of duplicating them", () => {
  const first = createOrionCapabilityGap("读取网页", {
    toolKind: "browser.fetchUrl",
    alternative: "web.fetchUrl",
    reason: "unsupported_tool_capability",
    payloadPreview: "url=https://a.example/",
  }, { now: 1000 });
  const second = createOrionCapabilityGap("分析网页", {
    toolKind: "browser.fetchUrl",
    alternative: "web.fetchUrl",
    reason: "model_requested_browser_tool",
    payloadPreview: "url=https://b.example/",
  }, { now: 2000 });

  const gaps = appendOrionCapabilityGap(appendOrionCapabilityGap([], first), second);

  assert.equal(gaps.length, 1);
  assert.equal(gaps[0].count, 2);
  assert.equal(gaps[0].latestTask, "分析网页");
  assert.equal(gaps[0].payloadPreview, "url=https://b.example/");
});

test("persists ORION capability gaps in local storage", () => {
  const storage = memoryStorage();
  const gap = createOrionCapabilityGap("搜索资料", {
    toolKind: "vector.search",
    alternative: "web.searchPublic",
    reason: "unsupported_tool_capability",
    payloadPreview: "query=orx",
  }, { now: 1000 });

  saveOrionCapabilityGaps(storage, [gap]);
  assert.deepEqual(loadOrionCapabilityGaps(storage), [gap]);
});

test("formats ORION capability gaps for logs and future UI", () => {
  const gap = createOrionCapabilityGap("读取网页", {
    toolKind: "browser.fetchUrl",
    alternative: "web.fetchUrl",
    reason: "unsupported_tool_capability",
    payloadPreview: "url=https://hnr.pages.dev/",
  }, { now: 1000 });

  assert.equal(formatOrionCapabilityGapLine(gap), "browser.fetchUrl；可替代：web.fetchUrl；出现 1 次；最近任务：读取网页");
});

test("formats ORION capability gaps as model steering context", () => {
  const older = createOrionCapabilityGap("搜索资料", {
    toolKind: "vector.search",
    alternative: "web.searchPublic",
    reason: "unsupported_tool_capability",
    payloadPreview: "query=orx",
  }, { now: 1000 });
  const newer = createOrionCapabilityGap("读取网页", {
    toolKind: "browser.fetchUrl",
    alternative: "web.fetchUrl",
    reason: "unsupported_tool_capability",
    payloadPreview: "url=https://hnr.pages.dev/",
  }, { now: 2000 });

  const context = formatOrionCapabilityGapContext([older, newer], { limit: 1 });

  assert.match(context, /缺口工具：browser\.fetchUrl/);
  assert.match(context, /优先替代：web\.fetchUrl/);
  assert.match(context, /最近参数：url=https:\/\/hnr\.pages\.dev\//);
  assert.doesNotMatch(context, /vector\.search/);
});

test("recommends connector installation for unsupported browser automation", () => {
  const recommendation = recommendOrionCapability({
    toolKind: "browser.click",
    alternative: "",
  });

  assert.equal(recommendation.kind, "install_connector");
  assert.match(recommendation.title, /浏览器/);
});

test("recommends creating a tool draft for missing vector search", () => {
  const recommendation = recommendOrionCapability({
    toolKind: "vector.search",
    alternative: "",
  });

  assert.equal(recommendation.kind, "create_tool");
  assert.match(recommendation.detail, /工具注册表/);
});
