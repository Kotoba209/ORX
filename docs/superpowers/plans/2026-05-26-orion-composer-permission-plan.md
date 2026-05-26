# ORION Composer Permission Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Codex-style ORION permission request inside the composer with vertical approval choices.

**Architecture:** Keep ORION plan generation in `App.tsx`, but move reusable risk/allowance logic into a focused utility module. The composer renders the pending permission request above the textarea, while the right inspector remains the detailed preview surface.

**Tech Stack:** React, TypeScript, Vite, Node test runner, existing ORX CSS.

---

## File Structure

- Create `src/orionPermission.ts`: risk ordering, highest-risk calculation, risk counts, session allowance checks, and copy helpers.
- Create `src/orionPermission.test.ts`: unit tests for the new permission helpers.
- Modify `src/App.tsx`: add session allowance state, render composer permission request, and handle vertical option actions.
- Modify `src/App.css`: add compact dark styles for the inline ORION permission request.

---

### Task 1: ORION Permission Helpers

**Files:**
- Create: `D:\CodexProjects\ORX\src\orionPermission.ts`
- Create: `D:\CodexProjects\ORX\src\orionPermission.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/orionPermission.test.ts`:

```ts
import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { OrionAction } from "./orionActions.ts";
import {
  actionRiskSummary,
  highestOrionRisk,
  isOrionPlanAllowedBySession,
  orionRiskLabel,
} from "./orionPermission.ts";

function action(risk: OrionAction["risk"]): OrionAction {
  return {
    id: risk,
    kind: risk === "strong-confirm" ? "git.push" : risk === "confirm" ? "workflow.run" : "workflow.draft",
    risk,
    title: risk,
    summary: risk,
    payload: {},
  };
}

test("finds highest risk in an ORION action plan", () => {
  assert.equal(highestOrionRisk([action("direct"), action("confirm")]), "confirm");
  assert.equal(highestOrionRisk([action("confirm"), action("strong-confirm")]), "strong-confirm");
  assert.equal(highestOrionRisk([]), "direct");
});

test("summarizes risk counts for composer copy", () => {
  assert.equal(actionRiskSummary([action("direct"), action("confirm"), action("confirm")]), "direct 1 · confirm 2");
});

test("checks session allowance by risk level", () => {
  assert.equal(isOrionPlanAllowedBySession("confirm", "direct"), true);
  assert.equal(isOrionPlanAllowedBySession("confirm", "confirm"), true);
  assert.equal(isOrionPlanAllowedBySession("confirm", "strong-confirm"), false);
  assert.equal(isOrionPlanAllowedBySession("strong-confirm", "strong-confirm"), true);
  assert.equal(isOrionPlanAllowedBySession(null, "confirm"), false);
});

test("labels risks in Chinese for the composer", () => {
  assert.equal(orionRiskLabel("direct"), "直接执行");
  assert.equal(orionRiskLabel("confirm"), "需要确认");
  assert.equal(orionRiskLabel("strong-confirm"), "强确认");
});
```

- [ ] **Step 2: Run the failing test**

Run:

```powershell
npm --cache D:\npm-cache run workflow:selftest
```

Expected: the new test fails because `src/orionPermission.ts` does not exist.

- [ ] **Step 3: Implement the helper module**

Create `src/orionPermission.ts`:

```ts
import type { OrionAction, OrionRiskLevel } from "./orionActions";

const riskRank: Record<OrionRiskLevel, number> = {
  direct: 0,
  confirm: 1,
  "strong-confirm": 2,
};

const riskLabels: Record<OrionRiskLevel, string> = {
  direct: "直接执行",
  confirm: "需要确认",
  "strong-confirm": "强确认",
};

export function highestOrionRisk(actions: OrionAction[]): OrionRiskLevel {
  return actions.reduce<OrionRiskLevel>((highest, action) => (
    riskRank[action.risk] > riskRank[highest] ? action.risk : highest
  ), "direct");
}

export function isOrionPlanAllowedBySession(allowedRisk: OrionRiskLevel | null, planRisk: OrionRiskLevel) {
  if (!allowedRisk) return planRisk === "direct";
  return riskRank[allowedRisk] >= riskRank[planRisk];
}

export function actionRiskSummary(actions: OrionAction[]) {
  const counts = actions.reduce<Record<OrionRiskLevel, number>>(
    (nextCounts, action) => {
      nextCounts[action.risk] += 1;
      return nextCounts;
    },
    { direct: 0, confirm: 0, "strong-confirm": 0 },
  );
  return (Object.entries(counts) as [OrionRiskLevel, number][])
    .filter(([, count]) => count > 0)
    .map(([risk, count]) => `${risk} ${count}`)
    .join(" · ");
}

export function orionRiskLabel(risk: OrionRiskLevel) {
  return riskLabels[risk];
}
```

- [ ] **Step 4: Run tests**

Run:

```powershell
npm --cache D:\npm-cache run workflow:selftest
```

Expected: all workflow self-tests pass.

- [ ] **Step 5: Commit**

```powershell
git add src/orionPermission.ts src/orionPermission.test.ts
git commit -m "feat: add orion permission helpers"
```

---

### Task 2: Composer Permission Request UI

**Files:**
- Modify: `D:\CodexProjects\ORX\src\App.tsx`
- Modify: `D:\CodexProjects\ORX\src\App.css`

- [ ] **Step 1: Import helper functions and add state**

In `src/App.tsx`, import:

```ts
import { actionRiskSummary, highestOrionRisk, isOrionPlanAllowedBySession, orionRiskLabel } from "./orionPermission";
```

Add state near `orionPendingPlan`:

```ts
const [orionSessionAllowedRisk, setOrionSessionAllowedRisk] = useState<OrionRiskLevel | null>(null);
```

Change the existing type import from `orionActions` to include `OrionRiskLevel`.

- [ ] **Step 2: Add permission handlers**

In `App.tsx`, add these functions near `executeOrionPendingPlan`:

```ts
async function approveOrionPendingPlan(alwaysAllowSession: boolean) {
  if (!orionPendingPlan) return;
  const planRisk = highestOrionRisk(orionPendingPlan.actions);
  if (alwaysAllowSession) {
    setOrionSessionAllowedRisk(planRisk);
  }
  await executeOrionPendingPlan(orionPendingPlan, alwaysAllowSession ? "session" : "once");
}

function rejectOrionPendingPlan() {
  if (!orionPendingPlan) return;
  setChatLines((lines) => [...lines, "你：驳回", "ORION：已取消这份动作计划。你可以继续输入新的目标或修改意见。"]);
  setLogLines((lines) => [...lines, `ORION reject: ${orionPendingPlan.workflow.id}`]);
  setOrionPendingPlan(null);
  setRequirement("");
}
```

Update `executeOrionPendingPlan` signature:

```ts
async function executeOrionPendingPlan(plan: OrionPendingPlan, approvalMode: "once" | "session" | "text" = "text") {
```

Use `approvalMode` in the chat line:

```ts
const approvalLine = approvalMode === "session" ? "本会话始终允许同类权限" : approvalMode === "once" ? "允许本次" : "同意";
setChatLines((lines) => [...lines, `你：${approvalLine}`, `ORION：已保存工作流「${plan.workflow.name}」，现在交给 ORCH Core 执行。`]);
```

- [ ] **Step 3: Auto-run covered plans**

In `createOrionPlan`, after actions are created, add:

```ts
const planRisk = highestOrionRisk(actions);
const pendingPlan = { task, workflow, actions };
if (isOrionPlanAllowedBySession(orionSessionAllowedRisk, planRisk)) {
  setChatLines((lines) => [...lines, `你：@orion ${task}`, `ORION：本会话已允许 ${orionRiskLabel(planRisk)}，将直接创建并运行「${workflow.name}」。`]);
  void executeOrionPendingPlan(pendingPlan, "session");
  return;
}
```

Then keep the existing pending-plan flow for plans not covered by allowance.

- [ ] **Step 4: Render vertical composer options**

Inside the composer form, before the attachment tray, render:

```tsx
{orionPendingPlan && <section className="orion-permission-request" aria-label="ORION 权限请求">
  <header>
    <strong>ORION 请求：创建并运行工作流</strong>
    <span>{orionPendingPlan.workflow.name}</span>
  </header>
  <p>{orionRiskLabel(highestOrionRisk(orionPendingPlan.actions))} · {actionRiskSummary(orionPendingPlan.actions)}</p>
  <div className="orion-permission-options">
    <button type="button" onClick={() => { void approveOrionPendingPlan(true); }}>本会话始终允许同类权限</button>
    <button type="button" onClick={() => { void approveOrionPendingPlan(false); }}>允许本次</button>
    <button type="button" className="danger-button" onClick={rejectOrionPendingPlan}>驳回</button>
  </div>
</section>}
```

- [ ] **Step 5: Keep free-form feedback behavior**

Keep the current `orionPendingPlan` branch in `handleComposerSubmit`: approving words still execute, other text cancels the plan and adds a chat message. This preserves the input path for conditional feedback until plan mutation is implemented.

- [ ] **Step 6: Add CSS**

In `src/App.css`, add:

```css
.orion-permission-request {
  display: grid;
  gap: 8px;
  border: 1px solid #2a2a2a;
  border-radius: 8px;
  background: #0a0a0a;
  padding: 10px;
}

.orion-permission-request header {
  display: grid;
  gap: 3px;
}

.orion-permission-request strong {
  color: #f5f5f5;
  font-size: 12px;
}

.orion-permission-request span,
.orion-permission-request p {
  color: #a3a3a3;
  font-size: 12px;
}

.orion-permission-options {
  display: grid;
  grid-template-columns: 1fr;
  gap: 6px;
}

.orion-permission-options button {
  justify-content: flex-start;
  width: 100%;
  text-align: left;
  padding: 8px 10px;
}
```

- [ ] **Step 7: Run build**

Run:

```powershell
npm --cache D:\npm-cache run build
```

Expected: TypeScript and Vite build pass.

- [ ] **Step 8: Commit**

```powershell
git add src/App.tsx src/App.css
git commit -m "feat: add orion composer permission UI"
```

---

### Task 3: Final Verification

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

- [ ] **Step 3: Check git status**

Run:

```powershell
git status --short --branch
```

Expected: clean working tree on `main`, unless release packaging is requested separately.
