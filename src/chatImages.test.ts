import assert from "node:assert/strict";
import test from "node:test";
import { parseChatImageMarkdown } from "./chatImages.ts";

test("parses markdown images while preserving surrounding text", () => {
  const parts = parseChatImageMarkdown("开始\n![生成图片](data:image/png;base64,abc123)\n结束");

  assert.deepEqual(parts, [
    { kind: "text", text: "开始\n" },
    { kind: "image", alt: "生成图片", src: "data:image/png;base64,abc123" },
    { kind: "text", text: "\n结束" },
  ]);
});

test("ignores non-image markdown links", () => {
  const parts = parseChatImageMarkdown("看这里 [链接](https://example.com)");

  assert.deepEqual(parts, [{ kind: "text", text: "看这里 [链接](https://example.com)" }]);
});

test("parses markdown video links for preview", () => {
  const parts = parseChatImageMarkdown("视频：[生成视频](data:video/mp4;base64,abc123)");

  assert.deepEqual(parts, [
    { kind: "text", text: "视频：" },
    { kind: "video", alt: "生成视频", src: "data:video/mp4;base64,abc123" },
  ]);
});

test("parses video file urls while ignoring non-media urls", () => {
  const parts = parseChatImageMarkdown("[预览](https://example.com/demo.mp4?token=1) [普通](https://example.com/page)");

  assert.deepEqual(parts, [
    { kind: "video", alt: "预览", src: "https://example.com/demo.mp4?token=1" },
    { kind: "text", text: " [普通](https://example.com/page)" },
  ]);
});
