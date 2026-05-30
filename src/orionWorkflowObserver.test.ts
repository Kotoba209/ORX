import test from "node:test";
import assert from "node:assert/strict";
import {
  createFallbackOrionWorkflowObservation,
  createOrionWorkflowObserverRunInput,
  formatOrionObservationPrompt,
  observationRequiresUserInput,
  observationRequestsRerun,
  appendOrionObservationToUpstream,
  appendOrionObservationRerunToUpstream,
  appendOrionObservationAnswerToUpstream,
  parseOrionWorkflowObservation,
  shouldRunFallbackOrionNodeMonitor,
  shouldSurfaceOrionWorkflowObservation,
} from "./orionWorkflowObserver.ts";

const provider = {
  id: "mimo",
  name: "MiMo",
  kind: "openai-compatible",
  api_protocol: "chat-completions" as const,
  base_url: "http://127.0.0.1:8080",
  use_proxy_route: false,
  proxy_url: "",
  model: "mimo",
  api_key_ref: "ANTHROPIC_AUTH_TOKEN",
};

test("creates a workflow observer prompt with node output and process memory", () => {
  const input = createOrionWorkflowObserverRunInput({
    provider,
    task: "实现登录页",
    owner: "DEV Agent",
    stage: "TaskSplit",
    output: "生成了 index.html",
    processContext: "当前任务归档目录：D:\\ORX\\tasks\\task-1",
  });

  assert.equal(input.owner, "ORION");
  assert.equal(input.stage, "工作流观察");
  assert.match(input.task, /AI 是驾驶员/);
  assert.match(input.task, /只输出 JSON/);
  assert.match(input.upstream, /DEV Agent \/ TaskSplit/);
  assert.match(input.upstream, /生成了 index\.html/);
  assert.match(input.upstream, /D:\\ORX\\tasks\\task-1/);
});

test("parses model workflow observations into safe decisions", () => {
  const observation = parseOrionWorkflowObservation(JSON.stringify({
    decision: "intervene",
    confidence: 0.82,
    summary: "DEV 输出没有说明保存路径",
    user_message: "我发现 DEV 结果缺少产物路径，可以先暂停确认。",
    memory_note: "DEV 节点缺少产物路径。",
  }));

  assert.equal(observation.decision, "intervene");
  assert.equal(observation.confidence, 0.82);
  assert.equal(observation.summary, "DEV 输出没有说明保存路径");
  assert.equal(observation.user_message, "我发现 DEV 结果缺少产物路径，可以先暂停确认。");
  assert.equal(observation.memory_note, "DEV 节点缺少产物路径。");
  assert.equal(observation.source, "model");
  assert.equal(shouldRunFallbackOrionNodeMonitor(observation), false);
});

test("falls back to continue when model observation is invalid", () => {
  const observation = parseOrionWorkflowObservation("继续推进即可");

  assert.equal(observation.decision, "continue");
  assert.equal(observation.confidence, 0.35);
  assert.match(observation.summary, /继续推进即可/);
  assert.equal(observation.source, "fallback");
  assert.equal(shouldRunFallbackOrionNodeMonitor(observation), true);
});

test("creates model-readable fallback observations when observer is unavailable", () => {
  const observation = createFallbackOrionWorkflowObservation({
    owner: "DEV Agent",
    stage: "TaskSplit",
    reason: "model request failed",
  });

  assert.equal(observation.decision, "continue");
  assert.equal(observation.confidence, 0.2);
  assert.match(observation.summary, /fallback/);
  assert.match(observation.summary, /DEV Agent \/ TaskSplit/);
  assert.match(observation.memory_note, /model request failed/);
  assert.equal(observation.source, "fallback");
  assert.equal(shouldRunFallbackOrionNodeMonitor(observation), true);
  assert.equal(shouldSurfaceOrionWorkflowObservation(observation), false);
});

test("surfaces only meaningful workflow observations to the chat", () => {
  assert.equal(shouldSurfaceOrionWorkflowObservation({ decision: "continue", confidence: 0.9, summary: "继续" }), false);
  assert.equal(shouldSurfaceOrionWorkflowObservation({ decision: "intervene", confidence: 0.7, summary: "需要补充" }), true);
  assert.equal(shouldSurfaceOrionWorkflowObservation({ decision: "ask_user", confidence: 0.6, summary: "需要用户确认" }), true);
  assert.equal(shouldSurfaceOrionWorkflowObservation({ decision: "stop", confidence: 0.6, summary: "应停止" }), true);
  assert.equal(shouldSurfaceOrionWorkflowObservation({ decision: "rerun", confidence: 0.8, summary: "需要重跑节点" }), true);
});

test("pauses workflow only when ORION asks the user or recommends stopping", () => {
  assert.equal(observationRequiresUserInput({ decision: "continue", confidence: 0.9, summary: "继续" }), false);
  assert.equal(observationRequiresUserInput({ decision: "intervene", confidence: 0.7, summary: "建议提醒" }), false);
  assert.equal(observationRequiresUserInput({ decision: "rerun", confidence: 0.7, summary: "重跑节点" }), false);
  assert.equal(observationRequiresUserInput({ decision: "ask_user", confidence: 0.7, summary: "需要用户补充" }), true);
  assert.equal(observationRequiresUserInput({ decision: "stop", confidence: 0.7, summary: "继续会出错" }), true);
});

test("formats observation prompt and appends user answer to workflow upstream", () => {
  const observation = {
    decision: "ask_user" as const,
    confidence: 0.76,
    summary: "DEV 没有说明部署目标。",
    user_message: "需要你确认部署目标后再继续。",
  };

  const prompt = formatOrionObservationPrompt(observation);
  const upstream = appendOrionObservationAnswerToUpstream("上游内容", observation, "部署到本地 preview");

  assert.match(prompt, /需要你确认部署目标/);
  assert.match(upstream, /ORION observation/);
  assert.match(upstream, /DEV 没有说明部署目标/);
  assert.match(upstream, /部署到本地 preview/);
});

test("appends ORION observations to downstream workflow upstream", () => {
  const observation = {
    source: "model" as const,
    decision: "intervene" as const,
    confidence: 0.76,
    summary: "DEV 输出缺少服务器环境说明。",
    user_message: "后续 QA 需要补充服务器环境验证。",
    memory_note: "QA 节点应检查服务器环境信息。",
  };

  const upstream = appendOrionObservationToUpstream("节点上游", observation);

  assert.match(upstream, /ORION observation/);
  assert.match(upstream, /source: model/);
  assert.match(upstream, /decision: intervene/);
  assert.match(upstream, /DEV 输出缺少服务器环境说明/);
  assert.match(upstream, /QA 节点应检查服务器环境信息/);
});

test("parses rerun observations and formats rerun upstream", () => {
  const observation = parseOrionWorkflowObservation(JSON.stringify({
    decision: "rerun",
    confidence: 0.81,
    summary: "DEV 输出没有可落盘文件。",
    target_stage: "TaskSplit",
    rerun_instruction: "请输出带 FILE 标记的实际文件。",
  }));
  const upstream = appendOrionObservationRerunToUpstream("上游内容", observation);

  assert.equal(observation.decision, "rerun");
  assert.equal(observation.target_stage, "TaskSplit");
  assert.equal(observation.rerun_instruction, "请输出带 FILE 标记的实际文件。");
  assert.equal(observationRequestsRerun(observation), true);
  assert.match(upstream, /ORION rerun/);
  assert.match(upstream, /TaskSplit/);
  assert.match(upstream, /FILE/);
});
