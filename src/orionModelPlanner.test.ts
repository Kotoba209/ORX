import test from "node:test";
import assert from "node:assert/strict";
import {
  createOrionModelPlannerRunInput,
  formatOrionModelDecisionForMemory,
  parseOrionModelDecision,
} from "./orionModelPlanner.ts";
import type { ProviderConfig } from "./orionChat.ts";

const provider: ProviderConfig = {
  id: "gpt-local",
  name: "GPT Local",
  kind: "openai-compatible",
  api_protocol: "responses",
  base_url: "http://127.0.0.1:8317/v1",
  use_proxy_route: true,
  proxy_url: "http://127.0.0.1:7897",
  model: "gpt-5.5",
  api_key_ref: "GPT_LOCAL_API_KEY",
};

test("creates an AI-driver planner input with ORX safety boundaries", () => {
  const input = createOrionModelPlannerRunInput({
    provider,
    task: "帮我抓取 https://hnr.pages.dev/",
    chatLines: ["你：你好", "ORION：你好！"],
    memoryContext: "trace_id：orion-1\n结果：previous",
    capabilityGapContext: "缺口工具：browser.fetchUrl\n优先替代：web.fetchUrl",
    skillContext: "Skill：读取网页并总结服务端信息\n动作：web.fetchUrl\n复用次数：2",
    accessModeContext: "权限模式：完全访问权限\n规划策略：优先提出可执行工具动作",
  });

  assert.equal(input.owner, "ORION");
  assert.equal(input.stage, "驾驶员决策");
  assert.equal(input.provider, provider);
  assert.match(input.task, /AI 是驾驶员，ORX 是驾驶舱/);
  assert.match(input.task, /只输出 JSON/);
  assert.match(input.task, /web\.searchPublic/);
  assert.match(input.task, /cockpit protocol/);
  assert.match(input.upstream, /previous/);
  assert.match(input.upstream, /近期工具能力缺口/);
  assert.match(input.upstream, /browser\.fetchUrl/);
  assert.match(input.upstream, /优先使用缺口里标注的替代工具/);
  assert.match(input.upstream, /已沉淀技能\/SOP/);
  assert.match(input.upstream, /读取网页并总结服务端信息/);
  assert.match(input.upstream, /当前权限模式/);
  assert.match(input.upstream, /完全访问权限/);
  assert.match(input.upstream, /权限更开放时，优先规划可执行动作/);
});

test("parses chat visible_reply without exposing internal reasoning", () => {
  const decision = parseOrionModelDecision(JSON.stringify({
    kind: "chat",
    visible_reply: "你好，我在。",
    reason: "ordinary greeting",
    memory_update: "user greeted ORION",
  }));

  assert.deepEqual(decision, {
    kind: "chat",
    reply: "你好，我在。",
    reason: "ordinary greeting",
  });
});

test("parses model-proposed safe actions into ORX actions", () => {
  const decision = parseOrionModelDecision(`\`\`\`json
{
  "kind": "propose_actions",
  "reason": "用户要求读取公开网页",
  "actions": [
    {
      "kind": "web.searchPublic",
      "title": "联网查询公开资料",
      "summary": "读取 hnr.pages.dev",
      "payload": { "query": "https://hnr.pages.dev/", "max_results": 5 }
    }
  ]
}
\`\`\``);

  assert.equal(decision.kind, "propose_actions");
  assert.equal(decision.actions.length, 1);
  assert.equal(decision.actions[0].kind, "web.searchPublic");
  assert.equal(decision.actions[0].risk, "direct");
  assert.deepEqual(decision.actions[0].payload, { query: "https://hnr.pages.dev/", max_results: 5 });
});

test("fills empty web search query from request url", () => {
  const decision = parseOrionModelDecision(JSON.stringify({
    kind: "propose_actions",
    reason: "read website",
    actions: [
      {
        kind: "web.searchPublic",
        title: "Read website",
        summary: "Read public website",
        payload: {
          query: "",
          request: "我需要页面HTML包括服务器技术栈，地址是 https://hnr.pages.dev/",
          max_results: 5,
        },
      },
    ],
  }));

  assert.equal(decision.kind, "propose_actions");
  if (decision.kind === "propose_actions") {
    assert.equal(decision.actions[0].payload.query, "https://hnr.pages.dev/");
  }
});

test("parses fetch url actions for known public urls", () => {
  const decision = parseOrionModelDecision(JSON.stringify({
    kind: "propose_actions",
    reason: "read known website",
    actions: [
      {
        kind: "web.fetchUrl",
        title: "读取网页",
        summary: "读取网页 HTML 和响应头",
        payload: {
          url: "",
          request: "读取 https://hnr.pages.dev/ 的 HTML 和服务器信息",
          include_html: true,
          include_headers: true,
        },
      },
    ],
  }));

  assert.equal(decision.kind, "propose_actions");
  if (decision.kind === "propose_actions") {
    assert.equal(decision.actions[0].kind, "web.fetchUrl");
    assert.equal(decision.actions[0].payload.url, "https://hnr.pages.dev/");
  }
});

test("parses insecure fetch url actions with strong confirmation", () => {
  const decision = parseOrionModelDecision(JSON.stringify({
    kind: "propose_actions",
    reason: "retry expired certificate",
    actions: [
      {
        kind: "web.fetchUrlInsecure",
        title: "不安全读取网页",
        summary: "忽略证书校验读取 https://hnr.pages.dev/",
        payload: { url: "" },
      },
    ],
  }));

  assert.equal(decision.kind, "propose_actions");
  if (decision.kind === "propose_actions") {
    assert.equal(decision.actions[0].kind, "web.fetchUrlInsecure");
    assert.equal(decision.actions[0].risk, "strong-confirm");
    assert.equal(decision.actions[0].payload.url, "https://hnr.pages.dev/");
  }
});

test("rejects unsupported or destructive model-proposed actions", () => {
  const decision = parseOrionModelDecision(JSON.stringify({
    kind: "propose_actions",
    reason: "bad",
    actions: [
      { kind: "git.push", title: "push", summary: "push", payload: {} },
      { kind: "workflow.delete", title: "delete", summary: "delete", payload: {} },
    ],
  }));

  assert.equal(decision.kind, "ask_user");
  assert.match(decision.question, /没有可安全执行的动作/);
});

test("reports unsupported tool capability with a useful alternative", () => {
  const decision = parseOrionModelDecision(JSON.stringify({
    kind: "propose_actions",
    reason: "model wants a browser tool",
    actions: [
      {
        kind: "browser.fetchUrl",
        title: "Fetch URL",
        summary: "Open and read a webpage",
        payload: { url: "https://hnr.pages.dev/" },
      },
    ],
  }));

  assert.equal(decision.kind, "ask_user");
  if (decision.kind === "ask_user") {
    assert.match(decision.question, /缺少工具能力|browser\.fetchUrl|web\.fetchUrl/);
    assert.deepEqual(decision.capability_gap, {
      toolKind: "browser.fetchUrl",
      alternative: "web.fetchUrl",
      reason: "unsupported_tool_capability",
      payloadPreview: "url=https://hnr.pages.dev/",
    });
  }
});

test("rejects command actions without an executable program", () => {
  const decision = parseOrionModelDecision(JSON.stringify({
    kind: "propose_actions",
    reason: "install requested",
    actions: [
      {
        kind: "command.runWhitelisted",
        title: "Install app",
        summary: "Install a desktop app",
        payload: { request: "安装这个软件" },
      },
    ],
  }));

  assert.equal(decision.kind, "ask_user");
  if (decision.kind === "ask_user") {
    assert.match(decision.question, /命令|program|软件源|包名/);
  }
});

test("downgrades non-whitelisted commands to sandbox approval", () => {
  const decision = parseOrionModelDecision(JSON.stringify({
    kind: "propose_actions",
    reason: "inspect website headers",
    actions: [
      {
        kind: "command.runWhitelisted",
        title: "Check headers",
        summary: "Run curl headers",
        payload: { program: "curl", args: ["-I", "https://hnr.pages.dev/"] },
      },
    ],
  }));

  assert.equal(decision.kind, "propose_actions");
  if (decision.kind === "propose_actions") {
    assert.equal(decision.actions[0].kind, "command.runWorktreeSandbox");
    assert.equal(decision.actions[0].risk, "confirm");
    assert.deepEqual(decision.actions[0].payload, {
      program: "curl",
      args: ["-I", "https://hnr.pages.dev/"],
    });
  }
});

test("parses direct chat decisions", () => {
  const decision = parseOrionModelDecision(JSON.stringify({
    kind: "chat",
    reply: "你好，我在。",
    reason: "普通问候",
  }));

  assert.deepEqual(decision, {
    kind: "chat",
    reply: "你好，我在。",
    reason: "普通问候",
  });
});

test("formats model planner decisions for ORION memory", () => {
  const decision = parseOrionModelDecision(JSON.stringify({
    kind: "propose_actions",
    reason: "read known website",
    actions: [
      {
        kind: "web.fetchUrl",
        title: "读取网页",
        summary: "读取网页 HTML",
        payload: { url: "https://hnr.pages.dev/" },
      },
    ],
  }));

  assert.deepEqual(formatOrionModelDecisionForMemory(decision), {
    decision: "propose_actions:web.fetchUrl",
    reason: "read known website",
  });
});

test("formats fallback planner decisions with an explicit source marker", () => {
  const decision = parseOrionModelDecision(JSON.stringify({
    kind: "chat",
    reply: "fallback reply",
    reason: "structured_memory_follow_up",
  }));

  assert.deepEqual(formatOrionModelDecisionForMemory(decision, { source: "fallback" }), {
    decision: "fallback:chat",
    reason: "fallback: structured_memory_follow_up",
  });
});
