# ORION Copilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add ORION as a high-permission conversational copilot foundation with typed action permissions, capability-aware workflow drafting, and controlled local action execution.

**Architecture:** Keep ORCH Core as the workflow executor. Add ORION modules around it: a TypeScript action registry and planner for UI behavior, plus a Rust action executor for local file, command, release, and git capabilities. Risk levels gate execution before side effects.

**Tech Stack:** React 19, TypeScript, Node test runner, Tauri 2, Rust, serde JSON, std::process for whitelisted commands.

---

### Task 1: ORION Action Registry

**Files:**
- Create: `src/orionActions.ts`
- Create: `src/orionActions.test.ts`

- [ ] **Step 1: Write failing tests**

Test that action kinds map to `direct`, `confirm`, and `strong-confirm` exactly as defined in the design.

- [ ] **Step 2: Run RED**

Run: `node --test --experimental-strip-types src/orionActions.test.ts`

Expected: FAIL because `orionActions.ts` does not exist.

- [ ] **Step 3: Implement registry**

Add `OrionActionKind`, `OrionRiskLevel`, `getOrionActionRisk`, `actionNeedsConfirmation`, and `groupOrionActionsByRisk`.

- [ ] **Step 4: Run GREEN**

Run: `node --test --experimental-strip-types src/orionActions.test.ts`

Expected: PASS.

### Task 2: ORION Workflow Planner

**Files:**
- Create: `src/orionPlanner.ts`
- Create: `src/orionPlanner.test.ts`

- [ ] **Step 1: Write failing tests**

Test that bug requests produce a Bug Investigation workflow draft with Trellis, bug-investigation, test-planning, and optional code-review recommendation.

- [ ] **Step 2: Run RED**

Run: `node --test --experimental-strip-types src/orionPlanner.test.ts`

Expected: FAIL because `orionPlanner.ts` does not exist.

- [ ] **Step 3: Implement planner**

Add deterministic first-version planner helpers for workflow drafts and capability attachment.

- [ ] **Step 4: Run GREEN**

Run: `node --test --experimental-strip-types src/orionPlanner.test.ts`

Expected: PASS.

### Task 3: Rust ORION Action Executor

**Files:**
- Create: `src-tauri/src/orion_actions.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Write failing Rust tests**

Test path safety for project file reads, generated artifact write boundaries, command whitelist, and git/release risk metadata.

- [ ] **Step 2: Run RED**

Run: `cargo test orion_actions`

Expected: FAIL because executor module does not exist.

- [ ] **Step 3: Implement executor primitives**

Add request/response structs and functions for:

- `read_project_file`
- `write_generated_artifact`
- `validate_whitelisted_command`
- `orion_action_risk`

The first version exposes safe primitives and metadata; execution of command/release/git remains behind explicit confirmation payloads.

- [ ] **Step 4: Run GREEN**

Run: `cargo test orion_actions`

Expected: PASS.

### Task 4: App Integration

**Files:**
- Modify: `src/App.tsx`
- Modify: `package.json`

- [ ] **Step 1: Add ORION mode state**

Add an ORION entry point in the existing conversation surface. The first version can use text commands and action previews instead of a full new panel.

- [ ] **Step 2: Add ORION planner flow**

When the user starts with `@orion`, generate a workflow draft and action plan preview instead of directly starting ORCH.

- [ ] **Step 3: Add confirmation handling**

Allow user approval to execute confirm-level local workflow actions; strong-confirm actions remain preview-only until dedicated UI is added.

- [ ] **Step 4: Include ORION tests in selftest**

Add `orionActions.test.ts` and `orionPlanner.test.ts` to `workflow:selftest`.

### Task 5: Docs and Verification

**Files:**
- Modify: `README.md`
- Modify: `docs/orx-core-workflow-principles.md`

- [ ] **Step 1: Document ORION**

Describe ORION role, permission levels, and first-version action coverage.

- [ ] **Step 2: Run full verification**

Run:

```powershell
npm --cache D:\npm-cache run workflow:selftest
npm --cache D:\npm-cache run build
cargo test
```

Expected: all pass.
