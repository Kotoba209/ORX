import test from "node:test";
import assert from "node:assert/strict";
import {
  buildMemoryContextBlock,
  createMemoryRuleCandidate,
  retrieveRelevantMemoryRules,
  type MemoryRule,
} from "./memoryRules.ts";

test("creates a reusable rule candidate from retrospective text", () => {
  const candidate = createMemoryRuleCandidate(
    "登录表单漏了国家字段，后续表单类任务必须检查必填字段和验收标准是否一致。",
    "task-1001",
    "Retrospective",
  );

  assert.equal(candidate.scope, "global");
  assert.equal(candidate.source_task_id, "task-1001");
  assert.equal(candidate.tags.includes("form"), true);
  assert.equal(candidate.tags.includes("acceptance"), true);
});

test("retrieves relevant rules by task text and project context", () => {
  const rules: MemoryRule[] = [
    {
      id: "rule-form-acceptance",
      title: "表单字段必须回看验收标准",
      body: "表单页面实现前，DEV 必须逐项核对 PD 验收标准里的必填字段。",
      tags: ["form", "acceptance", "dev"],
      scope: "global",
      source_task_id: "task-1",
      created_at: 1,
      hits: 0,
    },
    {
      id: "rule-rust-timeout",
      title: "Rust 后端超时诊断",
      body: "Provider 超时要记录 endpoint、proxy 和 timeout。",
      tags: ["rust", "provider"],
      scope: "global",
      source_task_id: "task-2",
      created_at: 2,
      hits: 0,
    },
  ];

  const selected = retrieveRelevantMemoryRules("创建一个注册表单页面", "React 表单组件", rules);

  assert.deepEqual(selected.map((rule) => rule.id), ["rule-form-acceptance"]);
});

test("memory context block is compact and readable for agent prompts", () => {
  const longBody = "表单字段必须回看验收标准。".repeat(80);
  const block = buildMemoryContextBlock([
    {
      id: "rule-form-acceptance",
      title: "表单字段必须回看验收标准",
      body: longBody,
      tags: ["form", "acceptance"],
      scope: "global",
      source_task_id: "task-1",
      created_at: 1,
      hits: 3,
    },
  ]);

  assert.match(block, /长期记忆规则/);
  assert.match(block, /表单字段必须回看验收标准/);
  assert.match(block, /source=task-1/);
  assert.ok(block.length < 900);
});
