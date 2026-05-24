export type ChatTimelineItem = {
  side: "system" | "user";
  tone: "normal" | "error";
  text: string;
};

export function toChatTimelineItems(lines: string[]): ChatTimelineItem[] {
  return lines.map((line) => {
    const userPrefix = line.startsWith("你：") ? "你：" : line.startsWith("浣狅細") ? "浣狅細" : "";
    const isUser = Boolean(userPrefix);
    const text = isUser ? line.slice(userPrefix.length) : line;
    return {
      side: isUser ? "user" : "system",
      tone: !isUser && (line.includes("失败") || line.includes("澶辫触")) ? "error" : "normal",
      text,
    };
  });
}
