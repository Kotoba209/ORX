# ORION Command Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first ORX 0.4.1 slice where ORION can draft, confirm, execute, and summarize safe local project health commands.

**Architecture:** Keep command policy exact-match and split pure assistant planning helpers from React orchestration. `src/orionPlanner.ts` drafts command actions, `src/orionCommandResults.ts` formats execution results, `src-tauri/src/orion_actions.rs` validates and runs whitelisted commands, and `src/App.tsx` sequences approved actions.

**Tech Stack:** React 19, TypeScript 5.8, Tauri 2, Rust, Node test runner.

---

## File Structure

- Modify `src/orionPlanner.ts`: recognize project health/check/build/test requests and draft multiple `command.runWhitelisted` actions.
- Modify `src/orionPlanner.test.ts`: add tests for project health command plans, tool version plans, and assistant routing.
- Create `src/orionCommandResults.ts`: pure helpers for command labels, output previews, success/failure summaries, and whether to stop after a result.
- Create `src/orionCommandResults.test.ts`: unit tests for result formatting and stop behavior.
- Modify `src-tauri/src/orion_actions.rs`: add `rustc -V` and `cargo -V` whitelist support while preserving exact command matching.
- Modify `package.json`: add `src/orionCommandResults.test.ts` to `workflow:selftest`.
- Modify `src/App.tsx`: run approved assistant command actions sequentially, stop after the first non-zero command status, and render structured result text.

## Task 1: Planner Drafts Project Health Commands

**Files:**
- Modify: `src/orionPlanner.ts`
- Modify: `src/orionPlanner.test.ts`

- [ ] **Step 1: Write failing planner tests**

Add these tests to `src/orionPlanner.test.ts`:

```ts
test("assistant response maps project health checks to status selftest and build commands", () => {
  const response = createOrionAssistantResponse("检查项目状态和构建");

  assert.equal(response.mode, "assistant");
  assert.deepEqual(response.actions.map((action) => action.kind), [
    "command.runWhitelisted",
    "command.runWhitelisted",
    "command.runWhitelisted",
  ]);
  assert.deepEqual(response.actions.map((action) => action.payload), [
    {
      program: "git",
      args: ["status", "--short", "--branch"],
      cwd: "",
      request: "检查项目状态和构建",
      command_role: "project-status",
    },
    {
      program: "npm",
      args: ["run", "workflow:selftest"],
      cwd: "",
      request: "检查项目状态和构建",
      command_role: "project-selftest",
    },
    {
      program: "npm",
      args: ["run", "build"],
      cwd: "",
      request: "检查项目状态和构建",
      command_role: "project-build",
    },
  ]);
});

test("assistant response maps tool version checks to exact version commands", () => {
  const response = createOrionAssistantResponse("检查 Node npm Rust Cargo 环境版本");

  assert.deepEqual(response.actions.map((action) => action.payload), [
    { program: "node", args: ["--version"], cwd: "", request: "检查 Node npm Rust Cargo 环境版本", command_role: "node-version" },
    { program: "npm", args: ["--version"], cwd: "", request: "检查 Node npm Rust Cargo 环境版本", command_role: "npm-version" },
    { program: "rustc", args: ["-V"], cwd: "", request: "检查 Node npm Rust Cargo 环境版本", command_role: "rustc-version" },
    { program: "cargo", args: ["-V"], cwd: "", request: "检查 Node npm Rust Cargo 环境版本", command_role: "cargo-version" },
  ]);
});
```

- [ ] **Step 2: Run planner tests and confirm failure**

Run:

```powershell
E:\codex\tools\rtk\rtk.exe npm --prefix E:\code\ORX run workflow:selftest
```

Expected: FAIL because the new command plans are not drafted yet.

- [ ] **Step 3: Implement command plan helpers**

In `src/orionPlanner.ts`, add helpers near `createAssistantActions`:

```ts
function commandPayload(task: string, program: string, args: string[], commandRole: string) {
  return { program, args, cwd: "", request: task, command_role: commandRole };
}

function projectHealthActions(task: string) {
  return [
    createOrionAction("command.runWhitelisted", "Check Git status", "Check the current branch and working tree before running project checks.", commandPayload(task, "git", ["status", "--short", "--branch"], "project-status")),
    createOrionAction("command.runWhitelisted", "Run workflow self-tests", "Run the ORX workflow self-test suite.", commandPayload(task, "npm", ["run", "workflow:selftest"], "project-selftest")),
    createOrionAction("command.runWhitelisted", "Run production build", "Run the TypeScript and Vite production build.", commandPayload(task, "npm", ["run", "build"], "project-build")),
  ];
}

function toolVersionActions(task: string) {
  return [
    createOrionAction("command.runWhitelisted", "Check Node version", "Check the local Node.js version.", commandPayload(task, "node", ["--version"], "node-version")),
    createOrionAction("command.runWhitelisted", "Check npm version", "Check the local npm version.", commandPayload(task, "npm", ["--version"], "npm-version")),
    createOrionAction("command.runWhitelisted", "Check Rust version", "Check the local Rust compiler version.", commandPayload(task, "rustc", ["-V"], "rustc-version")),
    createOrionAction("command.runWhitelisted", "Check Cargo version", "Check the local Cargo version.", commandPayload(task, "cargo", ["-V"], "cargo-version")),
  ];
}

function taskLooksLikeProjectHealthCheck(task: string) {
  return /(health|healthy|status.*build|test.*build|build.*test|check.*project|project.*check|检查.*(项目|状态|构建|测试)|项目.*(状态|构建|测试|健康))/i.test(task);
}

function taskLooksLikeVersionCheck(task: string) {
  return /(version|versions|environment|toolchain|node|npm|rust|cargo|环境|版本|工具链)/i.test(task);
}
```

Then update the start of `createAssistantActions`:

```ts
function createAssistantActions(task: string) {
  if (taskLooksLikeProjectHealthCheck(task)) {
    return projectHealthActions(task);
  }
  if (taskLooksLikeVersionCheck(task)) {
    return toolVersionActions(task);
  }
```

- [ ] **Step 4: Run planner tests and confirm pass**

Run:

```powershell
E:\codex\tools\rtk\rtk.exe npm --prefix E:\code\ORX run workflow:selftest
```

Expected: PASS for the new planner tests and existing tests.

## Task 2: Backend Whitelist Supports Tool Versions

**Files:**
- Modify: `src-tauri/src/orion_actions.rs`

- [ ] **Step 1: Write failing Rust whitelist assertions**

In `validates_whitelisted_commands`, add:

```rust
assert!(validate_whitelisted_command("rustc", &["-V".to_string()]).is_ok());
assert!(validate_whitelisted_command("cargo", &["-V".to_string()]).is_ok());
assert!(validate_whitelisted_command("rustc", &["--version".to_string()]).is_err());
```

- [ ] **Step 2: Run Rust test if the local toolchain can link**

Run:

```powershell
E:\codex\tools\rtk\rtk.exe cargo test
```

Expected: either FAIL on the new assertions before implementation, or fail earlier with the known local GNU linker issue. If the linker issue appears, continue with frontend tests and document the linker blocker.

- [ ] **Step 3: Implement exact whitelist entries**

Change the whitelist section in `src-tauri/src/orion_actions.rs` to:

```rust
let allowed = (normalized_program == "node" && normalized_args == ["--version"])
    || (normalized_program == "npm" && normalized_args == ["--version"])
    || (normalized_program == "rustc" && normalized_args == ["-v"])
    || (normalized_program == "rustc" && normalized_args == ["-v"])
    || (normalized_program == "cargo" && normalized_args == ["-v"])
    || (normalized_program == "git" && normalized_args == ["status", "--short", "--branch"])
```

Then correct the duplicated `rustc` entry to preserve case-insensitive matching from `-V`:

```rust
let allowed = (normalized_program == "node" && normalized_args == ["--version"])
    || (normalized_program == "npm" && normalized_args == ["--version"])
    || (normalized_program == "rustc" && normalized_args == ["-v"])
    || (normalized_program == "cargo" && normalized_args == ["-v"])
    || (normalized_program == "git" && normalized_args == ["status", "--short", "--branch"])
```

Because args are normalized with `to_ascii_lowercase`, frontend `-V` arrives as `-v` for validation.

- [ ] **Step 4: Run available verification**

Run:

```powershell
E:\codex\tools\rtk\rtk.exe npm --prefix E:\code\ORX run workflow:selftest
E:\codex\tools\rtk\rtk.exe npm --prefix E:\code\ORX run build
E:\codex\tools\rtk\rtk.exe cargo test
```

Expected: npm commands PASS. `cargo test` may still fail at linker setup on this machine.

## Task 3: Command Result Formatting Helpers

**Files:**
- Create: `src/orionCommandResults.ts`
- Create: `src/orionCommandResults.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Add failing command result tests**

Create `src/orionCommandResults.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { commandLabel, formatWhitelistedCommandResult, shouldStopAfterCommandResult, type WhitelistedCommandResult } from "./orionCommandResults.ts";

const ok: WhitelistedCommandResult = {
  program: "npm",
  args: ["run", "build"],
  cwd: "E:\\code\\ORX",
  status: 0,
  stdout: "built successfully\n",
  stderr: "",
};

test("formats successful command results with command label and output preview", () => {
  assert.equal(commandLabel(ok), "npm run build");
  assert.match(formatWhitelistedCommandResult(ok), /命令完成：npm run build/);
  assert.match(formatWhitelistedCommandResult(ok), /退出码 0/);
  assert.match(formatWhitelistedCommandResult(ok), /built successfully/);
});

test("formats failed command results and marks them as stopping points", () => {
  const failed = { ...ok, status: 1, stderr: "build failed\n" };

  assert.equal(shouldStopAfterCommandResult(failed), true);
  assert.match(formatWhitelistedCommandResult(failed), /命令失败：npm run build/);
  assert.match(formatWhitelistedCommandResult(failed), /build failed/);
});
```

- [ ] **Step 2: Add the new test file to `workflow:selftest`**

Update `package.json` so the script includes:

```json
"workflow:selftest": "node --test --experimental-strip-types src/workflowState.test.ts src/projectTree.test.ts src/workflowConfig.test.ts src/chatTimeline.test.ts src/workflowStageOptions.test.ts src/workflowRouter.test.ts src/memoryRules.test.ts src/clarificationState.test.ts src/orionActions.test.ts src/orionPlanner.test.ts src/orionPermission.test.ts src/orionCommands.test.ts src/orionRunMonitor.test.ts src/orionCommandResults.test.ts src/workflowRunGuards.test.ts"
```

- [ ] **Step 3: Run selftest and confirm failure**

Run:

```powershell
E:\codex\tools\rtk\rtk.exe npm --prefix E:\code\ORX run workflow:selftest
```

Expected: FAIL because `src/orionCommandResults.ts` does not exist.

- [ ] **Step 4: Implement result helpers**

Create `src/orionCommandResults.ts`:

```ts
export type WhitelistedCommandResult = {
  program: string;
  args: string[];
  cwd: string;
  status: number;
  stdout: string;
  stderr: string;
};

export function commandLabel(result: Pick<WhitelistedCommandResult, "program" | "args">) {
  return [result.program, ...result.args].join(" ");
}

export function commandOutputPreview(result: Pick<WhitelistedCommandResult, "stdout" | "stderr">, maxLength = 1200) {
  const output = `${result.stdout}${result.stderr ? `\n${result.stderr}` : ""}`.trim();
  if (!output) return "命令没有输出。";
  return output.length > maxLength ? `${output.slice(0, maxLength)}\n...输出已截断` : output;
}

export function shouldStopAfterCommandResult(result: Pick<WhitelistedCommandResult, "status">) {
  return result.status !== 0;
}

export function formatWhitelistedCommandResult(result: WhitelistedCommandResult) {
  const label = commandLabel(result);
  const heading = result.status === 0 ? "命令完成" : "命令失败";
  const nextStep = result.status === 0 ? "" : "\n建议：先处理这个失败结果，再继续后续命令或让 ORION 转入工作流排查。";
  return `${heading}：${label}，退出码 ${result.status}，目录 ${result.cwd}\n${commandOutputPreview(result)}${nextStep}`;
}
```

- [ ] **Step 5: Run selftest and confirm pass**

Run:

```powershell
E:\codex\tools\rtk\rtk.exe npm --prefix E:\code\ORX run workflow:selftest
```

Expected: PASS.

## Task 4: Frontend Uses Result Helpers And Stops On Failure

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Import helper functions**

Add near the other imports:

```ts
import { formatWhitelistedCommandResult, shouldStopAfterCommandResult, type WhitelistedCommandResult } from "./orionCommandResults";
```

Remove the local `WhitelistedCommandResult` type from `src/App.tsx`.

- [ ] **Step 2: Stop the assistant action loop on failed command results**

Update `executeOrionAssistantActions`:

```ts
for (const action of pending.actions) {
  try {
    const result = await executeOrionAssistantAction(action);
    setChatLines((lines) => [...lines, `ORION：${result.message}`]);
    setLogLines((lines) => [...lines, `ORION assistant action done: ${action.kind}`, result.message]);
    if (result.stop) {
      setChatLines((lines) => [...lines, "ORION：已停止后续本机助手动作，避免在失败状态下继续执行。"]);
      setLogLines((lines) => [...lines, "ORION assistant action sequence stopped after failed command."]);
      break;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setChatLines((lines) => [...lines, `ORION：动作执行失败：${message}`]);
    setLogLines((lines) => [...lines, `ORION assistant action failed: ${action.kind}`, message]);
    break;
  }
}
```

- [ ] **Step 3: Return structured action execution results**

Change `executeOrionAssistantAction` to return `Promise<{ message: string; stop: boolean }>` and update command handling:

```ts
async function executeOrionAssistantAction(action: OrionAction): Promise<{ message: string; stop: boolean }> {
  if (action.kind === "command.runWhitelisted") {
    if (!canUseTauriCommands()) {
      throw new Error("需要在 Tauri 客户端中执行本机命令；浏览器预览不可用。");
    }
    const program = typeof action.payload.program === "string" ? action.payload.program : "";
    const args = Array.isArray(action.payload.args) ? action.payload.args.filter((item): item is string => typeof item === "string") : [];
    if (!program) {
      return { message: "这个本机命令还没有解析出可执行程序；安装类动作需要先接入明确的软件源白名单。", stop: true };
    }
    const cwd = typeof action.payload.cwd === "string" && action.payload.cwd.trim() ? action.payload.cwd : projectPath;
    const result = await invoke<WhitelistedCommandResult>("orion_run_whitelisted_command", {
      input: { program, args, cwd },
    });
    return {
      message: formatWhitelistedCommandResult(result),
      stop: shouldStopAfterCommandResult(result),
    };
  }
  if (action.kind === "memory.search") {
    const query = typeof action.payload.query === "string" ? action.payload.query : "";
    const matches = retrieveRelevantMemoryRules(query, summary?.context_brief ?? "", memoryRules);
    return {
      message: matches.length > 0
        ? `本地记忆命中：${matches.map((rule) => rule.title).join("；")}`
        : "本地记忆没有命中相关资料；联网查阅能力还未接入。",
      stop: false,
    };
  }
  return { message: `已跳过暂未支持的本机助手动作：${action.kind}`, stop: false };
}
```

- [ ] **Step 4: Run build and selftest**

Run:

```powershell
E:\codex\tools\rtk\rtk.exe npm --prefix E:\code\ORX run workflow:selftest
E:\codex\tools\rtk\rtk.exe npm --prefix E:\code\ORX run build
```

Expected: both PASS.

## Task 5: Final Verification And Commit

**Files:**
- Verify all modified files.

- [ ] **Step 1: Check status and diff**

Run:

```powershell
E:\codex\tools\rtk\rtk.exe git -C E:\code\ORX status -sb
E:\codex\tools\rtk\rtk.exe git -C E:\code\ORX diff --stat
```

Expected: only files from this plan are modified.

- [ ] **Step 2: Run final verification**

Run:

```powershell
E:\codex\tools\rtk\rtk.exe npm --prefix E:\code\ORX run workflow:selftest
E:\codex\tools\rtk\rtk.exe npm --prefix E:\code\ORX run build
E:\codex\tools\rtk\rtk.exe cargo test
```

Expected: npm commands PASS. If `cargo test` fails with the known `x86_64-w64-mingw32-gcc` linker `_Unwind_Resume` issue, record that in the final response.

- [ ] **Step 3: Commit implementation**

Run:

```powershell
E:\codex\tools\rtk\rtk.exe git -C E:\code\ORX add src/orionPlanner.ts src/orionPlanner.test.ts src/orionCommandResults.ts src/orionCommandResults.test.ts src-tauri/src/orion_actions.rs src/App.tsx package.json docs/superpowers/plans/2026-05-28-orion-command-loop-plan.md
E:\codex\tools\rtk\rtk.exe git -C E:\code\ORX commit -m "feat: add orion command execution loop"
```

Expected: commit succeeds.
