export type OrionRiskLevel = "direct" | "confirm" | "strong-confirm";

export type OrionActionKind =
  | "project.inspect"
  | "workflow.recommend"
  | "workflow.draft"
  | "workflow.create"
  | "workflow.update"
  | "workflow.clone"
  | "workflow.delete"
  | "workflow.setDefault"
  | "workflow.run"
  | "skill.list"
  | "skill.attach"
  | "skill.detach"
  | "memory.search"
  | "memory.append"
  | "memory.update"
  | "file.readProjectFile"
  | "file.writeGeneratedArtifact"
  | "command.runWhitelisted"
  | "release.build"
  | "git.commit"
  | "git.tag"
  | "git.push";

export type OrionAction = {
  id: string;
  kind: OrionActionKind;
  risk: OrionRiskLevel;
  title: string;
  summary: string;
  payload: Record<string, unknown>;
};

const riskByAction: Record<OrionActionKind, OrionRiskLevel> = {
  "project.inspect": "direct",
  "workflow.recommend": "direct",
  "workflow.draft": "direct",
  "workflow.create": "direct",
  "workflow.update": "direct",
  "workflow.clone": "direct",
  "workflow.run": "direct",
  "skill.list": "direct",
  "skill.attach": "direct",
  "memory.search": "direct",
  "file.readProjectFile": "direct",
  "skill.detach": "confirm",
  "memory.append": "confirm",
  "memory.update": "confirm",
  "file.writeGeneratedArtifact": "confirm",
  "command.runWhitelisted": "confirm",
  "release.build": "confirm",
  "workflow.delete": "strong-confirm",
  "workflow.setDefault": "strong-confirm",
  "git.commit": "strong-confirm",
  "git.tag": "strong-confirm",
  "git.push": "strong-confirm",
};

export function getOrionActionRisk(kind: OrionActionKind): OrionRiskLevel {
  return riskByAction[kind];
}

export function actionNeedsConfirmation(kind: OrionActionKind) {
  return getOrionActionRisk(kind) !== "direct";
}

export function createOrionAction(kind: OrionActionKind, title: string, summary: string, payload: Record<string, unknown> = {}): OrionAction {
  return {
    id: `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind,
    risk: getOrionActionRisk(kind),
    title,
    summary,
    payload,
  };
}

export function groupOrionActionsByRisk(actions: OrionAction[]) {
  return actions.reduce<Record<OrionRiskLevel, OrionAction[]>>(
    (grouped, action) => {
      grouped[action.risk].push(action);
      return grouped;
    },
    { direct: [], confirm: [], "strong-confirm": [] },
  );
}
