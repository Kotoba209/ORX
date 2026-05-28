# ORX Client UI Design Guidelines

## Design Goal

ORX should feel like a lightweight local Agent workspace: calm, focused, and precise. The client uses a modern macOS-inspired light UI with soft shadows, restrained radius, clear hierarchy, and generous spacing. It must remain a working tool, not a landing page or decorative demo.

The UI should prioritize these tasks:

- Chat with ORION to describe goals, adjust workflows, and confirm actions.
- Browse the current workspace, sessions, workflows, and Agent roles.
- Inspect Agent output, workflow nodes, project context, and project files.
- Approve local actions requested by ORION or ORCH.
- Understand whether a workflow is idle, planning, waiting for approval, running, stopped, failed, or complete.

## Layout

Use a three-zone application shell:

1. Left sidebar: navigation, workspaces, recent sessions, workflows, and Agent entry points.
2. Main area: ORION conversation and workflow execution.
3. Right inspector: output, context, project files, and action details.

Recommended dimensions:

- Sidebar width: 280px to 340px.
- Inspector width: 360px to 460px when expanded.
- Main area: flexible, with the largest share of space.
- App background: light gray.

Avoid dark full-app backgrounds, decorative gradients, large hero sections, nested cards, and hidden layout reservations that make the conversation area feel squeezed.

## Visual Style

The style reference is a modern macOS AI workspace, close to Linear, Raycast, Codex desktop, and quiet native desktop tools.

Use:

- Light neutral backgrounds.
- White or near-white surfaces.
- Soft borders.
- Soft shadows only for floating elements.
- Blue-violet accent for active and primary states.
- Orange only for approval or risk states.
- Red only for failure or dangerous actions.

Avoid:

- Large dark surfaces.
- Heavy borders.
- Neon gradients.
- Glassmorphism.
- Decorative blobs or orbs.
- Marketing-page composition.
- Card inside card layouts.
- Unreadably pale gray headings or labels.

## Color Tokens

Prefer a small token set:

```css
--app-bg: #f6f6f7;
--surface: #ffffff;
--surface-muted: #f0f0f2;
--surface-soft: #fafafa;
--border: #e5e5e8;
--border-strong: #d8d8de;

--text-primary: #1f1f23;
--text-secondary: #6f6f78;
--text-muted: #a0a0aa;

--accent: #5b5cf6;
--accent-soft: #ececff;
--accent-border: #c8c9ff;

--warning: #f59e0b;
--warning-soft: #fff7e6;

--danger: #ef4444;
--danger-soft: #fff1f1;

--success: #22c55e;
--success-soft: #edfdf3;
```

Rules:

- Primary actions use `--accent`.
- Hover states may use `--accent-soft`.
- Danger buttons use white or `--danger-soft` by default, and stronger red only on hover or active state.
- Text headings use `--text-primary`; do not use `#fafafa`, `#f7f7f7`, or other near-white text on white panels.

## Radius Tokens

Keep radius consistent:

```css
--radius-xs: 6px;
--radius-sm: 10px;
--radius-md: 16px;
--radius-lg: 22px;
--radius-xl: 28px;
--radius-pill: 999px;
```

Usage:

- Small buttons, labels, inline code: 6px to 10px.
- List items, inputs, compact panels: 12px to 16px.
- Floating panels and approval surfaces: 18px to 24px.
- Composer input: 24px to 28px.

Do not make every element pill-shaped. Large radii are reserved for Composer and floating panels.

## Shadow Tokens

Use subtle shadows:

```css
--shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.04);
--shadow-md: 0 8px 24px rgba(15, 15, 20, 0.08);
--shadow-lg: 0 20px 60px rgba(15, 15, 20, 0.12);
```

Do not use heavy black shadows.

## Left Sidebar

The left sidebar should closely follow the current light reference design:

- Background: `#fbfbfc` or `#f7f7f8`.
- No decorative macOS traffic-light dots unless they are real window controls.
- Section title uses uppercase `WORKSPACES`, small text, gray color, and increased letter spacing.
- Top navigation entries use compact line icons and text.
- Workspace rows use a folder icon, project name, and muted path.
- Recent sessions and workflows use quiet list rows.
- Active item uses a soft blue-violet background or soft gray background.
- Active item may use a restrained blue-violet inset border.
- The project title row may reveal the add button when the row is hovered, not only when hovering the button itself.
- Do not turn each item into a heavy card.

Suggested hierarchy:

```text
WORKSPACES
  ORX
  D:/CodexProjects/ORX

RECENT SESSIONS
  登录失败 bug 排查
  生成发布说明
  ORION 工作流规划

WORKFLOWS
  Bug Investigation
  Feature Planning
  Release Build
```

Suggested CSS shape:

```css
.sidebar {
  width: 320px;
  background: #fbfbfc;
  border-right: 1px solid #ececf0;
  padding: 20px 22px;
}

.sidebar-section-title {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.14em;
  color: #a2a2aa;
}

.sidebar-item {
  border-radius: 16px;
  padding: 12px 14px;
  color: #34343a;
}

.sidebar-item.active {
  background: #eeeeff;
  color: #4f46e5;
  box-shadow: inset 0 0 0 1px #cfd0ff;
}
```

## Main Area

The main area is the ORION conversation and workflow execution stage.

Structure:

```text
Top status line
Conversation / workflow content
Bottom Composer
```

The main content should feel like a focused document/chat workspace:

- Keep content centered with a max width around 900px to 1080px.
- Use light gray app background.
- Use white rounded containers only for meaningful output, code, plans, or approval surfaces.
- User messages align right.
- ORION and ORCH messages align left.
- Status bubbles must remain horizontal and readable; never let text wrap one character per line.
- Avoid filling the screen with separate decorative cards.
- Avoid hidden layout reservations such as `calc(100% - 372px)` for floating panels. If an element floats, it must not reduce the main content width.

## Top Bar

The top bar should show current state without visual noise:

- Current project.
- Current ORION session or workflow.
- Provider/model when relevant.
- Permission mode when relevant.
- Search or settings only when the control has a real current use.

Recommended height: 56px to 72px.

Do not keep placeholder top buttons such as `上下文` or `Settings` if the right inspector already provides those views.

## ORION Message Design

Message types must be visually distinguishable:

- User message.
- ORION recommendation.
- ORION action plan.
- ORCH execution update.
- Agent output.
- Permission approval request.
- Error, stopped, failed, or complete state.

Rules:

- User messages align right.
- ORION messages align left or use a centered content block.
- Action plans must be structured lists, not raw log text.
- Agent output should be collapsible or visually grouped by workflow node.
- Workflow state should clearly show pending, running, waiting for approval, done, failed, skipped, and stopped.
- Do not let floating workflow progress overlap the readable part of message bubbles.

## Composer

The bottom Composer should follow the Codex-like interaction model:

- Fixed near the bottom of the main area.
- White background.
- Radius: 24px to 28px.
- Soft shadow.
- Default height around 112px to 140px.
- Auto-grow when text is long.
- Left side: attachment/file action when available.
- Lower helper text: current target or active workflow.
- Right side: primary send or stop button.

State rules:

- Idle: show Send.
- ORION thinking: show loading state.
- Workflow running: replace Send with Stop in the same position.
- Approval pending: surface approval options above Composer.
- Dragging attachments: highlight Composer border.

Button rules:

- Send and Stop should be visually similar in size, around `36px x 36px`.
- Stop uses a small centered CSS-drawn square. The square must be smaller than the button and visually centered.
- Stop default state uses a light danger treatment; hover may use stronger red with white icon.
- Do not use oversized dark-red circular stop buttons.

## Permission, Memory, And Form UI

Permission approval should appear above the Composer, similar to Codex action approval, not as a blocking full-screen modal.

Structure:

```text
ORION 请求执行以下动作
保存工作流 / 挂载 skill / 运行命令 / 推送代码
[本次会话始终允许同类权限]
[允许本次]
[驳回]
[其他说明...]
```

Rules:

- Use a white floating panel.
- Radius: 20px to 24px.
- Options must be vertically stacked.
- Risk level appears as a small tag.
- Do not use a full-screen overlay.
- Do not hide the conversation while approval is pending.
- "Always allow in this session" only applies to the same permission class.
- Memory candidate panels use styled inputs and textareas, not browser-default form controls.
- Input focus uses a blue-violet border and subtle focus ring.
- Save memory uses the theme purple primary button.
- Ignore/dismiss uses a red danger outline or soft red background.

## Workflow Node Display

Workflow nodes should show process state clearly.

Each node should display:

- Node name.
- Agent role.
- Status.
- Input summary.
- Output summary.
- ORION node-level instruction, if present.
- Duration.

Status colors:

- Pending: gray.
- Running: blue-violet.
- Waiting approval: orange.
- Done: green.
- Failed: red.
- Stopped: gray with a stopped icon.

Use a timeline or clean list. Do not over-card every node.

## Floating Workflow Progress

The workflow progress panel is a floating assistant surface, not a layout column.

Behavior:

- Show it only when a workflow is active and the right inspector is collapsed.
- Hide it when the right inspector is expanded.
- Hide or relocate it when permission, approval, memory, or config surfaces are open.
- It must not reserve width in the main conversation layout.
- It must not squeeze the conversation bubbles to the left.
- At narrow widths, hide it or move it above the composer instead of overlapping messages.

Visual rules:

- White compact panel with soft border and shadow.
- Radius: 22px to 28px.
- Header shows workflow name and progress count.
- Completed nodes use green check state.
- Running nodes use the accent state.
- Pending nodes use muted gray state.

Implementation guardrail:

```css
.workflow-progress-float {
  position: fixed;
  right: 72px;
  top: 88px;
  width: min(420px, calc(100vw - 48px));
  z-index: 20;
}

.inspector-expanded .workflow-progress-float {
  display: none;
}
```

Do not pair this with hidden main-content padding or width subtraction.

## Right Inspector

The right inspector keeps three primary tabs:

1. Output.
2. Context.
3. Project Files.

The right inspector must be collapsible from a compact control in the top-right area of the app shell, similar to the Codex client interaction. Collapse and expand must feel smooth, not like a hard show/hide toggle.

Behavior requirements:

- Provide a top-right icon button to collapse or expand the inspector.
- The button should sit with other shell controls, not inside the inspector content body.
- The button hover state uses theme purple background and white icon/text.
- When expanded, the inspector uses its normal width: 360px to 460px.
- When collapsed, the inspector should shrink to a compact rail or disappear into the right edge while preserving a visible restore control.
- The main area should smoothly reclaim or release space during the transition.
- The transition should animate width, opacity, and subtle content translation.
- Do not use `display: none` as the primary collapse mechanism.
- Do not abruptly unmount inspector content before the closing animation finishes.
- Respect reduced motion preferences.

Suggested interaction model:

```text
Expanded:
[main content] [right inspector 420px]

Collapsed:
[main content expands] [small right-edge restore control]
```

Suggested CSS pattern:

```css
.app-shell {
  display: grid;
  grid-template-columns: var(--sidebar-width) minmax(0, 1fr) var(--inspector-width);
  transition: grid-template-columns 220ms ease;
}

.app-shell.inspector-collapsed {
  grid-template-columns: var(--sidebar-width) minmax(0, 1fr) 44px;
}

.inspector {
  overflow: hidden;
  opacity: 1;
  transform: translateX(0);
  transition:
    opacity 180ms ease,
    transform 220ms ease;
}

.app-shell.inspector-collapsed .inspector-content {
  opacity: 0;
  transform: translateX(12px);
  pointer-events: none;
}

@media (prefers-reduced-motion: reduce) {
  .app-shell,
  .inspector,
  .inspector-content {
    transition: none;
  }
}
```

The collapsed rail should remain visually quiet: a small rounded button with an icon is enough. Avoid a large vertical tab or noisy label.

### Output Tab

Show:

- Current run status.
- Current node.
- ORION running recommendations.
- Current workflow summary.
- Node detailed output.
- Recent Agent output.
- System logs.
- Duration metrics.

Rules:

- Metrics are compact chips.
- ORION recommendations, node details, recent output, and system logs are collapsible.
- Collapsed rows should be about 44px to 48px high.
- Collapsed row content is vertically centered: title on the left, count if needed, and `展开` on the right.
- Expanded rows must not clip content or cover following panels.
- Only collapsed state may use overflow clipping.
- Current workflow summary must not hard-clip text; use line clamp only when paired with a clear expand affordance.
- Logs must be layered by importance. Do not give raw logs and user-facing summaries the same visual weight.
- Headings and recommendation titles use `--text-primary`.

### Context Tab

Show:

- Project profile.
- Detected stack.
- `ORX.md` / `AGENTS.md` recognition result.
- Relevant memory rules.
- Current workflow context.
- Current ORION plan.

### Project Files Tab

Show:

- File tree.
- Files currently included in context.
- Important files.
- Expand/collapse state.

Rules:

- Match the reference file-list direction: clean white panel, line icons, compact rows.
- Folder/file icons are black line icons by default and may use accent purple on hover or selected state.
- Use explicit row columns for caret, icon, label, and tag.
- Directory and file names must stay on the same row as their icon.
- Never let labels wrap underneath the icon or display as one character per line.
- Long names use ellipsis.
- Right-click action menu should float above the file row and use a white rounded panel.

## Icons

Use `lucide-react` icons when available.

Recommended icons:

- `Folder`
- `Search`
- `Settings`
- `Send`
- `StopCircle`
- `Play`
- `Check`
- `X`
- `AlertTriangle`
- `FileText`
- `Bot`
- `Workflow`
- `Terminal`
- `Database`
- `Shield`
- `Clock`
- `Copy`
- `Download`

Rules:

- Prefer lucide for general UI.
- Local inline SVG line icons are allowed for the project file tree when lucide does not match the desired compact folder/file style.
- Do not use emoji as functional icons.
- Icon-only buttons must have an accessible label or title.

App icon rules:

- Use the ORX theme purple background, close to `#5b5cf6`.
- The mark and word shape should be pure white.
- Avoid 3D lettering, glow, chromatic edges, and colored borders.
- Keep the icon readable at 16px, 32px, and 256px.
- Regenerate Tauri icons from `src-tauri/icons/orx-source-1024.png` after changing the source icon.

## Typography

Recommended UI font:

```css
font-family:
  Inter,
  ui-sans-serif,
  system-ui,
  -apple-system,
  BlinkMacSystemFont,
  "Segoe UI",
  sans-serif;
```

Recommended code font:

```css
font-family:
  "JetBrains Mono",
  "SFMono-Regular",
  Consolas,
  monospace;
```

Sizes:

- Page title: 26px to 32px.
- Section title: 16px to 18px.
- Body: 14px to 16px.
- Helper text: 12px to 13px.
- Log/code: 13px to 14px.

Do not scale font size with viewport width. Avoid negative letter spacing.

## Motion

Use restrained motion only:

- Hover: subtle background or border change.
- Active press: scale to 0.98.
- Floating panel entry: opacity and slight translateY.
- Inspector collapse/expand: width plus opacity/translate for spatial continuity.
- Loading: small spinner or pulse.

Avoid bounce, dramatic transitions, decorative animation, and instant hard show/hide behavior for major panels.

## ORX Feature Mapping

Map current ORX features like this:

- ORION conversation: main area.
- ORION action plan: main message block and inspector details.
- ORCH execution: main workflow state and right-side output logs.
- Floating workflow progress: only when inspector is collapsed.
- Workflow list: left sidebar.
- Project files: right inspector.
- Project profile: context tab.
- Permission approval: floating panel above Composer.
- Stop workflow: same position as Send button when running.
- Provider/model settings: settings surface or top status controls when relevant.
- Memory rules: context tab and memory candidate surface.
- Skills/plugins: visible inside action plans.

## Implementation Rules

When modifying UI:

- Do not add new business capabilities unless explicitly requested.
- Do not change command semantics.
- Do not break ORION, ORCH, workflow execution, approval, or project scanning logic.
- Prefer component structure and CSS improvements.
- Prefer deleting outdated dark-theme conflicts instead of piling more overrides onto them.
- Keep TypeScript types clear.
- Important states must be visible: idle, thinking, waiting approval, running, stopped, failed, complete.
- Verify with `npm --cache D:\npm-cache run build` after UI edits.
- For workflow-adjacent UI edits, also run `npm --cache D:\npm-cache run workflow:selftest`.
- Vite dev preview uses port `5178` with HMR port `5179`; avoid returning to blocked ports `1420` and `1421`.

## First UI Pass Priority

The first UI pass is display-focused:

1. Rebuild the light application shell.
2. Redesign the left sidebar.
3. Redesign the bottom Composer.
4. Redesign permission and memory surfaces.
5. Improve the right inspector hierarchy.
6. Make the inspector collapse/expand smooth.
7. Make floating workflow progress non-invasive.
8. Improve project file tree display.
9. Normalize app icon assets.

## Prompt For Future AI UI Work

Use this prompt when asking another AI model to continue ORX UI work:

```text
You are modifying the ORX client UI. Do not add business features unless explicitly requested. Improve layout, visual hierarchy, component structure, interaction states, and display quality while preserving existing ORION, ORCH, workflow, permission approval, project files, context, logs, provider, memory, and skill/plugin behavior.

Use a light macOS/Codex-style AI workspace as the design direction: a soft left sidebar with WORKSPACES title, navigation rows, workspace rows, recent sessions, and workflow entries; a central ORION conversation and workflow execution stage; a large rounded Composer at the bottom; and a collapsible right Inspector with Output, Context, and Project Files tabs.

Visual requirements: light gray app background, white surfaces, soft shadows, restrained radii, blue-violet accent, orange for approval/risk, red for failure. Avoid dark full-app backgrounds, gradient backgrounds, decorative blobs, marketing hero sections, nested cards, and unreadably pale text.

Interaction requirements: right Inspector collapse/expand must animate smoothly. The floating workflow progress panel must only appear when the inspector is collapsed, must not reserve layout width, and must not cover readable conversation content. Send and Stop buttons should share the same compact size. Forms and memory candidate surfaces must use styled inputs and theme-colored actions instead of browser-default controls.

Project files should use compact line-style folder/file icons, same-row labels, ellipsis for long names, and a clean white panel. App icons should use the ORX theme purple background with a pure white mark, without 3D lettering, glow, or colored borders.

Strictly follow AGENTS.md. Run `npm --cache D:\npm-cache run build` after changes. For workflow-adjacent UI changes, also run `npm --cache D:\npm-cache run workflow:selftest`.
```
