import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultSteps,
  getApprovalPrompt,
  getRollbackTarget,
  isApproveCommand,
  isRejectCommand,
  nextRuntimeAfterApproval,
  nextRuntimeAfterRejection,
  outputHasFileArtifact,
  parseApprovalInput,
  stepShouldProduceFileArtifact,
  taskLikelyNeedsFileArtifact,
  type ApprovalGateState,
  type WorkflowRuntimeState,
} from "./workflowState.ts";

const approvedGate = (stage: string): ApprovalGateState => {
  const stepIndex = defaultSteps.findIndex((step) => step.stage === stage);
  assert.notEqual(stepIndex, -1, `${stage} step should exist`);
  return {
    step: defaultSteps[stepIndex],
    stepIndex,
    runtime: {
      nextIndex: stepIndex + 1,
      upstream: `accepted output from ${stage}`,
    },
    upstreamBefore: `upstream before ${stage}`,
  };
};

function runUntilApproval(runtime: WorkflowRuntimeState) {
  for (let index = runtime.nextIndex; index < defaultSteps.length; index += 1) {
    const step = defaultSteps[index];
    const upstreamBefore = runtime.upstream;
    runtime = {
      ...runtime,
      nextIndex: index + 1,
      upstream: `${runtime.upstream}\n[${step.owner}/${step.stage}] accepted output from ${step.stage}`,
    };
    if (step.approval === "user") {
      return {
        gate: { step, stepIndex: index, runtime, upstreamBefore },
        runtime,
        completed: false,
      };
    }
  }
  return { gate: null, runtime, completed: true };
}

test("default workflow has user approval gates for PD docs and ARCH review only", () => {
  const approvalStages = defaultSteps
    .filter((step) => step.enabled !== false && step.approval === "user")
    .map((step) => `${step.owner}/${step.stage}`);

  assert.deepEqual(approvalStages, [
    "PD Agent/ScenarioRehearsal",
    "ARCH Agent/CodeReview",
  ]);
});

test("approval commands continue from the paused next step", () => {
  const gate = approvedGate("ScenarioRehearsal");
  const next = nextRuntimeAfterApproval(gate);

  assert.equal(isApproveCommand("同意"), true);
  assert.equal(isApproveCommand("批准"), true);
  assert.equal(isApproveCommand("continue"), true);
  assert.equal(isRejectCommand("继续"), false);
  assert.equal(next.nextIndex, gate.runtime.nextIndex);
  assert.equal(next.upstream, gate.runtime.upstream);
});

test("PD rejection rolls back to PD document step without carrying rejected output", () => {
  const gate = approvedGate("ScenarioRehearsal");
  const next = nextRuntimeAfterRejection(gate, "需求不够明确");

  assert.equal(isRejectCommand("否决"), true);
  assert.equal(isRejectCommand("打回"), true);
  assert.equal(isApproveCommand("否决"), false);
  assert.equal(next.nextIndex, gate.stepIndex);
  assert.match(next.upstream, /需求不够明确/);
  assert.match(next.upstream, /回滚目标：PD Agent \/ ScenarioRehearsal/);
  assert.doesNotMatch(next.upstream, /accepted output from ScenarioRehearsal/);
});

test("ARCH rejection rolls back to DEV implementation step", () => {
  const gate = approvedGate("CodeReview");
  const next = nextRuntimeAfterRejection(gate, "实现和需求不一致");

  assert.equal(getRollbackTarget(gate).stage, "TaskSplit");
  assert.equal(getRollbackTarget(gate).owner, "DEV Agent");
  assert.equal(next.nextIndex, defaultSteps.findIndex((step) => step.stage === "TaskSplit"));
  assert.match(next.upstream, /回滚目标：DEV Agent \/ TaskSplit/);
});

test("unknown approval input asks user to make an explicit approval decision", () => {
  assert.equal(isApproveCommand("看起来还行"), false);
  assert.equal(isRejectCommand("看起来还行"), false);
  assert.match(getApprovalPrompt(approvedGate("CodeReview")), /回复“同意\/批准\/通过”继续/);
  assert.match(getApprovalPrompt(approvedGate("CodeReview")), /回复“否决\/打回\/不通过”回滚到 TaskSplit/);
});

test("approval input can carry optional review notes", () => {
  assert.deepEqual(parseApprovalInput("同意 字段命名按 client.ts 对齐"), {
    action: "approved",
    note: "字段命名按 client.ts 对齐",
  });
  assert.deepEqual(parseApprovalInput("否决：脱离主线，重新按 form.html 交付"), {
    action: "rejected",
    note: "脱离主线，重新按 form.html 交付",
  });
  assert.deepEqual(parseApprovalInput("先别动"), {
    action: "unknown",
    note: "先别动",
  });
});

test("code tasks require DEV file artifacts before QA can be meaningful", () => {
  const devStep = defaultSteps.find((step) => step.stage === "TaskSplit");
  assert.ok(devStep);
  assert.equal(taskLikelyNeedsFileArtifact("做一个表单的 html 文件"), true);
  assert.equal(stepShouldProduceFileArtifact(devStep), true);
  assert.equal(outputHasFileArtifact("这里只是方案，没有实际文件"), false);
  assert.equal(outputHasFileArtifact("```html\n<!-- FILE: index.html -->\n<form></form>\n```"), true);
});

test("attachment-derived code requirements trigger DEV file artifact gate", () => {
  const devStep = defaultSteps.find((step) => step.stage === "TaskSplit");
  assert.ok(devStep);
  const userTask = "请读取并处理我发送的附件。";
  const upstream = "附件 OCR：做一个 form 表单的 HTML 文件，保存为 form.html。";

  assert.equal(taskLikelyNeedsFileArtifact(`${userTask}\n${upstream}`), true);
  assert.equal(stepShouldProduceFileArtifact(devStep), true);
  assert.equal(outputHasFileArtifact("这里只拆解任务，没有代码块"), false);
});

test("workflow runtime state accumulates elapsed time and tokens", () => {
  const state: WorkflowRuntimeState = {
    nextIndex: 1,
    upstream: "seed",
    runTotals: { elapsed_ms: 100, input_tokens: 10, output_tokens: 20, total_tokens: 30 },
  };

  assert.deepEqual(state.runTotals, { elapsed_ms: 100, input_tokens: 10, output_tokens: 20, total_tokens: 30 });
});

test("headless full workflow supports approve and reject branches before QA completion", () => {
  let runtime: WorkflowRuntimeState = { nextIndex: 0, upstream: "用户任务：生成 HTML" };
  const visited: string[] = [];

  let checkpoint = runUntilApproval(runtime);
  assert.equal(checkpoint.gate?.step.stage, "ScenarioRehearsal");
  visited.push(checkpoint.gate.step.stage);

  runtime = nextRuntimeAfterRejection(checkpoint.gate, "PRD 缺少验收标准");
  assert.equal(runtime.nextIndex, defaultSteps.findIndex((step) => step.stage === "ScenarioRehearsal"));
  checkpoint = runUntilApproval(runtime);
  assert.equal(checkpoint.gate?.step.stage, "ScenarioRehearsal");
  visited.push(`${checkpoint.gate.step.stage}:rerun`);

  runtime = nextRuntimeAfterApproval(checkpoint.gate);
  checkpoint = runUntilApproval(runtime);
  assert.equal(checkpoint.gate?.step.stage, "CodeReview");
  visited.push(checkpoint.gate.step.stage);

  runtime = nextRuntimeAfterRejection(checkpoint.gate, "实现没有输出 HTML 文件");
  assert.equal(runtime.nextIndex, defaultSteps.findIndex((step) => step.stage === "TaskSplit"));
  checkpoint = runUntilApproval(runtime);
  assert.equal(checkpoint.gate?.step.stage, "CodeReview");
  visited.push(`${checkpoint.gate.step.stage}:rerun`);

  runtime = nextRuntimeAfterApproval(checkpoint.gate);
  checkpoint = runUntilApproval(runtime);

  assert.equal(checkpoint.completed, true);
  assert.equal(checkpoint.runtime.nextIndex, defaultSteps.length);
  assert.match(checkpoint.runtime.upstream, /QA Agent\/TestPlan/);
  assert.match(checkpoint.runtime.upstream, /PM Agent\/Retrospective/);
  assert.deepEqual(visited, ["ScenarioRehearsal", "ScenarioRehearsal:rerun", "CodeReview", "CodeReview:rerun"]);
});
