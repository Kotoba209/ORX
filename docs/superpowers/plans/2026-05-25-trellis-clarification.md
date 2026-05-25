# Trellis Clarification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Trellis-style multi-turn clarification capability for PD Agent while preserving the existing approval gate after PRD generation.

**Architecture:** Extend workflow steps with optional capability metadata (`skill_ids`, `interaction`, `exit_condition`). Add a pure TypeScript clarification state module used by `App.tsx` to pause on clarification questions, collect user answers, and resume the same node until requirements are ready.

**Tech Stack:** React 19, TypeScript, Node test runner with `--experimental-strip-types`, existing Tauri `run_agent` command.

---

### Task 1: Workflow Skill Metadata

**Files:**
- Modify: `src/workflowState.ts`
- Modify: `src/workflowConfig.ts`
- Test: `src/workflowConfig.test.ts`

- [ ] **Step 1: Add failing test**

Assert the full-development workflow includes `PD Agent / Clarification` after `Intake`, with `skill_ids: ["trellis"]`, `interaction: "multi-turn"`, and `exit_condition: "requirements_ready"`.

- [ ] **Step 2: Run test to verify RED**

Run: `node --test --experimental-strip-types src/workflowConfig.test.ts`

Expected: FAIL because the Clarification node does not exist.

- [ ] **Step 3: Implement metadata**

Add optional fields to `WorkflowStep`, add a default Clarification node, and keep bug-fix/test-only flows from requiring this node unless explicitly configured.

- [ ] **Step 4: Run test to verify GREEN**

Run: `node --test --experimental-strip-types src/workflowConfig.test.ts`

Expected: PASS.

### Task 2: Clarification State Machine

**Files:**
- Create: `src/clarificationState.ts`
- Create: `src/clarificationState.test.ts`

- [ ] **Step 1: Add failing tests**

Test that Trellis output ending with `需求已明确` completes the node, and regular question output pauses for user input.

- [ ] **Step 2: Run test to verify RED**

Run: `node --test --experimental-strip-types src/clarificationState.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement state helpers**

Add `stepUsesInteractiveClarification`, `parseClarificationOutput`, and `nextRuntimeAfterClarificationAnswer`.

- [ ] **Step 4: Run test to verify GREEN**

Run: `node --test --experimental-strip-types src/clarificationState.test.ts`

Expected: PASS.

### Task 3: ORCH Integration

**Files:**
- Modify: `src/App.tsx`
- Modify: `package.json`

- [ ] **Step 1: Add clarification gate state**

Track the paused clarification node separately from approval gates.

- [ ] **Step 2: Route composer answers**

When clarification is waiting, user input becomes a Trellis answer rather than a new task or approval command.

- [ ] **Step 3: Pause and resume interactive node**

If Trellis asks a question, pause. If it marks requirements ready, continue to ScenarioRehearsal and preserve the existing approval gate.

- [ ] **Step 4: Include new tests in selftest**

Add `clarificationState.test.ts` to `workflow:selftest`.

### Task 4: Docs and Verification

**Files:**
- Modify: `README.md`
- Modify: `docs/orx-core-workflow-principles.md`

- [ ] **Step 1: Document Trellis clarification**

Explain how Trellis differs from approval: clarification happens before PRD; approval remains after PRD/CR.

- [ ] **Step 2: Run full verification**

Run:

```powershell
npm --cache D:\npm-cache run workflow:selftest
npm --cache D:\npm-cache run build
cargo test
```

Expected: all pass.
