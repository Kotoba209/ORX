import type { WorkflowStep } from "./workflowState.ts";

export type WorkflowNodeFailureKind =
  | "artifact_missing"
  | "provider_error"
  | "tool_error"
  | "validation_failed"
  | "unknown";

export type WorkflowNodeFailure = {
  id: string;
  kind: WorkflowNodeFailureKind;
  title: string;
  summary: string;
  owner: string;
  stage: string;
  recovery: string;
  detail: string;
  createdAt: number;
};

export function createWorkflowNodeFailure(input: {
  step?: WorkflowStep | null;
  message: string;
  kind?: WorkflowNodeFailureKind;
  now?: number;
}): WorkflowNodeFailure {
  const owner = input.step?.owner ?? "ORCH";
  const stage = input.step?.stage ?? "Unknown";
  const kind = input.kind ?? classifyWorkflowNodeFailure(input.message);
  const title = failureTitle(kind);
  return {
    id: `failure:${owner}:${stage}:${input.now ?? Date.now()}`,
    kind,
    title,
    summary: failureSummary(kind, input.message),
    owner,
    stage,
    recovery: failureRecovery(kind),
    detail: input.message.trim(),
    createdAt: input.now ?? Date.now(),
  };
}

export function classifyWorkflowNodeFailure(message: string): WorkflowNodeFailureKind {
  if (/FILE|文件产物|代码产物|可落盘|artifact|generated/i.test(message)) return "artifact_missing";
  if (/Provider|API Key|endpoint|HTTP|timeout|代理|模型服务|certificate|证书|Connect|request/i.test(message)) return "provider_error";
  if (/tool|工具|command|命令|sandbox|白名单|权限/i.test(message)) return "tool_error";
  if (/验收|校验|validation|criteria|blocked|阻塞/i.test(message)) return "validation_failed";
  return "unknown";
}

export function formatWorkflowNodeFailureForChat(failure: WorkflowNodeFailure) {
  return `ORCH：${failure.owner} / ${failure.stage} 未通过验收：${failure.summary} 已停止推进，建议：${failure.recovery}`;
}

function failureTitle(kind: WorkflowNodeFailureKind) {
  if (kind === "artifact_missing") return "缺少代码产物";
  if (kind === "provider_error") return "模型服务调用失败";
  if (kind === "tool_error") return "工具执行失败";
  if (kind === "validation_failed") return "节点验收未通过";
  return "节点失败";
}

function failureSummary(kind: WorkflowNodeFailureKind, message: string) {
  const compact = message.replace(/\s+/g, " ").trim();
  if (kind === "artifact_missing") return "当前节点没有提交可落盘的真实文件产物。";
  if (kind === "provider_error") return "模型服务、网络、代理或密钥配置返回异常。";
  if (kind === "tool_error") return "工具调用没有按当前权限或执行环境完成。";
  if (kind === "validation_failed") return "节点输出没有满足本节点完成标准。";
  return compact.length > 120 ? `${compact.slice(0, 120)}...` : compact || "未返回明确失败原因。";
}

function failureRecovery(kind: WorkflowNodeFailureKind) {
  if (kind === "artifact_missing") return "回到 DEV Implementation，要求输出带 FILE 标记的非空代码块并写入当前项目路径。";
  if (kind === "provider_error") return "检查模型服务 Provider、Base URL、API Key、代理和协议配置后重试。";
  if (kind === "tool_error") return "查看工具权限等级与参数，必要时切换到沙箱或人工确认后重试。";
  if (kind === "validation_failed") return "把失败原因写入上游上下文，回滚到对应节点重做。";
  return "查看右侧输出详情，决定重试、回滚或调整任务描述。";
}
