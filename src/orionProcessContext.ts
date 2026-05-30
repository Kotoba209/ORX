import { formatOrionMemoryContext, type OrionMemoryEntry } from "./orionMemory.ts";

export type OrionTaskArchiveRef = { id: string; path: string };

export type OrionProcessContextInput = {
  taskArchive?: OrionTaskArchiveRef | null;
  artifactOutputDir?: string;
  memoryEntries?: OrionMemoryEntry[];
  chatLines?: string[];
  logLines?: string[];
};

export function formatOrionProcessContext(input: OrionProcessContextInput, options: { memoryLimit?: number } = {}) {
  const archivePath = input.taskArchive?.path;
  const paths = extractRecentArtifactPaths(input);
  const sections = [
    archivePath ? `当前任务归档目录：${archivePath}` : "",
    archivePath ? `当前 generated 产物目录：${archivePath}\\generated` : "",
    input.artifactOutputDir ? `用户设置的产物总目录：${input.artifactOutputDir}` : "用户未设置产物总目录；默认保存到任务归档目录。",
    paths.length > 0 ? `最近产物/归档路径：\n${paths.map((path, index) => `${index + 1}. ${path}`).join("\n")}` : "",
    input.memoryEntries?.length ? `最近 ORION 流程记忆：\n${formatOrionMemoryContext(input.memoryEntries, { limit: options.memoryLimit ?? 16 })}` : "",
  ].filter(Boolean);
  return sections.join("\n\n");
}

export function createOrionProcessFollowUpReply(task: string, input: OrionProcessContextInput) {
  if (!looksLikeArtifactPathRequest(task)) return "";
  const archivePath = input.taskArchive?.path ?? latestArchivePath(input);
  const paths = extractRecentArtifactPaths(input);
  if (archivePath) {
    const generatedPath = `${archivePath}\\generated`;
    const extra = paths.filter((path) => path !== archivePath && path !== generatedPath);
    return [
      `ORION：生成的产物默认放在当前任务归档目录的 generated 子目录：${generatedPath}`,
      `当前任务归档目录：${archivePath}`,
      input.artifactOutputDir ? `如果执行了导出，产物也会按任务整理到你设置的产物总目录：${input.artifactOutputDir}` : "你还没有设置产物总目录，所以默认只在任务归档目录里。",
      extra.length > 0 ? `最近记录到的具体路径：\n${extra.slice(0, 5).map((path, index) => `${index + 1}. ${path}`).join("\n")}` : "",
    ].filter(Boolean).join("\n");
  }
  if (paths.length > 0) {
    return `ORION：我在最近记忆里找到这些产物/归档路径：\n${paths.slice(0, 6).map((path, index) => `${index + 1}. ${path}`).join("\n")}`;
  }
  return "ORION：当前会话里还没有可定位的任务归档目录。产物默认会放在 ORX 的 tasks 目录下，每个任务自己的 generated 子目录中；等任务实际生成产物后，我会把具体路径写入记忆。";
}

export function shouldUseDirectOrionProcessFollowUpReply(input: { modelAvailable: boolean; processReply: string }) {
  return !input.modelAvailable && Boolean(input.processReply.trim());
}

export function extractRecentArtifactPaths(input: OrionProcessContextInput) {
  const candidates = [
    input.taskArchive?.path ?? "",
    input.taskArchive?.path ? `${input.taskArchive.path}\\generated` : "",
    ...(input.memoryEntries ?? []).flatMap((entry) => [
      entry.archivePath ?? "",
      ...(entry.artifactPaths ?? []),
    ]),
    ...extractPathsFromLines(input.chatLines ?? []),
    ...extractPathsFromLines(input.logLines ?? []),
  ];
  return uniqueStrings(candidates).slice(-12);
}

function looksLikeArtifactPathRequest(task: string) {
  const text = task.trim();
  const asksLocation = /(路径|目录|位置|放在哪|在哪里|在哪个|保存到哪|生成到哪|输出到哪|generated|artifact|task archive)/i.test(text);
  const mentionsRecentArtifact = /(刚才|上面|上一轮|这次|本次|生成的|产物|归档|文件)/i.test(text);
  return asksLocation && mentionsRecentArtifact;
}

function latestArchivePath(input: OrionProcessContextInput) {
  return [...(input.memoryEntries ?? [])]
    .reverse()
    .find((entry) => entry.archivePath)?.archivePath;
}

function extractPathsFromLines(lines: string[]) {
  const text = lines.slice(-80).join("\n");
  const matches = [
    ...text.matchAll(/task archive[:：]\s*([^\n]+)/gi),
    ...text.matchAll(/任务归档目录[:：]\s*([^\n；，。]+)/g),
    ...text.matchAll(/已写入 generated 产物[:：]\s*([^\n（]+)/g),
    ...text.matchAll(/ORION memory persisted[:：]\s*([^\n]+)/gi),
    ...text.matchAll(/([A-Za-z]:\\[^\n\r；，。]+(?:\\generated(?:\\[^\n\r；，。]+)?|\\tasks\\[^\n\r；，。]+))/g),
  ].map((match) => (match[1] ?? match[0]).trim().replace(/[，。；、)）]+$/, ""));
  return matches;
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}
