import test from "node:test";
import assert from "node:assert/strict";
import {
  createOrionProcessFollowUpReply,
  extractRecentArtifactPaths,
  formatOrionProcessContext,
  shouldUseDirectOrionProcessFollowUpReply,
} from "./orionProcessContext.ts";
import type { OrionMemoryEntry } from "./orionMemory.ts";

test("formats process context with current archive and memory", () => {
  const memoryEntries: OrionMemoryEntry[] = [{
    id: "m1",
    createdAt: 1,
    traceId: "orion-1",
    round: 1,
    task: "生成页面",
    kind: "workflow.node",
    title: "DEV / TaskSplit",
    message: "已写入 generated 产物",
    urls: [],
    source: "workflow_node",
    archivePath: "D:\\ORX\\tasks\\task-1",
    artifactPaths: ["D:\\ORX\\tasks\\task-1\\generated\\index.html"],
  }];

  const context = formatOrionProcessContext({
    taskArchive: { id: "task-1", path: "D:\\ORX\\tasks\\task-1" },
    artifactOutputDir: "D:\\ORX\\exports",
    memoryEntries,
  });

  assert.match(context, /当前任务归档目录：D:\\ORX\\tasks\\task-1/);
  assert.match(context, /当前 generated 产物目录：D:\\ORX\\tasks\\task-1\\generated/);
  assert.match(context, /D:\\ORX\\tasks\\task-1\\generated\\index\.html/);
});

test("uses a wider default process memory window for long workflow follow-ups", () => {
  const memoryEntries: OrionMemoryEntry[] = Array.from({ length: 14 }, (_, index) => ({
    id: `m${index}`,
    createdAt: index + 1,
    traceId: `orion-process-${index}`,
    round: index + 1,
    task: `workflow task ${index}`,
    kind: "workflow.node",
    title: `node ${index}`,
    message: `node result ${index}`,
    urls: [],
    source: "workflow_node",
  }));

  const context = formatOrionProcessContext({ memoryEntries });

  assert.match(context, /orion-process-0/);
  assert.match(context, /node result 0/);
  assert.match(context, /orion-process-13/);
  assert.match(context, /node result 13/);
});

test("answers artifact path follow-up from current process context", () => {
  const reply = createOrionProcessFollowUpReply("生成的产物文件放在哪个路径下面", {
    taskArchive: { id: "task-1", path: "D:\\ORX\\tasks\\task-1" },
    artifactOutputDir: "",
    memoryEntries: [],
  });

  assert.match(reply, /generated 子目录/);
  assert.match(reply, /D:\\ORX\\tasks\\task-1\\generated/);
});

test("uses direct process follow-up replies only when the model is unavailable", () => {
  assert.equal(shouldUseDirectOrionProcessFollowUpReply({ modelAvailable: true, processReply: "ORION：产物在 generated/index.html" }), false);
  assert.equal(shouldUseDirectOrionProcessFollowUpReply({ modelAvailable: false, processReply: "ORION：产物在 generated/index.html" }), true);
  assert.equal(shouldUseDirectOrionProcessFollowUpReply({ modelAvailable: false, processReply: "" }), false);
});

test("does not intercept new generation tasks as artifact follow-ups", () => {
  const reply = createOrionProcessFollowUpReply("帮我生成一个登录页面", {
    taskArchive: null,
    memoryEntries: [],
  });

  assert.equal(reply, "");
});

test("extracts recent artifact paths from logs and memory", () => {
  const paths = extractRecentArtifactPaths({
    taskArchive: { id: "task-1", path: "D:\\ORX\\tasks\\task-1" },
    memoryEntries: [{
      id: "m1",
      createdAt: 1,
      traceId: "orion-1",
      round: 1,
      task: "写文件",
      kind: "file.writeGeneratedArtifactAuto",
      title: "写入文件",
      message: "已写入 generated 产物：D:\\ORX\\tasks\\task-1\\generated\\sandbox-test.txt（2 bytes）。",
      urls: [],
      artifactPaths: ["D:\\ORX\\tasks\\task-1\\generated\\sandbox-test.txt"],
    }],
    logLines: ["task archive: D:\\ORX\\tasks\\task-1"],
  });

  assert.ok(paths.includes("D:\\ORX\\tasks\\task-1"));
  assert.ok(paths.includes("D:\\ORX\\tasks\\task-1\\generated"));
  assert.ok(paths.includes("D:\\ORX\\tasks\\task-1\\generated\\sandbox-test.txt"));
});
