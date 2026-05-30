import test from "node:test";
import assert from "node:assert/strict";
import {
  appendOrionSkill,
  createOrionSkill,
  createOrionSkillFromResults,
  formatOrionSkillContext,
  formatOrionSkillLine,
  loadOrionSkills,
  matchRelevantOrionSkills,
  orionSkillMaturity,
  orionSkillMaturityLabel,
  orionSkillTrainingEventLabel,
  reinforceOrionSkill,
  retrieveRelevantOrionSkills,
  saveOrionSkills,
  shouldDistillOrionSkill,
} from "./orionSkills.ts";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
}

test("creates reusable ORION skills from completed assistant tasks", () => {
  const skill = createOrionSkill({
    task: "读取网页并总结服务端信息",
    actionKinds: ["web.fetchUrl", "memory.search", "web.fetchUrl"],
    resultSummary: "已读取网页和响应头",
  }, { now: 1000 });

  assert.equal(skill.title, "读取网页并总结服务端信息");
  assert.deepEqual(skill.actionKinds, ["web.fetchUrl", "memory.search"]);
  assert.equal(skill.uses, 1);
  assert.equal(skill.lastTrainingEvent, "distilled");
});

test("merges repeated ORION skills into reusable SOPs", () => {
  const first = createOrionSkill({
    task: "读取网页并总结服务端信息",
    actionKinds: ["web.fetchUrl"],
    resultSummary: "第一次结果",
  }, { now: 1000 });
  const second = createOrionSkill({
    task: "读取网页并总结服务端信息",
    actionKinds: ["web.fetchUrl"],
    resultSummary: "第二次结果",
  }, { now: 2000 });

  const skills = appendOrionSkill(appendOrionSkill([], first), second);

  assert.equal(skills.length, 1);
  assert.equal(skills[0].uses, 2);
  assert.equal(skills[0].resultSummary, "第二次结果");
  assert.equal(skills[0].lastTrainingEvent, "reinforced");
});

test("persists ORION skills locally", () => {
  const storage = memoryStorage();
  const skill = createOrionSkill({
    task: "搜索公开资料",
    actionKinds: ["web.searchPublic"],
    resultSummary: "找到公开资料",
  }, { now: 1000 });

  saveOrionSkills(storage, [skill]);
  assert.deepEqual(loadOrionSkills(storage), [skill]);
});

test("formats ORION skills for model context and settings UI", () => {
  const skill = createOrionSkill({
    task: "读取网页并总结服务端信息",
    actionKinds: ["web.fetchUrl"],
    resultSummary: "已读取网页和响应头",
  }, { now: 1000 });

  assert.match(formatOrionSkillContext([skill]), /Skill：读取网页并总结服务端信息/);
  assert.match(formatOrionSkillContext([skill]), /成熟度：草稿/);
  assert.match(formatOrionSkillContext([skill]), /最近训练：新沉淀/);
  assert.equal(formatOrionSkillLine(skill), "读取网页并总结服务端信息；web.fetchUrl；草稿；新沉淀；复用 1 次");
});

test("labels ORION skill maturity by reuse count", () => {
  assert.equal(orionSkillMaturity({ uses: 1 }), "draft");
  assert.equal(orionSkillMaturity({ uses: 2 }), "reliable");
  assert.equal(orionSkillMaturity({ uses: 5 }), "stable");
  assert.equal(orionSkillMaturityLabel({ uses: 5 }), "稳定");
  assert.equal(orionSkillTrainingEventLabel("reinforced"), "已强化");
  assert.equal(orionSkillTrainingEventLabel(undefined), "新沉淀");
});

test("retrieves relevant ORION skills for the current task", () => {
  const webSkill = createOrionSkill({
    task: "读取网页并总结服务端信息",
    actionKinds: ["web.fetchUrl"],
    resultSummary: "已读取网页和响应头",
  }, { now: 1000 });
  const fileSkill = createOrionSkill({
    task: "搜索项目文件并总结代码位置",
    actionKinds: ["file.searchProject"],
    resultSummary: "找到代码位置",
  }, { now: 2000 });

  const matches = retrieveRelevantOrionSkills("帮我分析这个网页的服务端技术栈", [fileSkill, webSkill]);

  assert.deepEqual(matches.map((skill) => skill.id), [webSkill.id]);
});

test("returns scored ORION skill matches for planning traces", () => {
  const webSkill = createOrionSkill({
    task: "读取网页并总结服务端信息",
    actionKinds: ["web.fetchUrl"],
    resultSummary: "已读取网页和响应头",
  }, { now: 1000 });

  const matches = matchRelevantOrionSkills("帮我读取这个网页的服务端信息", [webSkill]);

  assert.equal(matches[0].skill.id, webSkill.id);
  assert.ok(matches[0].score >= 3);
});

test("reinforces a matched ORION skill after a successful reused run", () => {
  const skill = createOrionSkill({
    task: "读取网页并总结服务端信息",
    actionKinds: ["web.fetchUrl"],
    resultSummary: "第一次结果",
  }, { now: 1000 });

  const result = reinforceOrionSkill([skill], skill.id, {
    task: "读取 hnr.pages.dev 的页面信息",
    actionKinds: ["web.fetchUrl", "memory.search"],
    resultSummary: "第二次成功读取并整理页面信息",
    now: 2000,
  });

  assert.equal(result.reinforced?.id, skill.id);
  assert.equal(result.reinforced?.uses, 2);
  assert.equal(result.reinforced?.updatedAt, 2000);
  assert.equal(result.reinforced?.lastTrainingEvent, "reinforced");
  assert.deepEqual(result.reinforced?.actionKinds, ["web.fetchUrl", "memory.search"]);
  assert.equal(result.skills.length, 1);
});

test("does not create a new skill when reinforcement target is missing", () => {
  const result = reinforceOrionSkill([], "missing", {
    task: "读取网页",
    actionKinds: ["web.fetchUrl"],
    resultSummary: "成功",
    now: 2000,
  });

  assert.equal(result.reinforced, null);
  assert.deepEqual(result.skills, []);
});

test("distills ORION skills only from stable successful results", () => {
  assert.equal(shouldDistillOrionSkill({
    task: "读取网页",
    actionKinds: ["web.fetchUrl"],
    resultMessages: ["web.fetchUrl: 已读取网页：https://hnr.pages.dev/；状态：200；正文摘要：ok"],
    stopped: false,
  }), true);

  assert.equal(shouldDistillOrionSkill({
    task: "读取网页",
    actionKinds: ["web.fetchUrl"],
    resultMessages: ["web.fetchUrl: ORION 已识别到网页读取动作，但缺少 URL。请补充要读取的网址。"],
    stopped: false,
  }), false);

  assert.equal(shouldDistillOrionSkill({
    task: "运行命令",
    actionKinds: ["command.runWorktreeSandbox"],
    resultMessages: ["failed: command failed"],
    stopped: true,
  }), false);
});

test("creates ORION skills from result traces through the distill gate", () => {
  const skill = createOrionSkillFromResults({
    task: "读取网页",
    actionKinds: ["web.fetchUrl"],
    resultMessages: ["web.fetchUrl: 已读取网页：https://hnr.pages.dev/；状态：200；正文摘要：ok"],
    stopped: false,
  }, { now: 1000 });

  assert.equal(skill?.title, "读取网页");
  assert.deepEqual(skill?.actionKinds, ["web.fetchUrl"]);
});
