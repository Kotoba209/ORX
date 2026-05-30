import test from "node:test";
import assert from "node:assert/strict";
import {
  createOrionQuestionAnswerTask,
  createOrionResolvedTaskForOrch,
  findLatestWaitingOrionQuestion,
  shouldTreatAsOrionQuestionAnswer,
} from "./orionQuestionAnswer.ts";
import type { OrionMemoryEntry } from "./orionMemory.ts";

const waitingQuestion: OrionMemoryEntry = {
  id: "question-1",
  createdAt: 10,
  traceId: "orion-question",
  round: 1,
  task: "安装一个客户端",
  kind: "assistant.question",
  title: "ORION assistant question",
  message: "question: 你希望安装哪个客户端？\nreason: 缺少可信安装源",
  urls: [],
  source: "assistant_question",
  status: "waiting_user",
};

test("finds the latest waiting ORION question", () => {
  const older: OrionMemoryEntry = { ...waitingQuestion, id: "older", createdAt: 1, message: "question: 旧问题" };
  const latest = findLatestWaitingOrionQuestion([older, waitingQuestion]);

  assert.equal(latest?.id, "question-1");
});

test("adds planner guidance for route clarification answers", () => {
  const task = createOrionQuestionAnswerTask(waitingQuestion, "鐩存帴鎵ц");

  assert.match(task, /Route clarification guidance/);
  assert.match(task, /choose propose_actions/);
  assert.match(task, /choose chat/);
  assert.match(task, /choose run_workflow/);
});

test("ignores a waiting ORION question after the user answer is recorded", () => {
  const answer: OrionMemoryEntry = {
    id: "answer-1",
    createdAt: 11,
    traceId: "orion-question",
    round: 1,
    task: waitingQuestion.task,
    kind: "assistant.answer",
    title: "ORION assistant answer",
    message: "answer: Chrome",
    urls: [],
    source: "assistant_answer",
    status: "answered",
  };

  assert.equal(findLatestWaitingOrionQuestion([waitingQuestion, answer]), undefined);
});

test("treats short user replies as answers to a waiting ORION question", () => {
  assert.equal(shouldTreatAsOrionQuestionAnswer("Chrome", waitingQuestion), true);
  assert.equal(shouldTreatAsOrionQuestionAnswer("就用这个网站", waitingQuestion), true);
  assert.equal(shouldTreatAsOrionQuestionAnswer("请重新做一个登录页", waitingQuestion), false);
});

test("treats route clarification choices as answers even when they mention execution", () => {
  assert.equal(shouldTreatAsOrionQuestionAnswer("直接执行", waitingQuestion), true);
  assert.equal(shouldTreatAsOrionQuestionAnswer("调用工具处理", waitingQuestion), true);
  assert.equal(shouldTreatAsOrionQuestionAnswer("只是回答", waitingQuestion), true);
  assert.equal(shouldTreatAsOrionQuestionAnswer("进入开发流程", waitingQuestion), true);
});

test("creates a model task that preserves the original question context", () => {
  const task = createOrionQuestionAnswerTask(waitingQuestion, "Chrome");

  assert.match(task, /用户正在回答 ORION 上一轮追问/);
  assert.match(task, /原始任务：安装一个客户端/);
  assert.match(task, /ORION 追问：你希望安装哪个客户端？/);
  assert.match(task, /用户回答：Chrome/);
});

test("creates a detailed ORCH task when the user answer depends on prior ORION context", () => {
  const task = createOrionResolvedTaskForOrch(waitingQuestion, "是");

  assert.match(task, /ORION 已根据上一轮追问补全用户意图/);
  assert.match(task, /原始任务：安装一个客户端/);
  assert.match(task, /用户回答：是/);
  assert.match(task, /不要只向 ORCH 下发“继续”/);
});
