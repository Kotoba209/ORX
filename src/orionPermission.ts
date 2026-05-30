import type { OrionAction, OrionRiskLevel } from "./orionActions.ts";
import { getOrionToolDefinition } from "./orionToolRegistry.ts";

const riskRank: Record<OrionRiskLevel, number> = {
  direct: 0,
  confirm: 1,
  "strong-confirm": 2,
};

const riskLabels: Record<OrionRiskLevel, string> = {
  direct: "直接执行",
  confirm: "需要确认",
  "strong-confirm": "强确认",
};

export function highestOrionRisk(actions: OrionAction[]): OrionRiskLevel {
  return actions.reduce<OrionRiskLevel>((highest, action) => (
    riskRank[action.risk] > riskRank[highest] ? action.risk : highest
  ), "direct");
}

export function isOrionPlanAllowedBySession(allowedRisk: OrionRiskLevel | null, planRisk: OrionRiskLevel) {
  if (!allowedRisk) return planRisk === "direct";
  return riskRank[allowedRisk] >= riskRank[planRisk];
}

export function actionRiskSummary(actions: OrionAction[]) {
  const counts = actions.reduce<Record<OrionRiskLevel, number>>(
    (nextCounts, action) => {
      nextCounts[action.risk] += 1;
      return nextCounts;
    },
    { direct: 0, confirm: 0, "strong-confirm": 0 },
  );
  return (Object.entries(counts) as [OrionRiskLevel, number][])
    .filter(([, count]) => count > 0)
    .map(([risk, count]) => `${risk} ${count}`)
    .join(" / ");
}

export function orionRiskLabel(risk: OrionRiskLevel) {
  return riskLabels[risk];
}

export function formatOrionPayloadPreview(payload: Record<string, unknown>) {
  const entries = Object.entries(payload);
  if (entries.length === 0) {
    return [["参数", "等待执行前生成具体参数"]];
  }
  return entries.map(([key, value]) => [key, formatPayloadPreviewValue(value)]);
}

export function formatOrionToolPayloadPreview(action: OrionAction) {
  const definition = getOrionToolDefinition(action.kind);
  if (!definition) return formatOrionPayloadPreview(action.payload);

  const rows: string[][] = [];
  const missing = definition.required.filter((key) => payloadPreviewValueIsEmpty(action.payload[key]));
  if (missing.length > 0) rows.push(["缺少参数", missing.join(", ")]);

  for (const key of definition.schema) {
    if (Object.prototype.hasOwnProperty.call(action.payload, key) && !payloadPreviewValueIsEmpty(action.payload[key])) {
      rows.push([key, formatPayloadPreviewValue(action.payload[key])]);
    }
  }

  for (const [key, value] of Object.entries(action.payload)) {
    if (!definition.schema.includes(key) && !payloadPreviewValueIsEmpty(value)) {
      rows.push([key, formatPayloadPreviewValue(value)]);
    }
  }

  return rows.length > 0 ? rows : formatOrionPayloadPreview(action.payload);
}

function formatPayloadPreviewValue(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).join(", ") || "[]";
  }
  if (value && typeof value === "object") {
    return "{...}";
  }
  return String(value);
}

function payloadPreviewValueIsEmpty(value: unknown) {
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return value === undefined || value === null;
}
