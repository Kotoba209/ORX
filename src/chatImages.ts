export type ChatImagePart =
  | { kind: "text"; text: string }
  | { kind: "image"; alt: string; src: string }
  | { kind: "video"; alt: string; src: string };

export function parseChatImageMarkdown(text: string): ChatImagePart[] {
  const mediaPattern = /(!?)\[([^\]]*)\]\((data:(image|video)\/[^)\s]+|https?:\/\/[^)\s]+)\)/g;
  const parts: ChatImagePart[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(mediaPattern)) {
    const marker = match[1];
    const src = match[3];
    const mediaKind = detectChatMediaKind(src);
    if (!mediaKind || (!marker && mediaKind !== "video")) {
      continue;
    }
    const matchIndex = match.index ?? 0;
    if (matchIndex > lastIndex) {
      parts.push({ kind: "text", text: text.slice(lastIndex, matchIndex) });
    }
    parts.push({
      kind: mediaKind,
      alt: match[2]?.trim() || (mediaKind === "video" ? "视频" : "图片"),
      src,
    });
    lastIndex = matchIndex + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push({ kind: "text", text: text.slice(lastIndex) });
  }
  return parts.length > 0 ? parts : [{ kind: "text", text }];
}

function detectChatMediaKind(src: string): "image" | "video" | null {
  if (src.startsWith("data:image/")) return "image";
  if (src.startsWith("data:video/")) return "video";
  const withoutQuery = src.split(/[?#]/, 1)[0]?.toLowerCase() ?? "";
  if (/\.(png|jpe?g|webp|gif|bmp|svg)$/.test(withoutQuery)) return "image";
  if (/\.(mp4|webm|ogg|mov|m4v)$/.test(withoutQuery)) return "video";
  return null;
}
