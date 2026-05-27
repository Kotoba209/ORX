export type WorkflowStep = {
  stage: string;
  owner: string;
  instruction: string;
  enabled?: boolean;
  approval?: "none" | "user" | "auto";
  rollback_target?: string;
  skill_ids?: string[];
  interaction?: "single-turn" | "multi-turn";
  exit_condition?: "node_complete" | "requirements_ready";
  orion_notes?: string[];
};

export type WorkflowTotals = {
  elapsed_ms: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
};

export type WorkflowRuntimeState = {
  nextIndex: number;
  upstream: string;
  runTotals?: WorkflowTotals;
};

export type ApprovalGateState = {
  step: WorkflowStep;
  stepIndex: number;
  runtime: WorkflowRuntimeState;
  upstreamBefore: string;
};

export type ApprovalDecision = {
  action: "approved" | "rejected" | "unknown";
  note: string;
};

export const defaultSteps: WorkflowStep[] = [
  { stage: "Intake", owner: "PM Agent", instruction: "收集需求、项目上下文和用户约束。", enabled: true, approval: "none" },
  {
    stage: "Clarification",
    owner: "PD Agent",
    instruction: "使用 Trellis 需求澄清法连续追问用户，直到目标用户、核心场景、边界条件、验收标准和不做范围足够明确。一次只问 1-3 个关键问题；需求足够明确时必须明确写出“需求已明确”。",
    enabled: true,
    approval: "none",
    skill_ids: ["trellis"],
    interaction: "multi-turn",
    exit_condition: "requirements_ready",
  },
  { stage: "ScenarioRehearsal", owner: "PD Agent", instruction: "输出可预览的需求产品文档，包含场景预演、主路径、异常路径和验收标准。", enabled: true, approval: "user", rollback_target: "ScenarioRehearsal" },
  { stage: "BoundaryProbe", owner: "PD Agent", instruction: "做边界探测，识别环境依赖、输入输出、失败条件和打回条件。", enabled: true, approval: "none" },
  { stage: "TaskSplit", owner: "DEV Agent", instruction: "拆分接口、数据流、实现任务和测试任务。", enabled: true, approval: "auto", rollback_target: "TaskSplit" },
  { stage: "CodeReview", owner: "ARCH Agent", instruction: "对 DEV 产物做代码审查、红蓝质询、架构风险和非功能边界评估，输出可预览 CR 报告。", enabled: true, approval: "user", rollback_target: "TaskSplit" },
  { stage: "TestPlan", owner: "QA Agent", instruction: "优先设计集成测试和端到端测试，记录执行证据。", enabled: true, approval: "none", rollback_target: "TaskSplit" },
  { stage: "Retrospective", owner: "PM Agent", instruction: "输出交付总结，优先汇总 DEV 做了什么改动、生成了哪些新产物、修改了哪些原有文件；同时输出 QA 做了哪些测试、覆盖了哪些场景、是否全量覆盖、未覆盖项和残留风险；最后给出是否可交付、阻塞项和下一步。流程治理问题只作为补充。", enabled: true, approval: "none" },
];

export function trimWorkflowContext(context: string) {
  const maxChars = 12_000;
  if (context.length <= maxChars) return context;
  return `${context.slice(0, 4_000)}\n\n[中间上下文已压缩，保留最近节点产物]\n\n${context.slice(-7_600)}`;
}

export function shouldStopWorkflow(stopRef: { current: boolean }) {
  return stopRef.current;
}

export function isApproveCommand(value: string) {
  return /^(同意|批准|通过|继续|approve|approved|continue|yes|y)$/i.test(value.trim());
}

export function isRejectCommand(value: string) {
  return /^(否决|打回|不通过|拒绝|reject|rejected|no|n)$/i.test(value.trim());
}

export function parseApprovalInput(value: string): ApprovalDecision {
  const trimmed = value.trim();
  const match = trimmed.match(/^(同意|批准|通过|继续|approve|approved|continue|yes|y|否决|打回|不通过|拒绝|reject|rejected|no|n)(?:[：:\s，,。-]+([\s\S]*))?$/i);
  if (!match) return { action: "unknown", note: trimmed };
  const command = match[1];
  const note = (match[2] ?? "").trim();
  if (isApproveCommand(command)) return { action: "approved", note };
  if (isRejectCommand(command)) return { action: "rejected", note };
  return { action: "unknown", note: trimmed };
}

export function getRollbackTarget(gate: ApprovalGateState, steps = defaultSteps) {
  const target = gate.step.rollback_target || gate.step.stage;
  const index = steps.findIndex((step) => step.stage === target);
  return steps[index >= 0 ? index : gate.stepIndex];
}

export function getRollbackIndex(gate: ApprovalGateState, steps = defaultSteps) {
  const target = gate.step.rollback_target || gate.step.stage;
  const index = steps.findIndex((step) => step.stage === target);
  return index >= 0 ? index : gate.stepIndex;
}

export function nextRuntimeAfterApproval<T extends WorkflowRuntimeState>(gate: ApprovalGateState & { runtime: T }) {
  return gate.runtime;
}

export function nextRuntimeAfterRejection<T extends WorkflowRuntimeState>(gate: ApprovalGateState & { runtime: T }, note: string, steps = defaultSteps): T {
  const rollbackIndex = getRollbackIndex(gate, steps);
  const rollbackStep = steps[rollbackIndex] ?? gate.step;
  const rejectionNote = note || "用户否决，要求重做。";
  return {
    ...gate.runtime,
    nextIndex: rollbackIndex,
    upstream: trimWorkflowContext(`${gate.upstreamBefore}\n\n[ORCH / rejection]\n用户否决 ${gate.step.owner} / ${gate.step.stage} 产物。\n回滚目标：${rollbackStep.owner} / ${rollbackStep.stage}\n否决意见：${rejectionNote}`),
  };
}

export function getApprovalPrompt(gate: ApprovalGateState) {
  return `ORCH：${gate.step.owner} / ${gate.step.stage} 需要你预览确认。可填写审批意见，回复“同意/批准/通过”继续，回复“否决/打回/不通过”回滚到 ${gate.step.rollback_target || gate.step.stage}。`;
}

export function taskLikelyNeedsFileArtifact(task: string) {
  return /(html|页面|表单|文件|代码|脚本|css|js|javascript|typescript|组件|实现|开发|修改|生成|创建|index\.html|\.html|\.ts|\.tsx|\.js|\.css)/i.test(task);
}

export function stepShouldProduceFileArtifact(step: WorkflowStep) {
  return step.owner.includes("DEV") && !/(TaskSplit|Plan|Design|Analysis|Probe|Clarification)/i.test(step.stage);
}

export function outputHasFileArtifact(output: string) {
  if (/```[\s\S]*?(FILE:|<!doctype html|<html[\s>]|function\s|const\s|let\s|class\s|export\s|import\s)/i.test(output)) {
    return true;
  }
  return /<!--\s*FILE:\s*[^>]+-->|\/\/\s*FILE:\s*\S+|#\s*FILE:\s*\S+/i.test(output);
}
