export type WhitelistedCommandResult = {
  program: string;
  args: string[];
  cwd: string;
  status: number;
  stdout: string;
  stderr: string;
};

export type SandboxCommandResult = {
  program: string;
  args: string[];
  project_root: string;
  sandbox_path: string;
  status: number;
  stdout: string;
  stderr: string;
  changed_files: string[];
  diff_stat: string;
  elapsed_ms: number;
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

export function formatSandboxCommandResult(result: SandboxCommandResult) {
  const label = commandLabel(result);
  const heading = result.status === 0 ? "worktree 沙箱执行完成" : "worktree 沙箱执行失败";
  const changedFiles = result.changed_files.length > 0 ? result.changed_files.join("、") : "无";
  const diffStat = result.diff_stat.trim() ? `\n改动统计：\n${result.diff_stat.trim()}` : "";
  const nextStep = result.status === 0
    ? "\n沙箱改动不会自动写回主项目；确认结果后可以进入应用补丁/合并阶段。"
    : "\n已停止后续动作；请先查看沙箱输出和退出码。";
  return `${heading}：${label}，退出码 ${result.status}，耗时 ${result.elapsed_ms}ms\n沙箱目录：${result.sandbox_path}\n改动文件：${changedFiles}${diffStat}\n${commandOutputPreview(result)}${nextStep}`;
}
