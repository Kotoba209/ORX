# ORION Executable Workbench Design

## Purpose

ORX 0.4 should make ORION feel less like a planner and more like a trusted local workbench. The next version focuses on three product outcomes:

- ORION can safely execute common local project checks after explicit confirmation.
- ORX can turn useful retrospectives into user-approved project memory.
- Trellis and ORION interaction states are easier to understand and confirm.

The first implementation slice is the ORION command execution loop. Memory approval and Trellis polish are included as follow-up design direction, but they do not block the command loop.

## Recommended Path

Use the "execution first" approach:

1. Extend ORION assistant mode so it can recognize requests to check project status, run self-tests, run builds, and inspect tool versions.
2. Keep command execution behind the existing `confirm` permission level and Tauri command whitelist.
3. Render command actions with the same action preview model ORION already uses for workflow plans.
4. Show structured command results in chat and logs.
5. Feed failures into the existing run monitor language so the user gets a next-step recommendation.

This path fits the current codebase because `src/orionPlanner.ts`, `src/orionActions.ts`, `src/orionPermission.ts`, and `src-tauri/src/orion_actions.rs` already model action kind, risk, payload, and whitelist validation.

## 0.4.1 Scope: ORION Command Execution Loop

### User Experience

A user can type requests such as:

```text
@orion 检查项目状态和构建
@orion run tests and build
@orion check whether this project is healthy
```

ORION responds in assistant mode with a pending action plan. The plan includes:

- `git status --short --branch`
- `npm run workflow:selftest`
- `npm run build`

ORION asks for confirmation before execution. After approval, ORX runs each command in sequence and appends one result per command to the conversation and log.

### Command Policy

Initial allowed commands:

- `node --version`
- `npm --version`
- `rustc -V`
- `cargo -V`
- `git status --short --branch`
- `npm run workflow:selftest`
- `npm run build`
- `cargo test`

All commands remain exact-match whitelist entries. Arguments are normalized case-insensitively for command names and package ids where appropriate, but command shapes stay exact to avoid arbitrary shell execution.

### Result Model

Each command result should include:

- program
- args
- cwd
- status
- stdout preview
- stderr preview
- success flag
- short summary

The existing Rust result already returns `program`, `args`, `cwd`, `status`, `stdout`, and `stderr`. The frontend can derive success and summary without changing the backend contract in the first slice.

### Failure Behavior

Commands run sequentially. If one command fails, ORX should stop the remaining command sequence by default and tell the user which command failed. This prevents a failed test run from being hidden by later successful build output.

The chat copy should include:

- command that failed
- exit code
- stderr/stdout preview
- suggested next action, such as asking ORION to inspect the failure or running the workflow with DEV/QA agents

### Files And Boundaries

- `src/orionPlanner.ts` owns assistant intent classification and action drafting.
- `src/orionPlanner.test.ts` covers assistant intent and generated command actions.
- `src-tauri/src/orion_actions.rs` owns backend command whitelist validation and execution.
- `src-tauri/src/lib.rs` exposes the Tauri command.
- `src/App.tsx` orchestrates pending assistant approval and command execution.

The first slice should avoid a broad component split. If the implementation needs small helpers, prefer extracting pure frontend helpers into a focused file instead of growing `App.tsx` further.

## Follow-Up: Memory Candidate Approval

Retrospective-based memory should become user-approved before being written to the long-term rule store.

The UI should present a candidate with:

- title
- content
- tags
- source task
- source archive id

The user can save, edit and save, or ignore the candidate. Project association should be recorded so future project-level memory isolation can be added without changing the rule shape again.

## Follow-Up: Trellis And ORION UX Polish

Trellis clarification gates should provide explicit controls:

- submit clarification answer
- confirm and continue

ORION assistant actions and workflow actions should reuse the same action grouping and risk labeling patterns. This keeps direct, confirm, and strong-confirm actions understandable across both modes.

## Testing

The command loop should be covered by:

- `src/orionPlanner.test.ts` for assistant intent and command plan generation.
- Rust tests in `src-tauri/src/orion_actions.rs` for whitelist validation.
- Existing `npm run workflow:selftest`.
- Existing `npm run build`.

Manual verification should cover:

1. `@orion 检查项目状态和构建` creates three pending command actions.
2. Approving the request runs commands in order.
3. A failed command stops later commands and explains the failure.
4. Browser preview still reports that Tauri command execution requires the Tauri client.

## Risks

- Build commands can refresh generated output such as `dist`. The preview should mention that build commands may update build artifacts.
- Command output can be long. Chat should show a preview and keep full output in logs when practical.
- Rust command tests depend on the local Windows toolchain. Frontend tests remain the primary verification when the local GNU linker is misconfigured.

## Non-Goals

- No arbitrary shell command input.
- No Git commit, tag, push, or release publishing in 0.4.1.
- No vector memory index in this slice.
- No broad `App.tsx` rewrite in this slice.
