import type { OrionAction } from "./orionActions.ts";
import { orionRiskLabel } from "./orionPermission.ts";

export type OrionActivityStepStatus = "pending" | "running" | "done" | "failed";

export type OrionActivityStep = {
  id: string;
  title: string;
  detail: string;
  status: OrionActivityStepStatus;
  actionId?: string;
};

export type OrionActivityRun = {
  id: string;
  task: string;
  status: OrionActivityStepStatus;
  steps: OrionActivityStep[];
};

export type OrionActivityFloatVisibilityInput = {
  run: OrionActivityRun | null;
  inspectorCollapsed: boolean;
  workflowMetricCount: number;
  hasApprovalGate: boolean;
  hasConfigPanel: boolean;
  hasPendingPlan: boolean;
  hasPendingAssistant: boolean;
  hasPendingMemoryCandidate: boolean;
};

export function createOrionActivityRun(task: string, actions: OrionAction[]): OrionActivityRun {
  const riskSummary = actions.length > 0
    ? actions.map((action) => `${action.kind}[${orionRiskLabel(action.risk)}]`).join(" -> ")
    : "没有生成本机动作";
  return {
    id: `orion-activity-${Date.now()}`,
    task,
    status: "pending",
    steps: [
      { id: "understand", title: "识别任务", detail: task, status: "done" },
      { id: "draft-actions", title: "生成动作", detail: actions.length > 0 ? `${actions.length} 个本机助手动作` : "按普通对话处理", status: "done" },
      { id: "permission", title: "权限判断", detail: riskSummary, status: "done" },
      ...actions.map((action): OrionActivityStep => ({
        id: `action-${action.id}`,
        title: action.title,
        detail: action.summary,
        status: "pending",
        actionId: action.id,
      })),
      { id: "summarize", title: "整理结果", detail: "等待动作结果", status: "pending" },
      { id: "complete", title: "完成", detail: "等待返回对话", status: "pending" },
    ],
  };
}

export function markOrionActivityActionRunning(run: OrionActivityRun, actionId: string): OrionActivityRun {
  return {
    ...run,
    status: "running",
    steps: run.steps.map((step) => step.actionId === actionId ? { ...step, status: "running" } : step),
  };
}

export function markOrionActivityActionDone(run: OrionActivityRun, actionId: string, detail: string): OrionActivityRun {
  return finishAction(run, actionId, "done", detail, "done");
}

export function markOrionActivityActionFailed(run: OrionActivityRun, actionId: string, detail: string): OrionActivityRun {
  return finishAction(run, actionId, "failed", detail, "failed");
}

export function completeOrionActivityWithoutActions(run: OrionActivityRun, detail: string): OrionActivityRun {
  return {
    ...run,
    status: "done",
    steps: run.steps.map((step) => {
      if (step.id === "summarize") return { ...step, status: "done", detail };
      if (step.id === "complete") return { ...step, status: "done", detail: "已返回普通对话" };
      return step;
    }),
  };
}

export function shouldShowOrionActivityFloat(input: OrionActivityFloatVisibilityInput) {
  return Boolean(input.run)
    && input.inspectorCollapsed
    && input.workflowMetricCount === 0
    && !input.hasApprovalGate
    && !input.hasConfigPanel
    && !input.hasPendingPlan
    && !input.hasPendingAssistant
    && !input.hasPendingMemoryCandidate;
}

export function orionActivityStepStatusLabel(status: OrionActivityStepStatus) {
  if (status === "running") return "正在运行";
  if (status === "done") return "已完成";
  if (status === "failed") return "已停止";
  return "等待中";
}

function finishAction(run: OrionActivityRun, actionId: string, actionStatus: OrionActivityStepStatus, detail: string, runStatus: OrionActivityStepStatus): OrionActivityRun {
  return {
    ...run,
    status: runStatus,
    steps: run.steps.map((step) => {
      if (step.actionId === actionId) return { ...step, status: actionStatus, detail };
      if (step.id === "summarize") return { ...step, status: actionStatus, detail: actionStatus === "done" ? "已整理动作结果" : "动作失败，等待用户调整" };
      if (step.id === "complete") return { ...step, status: actionStatus, detail: actionStatus === "done" ? "已返回对话" : "已停止后续动作" };
      return step;
    }),
  };
}
