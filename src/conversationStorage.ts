import type { OrionMemoryEntry } from "./orionMemory.ts";

export const CONVERSATION_STORAGE_KEY = "orx.conversations.v1";

export type ConversationSession = {
  id: string;
  projectId: string;
  title: string;
  updatedAt: number;
  chatLines: string[];
  logLines: string[];
  orionMemoryEntries: OrionMemoryEntry[];
};

export type ConversationStoreSnapshot = {
  activeConversationId: string;
  conversations: ConversationSession[];
};

type ConversationStorage = Pick<Storage, "getItem" | "setItem">;

export function loadConversationStore(storage: Pick<Storage, "getItem"> | null | undefined, limit = 80): ConversationStoreSnapshot {
  if (!storage) return emptyConversationStore();
  try {
    const raw = storage.getItem(CONVERSATION_STORAGE_KEY);
    if (!raw) return emptyConversationStore();
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return emptyConversationStore();
    const value = parsed as Partial<ConversationStoreSnapshot>;
    const conversations = Array.isArray(value.conversations)
      ? value.conversations.map(normalizeConversation).filter((item): item is ConversationSession => Boolean(item)).slice(0, limit)
      : [];
    const activeConversationId = typeof value.activeConversationId === "string"
      && conversations.some((conversation) => conversation.id === value.activeConversationId)
      ? value.activeConversationId
      : "";
    return { activeConversationId, conversations };
  } catch {
    return emptyConversationStore();
  }
}

export function saveConversationStore(storage: ConversationStorage | null | undefined, snapshot: ConversationStoreSnapshot, limit = 80) {
  if (!storage) return;
  const conversations = snapshot.conversations.slice(0, limit);
  const activeConversationId = conversations.some((conversation) => conversation.id === snapshot.activeConversationId)
    ? snapshot.activeConversationId
    : "";
  storage.setItem(CONVERSATION_STORAGE_KEY, JSON.stringify({ activeConversationId, conversations }));
}

export function createConversationSession(projectId = "workspace", title = "新任务对话", options: { id?: string; now?: number } = {}): ConversationSession {
  const now = options.now ?? Date.now();
  return {
    id: options.id ?? `chat-${now}`,
    projectId,
    title,
    updatedAt: now,
    orionMemoryEntries: [],
    chatLines: [`ORCH：${title} 已就绪。`],
    logLines: ["codex-workflow-client started", `conversation: ${title}`],
  };
}

export function updateConversationContent(
  conversations: ConversationSession[],
  conversationId: string,
  chatLines: string[],
  logLines: string[],
  options: { now?: number; orionMemoryEntries?: OrionMemoryEntry[] } = {},
) {
  if (!conversationId) return conversations;
  const index = conversations.findIndex((conversation) => conversation.id === conversationId);
  if (index < 0) return conversations;
  const next = [...conversations];
  next[index] = {
    ...next[index],
    chatLines: [...chatLines],
    logLines: [...logLines],
    orionMemoryEntries: options.orionMemoryEntries ? [...options.orionMemoryEntries] : [...next[index].orionMemoryEntries],
    updatedAt: options.now ?? Date.now(),
  };
  return next;
}

export function removeConversationSessions(conversations: ConversationSession[], predicate: (conversation: ConversationSession) => boolean) {
  return conversations.filter((conversation) => !predicate(conversation));
}

export function selectConversationOrionMemory(conversation: ConversationSession | undefined, legacyEntries: OrionMemoryEntry[]) {
  if (conversation?.orionMemoryEntries.length) return conversation.orionMemoryEntries;
  return legacyEntries;
}

function emptyConversationStore(): ConversationStoreSnapshot {
  return { activeConversationId: "", conversations: [] };
}

function normalizeConversation(value: unknown): ConversationSession | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<ConversationSession>;
  if (typeof item.id !== "string" || !item.id || typeof item.projectId !== "string" || typeof item.title !== "string") return null;
  return {
    id: item.id,
    projectId: item.projectId,
    title: item.title,
    updatedAt: typeof item.updatedAt === "number" ? item.updatedAt : Date.now(),
    chatLines: normalizeStringArray(item.chatLines, [`ORCH：${item.title} 已就绪。`]),
    logLines: normalizeStringArray(item.logLines, ["codex-workflow-client started", `conversation: ${item.title}`]),
    orionMemoryEntries: normalizeOrionMemoryEntries(item.orionMemoryEntries),
  };
}

function normalizeStringArray(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) return fallback;
  const lines = value.filter((line): line is string => typeof line === "string");
  return lines.length > 0 ? lines : fallback;
}

function normalizeOrionMemoryEntries(value: unknown): OrionMemoryEntry[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is OrionMemoryEntry => {
    if (!entry || typeof entry !== "object") return false;
    const item = entry as Partial<OrionMemoryEntry>;
    return typeof item.id === "string"
      && typeof item.createdAt === "number"
      && typeof item.traceId === "string"
      && typeof item.round === "number"
      && typeof item.task === "string"
      && typeof item.kind === "string"
      && typeof item.title === "string"
      && typeof item.message === "string"
      && Array.isArray(item.urls);
  }).slice(-48);
}
