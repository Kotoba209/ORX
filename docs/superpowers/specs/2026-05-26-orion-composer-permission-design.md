# ORION Composer Permission Design

Date: 2026-05-26

## Goal

Move ORION approval from plain chat text into the composer area, matching the Codex-style permission interaction: the user sees what ORION wants to do at the place where they are already deciding what to send next.

The first implementation focuses on workflow plans created by `@orion ...`. It does not yet execute Git or release actions directly.

## Interaction Model

When ORION drafts a plan, the composer shows an inline permission request above the text input.

The request contains:

- A short action description, for example `ORION 请求创建并运行一个 Bug 排查工作流`.
- The highest risk level in the pending plan.
- A compact count of actions by risk level.
- A vertical list of choices:
  - `本会话始终允许同类权限`
  - `允许本次`
  - `驳回`
- The normal text input remains available for conditional feedback, such as `可以，但只保存工作流，不要运行`.

The right inspector remains a detail surface. It can show the workflow draft and action plan, but it is not the primary approval control.

## Permission Semantics

`允许本次` approves the current pending ORION plan only. After execution, the pending approval state is cleared.

`本会话始终允许同类权限` approves the current plan and records a session-scoped allowance for the highest risk level in that plan. The allowance is kept in React state only and is cleared when the app reloads. It does not persist to disk.

Session allowance is intentionally scoped to risk level for this version:

- Allowing `confirm` lets future `confirm` and `direct` ORION plans proceed without another prompt.
- Allowing `strong-confirm` lets future ORION plans proceed without another prompt for the current app session.
- `direct` plans can proceed without approval.

`驳回` cancels the current pending plan and leaves the user in normal conversation mode.

If the user types free-form feedback while a plan is pending, ORION cancels the current plan and asks the user to restate or refine the goal. Plan mutation from natural language is left for the next iteration.

## UI Placement

The approval block is rendered inside the existing composer, above attachments and the textarea. It should feel like part of the input flow rather than a modal.

The choices are vertically stacked full-width buttons so they are easy to scan and tap:

```text
ORION 请求：创建并运行一个 Bug 排查工作流
confirm · 2 个动作需要确认

[本会话始终允许同类权限]
[允许本次]
[驳回]
```

The visual style follows the existing ORX terminal UI: dark background, restrained borders, compact monospace labels, and no decorative card nesting.

## Data Flow

1. User enters `@orion ...`.
2. `draftOrionWorkflow` creates a workflow draft.
3. `createOrionActionPlan` creates typed ORION actions.
4. App stores `orionPendingPlan`.
5. If the plan is already covered by session allowance, App executes it immediately.
6. Otherwise, composer renders the permission request.
7. User chooses an option or types feedback.
8. App executes, allows for session, or cancels the plan.

## Component Shape

Keep the implementation local to `App.tsx` for this iteration to avoid premature abstraction. Add helper functions for:

- Highest risk calculation.
- Risk count summary.
- Session allowance checks.
- Permission option handling.

Add tests in a small utility module only if logic grows beyond simple UI state. Existing `orionActions.test.ts` already covers grouping and risk mapping.

## Error Handling

If execution fails after approval, ORCH error handling remains responsible for surfacing the failure in chat, logs, and the right output panel.

If the user starts a normal workflow while an ORION plan is pending, the pending plan should be cancelled first unless the user explicitly approves it.

## Verification

Run:

```powershell
npm --cache D:\npm-cache run workflow:selftest
npm --cache D:\npm-cache run build
```

Rust tests are not required for this UI-only change unless Tauri commands are touched.
