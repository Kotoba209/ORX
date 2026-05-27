import { strict as assert } from "node:assert";
import { test } from "node:test";
import { monitorOrionNodeResult } from "./orionRunMonitor.ts";
import type { WorkflowStep } from "./workflowState.ts";

const devStep: WorkflowStep = { stage: "Implementation", owner: "DEV Agent", instruction: "实现功能", enabled: true };
const pdStep: WorkflowStep = { stage: "ScenarioRehearsal", owner: "PD Agent", instruction: "输出需求", enabled: true };
const qaStep: WorkflowStep = { stage: "TestPlan", owner: "QA Agent", instruction: "测试计划", enabled: true };

test("suggests rerunning DEV when a code task returns no file artifact", () => {
  const suggestions = monitorOrionNodeResult({
    task: "做一个登录页面 html 文件",
    step: devStep,
    output: "这里只写了实现思路，没有 FILE 标记和代码块。",
  });

  assert.equal(suggestions[0]?.kind, "rerun_node");
  assert.equal(suggestions[0]?.targetOwner, "DEV Agent");
});

test("suggests ARCH review when output mentions migration or architecture risk", () => {
  const suggestions = monitorOrionNodeResult({
    task: "修复数据迁移 bug",
    step: devStep,
    output: "修复方案涉及数据库迁移和兼容性风险，需要注意回滚。",
  });

  assert.equal(suggestions.some((suggestion) => suggestion.kind === "insert_arch_review"), true);
});

test("suggests asking the user when PD output says requirements are unclear", () => {
  const suggestions = monitorOrionNodeResult({
    task: "做一个报表",
    step: pdStep,
    output: "需求不明确，缺少目标用户、验收标准和范围。",
  });

  assert.equal(suggestions[0]?.kind, "ask_user");
});

test("suggests stopping when QA output reports blocking failure", () => {
  const suggestions = monitorOrionNodeResult({
    task: "验证登录",
    step: qaStep,
    output: "回归测试失败，存在阻塞问题，无法继续发布。",
  });

  assert.equal(suggestions[0]?.kind, "stop");
});

test("suggests continue for clean node output", () => {
  const suggestions = monitorOrionNodeResult({
    task: "整理需求",
    step: pdStep,
    output: "需求已明确，节点完成。",
  });

  assert.deepEqual(suggestions.map((suggestion) => suggestion.kind), ["continue"]);
});
