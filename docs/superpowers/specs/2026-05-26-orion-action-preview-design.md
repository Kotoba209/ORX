# ORION Action Preview Design

Date: 2026-05-26

## Goal

Add a right-side ORION preview surface so the user can inspect the workflow draft and action plan before approving the composer permission request.

This complements the composer approval UI. The composer remains the decision point; the right panel is the detail view.

## Scope

This version shows detail only. It does not execute Git, release, shell, or file-write actions beyond the existing workflow save/run behavior.

## User Experience

When `orionPendingPlan` exists and the right inspector is on `输出`, the top of the output panel shows an ORION preview section.

The section contains:

- Workflow name and user task.
- Workflow steps in order, including owner, stage, and attached skills.
- Action plan grouped by risk:
  - `direct`
  - `confirm`
  - `strong-confirm`
- Each action row shows action kind, title, summary, and risk label.
- Strong-confirm actions show a compact warning detail area with available payload fields.

The preview does not include approval buttons. Approval remains in the composer vertical options:

- `本会话始终允许同类权限`
- `允许本次`
- `驳回`

## Strong Confirmation Detail

For `strong-confirm` actions, show a detail block even if payload data is sparse.

Fields are displayed as key-value rows from `action.payload`, excluding large nested objects where possible. If payload is empty, show `等待执行前生成具体参数`.

Examples:

- `git.commit`: message, files
- `git.tag`: tag, target
- `git.push`: remote, branch
- `release.build`: version, artifacts

Current ORION workflow drafts may not include these actions yet, but the UI should already support them.

## Data Flow

1. User enters `@orion ...`.
2. `App.tsx` creates `orionPendingPlan`.
3. Composer renders the permission request.
4. Right output panel renders `orionPendingPlan` details before logs and metrics.
5. User approves or rejects from the composer.
6. Preview disappears when `orionPendingPlan` clears.

## Implementation Shape

Keep rendering in `App.tsx` for this iteration, using small local render helpers:

- `renderOrionWorkflowPreview`
- `renderOrionActionGroups`
- `renderOrionActionPayload`

Use existing `groupOrionActionsByRisk` plus `orionRiskLabel` to avoid duplicating risk logic.

## Visual Style

The preview should match the existing right inspector:

- compact rows
- restrained borders
- 8px or smaller radius
- no nested card-heavy layout
- readable monospace labels

## Verification

Run:

```powershell
npm --cache D:\npm-cache run workflow:selftest
npm --cache D:\npm-cache run build
```
