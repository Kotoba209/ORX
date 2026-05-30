import test from "node:test";
import assert from "node:assert/strict";
import { createOrionWorkflowStartUpstream } from "./orionWorkflowContext.ts";
import type { OrionMemoryEntry } from "./orionMemory.ts";

test("adds ORION structured memory to workflow start upstream", () => {
  const orionMemoryEntries: OrionMemoryEntry[] = [{
    id: "assistant-summary-1",
    createdAt: 1,
    traceId: "orion-assistant",
    round: 1,
    task: "读取网页并判断技术栈",
    kind: "assistant.summary",
    title: "ORION assistant summary",
    message: "reply: 页面运行在 Cloudflare Pages，前端像是静态站点。",
    urls: [],
    source: "assistant_summary",
    status: "completed",
  }];

  const upstream = createOrionWorkflowStartUpstream({
    task: "基于刚才网页结果做一个安全测试页面",
    projectContext: "项目上下文摘要",
    projectPath: "D:\\demo",
    memoryContext: "长期记忆：测试优先",
    attachmentContext: "附件：spec.md",
    orionMemoryEntries,
  });

  assert.match(upstream, /用户任务：基于刚才网页结果做一个安全测试页面/);
  assert.match(upstream, /项目上下文：项目上下文摘要/);
  assert.match(upstream, /长期记忆：测试优先/);
  assert.match(upstream, /ORION 结构化记忆/);
  assert.match(upstream, /ORION 最终答复：页面运行在 Cloudflare Pages/);
  assert.match(upstream, /附件：spec\.md/);
  assert.match(upstream, /代码产物同步路径：D:\\demo/);
  assert.match(upstream, /ARCH 和 QA 必须优先检查该项目路径/);
});

test("omits empty optional workflow context blocks", () => {
  const upstream = createOrionWorkflowStartUpstream({
    task: "实现登录页",
    projectContext: "项目上下文摘要",
    memoryContext: "",
    attachmentContext: "",
    orionMemoryEntries: [],
  });

  assert.equal(upstream, "用户任务：实现登录页\n项目上下文：项目上下文摘要");
});
