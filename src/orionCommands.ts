import { createOrionAction, type OrionAction } from "./orionActions.ts";
import type { WorkflowDefinition } from "./workflowConfig.ts";
import type { WorkflowStep } from "./workflowState.ts";

export type OrionPlanModification = "save_only" | "add_arch_review" | "add_clarification" | "add_qa" | "remove_qa";

export type OrionConversationCommand =
  | { type: "create_plan"; task: string }
  | { type: "approve_once" }
  | { type: "approve_session" }
  | { type: "reject" }
  | { type: "explain_plan" }
  | { type: "list_actions" }
  | { type: "explain_permission" }
  | { type: "modify_plan"; modification: OrionPlanModification; note: string }
  | { type: "node_instruction"; targetOwner: string; note: string }
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
  const nodeInstructionTarget = parseNodeInstructionTarget(normalized);
  if (nodeInstructionTarget) {
    return { type: "node_instruction", targetOwner: nodeInstructionTarget, note: normalized };
  }
  if (/(架构师|ARCH|code review|codereview|代码审查|代码审核|CR)/i.test(normalized)) {
    return { type: "modify_plan", modification: "add_arch_review", note: normalized };
  }
  if (/(先问|先澄清|需求澄清|问我需求|trellis)/i.test(normalized)) {
    return { type: "modify_plan", modification: "add_clarification", note: normalized };
  }
  if (/(不要|不用|去掉|删除|移除|不需要).*(QA|测试|回归)/i.test(normalized) || /(QA|测试|回归).*(不要|不用|去掉|删除|移除|不需要)/i.test(normalized)) {
    return { type: "modify_plan", modification: "remove_qa", note: normalized };
  }
  if (/(加|加上|加入|增加|需要|必须|保留).*(QA|测试|回归|全量覆盖)/i.test(normalized) || /(QA|测试|回归|全量覆盖).*(加|加上|加入|增加|需要|必须|保留)/i.test(normalized)) {
    return { type: "modify_plan", modification: "add_qa", note: normalized };
  }
  const targetOwner = parseTargetOwner(normalized);
  if (targetOwner) {
    return { type: "node_instruction", targetOwner, note: normalized };
  }

  return { type: "unknown", text: normalized };
}

export function applyOrionNodeInstruction(plan: OrionCommandPlan, targetOwner: string, note: string): OrionCommandPlan {
  const workflow = {
    ...plan.workflow,
    steps: plan.workflow.steps.map((workflowStep) => {
      if (!ownerMatches(workflowStep.owner, targetOwner)) return { ...workflowStep };
      const notes = [...(workflowStep.orion_notes ?? []), note];
      return {
        ...workflowStep,
        instruction: appendInstructionNote(workflowStep.instruction, note),
        orion_notes: notes,
      };
    }),
  };
  return {
    ...plan,
    workflow,
    actions: prependUpdateAction(plan.actions, workflow, `向 ${targetOwner} 转交 ORION 节点指令`),
  };
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

  if (modification === "add_qa") {
    const hasQa = plan.workflow.steps.some((step) => step.owner === "QA Agent" || /Test|QA|回归|测试/i.test(step.stage));
    const workflow = hasQa ? cloneWorkflow(plan.workflow) : {
      ...plan.workflow,
      steps: insertBeforeRetrospective(plan.workflow.steps, step("TestPlan", "QA Agent", "设计并执行测试计划，明确覆盖场景、是否全量覆盖、未覆盖项和残留风险。", ["test-planning"])),
    };
    return {
      ...plan,
      workflow,
      actions: prependUpdateAction(plan.actions, workflow, "加入 QA 测试覆盖节点"),
    };
  }

  if (modification === "remove_qa") {
    const workflow = {
      ...plan.workflow,
      steps: plan.workflow.steps
        .filter((workflowStep) => workflowStep.owner !== "QA Agent" && !/Test|QA|回归|测试/i.test(workflowStep.stage))
        .map((workflowStep) => ({ ...workflowStep })),
    };
    return {
      ...plan,
      workflow,
      actions: prependUpdateAction(plan.actions.filter((action) => action.kind !== "skill.attach" || !String(action.summary).includes("QA Agent")), workflow, "移除 QA 测试节点"),
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

function insertBeforeRetrospective(steps: WorkflowStep[], newStep: WorkflowStep) {
  const cloned = steps.map((workflowStep) => ({ ...workflowStep }));
  const retrospectiveIndex = cloned.findIndex((workflowStep) => workflowStep.stage === "Retrospective");
  if (retrospectiveIndex < 0) return [...cloned, newStep];
  return [...cloned.slice(0, retrospectiveIndex), newStep, ...cloned.slice(retrospectiveIndex)];
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

function parseTargetOwner(text: string) {
  if (/(开发|DEV|developer)/i.test(text)) return "DEV Agent";
  if (/(产品|需求|PD|prd)/i.test(text)) return "PD Agent";
  if (/(测试|QA|回归)/i.test(text)) return "QA Agent";
  if (/(架构|ARCH|code review|codereview|代码审查|代码审核)/i.test(text)) return "ARCH Agent";
  if (/(PM|流程|项目经理)/i.test(text)) return "PM Agent";
  return "";
}

function parseNodeInstructionTarget(text: string) {
  if (!/(让|提醒|告诉|要求|交代|转告)/.test(text)) return "";
  return parseTargetOwner(text);
}

function ownerMatches(owner: string, targetOwner: string) {
  return owner === targetOwner || owner.toLowerCase().includes(targetOwner.split(" ")[0].toLowerCase());
}

function appendInstructionNote(instruction: string, note: string) {
  if (instruction.includes(note)) return instruction;
  return `${instruction}\n\n[ORION 转交给本节点的补充指令]\n- ${note}`;
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
