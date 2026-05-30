import test from "node:test";
import assert from "node:assert/strict";
import { createOrionAction } from "./orionActions.ts";
import {
  ORION_MEMORY_STORAGE_KEY,
  appendOrionMemoryEntry,
  appendFreshOrionMemoryEntry,
  createOrionAssistantAnswerMemoryEntry,
  createOrionAssistantSummaryMemoryEntry,
  createOrionAssistantQuestionMemoryEntry,
  createOrionChatSummaryMemoryEntry,
  createOrionDecisionMemoryEntry,
  createOrionMemoryEntry,
  createOrionUserAssistantEventMemoryEntry,
  createOrionUserWorkflowEventMemoryEntry,
  createOrionWorkflowNodeMemoryEntry,
  createOrionWorkflowObservationMemoryEntry,
  createOrionWorkflowRunMemoryEntry,
  createOrionWorkflowSummaryMemoryEntry,
  formatOrionFindingsMarkdown,
  formatOrionMemoryContext,
  formatOrionMemoryJson,
  loadOrionMemoryEntries,
  saveOrionMemoryEntries,
  selectFreshOrionMemoryEntries,
  type OrionMemoryEntry,
} from "./orionMemory.ts";

test("records web search action results as structured memory", () => {
  const action = createOrionAction("web.searchPublic", "联网查询公开资料", "读取网页资料", {
    query: "https://hnr.pages.dev/",
  });

  const entry = createOrionMemoryEntry("帮我抓取网页", action, "联网查询“https://hnr.pages.dev/”读取到 1 条结果：1. Example - https://example.test - Summary text", {
    now: 123,
    traceId: "orion-abc",
    round: 2,
  });

  assert.equal(entry.kind, "web.searchPublic");
  assert.equal(entry.source, "assistant_action");
  assert.equal(entry.task, "帮我抓取网页");
  assert.equal(entry.traceId, "orion-abc");
  assert.equal(entry.round, 2);
  assert.equal(entry.query, "https://hnr.pages.dev/");
  assert.deepEqual(entry.urls, ["https://example.test"]);
  assert.match(entry.message, /Summary text/);
});

test("records workflow node and run results as ORION memory", () => {
  const nodeEntry = createOrionWorkflowNodeMemoryEntry({
    task: "实现登录页",
    owner: "DEV Agent",
    stage: "TaskSplit",
    output: "已生成文件 D:\\ORX\\tasks\\task-1\\generated\\index.html",
    archivePath: "D:\\ORX\\tasks\\task-1",
    now: 123,
  });
  const runEntry = createOrionWorkflowRunMemoryEntry({
    task: "实现登录页",
    status: "completed",
    message: "流程完成",
    archivePath: "D:\\ORX\\tasks\\task-1",
    now: 124,
  });

  assert.equal(nodeEntry.kind, "workflow.node");
  assert.equal(nodeEntry.source, "workflow_node");
  assert.equal(nodeEntry.owner, "DEV Agent");
  assert.deepEqual(nodeEntry.artifactPaths, ["D:\\ORX\\tasks\\task-1\\generated\\index.html"]);
  assert.equal(runEntry.kind, "workflow.run");
  assert.equal(runEntry.source, "workflow_run");
  assert.equal(runEntry.status, "completed");
});

test("records workflow observations as ORION memory", () => {
  const entry = createOrionWorkflowObservationMemoryEntry({
    task: "实现登录页",
    owner: "DEV Agent",
    stage: "TaskSplit",
    observation: {
      source: "model",
      decision: "rerun",
      confidence: 0.82,
      summary: "DEV 输出没有可落盘文件。",
      target_stage: "TaskSplit",
      rerun_instruction: "请输出带 FILE 标记的实际文件。",
      memory_note: "首次 TaskSplit 需要重跑。",
    },
    archivePath: "D:\\ORX\\tasks\\task-1",
    now: 125,
  });

  assert.equal(entry.kind, "workflow.observation");
  assert.equal(entry.source, "workflow_observation");
  assert.equal(entry.status, "rerun");
  assert.equal(entry.owner, "DEV Agent");
  assert.equal(entry.stage, "TaskSplit");
  assert.match(entry.message, /DEV 输出没有可落盘文件/);
  assert.match(entry.message, /observer_source: model/);
  assert.match(entry.message, /target_stage: TaskSplit/);
  assert.match(entry.message, /FILE/);
});

test("records AI workflow summaries as ORION memory", () => {
  const entry = createOrionWorkflowSummaryMemoryEntry({
    task: "实现登录页",
    status: "completed",
    summary: {
      outcome: "completed",
      summary: "登录页流程完成，生成了 index.html。",
      artifacts: ["D:\\ORX\\tasks\\task-1\\generated\\index.html"],
      memory_note: "后续问产物路径时回答 index.html。",
      follow_up_hints: ["可继续询问产物路径"],
    },
    archivePath: "D:\\ORX\\tasks\\task-1",
    now: 126,
  });

  assert.equal(entry.kind, "workflow.summary");
  assert.equal(entry.source, "workflow_summary");
  assert.equal(entry.status, "completed");
  assert.equal(entry.title, "ORION workflow summary / completed");
  assert.deepEqual(entry.artifactPaths, ["D:\\ORX\\tasks\\task-1\\generated\\index.html"]);
  assert.match(entry.message, /登录页流程完成/);
  assert.match(entry.message, /follow_up_hints/);
});

test("records AI assistant final replies as ORION memory", () => {
  const entry = createOrionAssistantSummaryMemoryEntry({
    task: "读取网页并判断技术栈",
    reply: "页面运行在 Cloudflare Pages，前端像是静态站点。",
    resultMessages: [
      "web.fetchUrl: 已读取网页 https://example.test",
      "web.searchPublic: 查询到 Cloudflare Pages 相关资料",
    ],
    artifactPaths: ["D:\\ORX\\tasks\\task-2\\generated\\page.html"],
    archivePath: "D:\\ORX\\tasks\\task-2",
    now: 127,
    traceId: "orion-assistant",
    round: 3,
  });

  assert.equal(entry.kind, "assistant.summary");
  assert.equal(entry.source, "assistant_summary");
  assert.equal(entry.status, "completed");
  assert.equal(entry.traceId, "orion-assistant");
  assert.equal(entry.round, 3);
  assert.deepEqual(entry.artifactPaths, ["D:\\ORX\\tasks\\task-2\\generated\\page.html"]);
  assert.match(entry.message, /页面运行在 Cloudflare Pages/);
  assert.match(entry.message, /tool_results/);
});

test("records stopped assistant runs as ORION memory for follow-up context", () => {
  const entry = createOrionAssistantSummaryMemoryEntry({
    task: "fetch https://example.test and summarize it",
    reply: "ORION stopped after the first tool failed.",
    resultMessages: ["failed: certificate validation failed"],
    archivePath: "D:\\ORX\\tasks\\task-stopped",
    now: 1271,
    traceId: "orion-stopped",
    round: 2,
    status: "stopped",
  });

  assert.equal(entry.kind, "assistant.summary");
  assert.equal(entry.source, "assistant_summary");
  assert.equal(entry.status, "stopped");

  const context = formatOrionMemoryContext([entry]);
  assert.match(context, /orion-stopped/);
  assert.match(context, /stopped/);
  assert.match(context, /certificate validation failed/);
});

test("records ordinary chat replies as ORION memory", () => {
  const entry = createOrionChatSummaryMemoryEntry({
    task: "你好",
    reply: "ORION：你好，我在。",
    now: 128,
    traceId: "orion-chat",
  });

  assert.equal(entry.kind, "chat.summary");
  assert.equal(entry.source, "chat_summary");
  assert.equal(entry.status, "completed");
  assert.equal(entry.traceId, "orion-chat");
  assert.match(entry.message, /user_message: 你好/);
  assert.match(entry.message, /orion_reply: ORION：你好/);
});

test("records ORION questions as structured memory", () => {
  const entry = createOrionAssistantQuestionMemoryEntry({
    task: "安装一个客户端",
    question: "你希望安装哪个客户端？",
    reason: "缺少可信安装源",
    now: 129,
    traceId: "orion-question",
  });

  assert.equal(entry.kind, "assistant.question");
  assert.equal(entry.source, "assistant_question");
  assert.equal(entry.status, "waiting_user");
  assert.equal(entry.traceId, "orion-question");
  assert.match(entry.message, /question: 你希望安装哪个客户端/);
  assert.match(entry.message, /reason: 缺少可信安装源/);
});

test("records user answers to ORION questions as structured memory", () => {
  const entry = createOrionAssistantAnswerMemoryEntry({
    task: "安装一个客户端",
    answer: "Chrome",
    question: "你希望安装哪个客户端？",
    traceId: "orion-question",
    now: 130,
  });

  assert.equal(entry.kind, "assistant.answer");
  assert.equal(entry.source, "assistant_answer");
  assert.equal(entry.status, "answered");
  assert.equal(entry.traceId, "orion-question");
  assert.match(entry.message, /answer: Chrome/);
  assert.match(entry.message, /question: 你希望安装哪个客户端/);
});

test("records ORION model routing decisions as structured memory", () => {
  const entry = createOrionDecisionMemoryEntry({
    task: "inspect website",
    decisionType: "intent_router",
    decision: "assistant",
    reason: "Existing URL inspection does not require code changes.",
    confidence: 0.91,
    now: 131,
    traceId: "orion-decision",
  });

  assert.equal(entry.kind, "orion.decision");
  assert.equal(entry.source, "model_decision");
  assert.equal(entry.status, "assistant");
  assert.equal(entry.traceId, "orion-decision");
  assert.match(entry.message, /decision_type: intent_router/);
  assert.match(entry.message, /decision: assistant/);
  assert.match(entry.message, /reason: Existing URL inspection/);
  assert.match(entry.message, /confidence: 0\.91/);
});

test("formats ORION model decisions for future model context", () => {
  const context = formatOrionMemoryContext([
    createOrionDecisionMemoryEntry({
      task: "inspect website",
      decisionType: "intent_router",
      decision: "assistant",
      reason: "Existing URL inspection does not require code changes.",
      confidence: 0.91,
      now: 132,
      traceId: "decision-trace",
    }),
  ]);

  assert.match(context, /ORION model decision: intent_router -> assistant/);
  assert.match(context, /Decision reason: Existing URL inspection does not require code changes\./);
  assert.match(context, /Decision confidence: 0\.91/);
});

test("records user workflow events as structured memory", () => {
  const entry = createOrionUserWorkflowEventMemoryEntry({
    task: "build login page",
    eventType: "approval.rejected",
    owner: "ARCH Agent",
    stage: "CodeReview",
    note: "Reject because accessibility checks are missing.",
    now: 133,
    traceId: "user-event",
  });

  assert.equal(entry.kind, "user.workflow_event");
  assert.equal(entry.source, "user_workflow_event");
  assert.equal(entry.status, "approval.rejected");
  assert.equal(entry.owner, "ARCH Agent");
  assert.equal(entry.stage, "CodeReview");
  assert.match(entry.message, /event_type: approval\.rejected/);
  assert.match(entry.message, /note: Reject because accessibility checks are missing\./);
});

test("formats user workflow events for future model context", () => {
  const context = formatOrionMemoryContext([
    createOrionUserWorkflowEventMemoryEntry({
      task: "build login page",
      eventType: "approval.approved",
      owner: "PD Agent",
      stage: "ScenarioRehearsal",
      note: "Approved, keep mobile layout simple.",
      now: 134,
      traceId: "user-event-context",
    }),
  ]);

  assert.match(context, /User workflow event: approval\.approved/);
  assert.match(context, /Workflow node: PD Agent \/ ScenarioRehearsal/);
  assert.match(context, /User note: Approved, keep mobile layout simple\./);
});

test("records user assistant permission events as structured memory", () => {
  const entry = createOrionUserAssistantEventMemoryEntry({
    task: "读取网页内容",
    eventType: "assistant.approved",
    note: "允许本次",
    actions: ["web.fetchUrl", "memory.search"],
    now: 135,
    traceId: "assistant-event",
  });

  assert.equal(entry.kind, "user.assistant_event");
  assert.equal(entry.source, "user_assistant_event");
  assert.equal(entry.status, "assistant.approved");
  assert.match(entry.message, /event_type: assistant\.approved/);
  assert.match(entry.message, /actions: web\.fetchUrl -> memory\.search/);
  assert.match(entry.message, /note: 允许本次/);
});

test("formats user assistant permission events for future model context", () => {
  const context = formatOrionMemoryContext([
    createOrionUserAssistantEventMemoryEntry({
      task: "读取网页内容",
      eventType: "assistant.rejected",
      note: "用户取消，不要访问这个地址。",
      actions: ["web.fetchUrl"],
      now: 136,
      traceId: "assistant-event-context",
    }),
  ]);

  assert.match(context, /User assistant event: assistant\.rejected/);
  assert.match(context, /Assistant actions: web\.fetchUrl/);
  assert.match(context, /User note: 用户取消，不要访问这个地址。/);
});

test("formats recent structured memory for ORION follow-up replies", () => {
  const entries: OrionMemoryEntry[] = [
    {
      id: "old",
      createdAt: 1,
      traceId: "orion-old",
      round: 1,
      task: "旧任务",
      kind: "web.searchPublic",
      title: "旧结果",
      query: "old",
      message: "旧内容 https://old.example",
      urls: ["https://old.example"],
    },
    {
      id: "new",
      createdAt: 2,
      traceId: "orion-new",
      round: 1,
      task: "读取网页",
      kind: "web.searchPublic",
      title: "联网查询公开资料",
      query: "https://hnr.pages.dev/",
      message: "联网查询“https://hnr.pages.dev/”读取到 1 条结果：1. New Result - https://new.example - New summary",
      urls: ["https://new.example"],
      source: "assistant_action",
    },
  ];

  const context = formatOrionMemoryContext(entries, { limit: 1 });

  assert.match(context, /任务：读取网页/);
  assert.match(context, /trace_id：orion-new/);
  assert.match(context, /查询：https:\/\/hnr\.pages\.dev\//);
  assert.match(context, /https:\/\/new\.example/);
  assert.doesNotMatch(context, /old\.example/);
});

test("uses a wider default model memory window for multi-step ORION runs", () => {
  const entries: OrionMemoryEntry[] = Array.from({ length: 18 }, (_, index) => ({
    id: `entry-${index}`,
    createdAt: index + 1,
    traceId: `orion-wide-${index}`,
    round: index + 1,
    task: `multi step task ${index}`,
    kind: "web.searchPublic",
    title: "memory item",
    query: `query-${index}`,
    message: `result-${index}`,
    urls: [],
    source: "assistant_action",
  }));

  const context = formatOrionMemoryContext(entries);

  assert.match(context, /orion-wide-0/);
  assert.match(context, /result-0/);
  assert.match(context, /orion-wide-17/);
  assert.match(context, /result-17/);
});

test("formats AI summary memories with model-friendly semantic fields", () => {
  const context = formatOrionMemoryContext([
    createOrionAssistantSummaryMemoryEntry({
      task: "读取网页并判断技术栈",
      reply: "页面运行在 Cloudflare Pages，前端像是静态站点。",
      resultMessages: ["web.fetchUrl: 已读取网页 https://example.test"],
      now: 10,
      traceId: "assistant-trace",
    }),
    createOrionWorkflowSummaryMemoryEntry({
      task: "实现登录页",
      status: "completed",
      summary: {
        outcome: "completed",
        summary: "登录页流程完成，生成了 index.html。",
        artifacts: ["D:\\ORX\\tasks\\task-1\\generated\\index.html"],
        memory_note: "后续问产物路径时回答 index.html。",
        follow_up_hints: ["可继续询问产物路径"],
      },
      now: 11,
      traceId: "workflow-trace",
    }),
    createOrionChatSummaryMemoryEntry({
      task: "你好",
      reply: "ORION：你好，我在。",
      now: 12,
      traceId: "chat-trace",
    }),
    createOrionAssistantQuestionMemoryEntry({
      task: "安装一个客户端",
      question: "你希望安装哪个客户端？",
      reason: "缺少可信安装源",
      now: 13,
      traceId: "question-trace",
    }),
    createOrionAssistantAnswerMemoryEntry({
      task: "安装一个客户端",
      answer: "Chrome",
      question: "你希望安装哪个客户端？",
      now: 14,
      traceId: "answer-trace",
    }),
  ], { limit: 5 });

  assert.match(context, /ORION 最终答复：页面运行在 Cloudflare Pages/);
  assert.match(context, /工具结果摘要：web\.fetchUrl/);
  assert.match(context, /ORION 工作流回顾：登录页流程完成/);
  assert.match(context, /后续追问线索：可继续询问产物路径/);
  assert.match(context, /用户消息：你好/);
  assert.match(context, /ORION 普通回复：ORION：你好，我在。/);
  assert.match(context, /ORION 追问：你希望安装哪个客户端？/);
  assert.match(context, /追问原因：缺少可信安装源/);
  assert.match(context, /用户回答 ORION 追问：Chrome/);
  assert.doesNotMatch(context, /结果：reply:/);
  assert.doesNotMatch(context, /结果：outcome:/);
});

test("keeps ORION memory bounded while appending traceable entries", () => {
  const entries: OrionMemoryEntry[] = Array.from({ length: 3 }, (_, index) => ({
    id: `entry-${index}`,
    createdAt: index,
    traceId: `orion-${index}`,
    round: 1,
    task: `任务 ${index}`,
    kind: "web.searchPublic",
    title: "联网查询公开资料",
    message: `结果 ${index}`,
    urls: [],
  }));
  const next = appendOrionMemoryEntry(entries, {
    id: "entry-3",
    createdAt: 3,
    traceId: "orion-3",
    round: 1,
    task: "任务 3",
    kind: "web.searchPublic",
    title: "联网查询公开资料",
    message: "结果 3",
    urls: [],
  }, 2);

  assert.deepEqual(next.map((entry) => entry.id), ["entry-2", "entry-3"]);
});

test("selects ref memory when it is fresher than React state memory", () => {
  const stateEntry: OrionMemoryEntry = {
    id: "state-old",
    createdAt: 100,
    traceId: "orion-state",
    round: 1,
    task: "old state",
    kind: "workflow.node",
    title: "old node",
    message: "old node result",
    urls: [],
    source: "workflow_node",
  };
  const refEntry: OrionMemoryEntry = {
    id: "ref-new",
    createdAt: 200,
    traceId: "orion-ref",
    round: 1,
    task: "fresh workflow result",
    kind: "workflow.observation",
    title: "fresh observation",
    message: "fresh model observation",
    urls: [],
    source: "workflow_observation",
  };

  assert.deepEqual(selectFreshOrionMemoryEntries([stateEntry], [stateEntry, refEntry]), [stateEntry, refEntry]);
  assert.deepEqual(selectFreshOrionMemoryEntries([stateEntry, refEntry], [stateEntry]), [stateEntry, refEntry]);
});

test("appends assistant results to the freshest memory snapshot when React state lags behind the ref", () => {
  const stateEntry: OrionMemoryEntry = {
    id: "state-old",
    createdAt: 100,
    traceId: "orion-state",
    round: 1,
    task: "old state",
    kind: "workflow.node",
    title: "old node",
    message: "old node result",
    urls: [],
  };
  const refEntry: OrionMemoryEntry = {
    id: "ref-new",
    createdAt: 200,
    traceId: "orion-ref",
    round: 2,
    task: "approved action",
    kind: "user.assistant_event",
    title: "approval",
    message: "assistant.approved",
    urls: [],
  };
  const resultEntry: OrionMemoryEntry = {
    id: "tool-result",
    createdAt: 300,
    traceId: "orion-ref",
    round: 3,
    task: "fetch website",
    kind: "web.fetchUrl",
    title: "fetch result",
    message: "HTML loaded",
    urls: [],
  };

  assert.deepEqual(
    appendFreshOrionMemoryEntry([stateEntry], [stateEntry, refEntry], resultEntry).map((entry) => entry.id),
    ["state-old", "ref-new", "tool-result"],
  );
});

test("persists ORION memory entries and tolerates corrupted local storage", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
  const entries: OrionMemoryEntry[] = [{
    id: "entry-1",
    createdAt: 1,
    traceId: "orion-1",
    round: 1,
    task: "读取网页",
    kind: "web.searchPublic",
    title: "联网查询公开资料",
    query: "https://hnr.pages.dev/",
    message: "结果",
    urls: ["https://example.test"],
    source: "assistant_action",
  }];

  saveOrionMemoryEntries(storage, entries);
  assert.deepEqual(loadOrionMemoryEntries(storage), entries);

  storage.setItem(ORION_MEMORY_STORAGE_KEY, "{bad json");
  assert.deepEqual(loadOrionMemoryEntries(storage), []);
});

test("exports ORION memory as replayable json and findings markdown", () => {
  const entries: OrionMemoryEntry[] = [{
    id: "entry-1",
    createdAt: Date.UTC(2026, 4, 29, 12, 0, 0),
    traceId: "orion-trace",
    round: 1,
    task: "读取网页",
    kind: "web.searchPublic",
    title: "联网查询公开资料",
    query: "https://hnr.pages.dev/",
    message: "联网查询“https://hnr.pages.dev/”读取到 1 条结果：1. Example - https://example.test - Summary",
    urls: ["https://example.test"],
    source: "assistant_action",
  }];

  const json = JSON.parse(formatOrionMemoryJson(entries));
  assert.equal(json.version, 2);
  assert.equal(json.entries[0].traceId, "orion-trace");

  const markdown = formatOrionFindingsMarkdown(entries);
  assert.match(markdown, /# ORION Findings/);
  assert.match(markdown, /trace_id: orion-trace/);
  assert.match(markdown, /query: https:\/\/hnr\.pages\.dev\//);
  assert.match(markdown, /https:\/\/example\.test/);
});
