export type ActivityFloatSummaryInput = {
  title: string;
  subtitle: string;
  done: number;
  total: number;
  active: boolean;
};

export function shouldCollapseActivityFloat(input: {
  activityActive: boolean;
  lastChangedAt: number;
  now: number;
  delayMs: number;
}) {
  if (input.activityActive) return false;
  return input.now - input.lastChangedAt >= input.delayMs;
}

export function activityFloatSummary(input: ActivityFloatSummaryInput) {
  return {
    title: input.title,
    subtitle: input.subtitle,
    progress: `${input.done}/${input.total}`,
    status: input.active ? "运行中" : "已收纳",
  };
}

export function activityFloatShouldAutoExpand(input: {
  previousSignature: string;
  nextSignature: string;
  hasTaskActivity: boolean;
}) {
  if (!input.hasTaskActivity) return false;
  if (!input.nextSignature) return false;
  return input.previousSignature !== input.nextSignature;
}
