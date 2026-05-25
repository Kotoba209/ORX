export type MemoryRuleScope = "global" | "project";

export type MemoryRule = {
  id: string;
  title: string;
  body: string;
  tags: string[];
  scope: MemoryRuleScope;
  source_task_id: string;
  created_at: number;
  hits: number;
};

export type MemoryRuleCandidate = Omit<MemoryRule, "id" | "created_at" | "hits">;

const tagPatterns: Array<[string, RegExp]> = [
  ["form", /表单|字段|input|form/i],
  ["acceptance", /验收|标准|必填|口径|acceptance/i],
  ["test", /测试|回归|集成|端到端|e2e|test/i],
  ["provider", /provider|模型|api|endpoint|proxy|超时/i],
  ["rust", /rust|tauri|cargo/i],
  ["react", /react|组件|tsx|页面/i],
  ["dev", /实现|代码|开发|文件|dev/i],
];

export function createMemoryRuleCandidate(retrospectiveText: string, sourceTaskId: string, sourceStage: string): MemoryRuleCandidate {
  const body = compactRuleBody(retrospectiveText.trim());
  const title = summarizeTitle(body, sourceStage);
  return {
    title,
    body,
    tags: inferTags(body),
    scope: "global",
    source_task_id: sourceTaskId,
  };
}

export function retrieveRelevantMemoryRules(task: string, projectContext: string, rules: MemoryRule[], limit = 5): MemoryRule[] {
  const haystack = `${task}\n${projectContext}`.toLowerCase();
  const queryTags = new Set(inferTags(haystack));
  return rules
    .map((rule) => ({ rule, score: scoreRule(rule, haystack, queryTags) }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || right.rule.hits - left.rule.hits || right.rule.created_at - left.rule.created_at)
    .slice(0, limit)
    .map((item) => item.rule);
}

export function buildMemoryContextBlock(rules: MemoryRule[]) {
  if (rules.length === 0) return "长期记忆规则：无匹配规则。";
  return [
    "长期记忆规则：",
    ...rules.map((rule, index) => {
      const tags = rule.tags.length > 0 ? ` tags=${rule.tags.join(",")}` : "";
      return `${index + 1}. ${rule.title} [source=${rule.source_task_id}${tags}]\n   ${compactRuleBody(rule.body)}`;
    }),
    "请 Agent 优先遵守这些历史规则；如果本轮情况不适用，需要说明原因。",
  ].join("\n");
}

function inferTags(text: string) {
  const tags = tagPatterns.filter(([, pattern]) => pattern.test(text)).map(([tag]) => tag);
  return Array.from(new Set(tags));
}

function scoreRule(rule: MemoryRule, haystack: string, queryTags: Set<string>) {
  let score = 0;
  for (const tag of rule.tags) {
    if (haystack.includes(tag.toLowerCase())) score += 4;
    if (queryTags.has(tag)) score += 6;
  }
  for (const token of tokenize(`${rule.title} ${rule.body}`)) {
    if (haystack.includes(token)) score += 1;
  }
  return score;
}

function tokenize(text: string) {
  return text
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fff]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function summarizeTitle(body: string, sourceStage: string) {
  const firstLine = body.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? `${sourceStage} 经验规则`;
  const compact = firstLine.replace(/^[-*#\s]+/, "");
  return compact.length > 28 ? `${compact.slice(0, 28)}...` : compact;
}

function compactRuleBody(body: string) {
  const compact = body.replace(/\s+/g, " ").trim();
  return compact.length > 520 ? `${compact.slice(0, 520)}...` : compact;
}
