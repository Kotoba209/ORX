import { createMemoryRuleCandidate, type MemoryRuleCandidate } from "./memoryRules.ts";

export type PendingMemoryCandidate = {
  status: "pending";
  candidate: MemoryRuleCandidate;
};

export type MemoryCandidatePatch = {
  title?: string;
  body?: string;
  tagsText?: string;
};

export function createPendingMemoryCandidate(retrospectiveText: string, sourceTaskId: string, sourceStage: string): PendingMemoryCandidate | null {
  if (!retrospectiveText.trim() || !sourceTaskId.trim()) return null;
  return {
    status: "pending",
    candidate: createMemoryRuleCandidate(retrospectiveText, sourceTaskId, sourceStage),
  };
}

export function updatePendingMemoryCandidate(pending: PendingMemoryCandidate, patch: MemoryCandidatePatch): PendingMemoryCandidate {
  return {
    ...pending,
    candidate: {
      ...pending.candidate,
      title: patch.title ?? pending.candidate.title,
      body: patch.body ?? pending.candidate.body,
      tags: patch.tagsText === undefined ? pending.candidate.tags : parseTagsText(patch.tagsText),
    },
  };
}

function parseTagsText(value: string) {
  return Array.from(new Set(value.split(/[,\s，、]+/).map((tag) => tag.trim()).filter(Boolean)));
}
