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
