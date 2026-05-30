export type OrionRuntimeStatus =
  | "idle"
  | "thinking"
  | "waiting_user"
  | "running_tool"
  | "running_workflow"
  | "paused"
  | "failed"
  | "completed";

export type OrionRuntimeStateInput = {
  workflowRunning?: boolean;
  assistantRunning?: boolean;
  activityRunning?: boolean;
  waitingForUser?: boolean;
  failed?: boolean;
  completed?: boolean;
};

export function deriveOrionRuntimeStatus(input: OrionRuntimeStateInput): OrionRuntimeStatus {
  if (input.failed) return "failed";
  if (input.waitingForUser) return "waiting_user";
  if (input.workflowRunning) return "running_workflow";
  if (input.activityRunning) return "running_tool";
  if (input.assistantRunning) return "thinking";
  if (input.completed) return "completed";
  return "idle";
}

export function runtimeStatusNeedsVisibleProgress(status: OrionRuntimeStatus) {
  return status === "running_workflow"
    || status === "running_tool"
    || status === "waiting_user"
    || status === "failed";
}
