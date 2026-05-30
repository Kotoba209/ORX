import test from "node:test";
import assert from "node:assert/strict";
import {
  createConversationSession,
  selectConversationOrionMemory,
  loadConversationStore,
  removeConversationSessions,
  saveConversationStore,
  updateConversationContent,
} from "./conversationStorage.ts";
import type { OrionMemoryEntry } from "./orionMemory.ts";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
}

test("creates a conversation session with restorable chat content", () => {
  const session = createConversationSession("project-1", "安全排查", { id: "chat-1", now: 1000 });

  assert.equal(session.id, "chat-1");
  assert.equal(session.projectId, "project-1");
  assert.deepEqual(session.chatLines, ["ORCH：安全排查 已就绪。"]);
});

test("persists the active conversation and its content", () => {
  const storage = memoryStorage();
  const session = createConversationSession("project-1", "网页分析", { id: "chat-1", now: 1000 });
  const conversations = updateConversationContent([session], session.id, ["你：你好", "ORION：我在。"], ["log"], { now: 2000 });

  saveConversationStore(storage, { activeConversationId: session.id, conversations });
  const restored = loadConversationStore(storage);

  assert.equal(restored.activeConversationId, "chat-1");
  assert.deepEqual(restored.conversations[0].chatLines, ["你：你好", "ORION：我在。"]);
  assert.equal(restored.conversations[0].updatedAt, 2000);
});

test("persists ORION process memory independently for each conversation", () => {
  const storage = memoryStorage();
  const first = createConversationSession("project-1", "first", { id: "chat-1", now: 1000 });
  const second = createConversationSession("project-1", "second", { id: "chat-2", now: 1001 });
  const firstMemory: OrionMemoryEntry = {
    id: "memory-1",
    createdAt: 1002,
    traceId: "trace-1",
    round: 1,
    task: "read example.test",
    kind: "web.fetchUrl",
    title: "fetch",
    message: "fetched example.test",
    urls: ["https://example.test"],
    source: "assistant_action",
  };
  const conversations = updateConversationContent(
    [first, second],
    first.id,
    ["ORION: fetched example.test"],
    ["fetch done"],
    { now: 2000, orionMemoryEntries: [firstMemory] },
  );

  saveConversationStore(storage, { activeConversationId: second.id, conversations });
  const restored = loadConversationStore(storage);

  assert.deepEqual(restored.conversations.find((conversation) => conversation.id === first.id)?.orionMemoryEntries, [firstMemory]);
  assert.deepEqual(restored.conversations.find((conversation) => conversation.id === second.id)?.orionMemoryEntries, []);
});

test("migrates legacy global ORION memory only when the active conversation has no scoped memory", () => {
  const session = createConversationSession("project-1", "legacy", { id: "chat-1", now: 1000 });
  const legacyMemory: OrionMemoryEntry = {
    id: "legacy-memory",
    createdAt: 1002,
    traceId: "legacy-trace",
    round: 1,
    task: "legacy task",
    kind: "web.fetchUrl",
    title: "legacy fetch",
    message: "legacy result",
    urls: [],
    source: "assistant_action",
  };
  const scopedMemory: OrionMemoryEntry = { ...legacyMemory, id: "scoped-memory", traceId: "scoped-trace" };

  assert.deepEqual(selectConversationOrionMemory(session, [legacyMemory]), [legacyMemory]);
  assert.deepEqual(selectConversationOrionMemory({ ...session, orionMemoryEntries: [scopedMemory] }, [legacyMemory]), [scopedMemory]);
});

test("removes project conversations without affecting other projects", () => {
  const first = createConversationSession("project-1", "一", { id: "chat-1" });
  const second = createConversationSession("project-2", "二", { id: "chat-2" });

  const conversations = removeConversationSessions([first, second], (conversation) => conversation.projectId === "project-1");

  assert.deepEqual(conversations.map((conversation) => conversation.id), ["chat-2"]);
});

test("tolerates corrupted local conversation storage", () => {
  const storage = memoryStorage();
  storage.setItem("orx.conversations.v1", "{broken");

  assert.deepEqual(loadConversationStore(storage), { activeConversationId: "", conversations: [] });
});
