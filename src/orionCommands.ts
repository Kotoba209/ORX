import { createOrionAction, type OrionAction } from "./orionActions.ts";
import type { WorkflowDefinition } from "./workflowConfig.ts";
import type { WorkflowStep } from "./workflowState.ts";

export type OrionPlanModification = "save_only" | "add_arch_review" | "add_clarification";

export type OrionConversationCommand =
  | { type: "create_plan"; task: string }
  | { type: "approve_once" }
  | { type: "approve_session" }
  | { type: "reject" }
  | { type: "explain_plan" }
  | { type: "list_actions" }
  | { type: "explain_permission" }
  | { type: "modify_plan"; modification: OrionPlanModification; note: string }
  | { type: "unknown"; text: string };

export type OrionCommandPlan = {
  task: string;
  workflow: WorkflowDefinition;
  actions: OrionAction[];
};

export function parseOrionCommand(text: string, hasPendingPlan: boolean): OrionConversationCommand {
  const normalized = text.trim();
  if (/^@orion\b/i.test(normalized)) {
    return { type: "create_plan", task: normalized.replace(/^@orion\b/i, "").trim() || "请 ORION 规划一个工作流。" };
  }
  if (!hasPendingPlan) return { type: "unknown", text: normalized };

  if (/^(同意|执行|确认|保存并运行|允许|approve|yes|y)$/i.test(normalized)) return { type: "approve_once" };
  if (/(本会话|始终|一直).*(允许|同意|确认)|always/i.test(normalized)) return { type: "approve_session" };
  if (/^(驳回|拒绝|取消|不要|reject|no|n)$/i.test(normalized)) return { type: "reject" };

  if (/(你准备做什么|准备做什么|解释计划|说明计划)/.test(normalized)) return { type: "explain_plan" };
  if (/(列出动作|动作列表|action plan|actions)/i.test(normalized)) return { type: "list_actions" };
  if (/(为什么.*权限|权限.*为什么|需要权限)/.test(normalized)) return { type: "explain_permission" };

  if (/(只保存|不要运行|不运行|别运行|仅保存)/.test(normalized)) {
    return { type: "modify_plan", modification: "save_only", note: normalized };
  }
  if (/(架构师|ARCH|code review|codereview|代码审查|代码审核|CR)/i.test(normalized)) {
    return { type: "modify_plan", modification: "add_arch_review", note: normalized };
  }
  if (/(先问|先澄清|需求澄清|问我需求|trellis)/i.test(normalized)) {
    return { type: "modify_plan", modification: "add_clarification", note: normalized };
  }

  return { type: "unknown", text: normalized };
}

export function applyOrionPlanModification(plan: OrionCommandPlan, modification: OrionPlanModification): OrionCommandPlan {
  if (modification === "save_only") {
    return {
      ...plan,
      actions: plan.actions.filter((action) => action.kind !== "workflow.run"),
    };
  }

  if (modification === "add_arch_review") {
    const hasReview = plan.workflow.steps.some((step) => step.owner === "ARCH Agent" || step.stage === "CodeReview");
    const workflow = hasReview ? cloneWorkflow(plan.workflow) : {
      ...plan.workflow,
      steps: [
        ...plan.workflow.steps.map((step) => ({ ...step })),
        step("CodeReview", "ARCH Agent", "审查实现方案、风险和关键代码修改，输出是否需要返工。"),
      ],
    };
    return {
      ...plan,
      workflow,
      actions: prependUpdateAction(plan.actions, workflow, "加入架构师 CodeReview 节点"),
    };
  }

  const hasClarification = plan.workflow.steps.some((step) => step.stage === "Clarification" || step.stage === "BugClarification");
  const workflow = hasClarification ? cloneWorkflow(plan.workflow) : {
    ...plan.workflow,
    steps: [
      step("Clarification", "PD Agent", "使用 Trellis 先澄清目标、边界、验收标准和用户约束。", ["trellis"]),
      ...plan.workflow.steps.map((item) => ({ ...item })),
    ],
  };
  return {
    ...plan,
    workflow,
    actions: prependUpdateAction(plan.actions, workflow, "加入 Trellis 需求澄清节点"),
  };
}

function prependUpdateAction(actions: OrionAction[], workflow: WorkflowDefinition, summary: string) {
  return [
    createOrionAction("workflow.update", "修改工作流", summary, { workflow }),
    ...syncWorkflowPayloads(actions, workflow),
  ];
}

function syncWorkflowPayloads(actions: OrionAction[], workflow: WorkflowDefinition) {
  return actions.map((action) => {
    if (action.kind !== "workflow.create" && action.kind !== "workflow.update") return action;
    return { ...action, payload: { ...action.payload, workflow } };
  });
}

function cloneWorkflow(workflow: WorkflowDefinition): WorkflowDefinition {
  return { ...workflow, steps: workflow.steps.map((item) => ({ ...item })) };
}

function step(stage: string, owner: string, instruction: string, skillIds?: string[]): WorkflowStep {
  return {
    stage,
    owner,
    instruction,
    enabled: true,
    approval: "none",
    interaction: skillIds?.includes("trellis") ? "multi-turn" : "single-turn",
    exit_condition: skillIds?.includes("trellis") ? "requirements_ready" : "node_complete",
    skill_ids: skillIds,
  };
}
