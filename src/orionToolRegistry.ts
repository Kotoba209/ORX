import type { OrionAction, OrionActionKind, OrionRiskLevel } from "./orionActions.ts";

export type OrionToolDefinition = {
  kind: OrionActionKind;
  schema: string[];
  required: string[];
  risk: OrionRiskLevel;
  purpose: string;
};

export type OrionToolCatalogRow = {
  kind: OrionActionKind;
  risk: OrionRiskLevel;
  purpose: string;
  schema: string;
  required: string;
};

export const orionToolRegistry: OrionToolDefinition[] = [
  { kind: "local.inspectConfig", schema: ["include"], required: [], risk: "direct", purpose: "Inspect local ORX paths and settings." },
  { kind: "memory.search", schema: ["query"], required: ["query"], risk: "direct", purpose: "Search ORION conversation memory." },
  { kind: "web.fetchUrl", schema: ["url", "include_html", "include_headers", "max_bytes"], required: ["url"], risk: "direct", purpose: "Fetch a known public URL, response headers, HTML, and text preview." },
  { kind: "web.fetchUrlInsecure", schema: ["url", "include_html", "include_headers", "max_bytes"], required: ["url"], risk: "strong-confirm", purpose: "Fetch a URL while ignoring invalid TLS certificates after explicit user approval." },
  { kind: "web.searchPublic", schema: ["query", "max_results"], required: ["query"], risk: "direct", purpose: "Search public web results when the URL is not known." },
  { kind: "web.searchSensitive", schema: ["query", "max_results"], required: ["query"], risk: "confirm", purpose: "Search web with potentially sensitive local context." },
  { kind: "file.searchProject", schema: ["query", "max_results"], required: ["query"], risk: "direct", purpose: "Search current project files." },
  { kind: "file.writeGeneratedArtifactAuto", schema: ["relative_path", "content"], required: ["relative_path", "content"], risk: "direct", purpose: "Write safe generated task artifacts." },
  { kind: "file.writeGeneratedArtifact", schema: ["relative_path", "content"], required: ["relative_path", "content"], risk: "confirm", purpose: "Write user-confirmed generated task artifacts." },
  { kind: "command.runWhitelisted", schema: ["program", "args"], required: ["program", "args"], risk: "confirm", purpose: "Run a small ORX allowlisted local command." },
  { kind: "command.runWorktreeSandbox", schema: ["program", "args"], required: ["program", "args"], risk: "confirm", purpose: "Run a non-destructive command in a temporary sandbox after approval." },
];

export const orionSupportedToolKinds = orionToolRegistry.map((tool) => tool.kind);

export function isSupportedOrionToolKind(kind: string): kind is OrionActionKind {
  return orionSupportedToolKinds.includes(kind as OrionActionKind);
}

export function getOrionToolDefinition(kind: string) {
  return orionToolRegistry.find((tool) => tool.kind === kind);
}

export function formatOrionToolKindList() {
  return orionSupportedToolKinds.join(", ");
}

export function formatOrionToolSchemaSummary() {
  return orionToolRegistry
    .map((tool) => `${tool.kind} {${tool.schema.join(", ")}}`)
    .join("; ");
}

export function formatOrionToolCatalogRows(): OrionToolCatalogRow[] {
  return orionToolRegistry.map((tool) => ({
    kind: tool.kind,
    risk: tool.risk,
    purpose: tool.purpose,
    schema: tool.schema.join(", "),
    required: tool.required.join(", ") || "无",
  }));
}

export function getOrionToolAlternative(kind: string) {
  const normalized = kind.toLowerCase();
  if (normalized.includes("browser") && normalized.includes("fetch")) return "web.fetchUrl";
  if (normalized.includes("curl") || normalized.includes("http.head") || normalized.includes("headers")) return "web.fetchUrl";
  if (normalized.includes("search")) return "web.searchPublic";
  if (normalized.includes("file") && normalized.includes("search")) return "file.searchProject";
  return "";
}

export function isBlockedOrionToolKind(kind: string) {
  return /^(git\.(push|tag|commit)|workflow\.(delete|setDefault)|release\.build)$/i.test(kind);
}

export function validateOrionToolAction(action: Pick<OrionAction, "kind" | "payload"> | { kind: string; payload: Record<string, unknown> }) {
  const definition = getOrionToolDefinition(action.kind);
  if (!definition) {
    const alternative = getOrionToolAlternative(action.kind);
    return {
      ok: false as const,
      message: alternative
        ? `ORX 缺少工具能力：${action.kind}。可替代工具：${alternative}。`
        : `ORX 缺少工具能力：${action.kind}。`,
    };
  }
  const missing = definition.required.filter((key) => payloadValueIsEmpty(action.payload[key]));
  if (missing.length > 0) {
    return { ok: false as const, message: `${action.kind} 缺少必需参数：${missing.join(", ")}` };
  }
  return { ok: true as const };
}

function payloadValueIsEmpty(value: unknown) {
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return value === undefined || value === null;
}
