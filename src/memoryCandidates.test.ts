import test from "node:test";
import assert from "node:assert/strict";
import {
  createPendingMemoryCandidate,
  updatePendingMemoryCandidate,
} from "./memoryCandidates.ts";

test("does not create a pending memory candidate for blank retrospective text", () => {
  assert.equal(createPendingMemoryCandidate("   ", "task-1", "Retrospective"), null);
  assert.equal(createPendingMemoryCandidate("useful note", "", "Retrospective"), null);
});

test("creates a pending memory candidate from retrospective output", () => {
  const pending = createPendingMemoryCandidate(
    "登录表单漏了国家字段，后续表单类任务必须检查必填字段和验收标准是否一致。",
    "task-1001",
    "Retrospective",
  );

  assert.ok(pending);
  assert.equal(pending.status, "pending");
  assert.equal(pending.candidate.source_task_id, "task-1001");
  assert.equal(pending.candidate.tags.includes("form"), true);
  assert.equal(pending.candidate.tags.includes("acceptance"), true);
});

test("updates pending memory candidate title body and tags from editable text", () => {
  const pending = createPendingMemoryCandidate("Provider 超时要记录 endpoint、proxy 和 timeout。", "task-2", "Retrospective");
  assert.ok(pending);

  const updated = updatePendingMemoryCandidate(pending, {
    title: "Provider timeout diagnosis",
    body: "Always record endpoint, proxy, and timeout values.",
    tagsText: "provider, timeout, qa",
  });

  assert.equal(updated.candidate.title, "Provider timeout diagnosis");
  assert.equal(updated.candidate.body, "Always record endpoint, proxy, and timeout values.");
  assert.deepEqual(updated.candidate.tags, ["provider", "timeout", "qa"]);
});
