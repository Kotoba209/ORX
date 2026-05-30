import test from "node:test";
import assert from "node:assert/strict";
import { createOrionFollowUpReply } from "./orionFollowUp.ts";
import type { OrionMemoryEntry } from "./orionMemory.ts";

test("summarizes recent ORION web results for follow-up questions", () => {
  const reply = createOrionFollowUpReply("处理完要总结出内容告诉我", [
    "你：帮我抓取 hnr.pages.dev",
    "ORION：联网查询「https://hnr.pages.dev/」读取到 2 条结果：1. Example A - https://a.example - First summary；2. Example B - https://b.example - Second summary",
  ]);

  assert.match(reply, /上一轮关于「https:\/\/hnr\.pages\.dev\/」读取到的内容主要是/);
  assert.match(reply, /Example A/);
  assert.match(reply, /First summary/);
});

test("uses a wider recent context window for follow-up sources", () => {
  const reply = createOrionFollowUpReply("这些内容来自哪里", [
    "ORION：联网查询「one」读取到 1 条结果：1. One - https://one.example - One summary",
    "ORION：普通说明",
    "ORION：项目搜索「two」命中 1 处：https://two.example",
  ]);

  assert.match(reply, /https:\/\/one\.example/);
  assert.match(reply, /https:\/\/two\.example/);
});

test("prefers structured memory over chat bubble text for follow-up replies", () => {
  const memory: OrionMemoryEntry[] = [
    {
      id: "memory-1",
      createdAt: 1,
      task: "读取网页",
      kind: "web.searchPublic",
      title: "联网查询公开资料",
      query: "https://hnr.pages.dev/",
      message: "联网查询「https://hnr.pages.dev/」读取到 1 条结果：1. Structured Result - https://structured.example - Structured summary",
      urls: ["https://structured.example"],
    },
  ];

  const reply = createOrionFollowUpReply("处理完总结内容", [
    "ORION：联网查询「old」读取到 1 条结果：1. Old - https://old.example - Old summary",
  ], memory);

  assert.match(reply, /Structured Result/);
  assert.match(reply, /structured\.example/);
  assert.doesNotMatch(reply, /old\.example/);
});

test("summarizes assistant summary memory in follow-up replies", () => {
  const memory: OrionMemoryEntry[] = [
    {
      id: "assistant-summary",
      createdAt: 2,
      traceId: "orion-assistant",
      round: 2,
      task: "读取网页并判断技术栈",
      kind: "assistant.summary",
      title: "ORION assistant summary",
      message: "reply: 页面运行在 Cloudflare Pages，前端像是静态站点。\ntool_results: web.fetchUrl: 已读取网页 https://example.test",
      urls: ["https://example.test"],
      source: "assistant_summary",
      status: "completed",
    },
  ];

  const reply = createOrionFollowUpReply("刚才判断的技术栈是什么", [], memory);

  assert.match(reply, /页面运行在 Cloudflare Pages/);
  assert.doesNotMatch(reply, /tool_results/);
});

test("summarizes workflow summary memory in follow-up replies", () => {
  const memory: OrionMemoryEntry[] = [
    {
      id: "workflow-summary",
      createdAt: 3,
      traceId: "orion-workflow",
      round: 1,
      task: "实现登录页",
      kind: "workflow.summary",
      title: "ORION workflow summary / completed",
      message: "outcome: completed\nsummary: 登录页流程完成，生成了 index.html。\nmemory_note: 后续问产物路径时回答 generated/index.html。",
      urls: [],
      source: "workflow_summary",
      status: "completed",
      artifactPaths: ["D:\\ORX\\tasks\\task-1\\generated\\index.html"],
    },
  ];

  const reply = createOrionFollowUpReply("刚才做完了什么", [], memory);

  assert.match(reply, /登录页流程完成/);
  assert.doesNotMatch(reply, /memory_note/);
});
