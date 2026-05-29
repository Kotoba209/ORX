import type { WorkflowDefinition } from "./workflowConfig.ts";
import { classifyOrionIntent } from "./orionPlanner.ts";
import { recommendWorkflowForTask } from "./workflowRouter.ts";

export type OrionConversationRouteContext = {
  workflows: WorkflowDefinition[];
  activeWorkflowId?: string;
  projectFiles?: string[];
};

export type OrionConversationRoute =
  | { kind: "assistant"; reason: string }
  | { kind: "custom-workflow-draft"; reason: string; requiresDraftReview: true }
  | { kind: "existing-workflow"; reason: string; workflow: WorkflowDefinition; requiresDraftReview: false };

export function resolveOrionConversationRoute(task: string, context: OrionConversationRouteContext): OrionConversationRoute {
  const normalizedTask = task.trim();
  if (taskRequestsCustomWorkflow(normalizedTask)) {
    return {
      kind: "custom-workflow-draft",
      reason: "explicit_custom_workflow_request",
      requiresDraftReview: true,
    };
  }

  const intent = classifyOrionIntent(normalizedTask, { projectFiles: context.projectFiles ?? [] });
  if (intent.mode === "assistant") {
    return {
      kind: "assistant",
      reason: intent.reason,
    };
  }

  const routeDecision = recommendWorkflowForTask(normalizedTask, context.workflows, context.activeWorkflowId);
  return {
    kind: "existing-workflow",
    reason: routeDecision.reason,
    workflow: routeDecision.workflow,
    requiresDraftReview: false,
  };
}

function taskRequestsCustomWorkflow(task: string) {
  const workflowObject = /(工作流|流程|workflow|agent|节点|分配|编排|调度)/i;
  const customizationIntent = /(自定义|定制|设计|配置|规划|安排)/i;
  return workflowObject.test(task) && customizationIntent.test(task);
}
