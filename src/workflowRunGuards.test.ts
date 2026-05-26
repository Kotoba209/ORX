import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  normalizeWorkflowTaskText,
  shouldBlockRecentlyStoppedTask,
} from "./workflowRunGuards.ts";

test("normalizes workflow task text for duplicate detection", () => {
  assert.equal(normalizeWorkflowTaskText("  帮我做一个登录页面 html 文件  "), "帮我做一个登录页面 html 文件");
  assert.equal(normalizeWorkflowTaskText("帮我做一个登录页面\nhtml 文件"), "帮我做一个登录页面 html 文件");
});

test("blocks same task shortly after it was stopped", () => {
  assert.equal(shouldBlockRecentlyStoppedTask({
    task: "帮我做一个登录页面 html 文件",
    lastStoppedTask: "帮我做一个登录页面 html 文件",
    lastStoppedAt: 1_000,
    now: 10_000,
  }), true);
});

test("does not block an explicit rerun after stop", () => {
  assert.equal(shouldBlockRecentlyStoppedTask({
    task: "重新运行 帮我做一个登录页面 html 文件",
    lastStoppedTask: "帮我做一个登录页面 html 文件",
    lastStoppedAt: 1_000,
    now: 10_000,
  }), false);
});

test("does not block old stopped tasks", () => {
  assert.equal(shouldBlockRecentlyStoppedTask({
    task: "帮我做一个登录页面 html 文件",
    lastStoppedTask: "帮我做一个登录页面 html 文件",
    lastStoppedAt: 1_000,
    now: 130_000,
  }), false);
});
