export const ORION_CAPABILITY_GAPS_STORAGE_KEY = "orx.orion.capability-gaps.v1";

export type OrionCapabilityGapDraft = {
  toolKind: string;
  alternative: string;
  reason: string;
  payloadPreview: string;
};

export type OrionCapabilityGap = OrionCapabilityGapDraft & {
  id: string;
  createdAt: number;
  updatedAt: number;
  count: number;
  latestTask: string;
  recommendation: OrionCapabilityRecommendation;
};

export type OrionCapabilityRecommendation = {
  kind: "use_alternative" | "install_connector" | "create_tool" | "manual";
  title: string;
  detail: string;
  actionLabel: string;
};

type CapabilityGapStorage = Pick<Storage, "getItem" | "setItem">;

export function createOrionCapabilityGap(task: string, draft: OrionCapabilityGapDraft, options: { now?: number } = {}): OrionCapabilityGap {
  const now = options.now ?? Date.now();
  const toolKind = draft.toolKind.trim();
  const alternative = draft.alternative.trim();
  return {
    id: capabilityGapId(toolKind, alternative),
    createdAt: now,
    updatedAt: now,
    count: 1,
    latestTask: task.trim(),
    toolKind,
    alternative,
    reason: draft.reason.trim(),
    payloadPreview: draft.payloadPreview.trim(),
    recommendation: recommendOrionCapability(draft),
  };
}

export function appendOrionCapabilityGap(gaps: OrionCapabilityGap[], gap: OrionCapabilityGap, limit = 30) {
  const existingIndex = gaps.findIndex((item) => item.id === gap.id);
  if (existingIndex < 0) return [...gaps, gap].slice(-limit);

  const next = [...gaps];
  const existing = next[existingIndex];
  next[existingIndex] = {
    ...existing,
    updatedAt: gap.updatedAt,
    count: existing.count + 1,
    latestTask: gap.latestTask || existing.latestTask,
    reason: gap.reason || existing.reason,
    payloadPreview: gap.payloadPreview || existing.payloadPreview,
    recommendation: recommendOrionCapability(gap),
  };
  return next.slice(-limit);
}

export function loadOrionCapabilityGaps(storage: CapabilityGapStorage | null | undefined, limit = 30): OrionCapabilityGap[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(ORION_CAPABILITY_GAPS_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeCapabilityGap).filter((gap): gap is OrionCapabilityGap => Boolean(gap)).slice(-limit);
  } catch {
    return [];
  }
}

export function saveOrionCapabilityGaps(storage: CapabilityGapStorage | null | undefined, gaps: OrionCapabilityGap[], limit = 30) {
  if (!storage) return;
  storage.setItem(ORION_CAPABILITY_GAPS_STORAGE_KEY, JSON.stringify(gaps.slice(-limit)));
}

export function formatOrionCapabilityGapLine(gap: OrionCapabilityGap) {
  const alternative = gap.alternative ? `；可替代：${gap.alternative}` : "；暂无替代工具";
  const task = gap.latestTask ? `；最近任务：${gap.latestTask}` : "";
  return `${gap.toolKind}${alternative}；出现 ${gap.count} 次${task}`;
}

export function formatOrionCapabilityGapContext(gaps: OrionCapabilityGap[], options: { limit?: number } = {}) {
  const limit = options.limit ?? 8;
  return [...gaps]
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, limit)
    .map((gap) => [
      `缺口工具：${gap.toolKind}`,
      gap.alternative ? `优先替代：${gap.alternative}` : "优先替代：暂无",
      `出现次数：${gap.count}`,
      gap.latestTask ? `最近任务：${gap.latestTask}` : "",
      gap.payloadPreview ? `最近参数：${gap.payloadPreview}` : "",
    ].filter(Boolean).join("\n"))
    .join("\n\n");
}

export function recommendOrionCapability(gap: Pick<OrionCapabilityGapDraft, "toolKind" | "alternative">): OrionCapabilityRecommendation {
  const toolKind = gap.toolKind.trim();
  const alternative = gap.alternative.trim();
  if (alternative) {
    return {
      kind: "use_alternative",
      title: `优先使用 ${alternative}`,
      detail: `当前 ORX 已有可替代能力，规划时应把 ${toolKind} 改写为 ${alternative}。`,
      actionLabel: "使用替代工具",
    };
  }
  if (/browser|chrome|playwright/i.test(toolKind)) {
    return {
      kind: "install_connector",
      title: "推荐接入浏览器控制能力",
      detail: "适合补齐页面打开、点击、截图、DOM 检查和登录态网页读取。",
      actionLabel: "推荐浏览器连接器",
    };
  }
  if (/adb|android|device/i.test(toolKind)) {
    return {
      kind: "install_connector",
      title: "推荐接入 ADB 设备控制能力",
      detail: "适合补齐 Android 设备、模拟器、安装包和移动端自动化控制。",
      actionLabel: "推荐 ADB 连接器",
    };
  }
  if (/vector|embedding|memory|search/i.test(toolKind)) {
    return {
      kind: "create_tool",
      title: "建议新增检索类工具",
      detail: "适合沉淀为 ORX 工具注册表能力，例如项目索引、向量检索或长期记忆搜索。",
      actionLabel: "创建工具草案",
    };
  }
  return {
    kind: "manual",
    title: "需要人工评估能力边界",
    detail: "当前没有明确替代工具，建议先记录使用场景，再决定是否做成新工具或插件。",
    actionLabel: "人工评估",
  };
}

function normalizeCapabilityGap(value: unknown): OrionCapabilityGap | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<OrionCapabilityGap>;
  if (typeof item.toolKind !== "string" || !item.toolKind.trim()) return null;
  const alternative = typeof item.alternative === "string" ? item.alternative : "";
  const createdAt = typeof item.createdAt === "number" ? item.createdAt : Date.now();
  const updatedAt = typeof item.updatedAt === "number" ? item.updatedAt : createdAt;
  return {
    id: typeof item.id === "string" && item.id ? item.id : capabilityGapId(item.toolKind, alternative),
    createdAt,
    updatedAt,
    count: typeof item.count === "number" && item.count > 0 ? item.count : 1,
    latestTask: typeof item.latestTask === "string" ? item.latestTask : "",
    toolKind: item.toolKind,
    alternative,
    reason: typeof item.reason === "string" ? item.reason : "",
    payloadPreview: typeof item.payloadPreview === "string" ? item.payloadPreview : "",
    recommendation: normalizeRecommendation(item.recommendation, {
      toolKind: item.toolKind,
      alternative,
      reason: typeof item.reason === "string" ? item.reason : "",
      payloadPreview: typeof item.payloadPreview === "string" ? item.payloadPreview : "",
    }),
  };
}

function normalizeRecommendation(value: unknown, gap: OrionCapabilityGapDraft): OrionCapabilityRecommendation {
  if (!value || typeof value !== "object") return recommendOrionCapability(gap);
  const item = value as Partial<OrionCapabilityRecommendation>;
  const fallback = recommendOrionCapability(gap);
  const kind = item.kind === "use_alternative" || item.kind === "install_connector" || item.kind === "create_tool" || item.kind === "manual"
    ? item.kind
    : fallback.kind;
  return {
    kind,
    title: typeof item.title === "string" && item.title.trim() ? item.title : fallback.title,
    detail: typeof item.detail === "string" && item.detail.trim() ? item.detail : fallback.detail,
    actionLabel: typeof item.actionLabel === "string" && item.actionLabel.trim() ? item.actionLabel : fallback.actionLabel,
  };
}

function capabilityGapId(toolKind: string, alternative: string) {
  return `gap:${toolKind.toLowerCase()}:${alternative.toLowerCase() || "none"}`;
}
