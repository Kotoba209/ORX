import { formatOrionMemoryContext, type OrionMemoryEntry } from "./orionMemory.ts";

export function createOrionWorkflowStartUpstream(input: {
  task: string;
  projectContext: string;
  projectPath?: string;
  memoryContext?: string;
  orionMemoryEntries?: OrionMemoryEntry[];
  attachmentContext?: string;
}) {
  const orionMemoryContext = input.orionMemoryEntries?.length
    ? formatOrionMemoryContext(input.orionMemoryEntries, { limit: 10 })
    : "";
  return [
    `用户任务：${input.task}`,
    `项目上下文：${input.projectContext}`,
    input.projectPath?.trim()
      ? `代码产物同步路径：${input.projectPath.trim()}\nDEV 输出的 FILE 代码块会同步写入该项目根目录下的相对路径。ARCH 和 QA 必须优先检查该项目路径中的真实文件，再判断代码审查和测试结果。`
      : "",
    input.memoryContext,
    orionMemoryContext ? `ORION 结构化记忆：\n${orionMemoryContext}` : "",
    input.attachmentContext,
  ].filter((line) => Boolean(line?.trim())).join("\n");
}
