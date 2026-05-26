const stoppedTaskBlockWindowMs = 60_000;

export function normalizeWorkflowTaskText(task: string) {
  return task.trim().replace(/\s+/g, " ");
}

export function taskExplicitlyRequestsRerun(task: string) {
  return /(重新运行|重新执行|再次运行|再次执行|重跑|rerun|run again)/i.test(task);
}

export function shouldBlockRecentlyStoppedTask(input: {
  task: string;
  lastStoppedTask: string;
  lastStoppedAt: number;
  now: number;
}) {
  if (!input.lastStoppedTask || input.lastStoppedAt <= 0) return false;
  if (taskExplicitlyRequestsRerun(input.task)) return false;
  if (input.now - input.lastStoppedAt > stoppedTaskBlockWindowMs) return false;
  return normalizeWorkflowTaskText(input.task) === normalizeWorkflowTaskText(input.lastStoppedTask);
}
