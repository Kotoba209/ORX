import test from "node:test";
import assert from "node:assert/strict";
import { commandLabel, formatSandboxCommandResult, formatWhitelistedCommandResult, shouldStopAfterCommandResult, type WhitelistedCommandResult } from "./orionCommandResults.ts";

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

test("formats sandbox command results with sandbox path and changed files", () => {
  const formatted = formatSandboxCommandResult({
    program: "pnpm",
    args: ["lint"],
    project_root: "E:\\code\\ORX",
    sandbox_path: "C:\\Temp\\orx-worktree-sandbox\\run-1",
    status: 0,
    stdout: "lint ok\n",
    stderr: "",
    changed_files: ["src/App.tsx"],
    diff_stat: " src/App.tsx | 2 ++",
    elapsed_ms: 42,
  });

  assert.match(formatted, /worktree 沙箱执行完成：pnpm lint/);
  assert.match(formatted, /沙箱目录：C:\\Temp\\orx-worktree-sandbox\\run-1/);
  assert.match(formatted, /改动文件：src\/App\.tsx/);
  assert.match(formatted, /沙箱改动不会自动写回主项目/);
});
