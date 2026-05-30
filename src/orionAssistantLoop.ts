export const ORION_ASSISTANT_LOOP_MAX_ROUNDS = 2;

export function shouldContinueOrionAssistantLoop(input: {
  round: number;
  resultCount: number;
  stopped: boolean;
  maxRounds?: number;
}) {
  const maxRounds = input.maxRounds ?? ORION_ASSISTANT_LOOP_MAX_ROUNDS;
  return !input.stopped && input.resultCount > 0 && input.round < maxRounds;
}

export function createOrionAssistantContinuationTask(input: {
  originalTask: string;
  resultMessages: string[];
}) {
  return [
    `原始用户目标：${input.originalTask}`,
    "",
    "工具执行结果：",
    input.resultMessages.map((message, index) => `${index + 1}. ${message}`).join("\n"),
    "",
    "请作为 ORION 驾驶员继续判断下一步：",
    "- 如果信息已经足够，请给用户最终答复。",
    "- 如果还需要读取网页、查询资料、运行命令或写入产物，请继续调用工具。",
    "- 如果缺少关键目标或风险需要确认，请追问用户。",
    "- 不要为了重复验证而调用同一个工具；只有确实缺少信息时才继续。",
  ].join("\n");
}
