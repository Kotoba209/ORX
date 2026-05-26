# ORION Action Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render a right-side ORION workflow and action preview while a composer permission request is pending.

**Architecture:** Add small formatting helpers beside ORION permission logic, then render the preview in `App.tsx` at the top of the output inspector. The composer remains the only approval surface.

**Tech Stack:** React, TypeScript, Node test runner, existing ORX CSS.

---

## File Structure

- Modify `src/orionPermission.ts`: add payload formatting for action preview.
- Modify `src/orionPermission.test.ts`: test payload formatting.
- Modify `src/App.tsx`: import grouped actions and render ORION preview helpers.
- Modify `src/App.css`: style right-side preview rows and strong-confirm payload details.

---

### Task 1: Action Preview Formatting Helper

**Files:**
- Modify: `D:\CodexProjects\ORX\src\orionPermission.ts`
- Modify: `D:\CodexProjects\ORX\src\orionPermission.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `src/orionPermission.test.ts`:

```ts
import { formatOrionPayloadPreview } from "./orionPermission.ts";

test("formats compact ORION payload preview rows", () => {
  assert.deepEqual(formatOrionPayloadPreview({ message: "release", count: 2 }), [
    ["message", "release"],
    ["count", "2"],
  ]);
});

test("summarizes nested ORION payload values", () => {
  assert.deepEqual(formatOrionPayloadPreview({ workflow: { id: "wf" }, files: ["a.ts", "b.ts"] }), [
    ["workflow", "{...}"],
    ["files", "a.ts, b.ts"],
  ]);
});

test("returns a fallback row for empty ORION payload", () => {
  assert.deepEqual(formatOrionPayloadPreview({}), [["参数", "等待执行前生成具体参数"]]);
});
```

- [ ] **Step 2: Implement helper**

Add to `src/orionPermission.ts`:

```ts
export function formatOrionPayloadPreview(payload: Record<string, unknown>) {
  const entries = Object.entries(payload);
  if (entries.length === 0) {
    return [["参数", "等待执行前生成具体参数"]];
  }
  return entries.map(([key, value]) => {
    if (Array.isArray(value)) {
      return [key, value.map((item) => String(item)).join(", ") || "[]"];
    }
    if (value && typeof value === "object") {
      return [key, "{...}"];
    }
    return [key, String(value)];
  });
}
```

- [ ] **Step 3: Run tests**

Run:

```powershell
npm --cache D:\npm-cache run workflow:selftest
```

Expected: all tests pass.

---

### Task 2: Right-Side ORION Preview

**Files:**
- Modify: `D:\CodexProjects\ORX\src\App.tsx`
- Modify: `D:\CodexProjects\ORX\src\App.css`

- [ ] **Step 1: Import helpers**

In `src/App.tsx`, add `groupOrionActionsByRisk` to the `orionActions` import and add `formatOrionPayloadPreview` to the `orionPermission` import.

- [ ] **Step 2: Add render helpers**

Add local functions before `return` in `App.tsx`:

```tsx
function renderOrionActionPayload(action: OrionAction) {
  if (action.risk !== "strong-confirm") return null;
  return <div className="orion-action-payload">
    {formatOrionPayloadPreview(action.payload).map(([key, value]) => <p key={`${action.id}-${key}`}><span>{key}</span><em>{value}</em></p>)}
  </div>;
}

function renderOrionActionGroups(plan: OrionPendingPlan) {
  const grouped = groupOrionActionsByRisk(plan.actions);
  const groups: OrionRiskLevel[] = ["direct", "confirm", "strong-confirm"];
  return <div className="orion-action-groups">
    {groups.map((risk) => grouped[risk].length > 0 && <section className={`orion-action-group ${risk}`} key={risk}>
      <header><strong>{orionRiskLabel(risk)}</strong><span>{grouped[risk].length} actions</span></header>
      {grouped[risk].map((action) => <article className="orion-action-row" key={action.id}>
        <div><strong>{action.kind}</strong><span>{action.title}</span></div>
        <p>{action.summary}</p>
        {renderOrionActionPayload(action)}
      </article>)}
    </section>)}
  </div>;
}

function renderOrionWorkflowPreview(plan: OrionPendingPlan) {
  return <article className="orion-preview">
    <header>
      <div><strong>ORION Action Preview</strong><span>{plan.workflow.name}</span></div>
      <em>{orionRiskLabel(highestOrionRisk(plan.actions))}</em>
    </header>
    <p className="orion-preview-task">{plan.task}</p>
    <div className="orion-preview-steps">
      {plan.workflow.steps.map((step, index) => <p key={`${step.owner}-${step.stage}-${index}`}><span>{index + 1}</span><strong>{step.owner} / {step.stage}</strong><em>{step.skill_ids?.join(", ") || "no skill"}</em></p>)}
    </div>
    {renderOrionActionGroups(plan)}
  </article>;
}
```

- [ ] **Step 3: Render preview in output inspector**

Inside the `inspectorView === "output"` section, place this after the `run-summary`:

```tsx
{orionPendingPlan && renderOrionWorkflowPreview(orionPendingPlan)}
```

- [ ] **Step 4: Add CSS**

Add compact styles for:

- `.orion-preview`
- `.orion-preview header`
- `.orion-preview-task`
- `.orion-preview-steps`
- `.orion-action-groups`
- `.orion-action-group`
- `.orion-action-row`
- `.orion-action-payload`

- [ ] **Step 5: Run build**

Run:

```powershell
npm --cache D:\npm-cache run build
```

Expected: TypeScript and Vite build pass.

---

### Task 3: Final Verification and Commit

**Files:**
- No new files.

- [ ] **Step 1: Run workflow self-test**

Run:

```powershell
npm --cache D:\npm-cache run workflow:selftest
```

Expected: all tests pass.

- [ ] **Step 2: Run production build**

Run:

```powershell
npm --cache D:\npm-cache run build
```

Expected: build succeeds.

- [ ] **Step 3: Commit**

```powershell
git add src/orionPermission.ts src/orionPermission.test.ts src/App.tsx src/App.css
git commit -m "feat: add orion action preview"
```
