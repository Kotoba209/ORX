import type { ProviderConfig } from "./orionChat.ts";
import { parseOrionWorkflowDraft } from "./orionWorkflowDraft.ts";
import { createOrionActionPlan } from "./orionPlanner.ts";
import type { OrionAction } from "./orionActions.ts";
import type { WorkflowDefinition } from "./workflowConfig.ts";

export type OrionWorkflowRevisionRunInput = {
  provider: ProviderConfig;
  owner: string;
  stage: string;
  task: string;
  upstream: string;
};

export function createOrionWorkflowRevisionRunInput(input: {
  provider: ProviderConfig;
  task: string;
  revision: string;
  workflow: WorkflowDefinition;
  processContext?: string;
  projectContext?: string;
}): OrionWorkflowRevisionRunInput {
  return {
    provider: input.provider,
    owner: "ORION",
    stage: "自定义工作流修订",
    task: [
      "AI 是工作流设计驾驶员，ORX 是驾驶舱。用户正在审阅一份尚未执行的工作流草案。",
      `原始任务：${input.task}`,
      `用户修订要求：${input.revision}`,
      "",
      "请根据用户要求重写完整工作流草案。保留仍然适用的节点，只调整必要部分。",
      "只输出 JSON，不要输出 Markdown 或解释文字。",
      "JSON 字段：name, description, steps。",
      "steps 是数组，每个节点字段：stage, owner, instruction, approval, rollback_target, skill_ids, interaction, exit_condition。",
      "approval 只能是 none、user、auto；interaction 只能是 single-turn、multi-turn；exit_condition 只能是 node_complete、requirements_ready。",
      "不要直接执行任务，只生成修订后的完整流程草案。",
      "",
      `当前草案：${JSON.stringify(input.workflow)}`,
    ].join("\n"),
    upstream: [
      input.projectContext ? `项目上下文：${input.projectContext}` : "",
      input.processContext ? `当前 ORION 过程记忆：\n${input.processContext}` : "",
    ].filter(Boolean).join("\n\n"),
  };
}

export function parseOrionWorkflowRevision(output: string, currentWorkflow: WorkflowDefinition): WorkflowDefinition | null {
  const workflow = parseOrionWorkflowDraft(output, { task: currentWorkflow.description });
  return workflow ? { ...workflow, id: currentWorkflow.id } : null;
}

export function applyOrionWorkflowRevision<T extends { task: string; workflow: WorkflowDefinition; actions: OrionAction[] }>(
  plan: T,
  workflow: WorkflowDefinition,
): T {
  const shouldRun = plan.actions.some((action) => action.kind === "workflow.run");
  const actions = createOrionActionPlan(workflow).filter((action) => shouldRun || action.kind !== "workflow.run");
  return { ...plan, workflow, actions };
}
