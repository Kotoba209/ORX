import type { OrionAction, OrionRiskLevel } from "./orionActions.ts";

export type OrionAccessMode = "default" | "auto-review" | "full-access";

export type OrionAccessModeOption = {
  id: OrionAccessMode;
  label: string;
  description: string;
};

export const ORION_ACCESS_MODE_STORAGE_KEY = "orx.orion.access-mode.v1";

export const orionAccessModeOptions: OrionAccessModeOption[] = [
  { id: "default", label: "默认权限", description: "只读直通，写入、命令和敏感动作需要确认。" },
  { id: "auto-review", label: "自动审查", description: "普通写入和命令自动执行，强风险动作仍需确认。" },
  { id: "full-access", label: "完全访问权限", description: "系统控制优先，ORX 记录轨迹并保留停止入口。" },
];

export function normalizeOrionAccessMode(value: unknown): OrionAccessMode {
  return value === "auto-review" || value === "full-access" ? value : "default";
}

export function getOrionAccessModeOption(mode: OrionAccessMode) {
  return orionAccessModeOptions.find((option) => option.id === mode) ?? orionAccessModeOptions[0];
}

export function loadOrionAccessMode(storage: Pick<Storage, "getItem"> | null | undefined): OrionAccessMode {
  if (!storage) return "default";
  return normalizeOrionAccessMode(storage.getItem(ORION_ACCESS_MODE_STORAGE_KEY));
}

export function saveOrionAccessMode(storage: Pick<Storage, "setItem"> | null | undefined, mode: OrionAccessMode) {
  if (!storage) return;
  storage.setItem(ORION_ACCESS_MODE_STORAGE_KEY, mode);
}

export function actionRequiresManualConfirmation(action: Pick<OrionAction, "risk"> & Partial<Pick<OrionAction, "kind">>, mode: OrionAccessMode) {
  if (action.kind === "web.fetchUrlInsecure") return true;
  if (mode === "full-access") return false;
  if (mode === "auto-review") return action.risk === "strong-confirm";
  return action.risk !== "direct";
}

export function summarizeAccessModeRisk(actions: Array<Pick<OrionAction, "risk">>, mode: OrionAccessMode) {
  const manualCount = actions.filter((action) => actionRequiresManualConfirmation(action, mode)).length;
  if (manualCount === 0) return `${getOrionAccessModeOption(mode).label}：本次将自动执行并记录轨迹。`;
  return `${getOrionAccessModeOption(mode).label}：${manualCount} 个动作需要确认。`;
}

export function riskAllowedByAccessMode(risk: OrionRiskLevel, mode: OrionAccessMode) {
  return !actionRequiresManualConfirmation({ risk }, mode);
}

export function formatOrionAccessModeContext(mode: OrionAccessMode) {
  const option = getOrionAccessModeOption(mode);
  const policy = mode === "full-access"
    ? "当前用户希望 ORION 获得 GenericAgent 风格的系统级控制体验。优先提出可执行工具动作，减少不必要的二次确认；ORX 会记录轨迹并保留停止入口。"
    : mode === "auto-review"
      ? "当前用户允许普通写入和命令自动执行。除强风险动作外，优先提出可执行工具动作，不要因为普通 confirm 风险而转为纯聊天。"
      : "当前用户使用默认权限。只读动作可直接提出；写入、命令和敏感动作需要清楚说明并等待确认。";
  return [
    `权限模式：${option.label}`,
    `说明：${option.description}`,
    `规划策略：${policy}`,
  ].join("\n");
}
