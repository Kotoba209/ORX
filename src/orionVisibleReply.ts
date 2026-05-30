const visibleReplyKeys = ["visible_reply", "reply", "message", "answer"];

const reportTailLabels = [
  "\\u8282\\u70b9\\u4ea7\\u51fa\\u6458\\u8981", // node output summary
  "\\u53ef\\u4ea4\\u4ed8\\u4ea7\\u7269", // deliverables
  "\\u98ce\\u9669", // risks
  "\\u963b\\u585e\\u9879", // blockers
  "\\u4e0b\\u4e00\\u6b65\\u5efa\\u8bae", // next suggestions
  "\\u8282\\u70b9\\u5b8c\\u6210", // node complete
];

export function normalizeOrionVisibleReply(output: string, fallback = "ORION: I am here.") {
  const visible = extractVisibleReply(output) ?? output;
  const cleaned = stripWorkflowReportTail(visible).trim();
  const finalReply = cleaned || fallback;
  if (/^ORION[:\uff1a]/i.test(finalReply)) return finalReply;
  return `ORION\uFF1A${finalReply}`;
}

export function extractVisibleReply(output: string) {
  const parsed = tryParseJsonObject(output);
  if (!parsed) return null;
  for (const key of visibleReplyKeys) {
    const value = parsed[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

export function stripWorkflowReportTail(output: string) {
  let cleaned = output;
  for (const label of reportTailLabels) {
    const pattern = new RegExp(`\\s*(?:\\|\\s*)?(?:\\*\\*)?${label}(?:\\*\\*)?\\s*[:\\uff1a|][\\s\\S]*$`, "i");
    cleaned = cleaned.replace(pattern, "");
  }
  cleaned = cleaned.replace(new RegExp(`(^|\\n)\\s*(?:${reportTailLabels.join("|")})[\\u3002.]?\\s*$`, "gi"), "");
  return cleaned.trim();
}

function tryParseJsonObject(output: string): Record<string, unknown> | null {
  const text = output.trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const candidate = fenced ?? text.match(/\{[\s\S]*\}/)?.[0] ?? text;
  try {
    const parsed: unknown = JSON.parse(candidate);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}
