import { formatOrionMemoryContext, type OrionMemoryEntry } from "./orionMemory.ts";

export function createOrionFollowUpReply(task: string, chatLines: string[], memoryEntries: OrionMemoryEntry[] = []) {
  if (!looksLikeFollowUp(task)) return "";
  const summaryReply = summaryMemoryReply(task, memoryEntries);
  if (summaryReply) return summaryReply;
  const context = memoryEntries.length > 0 ? formatOrionMemoryContext(memoryEntries) : recentUsefulOrionContext(chatLines);
  if (!context) return "";
  if (looksLikeArtifactPathRequest(task)) {
    return artifactPathContext(context);
  }
  if (looksLikeSummaryRequest(task)) {
    return summarizeContext(context);
  }
  if (looksLikeSourceRequest(task)) {
    return sourceContext(context);
  }
  return `ORION：可以继续沿用上一轮内容。最近可用上下文是：${compact(context, 420)}`;
}

function summaryMemoryReply(task: string, memoryEntries: OrionMemoryEntry[]) {
  if (memoryEntries.length === 0) return "";
  const latest = [...memoryEntries]
    .reverse()
    .find((entry) => entry.kind === "assistant.summary" || entry.kind === "workflow.summary");
  if (!latest) return "";
  if (looksLikeArtifactPathRequest(task) && latest.artifactPaths && latest.artifactPaths.length > 0) {
    return `ORION：最近记录到的产物路径在这里：\n${latest.artifactPaths.map((path, index) => `${index + 1}. ${path}`).join("\n")}`;
  }
  const summary = latest.kind === "assistant.summary"
    ? fieldValue(latest.message, "reply")
    : fieldValue(latest.message, "summary");
  if (!summary) return "";
  if (looksLikeSourceRequest(task) && latest.urls.length > 0) {
    return `ORION：刚才内容主要来自这些链接：\n${latest.urls.slice(0, 6).map((url, index) => `${index + 1}. ${url}`).join("\n")}`;
  }
  return `ORION：${summary}`;
}

function fieldValue(message: string, field: string) {
  const pattern = new RegExp(`(?:^|\\n)${field}:\\s*([^\\n]+)`);
  return message.match(pattern)?.[1]?.trim() ?? "";
}

function looksLikeFollowUp(task: string) {
  return /(总结|概括|处理完|刚才|上面|上一轮|读取到|读到|内容|来源|来自|是什么|继续|说明|解释|说一下|产物|生成|文件|路径|目录|放在哪|在哪里|在哪个路径|task archive|generated)/i.test(task);
}

function looksLikeSummaryRequest(task: string) {
  return /(总结|概括|处理完|说一下|说明|解释|是什么内容|到什么内容)/i.test(task);
}

function looksLikeSourceRequest(task: string) {
  return /(来源|来自|哪里|网址|链接)/i.test(task);
}

function looksLikeArtifactPathRequest(task: string) {
  return /(产物|生成|文件|路径|目录|放在哪|在哪里|在哪个路径|task archive|generated)/i.test(task);
}

function recentUsefulOrionContext(chatLines: string[]) {
  const useful = [...chatLines]
    .reverse()
    .map((line) => line.replace(/^(ORION|ORCH|你)：/, "").trim())
    .filter((line) => /(联网查询|项目搜索|命中|读取到|结果|https?:\/\/|动作执行|沙箱|命令完成|命令失败|task archive|generated|已写入|产物|产物总目录|任务归档目录)/i.test(line) && !/local assistant mode/i.test(line))
    .slice(0, 8)
    .reverse();
  return useful.join("\n");
}

function summarizeContext(context: string) {
  const query = context.match(/(?:查询|联网查询)(?:[:：])?「?([^」\n]+)」?/)?.[1];
  const items = Array.from(context.matchAll(/(?:^|[：；\n])\s*\d+\.\s([^；\n]+)/g))
    .map((match) => match[1].trim())
    .slice(0, 5)
    .filter(Boolean);
  if (items.length === 0) {
    return `ORION：我根据上一轮内容整理了一下：${compact(context, 520)}`;
  }
  const lines = items.map((item, index) => {
    const [title = "", url = "", ...summaryParts] = item.split(" - ");
    const summary = summaryParts.join(" - ");
    return `${index + 1}. ${title.trim()}${url.trim() ? `（${url.trim()}）` : ""}：${compact(summary || item, 180)}`;
  });
  return `ORION：上一轮${query ? `关于「${query}」` : ""}读取到的内容主要是：\n${lines.join("\n")}`;
}

function sourceContext(context: string) {
  const urls = Array.from(new Set(context.match(/https?:\/\/[^\s；，。)）「」]+/g) ?? [])).slice(0, 6);
  if (urls.length === 0) return `ORION：上一轮内容里没有提取到明确链接，原始摘要是：${compact(context, 420)}`;
  return `ORION：上一轮内容主要来自这些链接：\n${urls.map((url, index) => `${index + 1}. ${url}`).join("\n")}`;
}

function artifactPathContext(context: string) {
  const paths = extractArtifactPaths(context);
  if (paths.length === 0) {
    return `ORION：我没有在最近上下文里找到明确的产物路径。当前可用线索是：${compact(context, 420)}`;
  }
  return `ORION：最近生成/归档的产物路径在这里：\n${paths.map((path, index) => `${index + 1}. ${path}`).join("\n")}`;
}

function extractArtifactPaths(context: string) {
  const patterns = [
    /task archive[:：]\s*([^\n]+)/gi,
    /(?:已写入 generated 产物|ORION memory persisted)[:：]\s*([^\n（]+)/gi,
    /([A-Za-z]:\\[^\n；。]*\\(?:generated|tasks)\\?[^\n；。]*)/gi,
    /([A-Za-z]:\\[^\n；。]*\\generated\\[^\n；。]*)/gi,
  ];
  const paths: string[] = [];
  for (const pattern of patterns) {
    for (const match of context.matchAll(pattern)) {
      const value = match[1]?.trim().replace(/[。；,，]$/, "");
      if (value) paths.push(value);
    }
  }
  return Array.from(new Set(paths)).slice(0, 8);
}

function compact(value: string, maxLength: number) {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}
