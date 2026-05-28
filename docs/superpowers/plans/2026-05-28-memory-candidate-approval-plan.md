# Memory Candidate Approval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Change Retrospective memory capture from automatic append to a user-approved candidate flow.

**Architecture:** Keep candidate creation as pure TypeScript in `src/memoryCandidates.ts`, reuse the existing `append_memory_rule` backend command only when the user saves, and keep the UI local to `src/App.tsx` for this slice. This avoids backend schema churn while making memory persistence explicit.

**Tech Stack:** React 19, TypeScript 5.8, Tauri 2, Node test runner.

---

## File Structure

- Create `src/memoryCandidates.ts`: pure helper functions for creating and editing pending memory candidates.
- Create `src/memoryCandidates.test.ts`: tests for blank retrospectives, candidate creation, and edits.
- Modify `src/memoryRules.ts`: export `MemoryRuleCandidate` use stays unchanged.
- Modify `src/App.tsx`: store one pending memory candidate, propose it after Retrospective, save/edit/ignore from UI.
- Modify `src/App.css`: small styling for the pending memory card.
- Modify `package.json`: include `src/memoryCandidates.test.ts` in `workflow:selftest`.

## Tasks

- [ ] Write failing tests in `src/memoryCandidates.test.ts` proving blank text returns `null`, valid Retrospective output creates a pending candidate, and edits update title/body/tags.
- [ ] Add `src/memoryCandidates.ts` with `PendingMemoryCandidate`, `createPendingMemoryCandidate`, and `updatePendingMemoryCandidate`.
- [ ] Add the new test file to `package.json` and run `npm run workflow:selftest` to see RED, then GREEN.
- [ ] Replace automatic `tryAppendMemoryRule` behavior in `src/App.tsx` with `proposeMemoryRuleCandidate`.
- [ ] Add `savePendingMemoryCandidate`, `ignorePendingMemoryCandidate`, and simple controlled inputs for title/body/tags.
- [ ] Render a pending memory candidate card near other composer permission surfaces.
- [ ] Run `npm run workflow:selftest`, `npm run build`, and `cargo test`; record the known local linker blocker if it remains.
- [ ] Commit as `feat: add memory candidate approval`.
