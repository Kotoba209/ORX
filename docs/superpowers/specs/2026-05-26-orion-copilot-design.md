# ORION Copilot Design

## Goal

Add **ORION** as a high-permission conversational copilot inside ORX. ORION can talk freely with the user, design and mutate workflows, assign capabilities to workflow nodes, run workflows through ORCH Core, inspect results, and perform controlled client actions such as reading project files, writing generated artifacts, running whitelisted commands, building releases, and performing git operations.

ORION must feel powerful, but its power must flow through a typed action layer so every meaningful client mutation is visible, auditable, and gated by risk level.

## Role Definition

**Code name:** ORION

**Meaning:** ORX Reasoning & Intervention Operator Node

ORION is not a workflow step Agent like PD, DEV, ARCH, or QA. It sits above ORCH Core:

```text
User
  <-> ORION conversational copilot
        -> ORION Action Registry
        -> ORION Action Executor
        -> ORCH Core / config stores / local project / release tooling / git
```

ORION decides what should happen. ORCH Core continues to execute workflows predictably.

## Permission Levels

ORION actions use three permission levels.

### Level 1: Direct

Safe inspection and draft actions can run immediately.

- `project.inspect`
- `workflow.recommend`
- `workflow.draft`
- `memory.search`
- `skill.list`
- `file.readProjectFile`

### Level 2: Confirm

Actions that mutate local ORX state, write artifacts, run local commands, or build releases require user confirmation before execution.

- `workflow.create`
- `workflow.update`
- `workflow.clone`
- `workflow.delete`
- `workflow.setDefault`
- `workflow.run`
- `skill.attach`
- `skill.detach`
- `memory.append`
- `memory.update`
- `file.writeGeneratedArtifact`
- `command.runWhitelisted`
- `release.build`

### Level 3: Strong Confirm

Actions that affect git history, tags, or remotes require explicit strong confirmation.

- `git.commit`
- `git.tag`
- `git.push`

Strong confirmation must show the action summary, target repository, affected files or refs, and the exact command-like operation.

## Action Model

Each ORION action is represented as data:

```ts
type OrionRiskLevel = "direct" | "confirm" | "strong-confirm";

type OrionAction = {
  id: string;
  kind: OrionActionKind;
  risk: OrionRiskLevel;
  title: string;
  summary: string;
  payload: Record<string, unknown>;
};
```

The model returns an action plan. The client validates risk and executes actions through first-party code, not arbitrary model output.

## First Version Action Kinds

```text
project.inspect
workflow.recommend
workflow.draft
workflow.create
workflow.update
workflow.run
skill.list
skill.attach
memory.search
file.readProjectFile
file.writeGeneratedArtifact
command.runWhitelisted
release.build
git.commit
git.tag
git.push
```

## Safety Boundaries

### File Reads

`file.readProjectFile` can read files only inside a registered project root. It must reject path traversal and very large files.

### Artifact Writes

`file.writeGeneratedArtifact` writes only to ORX task archives, `generated/`, or the configured artifact output directory. It does not directly edit source files in user projects.

### Commands

`command.runWhitelisted` can run only known safe commands configured by ORX, such as:

```text
npm run workflow:selftest
npm run build
cargo test
npm run tauri -- build
```

The command, cwd, timeout, and reason are shown before execution.

### Release Build

`release.build` wraps the existing Tauri build command and returns generated artifact paths.

### Git

Git actions are Level 3:

- `git.commit` requires a message and staged or explicit files.
- `git.tag` requires a tag name and target commit.
- `git.push` requires remote, branch or tag, and explicit confirmation.

## Capability Assignment

ORION can assign capabilities to workflow nodes by editing workflow metadata:

```json
{
  "stage": "Clarification",
  "owner": "PD Agent",
  "skill_ids": ["trellis"],
  "interaction": "multi-turn",
  "exit_condition": "requirements_ready"
}
```

The first built-in capability set includes:

- `trellis`
- `workflow-designer`
- `bug-investigation`
- `code-review`
- `test-planning`
- `verification-gate`
- `release-manager`
- `memory-miner`

## Interaction Flow

Example:

```text
User: 我想查一个 bug。

ORION:
我建议创建 Bug Investigation 工作流：
1. PM / Intake
2. PD / Clarification，挂载 trellis
3. DEV / BugTrace，挂载 bug-investigation
4. QA / ReproductionTest，挂载 test-planning

准备执行：
- workflow.create
- skill.attach trellis
- skill.attach bug-investigation
- workflow.run

是否执行？
```

If the user confirms, the action executor saves the workflow and starts ORCH Core.

After results:

```text
ORION:
DEV 已给出修复方向，但当前流程没有架构审查。
建议插入 ARCH / CodeReview 并挂载 code-review capability。
是否修改工作流并从 CodeReview 继续？
```

## UI Shape

First version uses the existing middle conversation column, with ORION-specific messages and a right-side action preview in the output inspector. A separate ORION panel can be added later if the workflow grows too dense.

## Persistence

Saved ORION-created workflows use the existing workflow config store. ORION action history can initially be appended to chat/log lines and later moved into a dedicated `orion_actions.json` audit file.

## Testing

The first implementation should be test-first:

- action registry permission mapping
- action plan confirmation grouping
- safe project file path checks
- workflow draft generation from a task
- capability attachment to workflow steps
- command whitelist acceptance/rejection
- release/git action risk classification

## Non-Goals For First Version

- No arbitrary shell execution.
- No direct source-file mutation in user projects.
- No remote plugin marketplace.
- No fully autonomous push or release without confirmation.
- No vector-memory retrieval for ORION action history.
