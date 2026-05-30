import type { OrionActionKind } from "./orionActions.ts";

export const ORION_SKILLS_STORAGE_KEY = "orx.orion.skills.v1";

export type OrionSkillDraft = {
  task: string;
  actionKinds: OrionActionKind[];
  resultSummary: string;
};

export type OrionSkillDistillInput = {
  task: string;
  actionKinds: OrionActionKind[];
  resultMessages: string[];
  stopped: boolean;
};

export type OrionSkill = OrionSkillDraft & {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  uses: number;
  lastTrainingEvent: OrionSkillTrainingEvent;
};

export type OrionSkillMaturity = "draft" | "reliable" | "stable";
export type OrionSkillTrainingEvent = "distilled" | "reinforced";
export type OrionSkillMatch = {
  skill: OrionSkill;
  score: number;
};

export type OrionSkillReinforcement = {
  task: string;
  actionKinds: OrionActionKind[];
  resultSummary: string;
  now?: number;
};

type SkillStorage = Pick<Storage, "getItem" | "setItem">;

export function createOrionSkill(draft: OrionSkillDraft, options: { now?: number } = {}): OrionSkill {
  const now = options.now ?? Date.now();
  const title = skillTitleFromTask(draft.task);
  return {
    id: skillId(title, draft.actionKinds),
    title,
    task: draft.task.trim(),
    actionKinds: Array.from(new Set(draft.actionKinds)),
    resultSummary: draft.resultSummary.trim(),
    createdAt: now,
    updatedAt: now,
    uses: 1,
    lastTrainingEvent: "distilled",
  };
}

export function appendOrionSkill(skills: OrionSkill[], skill: OrionSkill, limit = 40) {
  const existingIndex = skills.findIndex((item) => item.id === skill.id);
  if (existingIndex < 0) return [...skills, skill].slice(-limit);
  const next = [...skills];
  const existing = next[existingIndex];
  next[existingIndex] = {
    ...existing,
    task: skill.task || existing.task,
    resultSummary: skill.resultSummary || existing.resultSummary,
    updatedAt: skill.updatedAt,
    uses: existing.uses + 1,
    lastTrainingEvent: "reinforced",
  };
  return next.slice(-limit);
}

export function reinforceOrionSkill(
  skills: OrionSkill[],
  skillId: string,
  reinforcement: OrionSkillReinforcement,
  limit = 40,
) {
  const existingIndex = skills.findIndex((item) => item.id === skillId);
  if (existingIndex < 0) return { skills: skills.slice(-limit), reinforced: null as OrionSkill | null };
  const next = [...skills];
  const existing = next[existingIndex];
  const updated: OrionSkill = {
    ...existing,
    task: reinforcement.task.trim() || existing.task,
    actionKinds: mergeActionKinds(existing.actionKinds, reinforcement.actionKinds),
    resultSummary: reinforcement.resultSummary.trim() || existing.resultSummary,
    updatedAt: reinforcement.now ?? Date.now(),
    uses: existing.uses + 1,
    lastTrainingEvent: "reinforced",
  };
  next[existingIndex] = updated;
  return { skills: next.slice(-limit), reinforced: updated };
}

export function loadOrionSkills(storage: SkillStorage | null | undefined, limit = 40): OrionSkill[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(ORION_SKILLS_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeSkill).filter((skill): skill is OrionSkill => Boolean(skill)).slice(-limit);
  } catch {
    return [];
  }
}

export function saveOrionSkills(storage: SkillStorage | null | undefined, skills: OrionSkill[], limit = 40) {
  if (!storage) return;
  storage.setItem(ORION_SKILLS_STORAGE_KEY, JSON.stringify(skills.slice(-limit)));
}

export function shouldDistillOrionSkill(input: OrionSkillDistillInput) {
  if (input.stopped) return false;
  if (!input.task.trim()) return false;
  if (input.actionKinds.length === 0 || input.resultMessages.length === 0) return false;
  const combined = input.resultMessages.join("\n").trim();
  if (combined.length < 24) return false;
  return !/(失败|failed|error|缺少|不可用|无法|已停止|stopped|missing|required)/i.test(combined);
}

export function createOrionSkillFromResults(input: OrionSkillDistillInput, options: { now?: number } = {}) {
  if (!shouldDistillOrionSkill(input)) return null;
  return createOrionSkill({
    task: input.task,
    actionKinds: input.actionKinds,
    resultSummary: input.resultMessages.slice(-3).join("；").slice(0, 360),
  }, options);
}

export function retrieveRelevantOrionSkills(task: string, skills: OrionSkill[], options: { limit?: number } = {}) {
  return matchRelevantOrionSkills(task, skills, options).map((item) => item.skill);
}

export function matchRelevantOrionSkills(task: string, skills: OrionSkill[], options: { limit?: number } = {}): OrionSkillMatch[] {
  const limit = options.limit ?? 4;
  const taskTokens = textTokens(task);
  if (taskTokens.size === 0) return [];
  return skills
    .map((skill) => ({
      skill,
      score: relevanceScore(taskTokens, skill),
    }))
    .filter((item) => item.score >= 3)
    .sort((left, right) => right.score - left.score || right.skill.updatedAt - left.skill.updatedAt)
    .slice(0, limit);
}

export function formatOrionSkillContext(skills: OrionSkill[], options: { limit?: number } = {}) {
  const limit = options.limit ?? 6;
  return [...skills]
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, limit)
    .map((skill) => [
      `Skill：${skill.title}`,
      `成熟度：${orionSkillMaturityLabel(skill)}`,
      `最近训练：${orionSkillTrainingEventLabel(skill.lastTrainingEvent)}`,
      `动作：${skill.actionKinds.join(" -> ")}`,
      `复用次数：${skill.uses}`,
      `最近结果：${skill.resultSummary}`,
    ].join("\n"))
    .join("\n\n");
}

export function formatOrionSkillLine(skill: OrionSkill) {
  return `${skill.title}；${skill.actionKinds.join(" -> ")}；${orionSkillMaturityLabel(skill)}；${orionSkillTrainingEventLabel(skill.lastTrainingEvent)}；复用 ${skill.uses} 次`;
}

export function orionSkillMaturity(skill: Pick<OrionSkill, "uses">): OrionSkillMaturity {
  if (skill.uses >= 5) return "stable";
  if (skill.uses >= 2) return "reliable";
  return "draft";
}

export function orionSkillMaturityLabel(skill: Pick<OrionSkill, "uses">) {
  const maturity = orionSkillMaturity(skill);
  if (maturity === "stable") return "稳定";
  if (maturity === "reliable") return "可靠";
  return "草稿";
}

export function orionSkillTrainingEventLabel(event: OrionSkillTrainingEvent | undefined) {
  return event === "reinforced" ? "已强化" : "新沉淀";
}

function normalizeSkill(value: unknown): OrionSkill | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<OrionSkill>;
  if (typeof item.title !== "string" || typeof item.task !== "string") return null;
  const actionKinds = Array.isArray(item.actionKinds) ? item.actionKinds.filter((kind): kind is OrionActionKind => typeof kind === "string") : [];
  if (actionKinds.length === 0) return null;
  const createdAt = typeof item.createdAt === "number" ? item.createdAt : Date.now();
  const updatedAt = typeof item.updatedAt === "number" ? item.updatedAt : createdAt;
  return {
    id: typeof item.id === "string" && item.id ? item.id : skillId(item.title, actionKinds),
    title: item.title,
    task: item.task,
    actionKinds,
    resultSummary: typeof item.resultSummary === "string" ? item.resultSummary : "",
    createdAt,
    updatedAt,
    uses: typeof item.uses === "number" && item.uses > 0 ? item.uses : 1,
    lastTrainingEvent: item.lastTrainingEvent === "reinforced" ? "reinforced" : "distilled",
  };
}

function skillTitleFromTask(task: string) {
  const compact = task.replace(/\s+/g, " ").trim();
  return compact.length > 30 ? `${compact.slice(0, 30)}...` : compact || "ORION 自动技能";
}

function skillId(title: string, actionKinds: string[]) {
  return `skill:${title.toLowerCase()}:${actionKinds.join("|").toLowerCase()}`;
}

function mergeActionKinds(left: OrionActionKind[], right: OrionActionKind[]) {
  return Array.from(new Set([...left, ...right]));
}

function relevanceScore(taskTokens: Set<string>, skill: OrionSkill) {
  const skillTokens = textTokens([
    skill.title,
    skill.task,
    skill.resultSummary,
    skill.actionKinds.join(" "),
  ].join(" "));
  let score = 0;
  for (const token of taskTokens) {
    if (skillTokens.has(token)) score += token.length > 2 ? 2 : 1;
  }
  if (skill.actionKinds.some((kind) => taskTokens.has(kind.toLowerCase()))) score += 3;
  return score + Math.min(skill.uses, 5) * 0.1;
}

function textTokens(text: string) {
  const normalized = text.toLowerCase();
  const tokens = new Set<string>();
  for (const match of normalized.matchAll(/[a-z0-9_.:/-]{2,}/g)) {
    tokens.add(match[0]);
  }
  const cjkText = normalized.replace(/[^\u4e00-\u9fff]+/g, "");
  for (let index = 0; index < cjkText.length; index += 1) {
    tokens.add(cjkText[index]);
    if (index + 1 < cjkText.length) tokens.add(cjkText.slice(index, index + 2));
    if (index + 2 < cjkText.length) tokens.add(cjkText.slice(index, index + 3));
  }
  return tokens;
}
