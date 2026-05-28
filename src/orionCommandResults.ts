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
