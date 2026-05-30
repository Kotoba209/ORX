export type ComposerSendStateInput = {
  workflowRunning: boolean;
  assistantRunning: boolean;
  chatRunning?: boolean;
  approvalGate: boolean;
  clarificationGate: boolean;
};

export type ComposerSendState = {
  disabled: boolean;
  className: string;
  ariaLabel: string;
  title: string;
  content: string;
};

export function composerSendState(input: ComposerSendStateInput): ComposerSendState {
  if (input.workflowRunning) {
    return {
      disabled: false,
      className: "stop-workflow-button",
      ariaLabel: "终止当前流程",
      title: "终止当前流程",
      content: "",
    };
  }
  if (input.assistantRunning) {
    return {
      disabled: true,
      className: "assistant-loading-button",
      ariaLabel: "ORION 正在执行本机助手动作",
      title: "ORION 正在执行",
      content: "",
    };
  }
  if (input.chatRunning) {
    return {
      disabled: true,
      className: "assistant-loading-button chat-loading-button",
      ariaLabel: "ORION 正在等待模型回复",
      title: "ORION 正在回复",
      content: "",
    };
  }
  return {
    disabled: false,
    className: "",
    ariaLabel: input.approvalGate ? "提交审批意见" : input.clarificationGate ? "提交澄清回答" : "启动工作流",
    title: "启动工作流",
    content: "↑",
  };
}

export function assistantActivityLine(actionCount: number) {
  return `ORION 正在执行 ${actionCount} 个本机助手动作`;
}
