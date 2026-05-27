import { trimWorkflowContext, type WorkflowRuntimeState, type WorkflowStep } from "./workflowState.ts";

export type ClarificationDecision =
  | { status: "needs_user_input"; prompt: string }
  | { status: "requirements_ready"; prompt: string };

export function stepUsesInteractiveClarification(step: WorkflowStep) {
  return step.interaction === "multi-turn" && step.skill_ids?.includes("trellis") === true && step.exit_condition === "requirements_ready";
}

export function parseClarificationOutput(output: string): ClarificationDecision {
  const trimmed = output.trim();
  if (/需求已明确|requirements\s+ready|ready\s+for\s+prd|用户已明确确认|需求基线|节点完成|已收敛|已完成|下发至(方案设计|PRD|下一?节点)/i.test(trimmed)) {
    return { status: "requirements_ready", prompt: trimmed };
  }
  return { status: "needs_user_input", prompt: trimmed || "请补充需求细节。" };
}

export function isClarificationContinueCommand(answer: string) {
  return /^(需求|方案|内容|信息|问题)?\s*(已)?\s*(确认|确定|可以|没问题|通过|完成|明确|继续|下一步|下一个流程|继续下一步|继续下一个流程|继续执行|执行下一步|执行下一个流程|进入下一步|进入下一个流程)\s*(了|吧|。|！|!|，|,)?$/i.test(answer.trim());
}

export function nextRuntimeAfterClarificationAnswer<T extends WorkflowRuntimeState>(runtime: T, step: WorkflowStep, answer: string, stepIndex: number): T {
  const note = answer.trim() || "用户未补充更多信息。";
  return {
    ...runtime,
    nextIndex: stepIndex,
    upstream: trimWorkflowContext(`${runtime.upstream}\n\n[ORCH / Trellis clarification answer]\n${step.owner} / ${step.stage} 用户补充：${note}`),
  };
}

export function nextRuntimeAfterClarificationConfirmation<T extends WorkflowRuntimeState>(runtime: T, step: WorkflowStep, answer: string, stepIndex: number): T {
  const note = answer.trim() || "用户确认继续。";
  return {
    ...runtime,
    nextIndex: stepIndex + 1,
    upstream: trimWorkflowContext(`${runtime.upstream}\n\n[ORCH / Trellis clarification confirmed]\n${step.owner} / ${step.stage} 用户确认：${note}\nORCH 已将 Trellis 澄清视为完成，继续下一个流程节点。`),
  };
}
