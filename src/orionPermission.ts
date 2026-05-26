import type { OrionAction, OrionRiskLevel } from "./orionActions";

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
    .join(" · ");
}

export function orionRiskLabel(risk: OrionRiskLevel) {
  return riskLabels[risk];
}

export function formatOrionPayloadPreview(payload: Record<string, unknown>) {
  const entries = Object.entries(payload);
  if (entries.length === 0) {
    return [["参数", "等待执行前生成具体参数"]];
  }
  return entries.map(([key, value]) => {
    if (Array.isArray(value)) {
      return [key, value.map((item) => String(item)).join(", ") || "[]"];
    }
    if (value && typeof value === "object") {
      return [key, "{...}"];
    }
    return [key, String(value)];
  });
}
