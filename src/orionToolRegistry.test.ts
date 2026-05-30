import test from "node:test";
import assert from "node:assert/strict";
import { getOrionActionRisk } from "./orionActions.ts";
import {
  formatOrionToolCatalogRows,
  formatOrionToolSchemaSummary,
  getOrionToolAlternative,
  isBlockedOrionToolKind,
  isSupportedOrionToolKind,
  orionToolRegistry,
  orionSupportedToolKinds,
  validateOrionToolAction,
} from "./orionToolRegistry.ts";

test("exposes supported ORION tool kinds from one registry", () => {
  assert.equal(isSupportedOrionToolKind("web.fetchUrl"), true);
  assert.equal(isSupportedOrionToolKind("web.fetchUrlInsecure"), true);
  assert.equal(isSupportedOrionToolKind("web.searchPublic"), true);
  assert.equal(isSupportedOrionToolKind("browser.fetchUrl"), false);
  assert.deepEqual(orionSupportedToolKinds.includes("web.fetchUrl"), true);
});

test("formats model-facing tool schema summary from registry", () => {
  const summary = formatOrionToolSchemaSummary();

  assert.match(summary, /web\.fetchUrl \{url, include_html, include_headers, max_bytes\}/);
  assert.match(summary, /web\.fetchUrlInsecure \{url, include_html, include_headers, max_bytes\}/);
  assert.match(summary, /command\.runWorktreeSandbox \{program, args\}/);
});

test("formats user-facing ORION tool catalog rows from registry", () => {
  const rows = formatOrionToolCatalogRows();
  const fetchTool = rows.find((tool) => tool.kind === "web.fetchUrl");
  const insecureFetchTool = rows.find((tool) => tool.kind === "web.fetchUrlInsecure");
  const sandboxTool = rows.find((tool) => tool.kind === "command.runWorktreeSandbox");

  assert.equal(rows.length, orionToolRegistry.length);
  assert.deepEqual(fetchTool, {
    kind: "web.fetchUrl",
    risk: "direct",
    purpose: "Fetch a known public URL, response headers, HTML, and text preview.",
    schema: "url, include_html, include_headers, max_bytes",
    required: "url",
  });
  assert.equal(sandboxTool?.required, "program, args");
  assert.equal(insecureFetchTool?.risk, "strong-confirm");
});

test("keeps registry risk labels aligned with executable action risks", () => {
  for (const tool of orionToolRegistry) {
    assert.equal(tool.risk, getOrionActionRisk(tool.kind), tool.kind);
  }
});

test("suggests alternatives for unsupported tool names", () => {
  assert.equal(getOrionToolAlternative("browser.fetchUrl"), "web.fetchUrl");
  assert.equal(getOrionToolAlternative("http.head"), "web.fetchUrl");
  assert.equal(getOrionToolAlternative("vector.search"), "web.searchPublic");
});

test("keeps destructive actions out of capability-missing suggestions", () => {
  assert.equal(isBlockedOrionToolKind("git.push"), true);
  assert.equal(isBlockedOrionToolKind("workflow.delete"), true);
  assert.equal(isBlockedOrionToolKind("browser.fetchUrl"), false);
});

test("validates action payloads against required tool schema", () => {
  assert.deepEqual(validateOrionToolAction({
    kind: "web.fetchUrl",
    risk: "direct",
    id: "a",
    title: "fetch",
    summary: "fetch",
    payload: { url: "https://hnr.pages.dev/" },
  }), { ok: true });

  assert.deepEqual(validateOrionToolAction({
    kind: "web.fetchUrl",
    risk: "direct",
    id: "b",
    title: "fetch",
    summary: "fetch",
    payload: {},
  }), { ok: false, message: "web.fetchUrl 缺少必需参数：url" });
});

test("reports unsupported action kinds before execution", () => {
  const action = {
    kind: "browser.fetchUrl",
    risk: "direct",
    id: "c",
    title: "fetch",
    summary: "fetch",
    payload: { url: "https://hnr.pages.dev/" },
  };

  assert.deepEqual(validateOrionToolAction(action), {
    ok: false,
    message: "ORX 缺少工具能力：browser.fetchUrl。可替代工具：web.fetchUrl。",
  });
});
