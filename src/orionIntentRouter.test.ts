import test from "node:test";
import assert from "node:assert/strict";
import { createOrionIntentClarificationQuestion, formatOrionIntentRouteForMemory, intentRouteIsActionable, normalizeOrionIntentRouteDecision, parseOrionIntentRouteDecision } from "./orionIntentRouter.ts";

test("parses ordinary chat route without requiring high confidence gate", () => {
  const decision = parseOrionIntentRouteDecision('{"route":"chat","confidence":0.55,"reason":"用户只是问候"}');

  assert.deepEqual(decision, {
    route: "chat",
    confidence: 0.55,
    reason: "用户只是问候",
    question: undefined,
  });
  assert.equal(decision ? intentRouteIsActionable(decision) : false, true);
});

test("parses website analysis as assistant route", () => {
  const decision = parseOrionIntentRouteDecision('```json\n{"route":"assistant","confidence":0.91,"reason":"用户要分析已有网址的 HTML 和服务器技术栈"}\n```');

  assert.equal(decision?.route, "assistant");
  assert.equal(decision?.confidence, 0.91);
  assert.equal(decision ? intentRouteIsActionable(decision) : false, true);
});

test("requires clarification for low confidence non-chat routes", () => {
  const decision = parseOrionIntentRouteDecision('{"route":"workflow","confidence":0.42,"reason":"可能是开发任务"}');

  assert.equal(decision?.route, "workflow");
  assert.equal(decision ? intentRouteIsActionable(decision) : false, false);
});

test("creates a trackable clarification question for low confidence routes", () => {
  const question = createOrionIntentClarificationQuestion({
    route: "workflow",
    confidence: 0.42,
    reason: "possibly development but missing explicit code change",
  });

  assert.match(question, /普通聊天/);
  assert.match(question, /调用工具/);
  assert.match(question, /开发流程/);
});

test("rejects unknown model routes", () => {
  assert.equal(parseOrionIntentRouteDecision('{"route":"delete_everything","confidence":1,"reason":"bad"}'), null);
});

test("defaults uncertain non-development tasks to assistant instead of asking twice", () => {
  const decision = normalizeOrionIntentRouteDecision(parseOrionIntentRouteDecision(JSON.stringify({
    route: "ask_user",
    confidence: 0.58,
    reason: "possibly needs tools",
    facts: {
      target: "existing_website",
      operation: "inspect",
      mentions_url: true,
      requires_code_change: false,
      requires_local_tool: true,
      destructive: false,
      missing_critical_target: false,
    },
  }))!);

  assert.equal(decision.route, "assistant");
  assert.equal(intentRouteIsActionable(decision), true);
});

test("keeps clarification only when a critical target is missing", () => {
  const decision = normalizeOrionIntentRouteDecision(parseOrionIntentRouteDecision(JSON.stringify({
    route: "ask_user",
    confidence: 0.3,
    reason: "missing target",
    question: "你希望我处理哪个项目或网址？",
    facts: {
      target: "unknown",
      operation: "inspect",
      mentions_url: false,
      requires_code_change: false,
      requires_local_tool: true,
      destructive: false,
      missing_critical_target: true,
    },
  }))!);

  assert.equal(decision.route, "ask_user");
  assert.equal(intentRouteIsActionable(decision), true);
});

test("requires explicit code-change evidence before allowing workflow", () => {
  const decision = normalizeOrionIntentRouteDecision(parseOrionIntentRouteDecision(JSON.stringify({
    route: "workflow",
    confidence: 0.91,
    reason: "mentions html",
    facts: {
      target: "existing_website",
      operation: "inspect",
      mentions_url: true,
      requires_code_change: false,
      requires_local_tool: true,
      destructive: false,
      missing_critical_target: false,
    },
  }))!);

  assert.equal(decision.route, "assistant");
});

test("normalizes recent-memory follow-ups without tool needs to chat", () => {
  const decision = normalizeOrionIntentRouteDecision(parseOrionIntentRouteDecision(JSON.stringify({
    route: "assistant",
    confidence: 0.77,
    reason: "user asks about previous result",
    facts: {
      target: "recent_memory",
      operation: "follow_up",
      mentions_url: false,
      requires_code_change: false,
      requires_local_tool: false,
      destructive: false,
      missing_critical_target: false,
    },
  }))!);

  assert.equal(decision.route, "chat");
  assert.equal(intentRouteIsActionable(decision), true);
});

test("formats fallback intent routes as explicit model-readable memory", () => {
  const memory = formatOrionIntentRouteForMemory({
    route: "assistant",
    confidence: 0.5,
    reason: "rule route after intent router was unavailable",
  }, { source: "fallback" });

  assert.equal(memory.decision, "fallback:assistant");
  assert.match(memory.reason, /fallback/);
  assert.match(memory.reason, /rule route after intent router was unavailable/);
  assert.equal(memory.confidence, 0.5);
});
