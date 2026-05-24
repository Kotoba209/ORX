import { defaultSteps, type WorkflowStep } from "./workflowState.ts";

export type WorkflowStageOption = {
  stage: string;
  owner: string;
  label: string;
};

export function createWorkflowStageOptions(extraSteps: WorkflowStep[] = []): WorkflowStageOption[] {
  const options = new Map<string, WorkflowStageOption>();
  for (const step of [...defaultSteps, ...extraSteps]) {
    const key = `${step.owner}/${step.stage}`;
    if (!options.has(key)) {
      options.set(key, {
        stage: step.stage,
        owner: step.owner,
        label: `${step.stage}（${step.owner}）`,
      });
    }
  }
  return Array.from(options.values());
}
