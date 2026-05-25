# Workflow Intelligence Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add lightweight workflow intelligence so ORCH can dynamically route tasks and reuse long-term memory rules.

**Architecture:** Keep the existing sequential ORCH loop, but add small pure TypeScript decision modules plus a Rust JSON-backed rule store. The frontend chooses a workflow per task, injects relevant memory rules into upstream context, and appends Retrospective output as a new rule candidate.

**Tech Stack:** React 19, TypeScript, Node test runner with `--experimental-strip-types`, Tauri 2, Rust, serde JSON.

---

### Task 1: Dynamic Workflow Router

**Files:**
- Create: `src/workflowRouter.ts`
- Create: `src/workflowRouter.test.ts`
- Modify: `src/App.tsx`

- [x] **Step 1: Write failing router tests**

Tests cover Bug 修复流程, 仅测试流程, and ambiguous tasks staying on the current workflow.

- [x] **Step 2: Verify RED**

Run: `node --test --experimental-strip-types src/workflowRouter.test.ts`

Expected: FAIL because `src/workflowRouter.ts` does not exist.

- [x] **Step 3: Implement router**

`recommendWorkflowForTask(task, workflows, currentWorkflowId)` returns workflow, confidence, matched kind, and human-readable reason.

- [x] **Step 4: Verify GREEN**

Run: `node --test --experimental-strip-types src/workflowRouter.test.ts`

Expected: PASS.

### Task 2: Long-Term Memory Rule Logic

**Files:**
- Create: `src/memoryRules.ts`
- Create: `src/memoryRules.test.ts`
- Modify: `src/App.tsx`

- [x] **Step 1: Write failing memory tests**

Tests cover candidate creation, tag-based retrieval, and compact prompt context formatting.

- [x] **Step 2: Verify RED**

Run: `node --test --experimental-strip-types src/memoryRules.test.ts`

Expected: FAIL because `src/memoryRules.ts` does not exist.

- [x] **Step 3: Implement memory utilities**

Add `createMemoryRuleCandidate`, `retrieveRelevantMemoryRules`, and `buildMemoryContextBlock`.

- [x] **Step 4: Verify GREEN**

Run: `node --test --experimental-strip-types src/memoryRules.test.ts`

Expected: PASS.

### Task 3: Rust Memory Rule Store

**Files:**
- Create: `src-tauri/src/memory_rule_store.rs`
- Modify: `src-tauri/src/lib.rs`

- [x] **Step 1: Write failing Rust tests**

Tests cover empty load, save/load persistence, and append metadata.

- [x] **Step 2: Verify RED**

Run: `cargo test memory_rule_store`

Expected: FAIL because rule types and functions do not exist.

- [x] **Step 3: Implement JSON store**

Persist rules to `%APPDATA%\ORX\memory_rules.json`, expose `get_memory_rules`, `save_memory_rules`, and `append_memory_rule`.

- [x] **Step 4: Verify GREEN**

Run: `cargo test memory_rule_store`

Expected: PASS.

### Task 4: ORCH Integration

**Files:**
- Modify: `src/App.tsx`
- Modify: `package.json`

- [x] **Step 1: Route before starting a workflow**

At task start, call `recommendWorkflowForTask`, use that workflow's enabled steps for the current run, and log route reason and confidence.

- [x] **Step 2: Inject relevant memory**

Load rules from Tauri, retrieve relevant rules from task plus project context, and include the memory block in `upstream`.

- [x] **Step 3: Persist Retrospective as memory**

When the `Retrospective` node completes, append a rule candidate to the local rule store.

- [x] **Step 4: Include tests in selftest script**

Add `workflowRouter.test.ts` and `memoryRules.test.ts` to `workflow:selftest`.

### Task 5: Verification and Docs

**Files:**
- Modify: `README.md`
- Modify: `docs/orx-core-workflow-principles.md`

- [x] **Step 1: Document dynamic routing**

Explain how ORCH chooses full-development, bug-fix, test-only, or current workflow.

- [x] **Step 2: Document memory rules**

Explain `%APPDATA%\ORX\memory_rules.json`, retrieval, and Retrospective rule creation.

- [x] **Step 3: Run full verification**

Run:

```powershell
npm --cache D:\npm-cache run workflow:selftest
npm --cache D:\npm-cache run build
cargo test
```

Expected: all pass.
