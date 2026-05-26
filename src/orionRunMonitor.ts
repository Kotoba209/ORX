import { outputHasFileArtifact, taskLikelyNeedsFileArtifact, stepShouldProduceFileArtifact, type WorkflowStep } from "./workflowState.ts";

export type OrionSuggestedActionKind =
  | "continue"
  | "ask_user"
  | "add_node_instruction"
  | "insert_arch_review"
  | "rerun_node"
  | "stop";

export type OrionSuggestedAction = {
  id: string;
  kind: OrionSuggestedActionKind;
  title: string;
  summary: string;
  targetOwner?: string;
  targetStage?: string;
  reason: string;
};

export type OrionNodeMonitorInput = {
  task: string;
  step: WorkflowStep;
  output: string;
};

export function monitorOrionNodeResult(input: OrionNodeMonitorInput): OrionSuggestedAction[] {
  const suggestions: OrionSuggestedAction[] = [];
  const text = `${input.task}\n${input.output}`;

  if (taskLikelyNeedsFileArtifact(text) && stepShouldProduceFileArtifact(input.step) && !outputHasFileArtifact(input.output)) {
    suggestions.push(suggestion("rerun_node", "建议重跑当前节点", `${input.step.owner} 没有输出可落盘文件产物。`, input.step, "代码类任务缺少 FILE 标记或代码块。"));
  }

  if (/(数据库|迁移|schema|权限|鉴权|并发|性能|安全|架构|兼容|回滚|breaking)/i.test(input.output) && !input.step.owner.includes("ARCH")) {
    suggestions.push(suggestion("insert_arch_review", "建议加入架构审查", "当前产物出现架构或高风险关键词，建议让 ARCH Agent 审查。", input.step, "检测到迁移、权限、兼容、回滚或安全等风险。"));
  }

  if (/(需求不明确|不明确|缺少.*验收|缺少.*范围|无法确认|需要用户|需要进一步澄清)/.test(input.output)) {
    suggestions.push(suggestion("ask_user", "建议追问用户", "当前节点认为需求或验收信息不足，建议暂停并向用户追问。", input.step, "节点输出包含需求不明确或需要澄清。"));
  }

  if (/(阻塞|无法继续|测试失败|回归失败|严重|失败)/.test(input.output) && input.step.owner.includes("QA")) {
    suggestions.push(suggestion("stop", "建议停止流程", "QA 输出显示阻塞或失败，建议停止后续推进并处理问题。", input.step, "QA 节点报告失败或阻塞。"));
  }

  if (suggestions.length === 0) {
    suggestions.push(suggestion("continue", "建议继续", "未发现需要主动干预的风险信号。", input.step, "节点输出满足继续推进的默认条件。"));
  }

  return suggestions;
}

function suggestion(kind: OrionSuggestedActionKind, title: string, summary: string, step: WorkflowStep, reason: string): OrionSuggestedAction {
  return {
    id: `${kind}-${step.owner}-${step.stage}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    kind,
    title,
    summary,
    targetOwner: step.owner,
    targetStage: step.stage,
    reason,
  };
}
