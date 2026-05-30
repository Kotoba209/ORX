import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useRef } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import "./App.css";
import {
  defaultSteps,
  formatWorkflowStepCompletionCriteria,
  getApprovalPrompt,
  getRollbackIndex,
  nextRuntimeAfterApproval,
  nextRuntimeAfterRejection,
  outputHasFileArtifact,
  parseApprovalInput,
  shouldStopWorkflow,
  stepShouldProduceFileArtifact,
  taskLikelyNeedsFileArtifact,
  trimWorkflowContext,
  type WorkflowStep,
} from "./workflowState";
import {
  addWorkflow,
  createDefaultWorkflows,
  deleteWorkflow,
  duplicateWorkflow,
  migrateWorkflowDefinition,
  setDefaultWorkflow,
  updateWorkflow,
  updateWorkflowSteps,
  type WorkflowDefinition,
} from "./workflowConfig";
import { buildFileTree, type FileTreeNode, type ProjectFile } from "./projectTree";
import { toChatTimelineItems } from "./chatTimeline";
import { createWorkflowStageOptions } from "./workflowStageOptions";
import { recommendWorkflowForTask } from "./workflowRouter";
import { shouldBlockRecentlyStoppedTask } from "./workflowRunGuards";
import {
  isClarificationContinueCommand,
  nextRuntimeAfterClarificationAnswer,
  nextRuntimeAfterClarificationConfirmation,
  parseClarificationOutput,
  stepUsesInteractiveClarification,
} from "./clarificationState";
import {
  buildMemoryContextBlock,
  retrieveRelevantMemoryRules,
  type MemoryRule,
} from "./memoryRules";
import { createPendingMemoryCandidate, updatePendingMemoryCandidate as applyMemoryCandidatePatch, type PendingMemoryCandidate } from "./memoryCandidates";
import { applyOrionNodeInstruction, applyOrionPlanModification, parseOrionCommand, type OrionPlanModification } from "./orionCommands";
import { createOrionActionPlan, createOrionAssistantResponse } from "./orionPlanner";
import { resolveOrionConversationRoute } from "./orionConversationRouter";
import { createOrionAction, groupOrionActionsByRisk, type OrionAction, type OrionRiskLevel } from "./orionActions";
import { actionRiskSummary, formatOrionToolPayloadPreview, highestOrionRisk, orionRiskLabel } from "./orionPermission";
import { monitorOrionNodeResult, type OrionSuggestedAction } from "./orionRunMonitor";
import { formatSandboxCommandResult, formatWhitelistedCommandResult, shouldStopAfterCommandResult, type SandboxCommandResult, type WhitelistedCommandResult } from "./orionCommandResults";
import { assistantActivityLine, composerSendState } from "./orionAssistantActivity";
import {
  actionRequiresManualConfirmation,
  formatOrionAccessModeContext,
  getOrionAccessModeOption,
  loadOrionAccessMode,
  orionAccessModeOptions,
  saveOrionAccessMode,
  summarizeAccessModeRisk,
  type OrionAccessMode,
} from "./orionAccessMode";
import { createOrionFollowUpReply } from "./orionFollowUp";
import { createOrionChatRunInput, normalizeOrionChatOutput } from "./orionChat";
import {
  createOrionIntentRouterRunInput,
  createOrionIntentClarificationQuestion,
  formatOrionIntentRouteForMemory,
  intentRouteIsActionable,
  normalizeOrionIntentRouteDecision,
  parseOrionIntentRouteDecision,
  type OrionIntentRouteDecision,
} from "./orionIntentRouter";
import { createOrionModelPlannerRunInput, formatOrionModelDecisionForMemory, parseOrionModelDecision, type OrionModelDecision } from "./orionModelPlanner";
import {
  applyOrionWorkflowDriverDecision,
  createOrionWorkflowDriverHandoff,
  createOrionWorkflowDriverRunInput,
  formatOrionWorkflowDriverDecisionForMemory,
  parseOrionWorkflowDriverDecision,
  type OrionWorkflowDriverDecision,
} from "./orionWorkflowDriver";
import {
  createFallbackOrionWorkflowDraft,
  createOrionWorkflowDraftRunInput,
  formatOrionWorkflowDraftDecisionForMemory,
  parseOrionWorkflowDraft,
} from "./orionWorkflowDraft";
import {
  applyOrionWorkflowRevision,
  createOrionWorkflowRevisionRunInput,
  parseOrionWorkflowRevision,
} from "./orionWorkflowRevision";
import {
  appendOrionObservationAnswerToUpstream,
  appendOrionObservationRerunToUpstream,
  appendOrionObservationToUpstream,
  createFallbackOrionWorkflowObservation,
  createOrionWorkflowObserverRunInput,
  formatOrionObservationPrompt,
  observationRequestsRerun,
  observationRequiresUserInput,
  parseOrionWorkflowObservation,
  shouldRunFallbackOrionNodeMonitor,
  shouldSurfaceOrionWorkflowObservation,
  type OrionWorkflowObservation,
} from "./orionWorkflowObserver";
import { activityFloatShouldAutoExpand, activityFloatSummary, shouldCollapseActivityFloat } from "./activityFloat";
import {
  appendFreshOrionMemoryEntry,
  appendOrionMemoryEntry,
  createOrionAssistantAnswerMemoryEntry,
  createOrionAssistantQuestionMemoryEntry,
  createOrionAssistantSummaryMemoryEntry,
  createOrionChatSummaryMemoryEntry,
  createOrionDecisionMemoryEntry,
  createOrionMemoryEntry,
  createOrionUserAssistantEventMemoryEntry,
  createOrionUserWorkflowEventMemoryEntry,
  createOrionWorkflowNodeMemoryEntry,
  createOrionWorkflowObservationMemoryEntry,
  createOrionWorkflowRunMemoryEntry,
  createOrionWorkflowSummaryMemoryEntry,
  formatOrionFindingsMarkdown,
  formatOrionMemoryContext,
  formatOrionMemoryJson,
  loadOrionMemoryEntries,
  saveOrionMemoryEntries,
  selectFreshOrionMemoryEntries,
  type OrionMemoryEntry,
} from "./orionMemory";
import { createFallbackOrionWorkflowSummary, createOrionWorkflowSummaryRunInput, parseOrionWorkflowSummary, type OrionWorkflowRunStatus } from "./orionWorkflowSummary";
import { createOrionWorkflowStartUpstream } from "./orionWorkflowContext";
import { createOrionProcessFollowUpReply, extractRecentArtifactPaths, formatOrionProcessContext, shouldUseDirectOrionProcessFollowUpReply } from "./orionProcessContext";
import {
  appendOrionCapabilityGap,
  createOrionCapabilityGap,
  formatOrionCapabilityGapLine,
  formatOrionCapabilityGapContext,
  loadOrionCapabilityGaps,
  saveOrionCapabilityGaps,
  type OrionCapabilityGap,
} from "./orionCapabilityGaps";
import { createWorkflowNodeFailure, formatWorkflowNodeFailureForChat, type WorkflowNodeFailure } from "./workflowNodeFailure";
import { formatOrionToolCatalogRows, validateOrionToolAction } from "./orionToolRegistry";
import { createOrionAssistantContinuationTask, shouldContinueOrionAssistantLoop } from "./orionAssistantLoop";
import { createOrionQuestionAnswerTask, createOrionResolvedTaskForOrch, findLatestWaitingOrionQuestion, shouldTreatAsOrionQuestionAnswer } from "./orionQuestionAnswer";
import {
  createConversationSession,
  loadConversationStore,
  removeConversationSessions,
  saveConversationStore,
  selectConversationOrionMemory,
  updateConversationContent,
  type ConversationSession,
} from "./conversationStorage";
import {
  appendOrionSkill,
  createOrionSkillFromResults,
  formatOrionSkillContext,
  formatOrionSkillLine,
  loadOrionSkills,
  matchRelevantOrionSkills,
  orionSkillMaturity,
  orionSkillMaturityLabel,
  orionSkillTrainingEventLabel,
  reinforceOrionSkill,
  saveOrionSkills,
  type OrionSkill,
} from "./orionSkills";
import {
  createOrionActivityRun,
  markOrionActivityActionDone,
  markOrionActivityActionFailed,
  markOrionActivityActionRunning,
  orionActivityStepStatusLabel,
  shouldShowOrionActivityFloat,
  type OrionActivityRun,
} from "./orionActivityRun";
import { deriveOrionRuntimeStatus, runtimeStatusNeedsVisibleProgress } from "./orionRuntimeState";

type ProjectProfile = {
  detected_stack: string[];
  manifest_files: string[];
  convention_file?: string | null;
  supplemental_convention_files: string[];
  architecture_hints: string[];
  suggested_commands: string[];
  convention_excerpt?: string | null;
};
type ProjectSummary = { root: string; files: ProjectFile[]; source_count: number; test_count: number; important_files: string[]; context_brief: string; project_profile?: ProjectProfile };
type RegisteredProject = { id: string; name: string; path: string; source_count: number; test_count: number; context_brief: string; updated_at: number };
type AddProjectResult = { project: RegisteredProject; summary: ProjectSummary };
type ProviderApiProtocol = "responses" | "anthropic-messages" | "custom-direct";
type ProviderConfig = { id: string; name: string; kind: string; api_protocol: ProviderApiProtocol; base_url: string; use_proxy_route: boolean; proxy_url: string; model: string; api_key_ref: string };
type ProviderConnectionResult = { ok: boolean; status: number; endpoint: string; message: string };
type AgentRunResult = { owner: string; stage: string; endpoint: string; output: string; elapsed_ms: number; input_tokens: number; output_tokens: number; total_tokens: number };
type AgentBinding = { role: string; provider_id: string; model: string; temperature: number };
type ProviderSnapshot = { providers: ProviderConfig[]; agents: AgentBinding[] };
type WorkflowConfigSnapshot = { workflows: WorkflowDefinition[]; active_workflow_id: string };
type AppSettings = { artifact_output_dir: string };
type LocalConfigInspectionResult = { settings_path: string; artifact_output_dir: string; tasks_dir: string; current_project: string };
type ProjectSearchMatch = { path: string; line_number: number; line: string };
type ProjectSearchResult = { query: string; project_root: string; matches: ProjectSearchMatch[] };
type WebSearchHit = { title: string; url: string; snippet: string; content_preview: string };
type WebSearchResult = { query: string; results: WebSearchHit[] };
type WebFetchResult = { url: string; final_url: string; status: number; content_type: string; headers: Array<[string, string]>; bytes: number; html: string; text_preview: string; insecure_tls?: boolean };
type GeneratedArtifactWriteResult = { path: string; bytes: number };
type MemoryRuleSnapshot = { rules: MemoryRule[] };
type PendingAttachment = { id: string; path?: string; name: string; kind: string; bytes: number; inlineBytes?: number[] };
type TaskAttachmentRecord = { original_name: string; path: string; bytes: number; kind: string; text_preview?: string | null };
type TaskAttachmentSaveResult = { task_id: string; attachments: TaskAttachmentRecord[]; context_block: string };
type InlineAttachmentInput = { original_name: string; bytes: number[] };
type WorkflowMetric = { stage: string; owner: string; status: "running" | "done" | "failed"; elapsed_ms: number; input_tokens: number; output_tokens: number; total_tokens: number; output_preview: string };
type TaskArchiveRef = { id: string; path: string };
type WorkflowRuntime = { task: string; enabledSteps: WorkflowStep[]; nextIndex: number; upstream: string; archive: TaskArchiveRef | null; workflowStart: number; runTotals: { elapsed_ms: number; input_tokens: number; output_tokens: number; total_tokens: number }; artifactRetries?: Record<string, number>; observationRetries?: Record<string, number>; skipNodeApprovals?: boolean };
type ApprovalGate = { step: WorkflowStep; stepIndex: number; result: AgentRunResult; runtime: WorkflowRuntime; preview: string; upstreamBefore: string };
type ClarificationGate = { step: WorkflowStep; stepIndex: number; result: AgentRunResult; runtime: WorkflowRuntime; prompt: string };
type OrionObservationGate = { step: WorkflowStep; stepIndex: number; runtime: WorkflowRuntime; observation: OrionWorkflowObservation };
type OrionPendingPlan = { task: string; workflow: WorkflowDefinition; actions: OrionAction[] };
type OrionPendingAssistant = { task: string; message: string; actions: OrionAction[]; traceId: string; matchedSkillIds?: string[]; continuationRound?: number };
type WorkflowRunOptions = { skipNodeApprovals?: boolean; initiatedBy?: "direct" | "orion-existing-workflow" | "orion-custom-workflow"; routeReason?: string; echoUserTask?: boolean };
type InspectorView = "output" | "context" | "files";
type ConfigPanel = "provider" | "workflow" | "settings" | null;
type ContextMenuState =
  | { kind: "file"; x: number; y: number; file: ProjectFile }
  | { kind: "folder"; x: number; y: number; folder: FileTreeNode }
  | { kind: "project"; x: number; y: number; project: RegisteredProject }
  | { kind: "conversation"; x: number; y: number; conversation: ConversationSession }
  | { kind: "workflow"; x: number; y: number; workflow: WorkflowDefinition }
  | null;
const roleLabels: Record<string, string> = {
  administrator: "PM",
  product: "PD",
  developer: "DEV",
  architect: "ARCH",
  tester: "QA",
};

const roleDescriptions: Record<string, string> = {
  administrator: "流程管理 Agent",
  product: "产品 Agent",
  developer: "开发 Agent",
  architect: "架构师 Agent",
  tester: "测试 Agent",
};

const agentOwners = ["PM Agent", "PD Agent", "DEV Agent", "ARCH Agent", "QA Agent"];
const approvalLabels: Record<NonNullable<WorkflowStep["approval"]>, string> = {
  none: "无需确认",
  user: "需要我确认",
  auto: "管理员自动转交",
};
const providerProtocolLabels: Record<ProviderApiProtocol, string> = {
  responses: "OpenAI Responses",
  "anthropic-messages": "Anthropic Messages",
  "custom-direct": "自定义直连",
};

const defaultProjectPath = "D:\\CodexProjects\\workflow-manager-mvp";
const workflowStorageKey = "workflow-manager.workflows.v1";

function createProviderDraft(index: number): ProviderConfig {
  const suffix = index + 1;
  return {
    id: `provider-${Date.now()}`,
    name: `Model ${suffix}`,
    kind: "openai-compatible",
    api_protocol: "responses",
    base_url: "http://127.0.0.1:8317/v1",
    use_proxy_route: true,
    proxy_url: "http://127.0.0.1:7897",
    model: "",
    api_key_ref: "",
  };
}

function loadWorkflowPreferences() {
  const fallback = createDefaultWorkflows();
  if (typeof window === "undefined") return { workflows: fallback, activeWorkflowId: "" };
  try {
    const raw = window.localStorage.getItem(workflowStorageKey);
    if (!raw) return { workflows: fallback, activeWorkflowId: "" };
    const parsed = JSON.parse(raw) as { workflows?: WorkflowDefinition[]; activeWorkflowId?: string };
    const savedWorkflows = Array.isArray(parsed.workflows) && parsed.workflows.length > 0 ? parsed.workflows.map(migrateWorkflowDefinition) : fallback;
    const activeWorkflowId = parsed.activeWorkflowId && savedWorkflows.some((workflow) => workflow.id === parsed.activeWorkflowId) ? parsed.activeWorkflowId : "";
    return { workflows: savedWorkflows, activeWorkflowId };
  } catch {
    return { workflows: fallback, activeWorkflowId: "" };
  }
}

function canUseTauriCommands() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function formatDuration(ms: number) {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.round(ms / 100) / 10;
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return `${minutes}m ${rest}s`;
}

function formatProjectSearchResult(result: ProjectSearchResult) {
  if (result.matches.length === 0) {
    return `项目搜索「${result.query}」没有命中。`;
  }
  const preview = result.matches
    .slice(0, 8)
    .map((match) => `${match.path}:${match.line_number} ${match.line.trim()}`)
    .join("；");
  return `项目搜索「${result.query}」命中 ${result.matches.length} 处：${preview}`;
}

function formatWebSearchResult(result: WebSearchResult) {
  if (result.results.length === 0) {
    return `联网查询「${result.query}」没有拿到可读结果。`;
  }
  const preview = result.results
    .slice(0, 5)
    .map((hit, index) => {
      const summary = hit.content_preview || hit.snippet || "没有可读摘要";
      return `${index + 1}. ${hit.title} - ${hit.url} - ${summary}`;
    })
    .join("；");
  return `联网查询「${result.query}」读取到 ${result.results.length} 条结果：${preview}`;
}

function formatWebFetchResult(result: WebFetchResult) {
  const headers = result.headers.length > 0
    ? result.headers.slice(0, 16).map(([name, value]) => `${name}: ${value}`).join("；")
    : "未请求响应头";
  const htmlPreview = result.html ? `\nHTML 片段：${previewOutput(result.html)}` : "";
  return [
    `已读取网页：${result.final_url}`,
    result.insecure_tls ? "安全提示：本次已忽略 HTTPS 证书校验，页面内容可能被中间人篡改，仅建议用于临时排查。" : "",
    `状态：${result.status}；类型：${result.content_type || "未知"}；大小：${result.bytes} bytes`,
    `响应头：${headers}`,
    `正文摘要：${result.text_preview || "无可读正文摘要"}`,
    htmlPreview,
  ].filter(Boolean).join("\n");
}

function previewOutput(output: string) {
  const compact = output.replace(/\s+/g, " ").trim();
  return compact.length > 260 ? `${compact.slice(0, 260)}...` : compact;
}

function extractUrlFromText(text: string) {
  return text.match(/https?:\/\/[^\s"'，。！？、）)]+|www\.[^\s"'，。！？、）)]+/i)?.[0] ?? "";
}

function workflowApprovalSummary(steps: WorkflowStep[]) {
  const gates = steps.filter((step) => step.enabled !== false && step.approval === "user");
  if (gates.length === 0) return "当前流程没有人工审批节点，会由 ORCH 自动推进到底。";
  return `人工审批节点：${gates.map((step) => `${step.owner}/${step.stage}`).join(" -> ")}`;
}

function configPanelTitle(panel: ConfigPanel) {
  if (panel === "provider") return "模型服务";
  if (panel === "workflow") return "工作流";
  if (panel === "settings") return "设置";
  return "配置";
}

function App() {
  const [initialWorkflowPreferences] = useState(loadWorkflowPreferences);
  const [projectPath, setProjectPath] = useState(defaultProjectPath);
  const [projects, setProjects] = useState<RegisteredProject[]>([]);
  const [requirement, setRequirement] = useState("");
  const [summary, setSummary] = useState<ProjectSummary | null>(null);
  const [workflows, setWorkflows] = useState<WorkflowDefinition[]>(initialWorkflowPreferences.workflows);
  const [activeWorkflowId, setActiveWorkflowId] = useState(initialWorkflowPreferences.activeWorkflowId);
  const [providerSnapshot, setProviderSnapshot] = useState<ProviderSnapshot>({ providers: [], agents: [] });
  const [providerForm, setProviderForm] = useState<ProviderConfig>({ id: "gpt-local", name: "GPT Local", kind: "openai-compatible", api_protocol: "responses", base_url: "http://127.0.0.1:8317/v1", use_proxy_route: true, proxy_url: "http://127.0.0.1:7897", model: "gpt-5.5", api_key_ref: "GPT_LOCAL_API_KEY" });
  const [agentForm, setAgentForm] = useState<AgentBinding>({ role: "developer", provider_id: "gpt-local", model: "gpt-5.5", temperature: 0.2 });
  const [inspectorView, setInspectorView] = useState<InspectorView>("output");
  const [inspectorCollapsed, setInspectorCollapsed] = useState(true);
  const [configPanel, setConfigPanel] = useState<ConfigPanel>(null);
  const [providerTestResult, setProviderTestResult] = useState<ProviderConnectionResult | null>(null);
  const [appSettings, setAppSettings] = useState<AppSettings>({ artifact_output_dir: "" });
  const [memoryRules, setMemoryRules] = useState<MemoryRule[]>([]);
  const [pendingMemoryCandidate, setPendingMemoryCandidate] = useState<PendingMemoryCandidate | null>(null);
  const [testingProvider, setTestingProvider] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [initialConversationStore] = useState(() => loadConversationStore(typeof window === "undefined" ? null : window.localStorage));
  const initialConversation = initialConversationStore.conversations.find((conversation) => conversation.id === initialConversationStore.activeConversationId);
  const [activeConversationId, setActiveConversationId] = useState(initialConversationStore.activeConversationId);
  const [conversations, setConversations] = useState<ConversationSession[]>(initialConversationStore.conversations);
  const [workflowMenuOpen, setWorkflowMenuOpen] = useState(false);
  const [accessModeMenuOpen, setAccessModeMenuOpen] = useState(false);
  const [workflowRunning, setWorkflowRunning] = useState(false);
  const workflowStopRequestedRef = useRef(false);
  const lastStoppedWorkflowRef = useRef({ task: "", at: 0 });
  const [chatLines, setChatLines] = useState<string[]>(initialConversation?.chatLines ?? ["ORCH：等待任务。"]);
  const [logLines, setLogLines] = useState<string[]>(initialConversation?.logLines ?? ["codex-workflow-client started", "等待添加本地项目。"]); 
  const [workflowMetrics, setWorkflowMetrics] = useState<WorkflowMetric[]>([]);
  const [workflowStartedAt, setWorkflowStartedAt] = useState<number | null>(null);
  const [taskArchive, setTaskArchive] = useState<TaskArchiveRef | null>(null);
  const [approvalGate, setApprovalGate] = useState<ApprovalGate | null>(null);
  const [clarificationGate, setClarificationGate] = useState<ClarificationGate | null>(null);
  const [orionObservationGate, setOrionObservationGate] = useState<OrionObservationGate | null>(null);
  const [orionPendingPlan, setOrionPendingPlan] = useState<OrionPendingPlan | null>(null);
  const [orionPendingAssistant, setOrionPendingAssistant] = useState<OrionPendingAssistant | null>(null);
  const [orionActivityRun, setOrionActivityRun] = useState<OrionActivityRun | null>(null);
  const [orionAssistantActionCount, setOrionAssistantActionCount] = useState(0);
  const [orionChatRunning, setOrionChatRunning] = useState(false);
  const [orionSuggestions, setOrionSuggestions] = useState<OrionSuggestedAction[]>([]);
  const [orionMemoryEntries, setOrionMemoryEntries] = useState<OrionMemoryEntry[]>(() => selectConversationOrionMemory(
    initialConversation,
    loadOrionMemoryEntries(typeof window === "undefined" ? null : window.localStorage),
  ));
  const [orionCapabilityGaps, setOrionCapabilityGaps] = useState<OrionCapabilityGap[]>([]);
  const [workflowNodeFailure, setWorkflowNodeFailure] = useState<WorkflowNodeFailure | null>(null);
  const [orionSkills, setOrionSkills] = useState<OrionSkill[]>([]);
  const [orionAccessMode, setOrionAccessMode] = useState<OrionAccessMode>("default");
  const [activityFloatExpanded, setActivityFloatExpanded] = useState(true);
  const [activityFloatChangedAt, setActivityFloatChangedAt] = useState(Date.now());
  const activityFloatSignatureRef = useRef("");
  const orionMemoryEntriesRef = useRef<OrionMemoryEntry[]>([]);
  const orionSkillsRef = useRef<OrionSkill[]>([]);
  const orionMatchedSkillIdsRef = useRef<string[]>([]);
  const [currentActivity, setCurrentActivity] = useState("");
  const [approvalNote, setApprovalNote] = useState("");
  const [workspaceFiles, setWorkspaceFiles] = useState<ProjectFile[]>([]);
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [composerDragActive, setComposerDragActive] = useState(false);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => new Set());
  const [expandedProjectIds, setExpandedProjectIds] = useState<Set<string>>(() => new Set());
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const [error, setError] = useState("");
  const [copiedMessageKey, setCopiedMessageKey] = useState("");

  const fileTree = useMemo(() => buildFileTree(summary?.files ?? []), [summary]);
  const workspaceFilePaths = useMemo(() => new Set(workspaceFiles.map((file) => file.path)), [workspaceFiles]);
  const activeWorkflow = useMemo(() => workflows.find((workflow) => workflow.id === activeWorkflowId), [workflows, activeWorkflowId]);
  const steps = activeWorkflow?.steps ?? [];
  const stageOptions = useMemo(() => createWorkflowStageOptions(steps), [steps]);
  const latestOutput = logLines.slice(-28);
  const chatTimelineItems = useMemo(() => toChatTimelineItems(chatLines), [chatLines]);
  const orionAssistantRunning = orionAssistantActionCount > 0;
  const composerButtonState = composerSendState({
    workflowRunning,
    assistantRunning: orionAssistantRunning,
    chatRunning: orionChatRunning,
    approvalGate: Boolean(approvalGate),
    clarificationGate: Boolean(clarificationGate || orionObservationGate),
  });
  const workflowTotals = useMemo(() => {
    const finished = workflowMetrics.filter((metric) => metric.status === "done");
    return {
      elapsed_ms: finished.reduce((total, metric) => total + metric.elapsed_ms, 0),
      input_tokens: finished.reduce((total, metric) => total + metric.input_tokens, 0),
      output_tokens: finished.reduce((total, metric) => total + metric.output_tokens, 0),
      total_tokens: finished.reduce((total, metric) => total + metric.total_tokens, 0),
    };
  }, [workflowMetrics]);
  const workflowProgressSteps = useMemo(() => steps
    .filter((step) => step.enabled !== false)
    .map((step, index) => {
      const metric = [...workflowMetrics].reverse().find((item) => item.owner === step.owner && item.stage === step.stage);
      return {
        index,
        owner: step.owner,
        stage: step.stage,
        status: metric?.status ?? "pending",
        elapsed_ms: metric?.elapsed_ms ?? 0,
        preview: metric?.output_preview ?? step.instruction,
      };
    }), [steps, workflowMetrics]);
  const workflowDoneCount = workflowProgressSteps.filter((step) => step.status === "done").length;
  const workflowProgressTotal = workflowProgressSteps.length;
  const orionActivityDoneCount = orionActivityRun?.steps.filter((step) => step.status === "done").length ?? 0;
  const orionActivityTotal = orionActivityRun?.steps.length ?? 0;
  const orionToolCatalogRows = useMemo(() => formatOrionToolCatalogRows(), []);
  const accessModeOption = getOrionAccessModeOption(orionAccessMode);
  const orionRuntimeStatus = deriveOrionRuntimeStatus({
    workflowRunning,
    assistantRunning: orionAssistantRunning,
    activityRunning: orionActivityRun?.status === "running",
    waitingForUser: Boolean(approvalGate || clarificationGate || orionObservationGate || orionPendingPlan),
    failed: Boolean(orionActivityRun?.status === "failed" || workflowMetrics.some((metric) => metric.status === "failed")),
  });
  const activityFloatActive = runtimeStatusNeedsVisibleProgress(orionRuntimeStatus);
  const activityFloatSignature = workflowMetrics.length > 0 || orionActivityRun
    ? [
      workflowMetrics.map((metric) => `${metric.owner}:${metric.stage}:${metric.status}`).join("|"),
      orionActivityRun ? `${orionActivityRun.id}:${orionActivityRun.status}:${orionActivityRun.steps.map((step) => step.status).join("|")}` : "",
    ].join("::")
    : "";

  useEffect(() => {
    void loadProjects();
    void loadProviderConfig();
    void loadAppSettings();
    void loadWorkflowConfig();
    void loadMemoryRules();
    setOrionCapabilityGaps(loadOrionCapabilityGaps(window.localStorage));
    setOrionSkills(loadOrionSkills(window.localStorage));
    setOrionAccessMode(loadOrionAccessMode(window.localStorage));
  }, []);
  useEffect(() => {
    if (activeWorkflowId && !workflows.some((workflow) => workflow.id === activeWorkflowId)) {
      setActiveWorkflowId("");
    }
  }, [workflows, activeWorkflowId]);
  useEffect(() => {
    window.localStorage.setItem(workflowStorageKey, JSON.stringify({ workflows, activeWorkflowId }));
  }, [workflows, activeWorkflowId]);
  useEffect(() => {
    orionMemoryEntriesRef.current = orionMemoryEntries;
    saveOrionMemoryEntries(window.localStorage, orionMemoryEntries);
  }, [orionMemoryEntries]);
  useEffect(() => {
    saveOrionCapabilityGaps(window.localStorage, orionCapabilityGaps);
  }, [orionCapabilityGaps]);
  useEffect(() => {
    orionSkillsRef.current = orionSkills;
    saveOrionSkills(window.localStorage, orionSkills);
  }, [orionSkills]);
  useEffect(() => {
    saveOrionAccessMode(window.localStorage, orionAccessMode);
  }, [orionAccessMode]);
  useEffect(() => {
    setConversations((items) => updateConversationContent(items, activeConversationId, chatLines, logLines, { orionMemoryEntries }));
  }, [activeConversationId, chatLines, logLines, orionMemoryEntries]);
  useEffect(() => {
    saveConversationStore(window.localStorage, { activeConversationId, conversations });
  }, [activeConversationId, conversations]);
  useEffect(() => {
    if (!activityFloatSignature) return;
    const previousSignature = activityFloatSignatureRef.current;
    activityFloatSignatureRef.current = activityFloatSignature;
    if (activityFloatShouldAutoExpand({
      previousSignature,
      nextSignature: activityFloatSignature,
      hasTaskActivity: workflowMetrics.length > 0 || Boolean(orionActivityRun && orionActivityRun.status !== "done"),
    })) {
      setActivityFloatExpanded(true);
      setActivityFloatChangedAt(Date.now());
    }
  }, [activityFloatSignature, workflowMetrics.length, orionActivityRun]);
  useEffect(() => {
    if (!activityFloatSignature || activityFloatActive) return;
    const changedAt = activityFloatChangedAt;
    const timer = window.setTimeout(() => {
      if (shouldCollapseActivityFloat({ activityActive: false, lastChangedAt: changedAt, now: Date.now(), delayMs: 3200 })) {
        setActivityFloatExpanded(false);
      }
    }, 3400);
    return () => window.clearTimeout(timer);
  }, [activityFloatSignature, activityFloatActive, activityFloatChangedAt]);
  useEffect(() => {
    setWorkspaceFiles([]);
    setExpandedPaths(new Set());
    setContextMenu(null);
  }, [summary?.root]);

  async function loadProjects() {
    try {
      const savedProjects = await invoke<RegisteredProject[]>("list_projects");
      setProjects(savedProjects);
      if (savedProjects.length > 0) setLogLines((lines) => [...lines, `已加载 ${savedProjects.length} 个本地项目。`]);
    } catch {
      setLogLines((lines) => [...lines, "浏览器预览模式：项目列表需要在 Tauri 客户端中持久化。"]);
    }
  }

  async function loadProviderConfig() {
    try {
      const snapshot = await invoke<ProviderSnapshot>("get_provider_config");
      setProviderSnapshot(snapshot);
      if (snapshot.providers.length > 0) {
        const provider = snapshot.providers[0];
        setProviderForm(provider);
        const binding = snapshot.agents.find((agent) => agent.provider_id === provider.id) ?? snapshot.agents[0];
        if (binding) setAgentForm(binding);
      }
      setLogLines((lines) => [...lines, `已加载 ${snapshot.providers.length} 个 Provider 配置。`]);
    } catch {
      setLogLines((lines) => [...lines, "浏览器预览模式：Provider 配置需要在 Tauri 客户端中持久化。"]);
    }
  }

  async function loadWorkflowConfig() {
    try {
      const snapshot = await invoke<WorkflowConfigSnapshot | null>("get_workflow_config");
      if (!snapshot || snapshot.workflows.length === 0) return;
      setWorkflows(snapshot.workflows);
      setActiveWorkflowId(snapshot.active_workflow_id && snapshot.workflows.some((workflow) => workflow.id === snapshot.active_workflow_id) ? snapshot.active_workflow_id : "");
      setLogLines((lines) => [...lines, `已加载 ${snapshot.workflows.length} 个本地工作流配置。`]);
    } catch {
      setLogLines((lines) => [...lines, "浏览器预览模式：工作流配置使用本地浏览器缓存；客户端会写入 workflows.json。"]);
    }
  }

  async function loadAppSettings() {
    try {
      const settings = await invoke<AppSettings>("get_app_settings");
      setAppSettings(settings);
      if (settings.artifact_output_dir) setLogLines((lines) => [...lines, `产物总目录：${settings.artifact_output_dir}`]);
    } catch {
      setLogLines((lines) => [...lines, "浏览器预览模式：产物目录设置需要在 Tauri 客户端中持久化。"]);
    }
  }

  async function loadMemoryRules() {
    try {
      const snapshot = await invoke<MemoryRuleSnapshot>("get_memory_rules");
      setMemoryRules(snapshot.rules);
      if (snapshot.rules.length > 0) setLogLines((lines) => [...lines, `已加载 ${snapshot.rules.length} 条长期记忆规则。`]);
    } catch {
      setLogLines((lines) => [...lines, "浏览器预览模式：长期记忆规则需要在 Tauri 客户端中持久化。"]);
    }
  }

  function proposeMemoryRuleCandidate(candidateText: string, archive: TaskArchiveRef | null, stage: string) {
    if (!archive || !candidateText.trim()) return;
    const pending = createPendingMemoryCandidate(candidateText, archive.id, stage);
    if (!pending) return;
    setPendingMemoryCandidate(pending);
    setChatLines((lines) => [...lines, `ORX：发现一条可沉淀的长期记忆候选：${pending.candidate.title}。请确认保存、编辑或忽略。`]);
    setLogLines((lines) => [...lines, `长期记忆候选待确认：${pending.candidate.title}`]);
  }

  async function savePendingMemoryCandidate() {
    if (!pendingMemoryCandidate) return;
    try {
      const snapshot = await invoke<MemoryRuleSnapshot>("append_memory_rule", { input: pendingMemoryCandidate.candidate });
      setMemoryRules(snapshot.rules);
      setChatLines((lines) => [...lines, `ORX：长期记忆已保存：${pendingMemoryCandidate.candidate.title}`]);
      setLogLines((lines) => [...lines, `长期记忆已保存：${pendingMemoryCandidate.candidate.title}`]);
      setPendingMemoryCandidate(null);
    } catch (memoryError) {
      const message = memoryError instanceof Error ? memoryError.message : String(memoryError);
      setLogLines((lines) => [...lines, `长期记忆沉淀失败：${message}`]);
    }
  }

  function ignorePendingMemoryCandidate() {
    if (!pendingMemoryCandidate) return;
    setChatLines((lines) => [...lines, `ORX：已忽略长期记忆候选：${pendingMemoryCandidate.candidate.title}`]);
    setLogLines((lines) => [...lines, `长期记忆候选已忽略：${pendingMemoryCandidate.candidate.title}`]);
    setPendingMemoryCandidate(null);
  }

  function updatePendingMemoryCandidateDraft(patch: { title?: string; body?: string; tagsText?: string }) {
    setPendingMemoryCandidate((pending) => pending ? applyMemoryCandidatePatch(pending, patch) : pending);
  }

  async function saveAppSettings(nextSettings = appSettings) {
    setError("");
    try {
      const saved = await invoke<AppSettings>("save_app_settings", { input: nextSettings });
      setAppSettings(saved);
      setLogLines((lines) => [...lines, saved.artifact_output_dir ? `产物总目录已保存：${saved.artifact_output_dir}` : "已清空产物总目录设置。"]);
    } catch (settingsError) {
      const message = settingsError instanceof Error ? settingsError.message : String(settingsError);
      setError(message);
      setLogLines((lines) => [...lines, `保存产物目录失败：${message}`]);
    }
  }

  async function chooseArtifactOutputDir() {
    try {
      const selected = await open({ directory: true, multiple: false, title: "选择产物存放总目录" });
      if (typeof selected !== "string") return;
      const nextSettings = { ...appSettings, artifact_output_dir: selected };
      setAppSettings(nextSettings);
      await saveAppSettings(nextSettings);
    } catch (settingsError) {
      const message = settingsError instanceof Error ? settingsError.message : String(settingsError);
      setError(message);
      setLogLines((lines) => [...lines, `选择产物目录失败：${message}`]);
    }
  }

  async function saveProviderConfig() {
    setError("");
    setSavingConfig(true);
    try {
      const snapshot = await invoke<ProviderSnapshot>("save_provider", { input: providerForm });
      setProviderSnapshot(snapshot);
      const savedProvider = snapshot.providers.find((provider) => provider.id === providerForm.id);
      if (savedProvider) setProviderForm(savedProvider);
      setLogLines((lines) => [...lines, `Provider 已保存：${providerForm.name}`]);
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : String(saveError);
      setError(message);
      setLogLines((lines) => [...lines, `保存 Provider 失败：${message}`]);
    } finally {
      setSavingConfig(false);
    }
  }

  function selectProviderConfig(provider: ProviderConfig) {
    setProviderForm(provider);
    setProviderTestResult(null);
    const binding = providerSnapshot.agents.find((agent) => agent.provider_id === provider.id);
    if (binding) setAgentForm(binding);
  }

  function newProviderConfig() {
    const draft = createProviderDraft(providerSnapshot.providers.length);
    setProviderForm(draft);
    setProviderTestResult(null);
    setAgentForm({ ...agentForm, provider_id: draft.id, model: draft.model });
    setLogLines((lines) => [...lines, "已创建新的模型配置草稿，填写后点击保存 Provider。"]);
  }

  async function deleteCurrentProvider() {
    if (!providerSnapshot.providers.some((provider) => provider.id === providerForm.id)) {
      newProviderConfig();
      return;
    }
    if (providerSnapshot.providers.length <= 1) {
      setError("至少需要保留一个 Provider。");
      return;
    }
    setError("");
    setSavingConfig(true);
    try {
      const snapshot = await invoke<ProviderSnapshot>("delete_provider", { providerId: providerForm.id });
      setProviderSnapshot(snapshot);
      const nextProvider = snapshot.providers[0] ?? createProviderDraft(0);
      setProviderForm(nextProvider);
      const binding = snapshot.agents.find((agent) => agent.provider_id === nextProvider.id) ?? snapshot.agents[0];
      if (binding) setAgentForm(binding);
      else setAgentForm({ ...agentForm, provider_id: nextProvider.id, model: nextProvider.model });
      setProviderTestResult(null);
      setLogLines((lines) => [...lines, `Provider 已删除：${providerForm.name}`]);
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : String(deleteError);
      setError(message);
      setLogLines((lines) => [...lines, `删除 Provider 失败：${message}`]);
    } finally {
      setSavingConfig(false);
    }
  }

  async function saveWorkflowConfig() {
    setError("");
    setSavingConfig(true);
    try {
      const saved = await invoke<WorkflowConfigSnapshot>("save_workflow_config", {
        input: { workflows, active_workflow_id: activeWorkflowId },
      });
      window.localStorage.setItem(workflowStorageKey, JSON.stringify({ workflows: saved.workflows, activeWorkflowId: saved.active_workflow_id }));
      setLogLines((lines) => [...lines, `工作流配置已保存：${saved.workflows.length} 个。`]);
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : String(saveError);
      setError(message);
      setLogLines((lines) => [...lines, `保存工作流配置失败：${message}`]);
    } finally {
      setSavingConfig(false);
    }
  }

  async function saveCurrentConfigPanel() {
    if (configPanel === "provider") await saveProviderConfig();
    else if (configPanel === "workflow") await saveWorkflowConfig();
    else if (configPanel === "settings") await saveAppSettings();
  }

  async function bindAgentProvider() {
    setError("");
    try {
      const snapshot = await invoke<ProviderSnapshot>("bind_agent_provider", { input: agentForm });
      setProviderSnapshot(snapshot);
      setLogLines((lines) => [...lines, `${roleLabels[agentForm.role]} Agent 已绑定：${agentForm.provider_id}`]);
    } catch (bindError) {
      const message = bindError instanceof Error ? bindError.message : String(bindError);
      setError(message);
      setLogLines((lines) => [...lines, `绑定 Agent 失败：${message}`]);
    }
  }

  async function bindAllAgentsToCurrentProvider() {
    setError("");
    try {
      let snapshot = await invoke<ProviderSnapshot>("save_provider", { input: providerForm });
      for (const role of Object.keys(roleLabels)) {
        snapshot = await invoke<ProviderSnapshot>("bind_agent_provider", {
          input: { role, provider_id: providerForm.id, model: providerForm.model, temperature: role === "product" ? 0.3 : 0.2 },
        });
      }
      setProviderSnapshot(snapshot);
      setAgentForm({ ...agentForm, provider_id: providerForm.id, model: providerForm.model });
      setLogLines((lines) => [...lines, `全部 Agent 已绑定到：${providerForm.name} / ${providerForm.model}`]);
    } catch (bindError) {
      const message = bindError instanceof Error ? bindError.message : String(bindError);
      setError(message);
      setLogLines((lines) => [...lines, `绑定全部 Agent 失败：${message}`]);
    }
  }

  async function testCurrentProvider() {
    setError("");
    setProviderTestResult(null);
    if (!canUseTauriCommands()) {
      const message = "Provider 测试连接需要在 Tauri 客户端中运行；浏览器预览没有 Tauri invoke 桥。";
      setError(message);
      setLogLines((lines) => [...lines, `Provider 测试未执行：${message}`]);
      return;
    }
    setTestingProvider(true);
    try {
      const result = await invoke<ProviderConnectionResult>("test_provider_connection", { input: providerForm });
      setProviderTestResult(result);
      setLogLines((lines) => [...lines, `Provider 测试${result.ok ? "成功" : "失败"}：${result.status} ${result.endpoint}`]);
    } catch (testError) {
      const message = testError instanceof Error ? testError.message : String(testError);
      setError(message);
      setLogLines((lines) => [...lines, `Provider 测试失败：${message}`]);
    } finally {
      setTestingProvider(false);
    }
  }

  async function addProjectPath(path: string) {
    setError("");
    setProjectPath(path);
    setLogLines((lines) => [...lines, `> add_project ${path}`]);
    try {
      const result = await invoke<AddProjectResult>("add_project", { path });
      setSummary(result.summary);
      await loadProjects();
      setLogLines((lines) => [...lines, `项目已添加：${result.project.name}`, result.summary.context_brief]);
      setInspectorView("context");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setError(message);
      setLogLines((lines) => [...lines, `添加项目失败：${message}`]);
    }
  }

  async function addCurrentProject() {
    try {
      const selected = await open({ directory: true, multiple: false, title: "选择项目文件夹" });
      if (typeof selected !== "string") {
        setLogLines((lines) => [...lines, "已取消选择项目文件夹。"]);
        return;
      }
      await addProjectPath(selected);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setError(message);
      setLogLines((lines) => [...lines, `打开项目选择器失败：${message}`]);
    }
  }

  async function scanProject(project: RegisteredProject) {
    setError("");
    setProjectPath(project.path);
    setLogLines((lines) => [...lines, `> scan_project ${project.path}`]);
    try {
      const result = await invoke<ProjectSummary>("scan_project", { path: project.path });
      setSummary(result);
      setLogLines((lines) => [...lines, result.context_brief]);
      setInspectorView("context");
    } catch (scanError) {
      const message = scanError instanceof Error ? scanError.message : String(scanError);
      setError(message);
      setLogLines((lines) => [...lines, `扫描失败：${message}`]);
    }
  }

  async function loadWorkflowBlueprint() {
    try {
      const blueprint = await invoke<WorkflowStep[]>("workflow_blueprint");
      setWorkflows((items) => updateWorkflowSteps(items, activeWorkflowId, blueprint.map((step) => ({ ...step, enabled: true, approval: "none" }))));
      setLogLines((lines) => [...lines, "> workflow_blueprint loaded", "已加载场景预演 -> 边界探测 -> 红蓝对抗 -> 测试计划 -> 复盘流程。"]);
    } catch {
      setLogLines((lines) => [...lines, "> workflow_blueprint fallback", "当前处于浏览器预览模式，使用前端内置流程蓝图。"]);
    }
  }

  function ownerToRole(owner: string) {
    if (owner.includes("PM") || owner.includes("管理员")) return "administrator";
    if (owner.includes("PD") || owner.includes("产品")) return "product";
    if (owner.includes("DEV") || (owner.includes("开发") && !owner.includes("架构"))) return "developer";
    if (owner.includes("ARCH") || owner.includes("架构")) return "architect";
    if (owner.includes("QA") || owner.includes("测试")) return "tester";
    return "administrator";
  }

  function providerInputForRole(role: string) {
    const binding = providerSnapshot.agents.find((agent) => agent.role === role);
    const provider = providerSnapshot.providers.find((item) => item.id === binding?.provider_id) ?? providerForm;
    return { ...provider, model: binding?.model ?? provider.model };
  }

  function providerEndpoint(provider: ProviderConfig) {
    const baseUrl = provider.base_url.trim().replace(/\/$/, "");
    if (provider.api_protocol === "anthropic-messages") return `${baseUrl}/v1/messages`;
    if (provider.api_protocol === "custom-direct") return baseUrl;
    return `${baseUrl}/responses`;
  }

  function toggleTreePath(path: string) {
    setExpandedPaths((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function toggleProject(projectId: string) {
    setExpandedProjectIds((current) => {
      const next = new Set(current);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  }

  function addFileToWorkspace(file: ProjectFile) {
    setWorkspaceFiles((files) => files.some((item) => item.path === file.path) ? files : [...files, file]);
    setContextMenu(null);
    setLogLines((lines) => [...lines, `上下文文件已加入工作区：${file.path}`]);
  }

  function addFolderToWorkspace(node: FileTreeNode) {
    const collectFiles = (item: FileTreeNode): ProjectFile[] => item.kind === "directory"
      ? item.children.flatMap(collectFiles)
      : [{ path: item.path, kind: item.kind, bytes: item.bytes }];
    const filesToAdd = collectFiles(node);
    setWorkspaceFiles((files) => {
      const existing = new Set(files.map((file) => file.path));
      return [...files, ...filesToAdd.filter((file) => !existing.has(file.path))];
    });
    setContextMenu(null);
    setLogLines((lines) => [...lines, `上下文文件夹已加入工作区：${node.path}（${filesToAdd.length} 个文件路径）`]);
  }

  function removeFileFromWorkspace(path: string) {
    setWorkspaceFiles((files) => files.filter((file) => file.path !== path));
  }

  function workspaceContextBrief() {
    if (workspaceFiles.length === 0) return "指定上下文文件：未选择。";
    return `指定上下文文件：\n${workspaceFiles.map((file) => `- ${file.path} (${file.kind}, ${file.bytes} bytes)`).join("\n")}\n请 Agent 优先围绕这些文件路径定位需求、方案、开发和测试影响面。`;
  }

  function projectProfileBrief(profile?: ProjectProfile) {
    if (!profile) return "项目画像：未生成。";
    const lines = [
      `项目画像：技术栈 ${profile.detected_stack.length ? profile.detected_stack.join(", ") : "未识别"}`,
      `主约定文件：${profile.convention_file || "未发现"}`,
      `补充约定：${profile.supplemental_convention_files.length ? profile.supplemental_convention_files.join(", ") : "未发现"}`,
      `建议命令：${profile.suggested_commands.length ? profile.suggested_commands.join(", ") : "未推断"}`,
    ];
    if (profile.architecture_hints.length) lines.push(`架构提示：${profile.architecture_hints.join("；")}`);
    if (profile.convention_excerpt) lines.push(`约定摘要：${profile.convention_excerpt}`);
    return lines.join("\n");
  }

  function attachmentKindFromName(name: string) {
    const ext = name.split(".").pop()?.toLowerCase() ?? "";
    if (["txt", "md", "json", "html", "css", "js", "jsx", "ts", "tsx", "py", "rs", "java", "xml", "yaml", "yml", "toml", "csv", "log"].includes(ext)) return "text";
    if (["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"].includes(ext)) return "image";
    return "binary";
  }

  async function fileToInlineAttachment(file: File, index: number): Promise<PendingAttachment> {
    const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
    const inferredName = file.name || `clipboard-${Date.now()}-${index}.${file.type.includes("jpeg") ? "jpg" : "png"}`;
    return { id: `inline-${Date.now()}-${index}-${file.size}`, name: inferredName, kind: attachmentKindFromName(inferredName), bytes: file.size, inlineBytes: bytes };
  }

  async function addAttachmentFiles(files: FileList | File[]) {
    const incoming: PendingAttachment[] = [];
    const inlineReads: Promise<PendingAttachment>[] = [];
    Array.from(files).forEach((file, index) => {
      const path = (file as File & { path?: string }).path;
      if (path) {
        incoming.push({ id: `${path}-${file.size}-${Date.now()}`, path, name: file.name || path.split(/[\\/]/).pop() || "attachment", kind: attachmentKindFromName(file.name || path), bytes: file.size });
      } else if (file.type.startsWith("image/")) {
        inlineReads.push(fileToInlineAttachment(file, index));
      }
    });
    if (inlineReads.length > 0) incoming.push(...await Promise.all(inlineReads));
    const unsupportedCount = files.length - incoming.length;
    if (unsupportedCount > 0) {
      setError("有文件没有本地路径且不是图片，暂时无法作为附件保存。请先保存到本机后再拖入。");
      setLogLines((lines) => [...lines, `附件添加失败：${unsupportedCount} 个无路径非图片文件。`]);
    }
    if (incoming.length === 0) return;
    setPendingAttachments((items) => {
      const existing = new Set(items.map((item) => item.path ?? item.id));
      return [...items, ...incoming.filter((item) => !existing.has(item.path ?? item.id))];
    });
    setLogLines((lines) => [...lines, `已加入待发送附件：${incoming.map((item) => item.name).join("、")}`]);
  }

  function removePendingAttachment(id: string) {
    setPendingAttachments((items) => items.filter((item) => item.id !== id));
  }

  function pendingAttachmentBrief(attachments: PendingAttachment[]) {
    if (attachments.length === 0) return "";
    return `对话附件（待归档）：\n${attachments.map((item) => `- ${item.name} [${item.kind}] ${item.bytes} bytes -> ${item.path ?? "clipboard-inline"}`).join("\n")}`;
  }

  async function trySaveTaskAttachments(archive: TaskArchiveRef | null, attachments: PendingAttachment[]) {
    if (attachments.length === 0) return "";
    if (!archive) return pendingAttachmentBrief(attachments);
    try {
      const result = await invoke<TaskAttachmentSaveResult>("save_task_attachments", {
        input: {
          task_id: archive.id,
          source_paths: attachments.map((item) => item.path).filter((path): path is string => Boolean(path)),
          inline_files: attachments
            .filter((item) => item.inlineBytes)
            .map((item): InlineAttachmentInput => ({ original_name: item.name, bytes: item.inlineBytes ?? [] })),
        },
      });
      setLogLines((lines) => [...lines, `附件已归档：${result.attachments.map((item) => item.original_name).join("、")}`]);
      return result.context_block;
    } catch (attachmentError) {
      const message = attachmentError instanceof Error ? attachmentError.message : String(attachmentError);
      setError(message);
      setLogLines((lines) => [...lines, `附件归档失败：${message}`]);
      throw attachmentError;
    }
  }

  function resetConversationRuntimeState() {
    setWorkflowMetrics([]);
    setWorkflowStartedAt(null);
    setTaskArchive(null);
    setApprovalGate(null);
    setApprovalNote("");
    setCurrentActivity("");
    setOrionActivityRun(null);
    setWorkflowNodeFailure(null);
    setPendingAttachments([]);
    setComposerDragActive(false);
    setError("");
  }

  function replaceOrionConversationMemory(entries: OrionMemoryEntry[]) {
    orionMemoryEntriesRef.current = entries;
    setOrionMemoryEntries(entries);
  }

  function resetConversationState(title = "新对话") {
    setChatLines([`ORCH：${title} 已就绪。`]);
    setLogLines(["codex-workflow-client started", `conversation: ${title}`]);
    replaceOrionConversationMemory([]);
    resetConversationRuntimeState();
  }

  function createConversation(projectId = "workspace", title = "新任务对话") {
    const conversation = createConversationSession(projectId, title);
    setConversations((items) => [conversation, ...items]);
    setActiveConversationId(conversation.id);
    setChatLines(conversation.chatLines);
    setLogLines(conversation.logLines);
    replaceOrionConversationMemory(conversation.orionMemoryEntries);
    setContextMenu(null);
    resetConversationRuntimeState();
  }

  function selectConversation(conversation: ConversationSession) {
    setActiveConversationId(conversation.id);
    setChatLines(conversation.chatLines);
    setLogLines(conversation.logLines);
    replaceOrionConversationMemory(conversation.orionMemoryEntries);
    resetConversationRuntimeState();
  }

  function deleteConversation(conversation: ConversationSession) {
    setConversations((items) => removeConversationSessions(items, (item) => item.id === conversation.id));
    if (activeConversationId === conversation.id) {
      setActiveConversationId("");
      resetConversationState("等待任务");
    }
    setContextMenu(null);
  }

  async function removeProject(project: RegisteredProject) {
    setError("");
    try {
      const nextProjects = await invoke<RegisteredProject[]>("remove_project", { projectId: project.id });
      setProjects(nextProjects);
      setConversations((items) => removeConversationSessions(items, (conversation) => conversation.projectId === project.id));
      if (conversations.some((conversation) => conversation.id === activeConversationId && conversation.projectId === project.id)) {
        setActiveConversationId("");
        resetConversationState("等待任务");
      }
      setExpandedProjectIds((current) => {
        const next = new Set(current);
        next.delete(project.id);
        return next;
      });
      if (projectPath === project.path) {
        setSummary(null);
        setWorkspaceFiles([]);
        setProjectPath(defaultProjectPath);
        setInspectorView("output");
      }
      setContextMenu(null);
      setLogLines((lines) => [...lines, `项目已从列表移除：${project.name}`, "磁盘文件未删除。"]);
    } catch (removeError) {
      const message = removeError instanceof Error ? removeError.message : String(removeError);
      setError(message);
      setContextMenu(null);
      setLogLines((lines) => [...lines, `移除项目失败：${message}`]);
    }
  }

  async function tryStartTaskArchive(task: string) {
    try {
      const archive = await invoke<TaskArchiveRef>("start_task_archive", {
        input: { task, project_path: projectPath, workflow_template: activeWorkflow?.name ?? "ORION 自动判断" },
      });
      setTaskArchive(archive);
      setLogLines((lines) => [...lines, `task archive: ${archive.path}`]);
      return archive;
    } catch (archiveError) {
      const message = archiveError instanceof Error ? archiveError.message : String(archiveError);
      setLogLines((lines) => [...lines, `任务档案创建失败：${message}`]);
      return null;
    }
  }

  async function trySaveTaskArtifact(archive: TaskArchiveRef | null, result: AgentRunResult, status: "done" | "failed", output: string) {
    if (!archive) return { ok: true, message: "" };
    try {
      await invoke<TaskArchiveRef>("save_task_artifact", {
        input: {
          task_id: archive.id,
          owner: result.owner,
          stage: result.stage,
          status,
          elapsed_ms: result.elapsed_ms,
          input_tokens: result.input_tokens,
          output_tokens: result.output_tokens,
          total_tokens: result.total_tokens,
          output,
        },
      });
      if (appSettings.artifact_output_dir) {
        setLogLines((lines) => [...lines, `外部产物已同步：${appSettings.artifact_output_dir}\\${archive.id}`]);
      }
      return { ok: true, message: "" };
    } catch (archiveError) {
      const message = archiveError instanceof Error ? archiveError.message : String(archiveError);
      setLogLines((lines) => [...lines, `任务产物写入失败：${message}`]);
      return { ok: false, message };
    }
  }

  async function tryFinishTaskArchive(archive: TaskArchiveRef | null, status: string, totalElapsedMs: number, agentTotals: { elapsed_ms: number; input_tokens: number; output_tokens: number; total_tokens: number }, summaryText: string) {
    if (!archive) return;
    try {
      await invoke<TaskArchiveRef>("finish_task_archive", {
        input: {
          task_id: archive.id,
          status,
          total_elapsed_ms: totalElapsedMs,
          agent_elapsed_ms: agentTotals.elapsed_ms,
          input_tokens: agentTotals.input_tokens,
          output_tokens: agentTotals.output_tokens,
          total_tokens: agentTotals.total_tokens,
          summary: summaryText,
        },
      });
    } catch (archiveError) {
      const message = archiveError instanceof Error ? archiveError.message : String(archiveError);
      setLogLines((lines) => [...lines, `任务档案收尾失败：${message}`]);
    }
  }

  async function tryRecordApproval(archive: TaskArchiveRef | null, gate: ApprovalGate, decision: "approved" | "rejected", note: string) {
    if (!archive) return;
    try {
      await invoke<TaskArchiveRef>("record_approval", {
        input: {
          task_id: archive.id,
          stage: gate.step.stage,
          owner: gate.step.owner,
          decision,
          note,
        },
      });
    } catch (archiveError) {
      const message = archiveError instanceof Error ? archiveError.message : String(archiveError);
      setLogLines((lines) => [...lines, `审批记录写入失败：${message}`]);
    }
  }

  function rollbackIndexFor(gate: ApprovalGate) {
    return getRollbackIndex(gate, gate.runtime.enabledSteps);
  }

  async function approveCurrentGate(note: string) {
    const gate = approvalGate;
    if (!gate) return;
    const approvalText = note.trim() || "用户批准继续。";
    setRequirement("");
    setApprovalNote("");
    setError("");
    await tryRecordApproval(gate.runtime.archive, gate, "approved", approvalText);
    await rememberOrionUserWorkflowEvent(gate.runtime.task, "approval.approved", approvalText, gate.step.owner, gate.step.stage, gate.runtime.archive);
    setApprovalGate(null);
    setChatLines((lines) => [...lines, `ORCH：审批通过，继续推进 ${gate.runtime.nextIndex < gate.runtime.enabledSteps.length ? gate.runtime.enabledSteps[gate.runtime.nextIndex].stage : "后续"} 节点。`]);
    setLogLines((lines) => [...lines, `审批结果：approved stage=${gate.step.stage} owner=${gate.step.owner}`, `审批备注：${approvalText}`]);
    await continueWorkflow(nextRuntimeAfterApproval(gate, note));
  }

  async function rejectCurrentGate(note: string) {
    const gate = approvalGate;
    if (!gate) return;
    const rollbackIndex = rollbackIndexFor(gate);
    const rollbackStep = gate.runtime.enabledSteps[rollbackIndex] ?? gate.step;
    const rejectionNote = note || "用户否决，要求重做。";
    const rollbackRuntime = nextRuntimeAfterRejection(gate, rejectionNote, gate.runtime.enabledSteps);
    setRequirement("");
    setApprovalNote("");
    setError("");
    await tryRecordApproval(gate.runtime.archive, gate, "rejected", rejectionNote);
    await rememberOrionUserWorkflowEvent(gate.runtime.task, "approval.rejected", rejectionNote, gate.step.owner, gate.step.stage, gate.runtime.archive);
    setApprovalGate(null);
    setChatLines((lines) => [...lines, `ORCH：已记录否决意见，打回 ${rollbackStep.owner} / ${rollbackStep.stage} 重做。`]);
    setLogLines((lines) => [...lines, `审批结果：rejected stage=${gate.step.stage} owner=${gate.step.owner}`, `回滚目标：${rollbackStep.owner} / ${rollbackStep.stage}`, `否决意见：${rejectionNote}`]);
    await continueWorkflow(rollbackRuntime);
  }

  async function answerClarificationGate(answer: string) {
    const gate = clarificationGate;
    if (!gate) return;
    if (isClarificationContinueCommand(answer)) {
      const nextRuntime = nextRuntimeAfterClarificationConfirmation(gate.runtime, gate.step, answer, gate.stepIndex);
      setRequirement("");
      setError("");
      setClarificationGate(null);
      await rememberOrionUserWorkflowEvent(gate.runtime.task, "clarification.confirmed", answer, gate.step.owner, gate.step.stage, gate.runtime.archive);
      setChatLines((lines) => [...lines, `ORCH：已确认 ${gate.step.owner} / ${gate.step.stage} 澄清完成，继续下一个流程。`]);
      setLogLines((lines) => [...lines, `Trellis 用户确认完成：${answer}`, `继续节点索引：${gate.stepIndex + 1}`]);
      await continueWorkflow(nextRuntime);
      return;
    }
    const nextRuntime = nextRuntimeAfterClarificationAnswer(gate.runtime, gate.step, answer, gate.stepIndex);
    setRequirement("");
    setError("");
    setClarificationGate(null);
    await rememberOrionUserWorkflowEvent(gate.runtime.task, "clarification.answered", answer, gate.step.owner, gate.step.stage, gate.runtime.archive);
    setChatLines((lines) => [...lines, `你：${answer}`, `ORCH：已把补充信息交回 ${gate.step.owner} / ${gate.step.stage}，继续 Trellis 澄清。`]);
    setLogLines((lines) => [...lines, `Trellis 用户补充：${answer}`, `回到节点：${gate.step.owner} / ${gate.step.stage}`]);
    await continueWorkflow(nextRuntime);
  }

  async function answerOrionObservationGate(answer: string) {
    const gate = orionObservationGate;
    if (!gate) return;
    const userAnswer = answer.trim() || "继续推进。";
    const nextRuntime = {
      ...gate.runtime,
      upstream: trimWorkflowContext(appendOrionObservationAnswerToUpstream(gate.runtime.upstream, gate.observation, userAnswer)),
      nextIndex: gate.stepIndex + 1,
    };
    setRequirement("");
    setError("");
    setOrionObservationGate(null);
    await rememberOrionUserWorkflowEvent(gate.runtime.task, "orion_observation.answered", userAnswer, gate.step.owner, gate.step.stage, gate.runtime.archive);
    setChatLines((lines) => [...lines, `你：${userAnswer}`, `ORION：已把你的补充交回流程记忆，继续推进 ${nextRuntime.nextIndex < nextRuntime.enabledSteps.length ? nextRuntime.enabledSteps[nextRuntime.nextIndex].owner : "收尾"}。`]);
    setLogLines((lines) => [...lines, `ORION observation answer: ${gate.step.owner} / ${gate.step.stage}`, userAnswer]);
    await continueWorkflow(nextRuntime);
  }

  async function handleComposerSubmit() {
    const text = requirement.trim();
    const attachments = pendingAttachments;
    const taskText = text || (attachments.length > 0 ? "请读取并处理我发送的附件。" : "");
    if (orionAssistantRunning) return;
    if (workflowRunning) {
      requestStopWorkflow();
      return;
    }
    if (!taskText || workflowRunning) return;
    if (orionPendingPlan) {
      await handleOrionConversationCommand(text, true);
      return;
    }
    if (orionPendingAssistant) {
      await handleOrionAssistantCommand(text);
      return;
    }
    if (clarificationGate) {
      await answerClarificationGate(text);
      return;
    }
    if (orionObservationGate) {
      await answerOrionObservationGate(text);
      return;
    }
    if (approvalGate) {
      const decision = parseApprovalInput(text);
      if (decision.action === "approved") {
        await approveCurrentGate(decision.note || approvalNote.trim());
        return;
      }
      if (decision.action === "rejected") {
        await rejectCurrentGate(decision.note || approvalNote.trim());
        return;
      }
      setChatLines((lines) => [...lines, `你：${text}`, "ORCH：当前正在等待审批。请回复“同意/批准/通过”继续，或回复“否决/打回/不通过”回滚重做。"]);
      setRequirement("");
      return;
    }
    const orionCommand = parseOrionCommand(text, false);
    if (orionCommand.type === "create_plan") {
      await createOrionPlan(orionCommand.task, { userLine: `你：@orion ${orionCommand.task}` });
      setRequirement("");
      return;
    }
    setRequirement("");
    setChatLines((lines) => [...lines, `你：${taskText}`]);
    await handleOrionPrimaryConversation(taskText, attachments);
  }

  async function handleOrionPrimaryConversation(task: string, attachments: PendingAttachment[]) {
    const latestQuestion = findLatestWaitingOrionQuestion(orionMemoryEntriesRef.current);
    if (shouldTreatAsOrionQuestionAnswer(task, latestQuestion)) {
      const contextualTask = createOrionQuestionAnswerTask(latestQuestion!, task);
      const resolvedTask = createOrionResolvedTaskForOrch(latestQuestion!, task);
      setLogLines((lines) => [...lines, "ORION question answer routed with memory context.", contextualTask]);
      await rememberOrionQuestionAnswer(latestQuestion!, task);
      await createOrionAssistantConversation(contextualTask, { userLine: "", routeReason: "answer_to_orion_question", attachments, resolvedTask });
      return;
    }

    const processReply = createOrionProcessFollowUpReply(task, {
      taskArchive,
      artifactOutputDir: appSettings.artifact_output_dir,
      memoryEntries: orionMemoryEntriesRef.current,
      chatLines,
      logLines,
    });
    if (shouldUseDirectOrionProcessFollowUpReply({ modelAvailable: canUseTauriCommands(), processReply })) {
      setChatLines((lines) => [...lines, processReply]);
      setLogLines((lines) => [...lines, "ORION process memory answered follow-up because model route is unavailable."]);
      return;
    }
    const projectFiles = summary?.files.map((file) => file.path) ?? workspaceFiles.map((file) => file.path);
    const modelRoute = await runOrionIntentRouter(task);
    if (modelRoute && intentRouteIsActionable(modelRoute)) {
      setLogLines((lines) => [...lines, `ORION intent router: ${modelRoute.route} confidence=${modelRoute.confidence}`, modelRoute.reason]);
      if (modelRoute.route === "chat") {
        await createOrionOrdinaryChatConversation(task, `intent-router: ${modelRoute.reason}`, "");
        return;
      }
      if (modelRoute.route === "assistant") {
        await createOrionAssistantConversation(task, { userLine: "", routeReason: `intent-router: ${modelRoute.reason}`, attachments });
        return;
      }
      if (modelRoute.route === "custom_workflow") {
        await createOrionPlan(task, { userLine: "" });
        return;
      }
      if (modelRoute.route === "ask_user") {
        const question = modelRoute.question ?? "我需要你再补充一点信息，才能判断是普通聊天、助手任务还是开发流程。";
        await rememberOrionQuestion(task, question, `intent-router: ${modelRoute.reason}`);
        setOrionPendingPlan(null);
        setOrionActivityRun(null);
        setChatLines((lines) => [...lines, `ORION：${question}`]);
        return;
      }
    } else if (modelRoute) {
      const question = createOrionIntentClarificationQuestion(modelRoute);
      await rememberOrionQuestion(task, question, `intent-router-low-confidence: ${modelRoute.reason}`);
      setChatLines((lines) => [...lines, `ORION：${question}`]);
      setLogLines((lines) => [...lines, `ORION intent router low confidence: ${modelRoute.route} confidence=${modelRoute.confidence}`, modelRoute.reason]);
      return;
    }

    const route = resolveOrionConversationRoute(task, {
      workflows,
      activeWorkflowId,
      projectFiles,
    });
    const fallbackRouteMemory = formatOrionIntentRouteForMemory({
      route: route.kind === "assistant" ? "assistant" : route.kind === "custom-workflow-draft" ? "custom_workflow" : "workflow",
      confidence: 0.5,
      reason: route.reason,
    }, { source: "fallback" });
    await rememberOrionDecision(task, "intent_router_fallback", fallbackRouteMemory.decision, fallbackRouteMemory.reason, fallbackRouteMemory.confidence);

    if (route.kind === "assistant") {
      await createOrionAssistantConversation(task, { userLine: "", routeReason: route.reason, attachments });
      return;
    }
    if (route.kind === "custom-workflow-draft") {
      await createOrionPlan(task, { userLine: "" });
      return;
    }

    await driveOrionDevelopmentWorkflow(task, attachments, route.workflow, route.reason, "");
  }

  async function runOrionIntentRouter(task: string): Promise<OrionIntentRouteDecision | null> {
    if (!canUseTauriCommands()) return null;
    setOrionChatRunning(true);
    try {
      const provider = providerInputForRole("administrator");
      const result = await invoke<AgentRunResult>("run_agent", {
        input: createOrionIntentRouterRunInput({
          provider,
          task,
          chatLines,
          activeWorkflowName: activeWorkflow?.name,
          projectContext: summary?.root ? `root=${summary.root}; files=${summary.files.length}` : projectPath,
          processContext: currentOrionProcessContext(),
        }),
      });
      const decision = parseOrionIntentRouteDecision(result.output);
      if (!decision) return null;
      const normalized = normalizeOrionIntentRouteDecision(decision);
      await rememberOrionDecision(task, "intent_router", normalized.route, normalized.reason, normalized.confidence);
      return normalized;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setLogLines((lines) => [...lines, `ORION intent router failed: ${message}`]);
      return null;
    } finally {
      setOrionChatRunning(false);
    }
  }

  function currentOrionProcessContext() {
    return formatOrionProcessContext({
      taskArchive,
      artifactOutputDir: appSettings.artifact_output_dir,
      memoryEntries: orionMemoryEntriesRef.current,
      chatLines,
      logLines,
    });
  }

  async function rememberOrionProcess(entry: OrionMemoryEntry, archive: TaskArchiveRef | null, task: string) {
    const nextEntries = appendOrionMemoryEntry(orionMemoryEntriesRef.current, entry);
    orionMemoryEntriesRef.current = nextEntries;
    setOrionMemoryEntries(nextEntries);
    await tryPersistOrionMemoryArchive(archive, task, nextEntries);
  }

  async function rememberOrionAssistantSummary(input: {
    task: string;
    reply: string;
    resultMessages: string[];
    traceId: string;
    archive: TaskArchiveRef | null;
    round?: number;
    status?: "completed" | "failed" | "stopped";
  }) {
    const entry = createOrionAssistantSummaryMemoryEntry({
      task: input.task,
      reply: input.reply,
      resultMessages: input.resultMessages,
      traceId: input.traceId,
      round: input.round,
      status: input.status,
      archivePath: input.archive?.path,
      artifactPaths: extractRecentArtifactPaths({
        taskArchive: input.archive,
        artifactOutputDir: appSettings.artifact_output_dir,
        memoryEntries: orionMemoryEntriesRef.current,
        chatLines,
        logLines,
      }),
    });
    await rememberOrionProcess(entry, input.archive, input.task);
  }

  async function rememberOrionChatSummary(task: string, reply: string) {
    const entry = createOrionChatSummaryMemoryEntry({ task, reply });
    await rememberOrionProcess(entry, taskArchive, task);
  }

  async function rememberOrionQuestion(task: string, question: string, reason: string) {
    const entry = createOrionAssistantQuestionMemoryEntry({ task, question, reason });
    await rememberOrionProcess(entry, taskArchive, task);
  }

  async function rememberOrionQuestionAnswer(question: OrionMemoryEntry, answer: string) {
    const entry = createOrionAssistantAnswerMemoryEntry({
      task: question.task,
      answer,
      question: orionMemoryField(question.message, "question") || question.message,
      traceId: question.traceId,
      round: question.round + 1,
    });
    await rememberOrionProcess(entry, taskArchive, question.task);
  }

  async function rememberOrionDecision(task: string, decisionType: string, decision: string, reason: string, confidence?: number) {
    const entry = createOrionDecisionMemoryEntry({
      task,
      decisionType,
      decision,
      reason,
      confidence,
    });
    await rememberOrionProcess(entry, taskArchive, task);
  }

  async function rememberOrionModelPlannerFallback(task: string, decision: OrionModelDecision) {
    const memoryDecision = formatOrionModelDecisionForMemory(decision, { source: "fallback" });
    await rememberOrionDecision(task, "model_planner_fallback", memoryDecision.decision, memoryDecision.reason);
  }

  async function rememberOrionUserWorkflowEvent(task: string, eventType: string, note: string, owner: string, stage: string, archive: TaskArchiveRef | null) {
    const entry = createOrionUserWorkflowEventMemoryEntry({
      task,
      eventType,
      note,
      owner,
      stage,
      archivePath: archive?.path,
    });
    await rememberOrionProcess(entry, archive, task);
  }

  async function rememberOrionUserAssistantEvent(task: string, eventType: string, note: string, actions: OrionAction[], archive: TaskArchiveRef | null) {
    const entry = createOrionUserAssistantEventMemoryEntry({
      task,
      eventType,
      note,
      actions: actions.map((action) => action.kind),
      archivePath: archive?.path,
    });
    await rememberOrionProcess(entry, archive, task);
  }

  function orionMemoryField(message: string, field: string) {
    const pattern = new RegExp(`(?:^|\\n)${field}:\\s*([^\\n]+)`);
    return message.match(pattern)?.[1]?.trim() ?? "";
  }

  async function driveOrionDevelopmentWorkflow(task: string, attachments: PendingAttachment[], fallbackWorkflow: WorkflowDefinition, routeReason: string, userLine = `你：${task}`) {
    setChatLines((lines) => [...lines, ...(userLine ? [userLine] : []), "ORION：我会先做一次开发流程驾驶决策，再决定使用完整流程、轻量流程或专门草案。"]);
    const modelDecision = await runOrionWorkflowDriver(task);
    const decision = modelDecision ?? fallbackOrionWorkflowDriverDecision(fallbackWorkflow, routeReason);
    if (!modelDecision) {
      const fallbackMemory = formatOrionWorkflowDriverDecisionForMemory(decision, { source: "fallback" });
      await rememberOrionDecision(task, "workflow_driver_fallback", fallbackMemory.decision, fallbackMemory.reason, fallbackMemory.confidence);
    }
    const application = applyOrionWorkflowDriverDecision(task, decision, workflows);
    setLogLines((lines) => [...lines, `ORION workflow driver: ${decision.workflow} confidence=${decision.confidence}`, decision.reason]);
    if (application.kind === "draft") {
      const actions = createOrionActionPlan(application.workflow);
      setOrionPendingPlan({ task, workflow: application.workflow, actions });
      setInspectorView("output");
      setChatLines((lines) => [
        ...lines,
        `ORION：我建议本次使用「${application.workflow.name}」。原因：${application.reason}`,
        `ORION：${application.workflow.steps.map((step, index) => `${index + 1}. ${step.owner} / ${step.stage}`).join("；")}`,
        "ORION：这是一份可审核流程草案。你可以同意并运行、只保存，或继续要求我增删节点。",
      ]);
      return;
    }
    setChatLines((lines) => [...lines, `ORION：我建议使用已有工作流「${application.workflow.name}」。原因：${application.reason}`]);
    await startRealWorkflow(task, attachments, application.workflow, {
      skipNodeApprovals: true,
      initiatedBy: "orion-existing-workflow",
      routeReason: `ORION workflow driver: ${application.reason}`,
      echoUserTask: false,
    });
  }

  async function createOrionAssistantConversation(task: string, options: { userLine: string; routeReason: string; attachments?: PendingAttachment[]; resolvedTask?: string }) {
    setOrionPendingPlan(null);
    setInspectorView("output");
    setOrionActivityRun(null);
    orionMatchedSkillIdsRef.current = [];
    if (options.userLine) setChatLines((lines) => [...lines, options.userLine]);
    const modelDecision = await runOrionModelPlanner(task);
    const decision = modelDecision ?? fallbackOrionModelDecision(task);
    if (!modelDecision) await rememberOrionModelPlannerFallback(task, decision);
    if (decision.kind === "chat") {
      const reply = decision.reply ? normalizeOrionChatOutput(decision.reply) : await runOrionOrdinaryChat(task);
      setChatLines((lines) => [...lines, reply]);
      await rememberOrionChatSummary(task, reply);
      setLogLines((lines) => [...lines, `ORION model chat: ${decision.reason}`]);
      return;
    }
    if (decision.kind === "ask_user") {
      if (decision.capability_gap) recordOrionCapabilityGap(task, decision.capability_gap);
      await rememberOrionQuestion(task, decision.question, `model-planner: ${decision.reason}`);
      setChatLines((lines) => [...lines, `ORION：${decision.question}`]);
      setLogLines((lines) => [...lines, `ORION model asks user: ${decision.reason}`]);
      return;
    }
    if (decision.kind === "draft_workflow") {
      await createOrionPlan(task, { userLine: "" });
      setLogLines((lines) => [...lines, `ORION model routes to workflow draft: ${decision.reason}`]);
      return;
    }
    if (decision.kind === "run_workflow") {
      const handoffTask = options.resolvedTask ?? task;
      const handoff = createOrionWorkflowDriverHandoff(handoffTask, decision, workflows, activeWorkflowId);
      setLogLines((lines) => [...lines, `ORION model hands development task to workflow driver: ${handoff.reason}`]);
      await driveOrionDevelopmentWorkflow(handoffTask, options.attachments ?? [], handoff.workflow, handoff.reason, "");
      return;
    }
    await prepareOrionAssistantActions(task, decision.actions, `ORION model driver: ${decision.reason}`, orionMatchedSkillIdsRef.current);
  }

  async function createOrionOrdinaryChatConversation(task: string, routeReason: string, userLine = `你：${task}`) {
    setOrionPendingPlan(null);
    setInspectorView("output");
    setOrionActivityRun(null);
    if (userLine) setChatLines((lines) => [...lines, userLine]);
    const reply = await runOrionOrdinaryChat(task);
    setChatLines((lines) => [...lines, reply]);
    await rememberOrionChatSummary(task, reply);
    setLogLines((lines) => [...lines, `ORION ordinary chat route: ${routeReason}`]);
  }

  async function prepareOrionAssistantActions(task: string, actions: OrionAction[], message: string, matchedSkillIds: string[] = [], continuationRound = 0) {
    const needsConfirmation = actions.some((action) => actionRequiresManualConfirmation(action, orionAccessMode));
    const activityRun = createOrionActivityRun(task, actions);
    setOrionActivityRun(activityRun);
    if (needsConfirmation) {
      setOrionPendingAssistant({ task, message, actions, traceId: activityRun.id, matchedSkillIds, continuationRound });
    } else if (actions.length > 0) {
      void executeOrionAssistantActions({ task, message, actions, traceId: activityRun.id, matchedSkillIds, continuationRound }, "直接执行");
    }
    setChatLines((lines) => [
      ...lines,
      `ORION：准备了 ${actions.length} 个本机助手动作草案：${actions.map((action) => `${action.kind}[${action.risk}]`).join(" -> ")}。${needsConfirmation ? "请允许本次或驳回。" : summarizeAccessModeRisk(actions, orionAccessMode)}`,
    ]);
    setLogLines((lines) => [
      ...lines,
      message,
      ...actions.map((action) => `${action.kind} risk=${action.risk} ${action.summary}`),
    ]);
  }

  function fallbackOrionModelDecision(task: string): OrionModelDecision {
    const followUpReply = createOrionFollowUpReply(task, chatLines, selectFreshOrionMemoryEntries(orionMemoryEntries, orionMemoryEntriesRef.current));
    if (followUpReply) return { kind: "chat", reply: followUpReply, reason: "structured_memory_follow_up" };
    const response = createOrionAssistantResponse(task);
    if (response.actions.length > 0) return { kind: "propose_actions", reason: "fallback_rule_planner", actions: response.actions };
    return { kind: "chat", reply: "", reason: "fallback_plain_chat" };
  }

  async function runOrionModelPlanner(task: string, options: { chatLinesOverride?: string[]; memoryEntriesOverride?: OrionMemoryEntry[] } = {}): Promise<OrionModelDecision | null> {
    if (!canUseTauriCommands()) return null;
    setOrionChatRunning(true);
    try {
      const provider = providerInputForRole("administrator");
      const skillMatches = matchRelevantOrionSkills(task, orionSkills);
      orionMatchedSkillIdsRef.current = skillMatches.map((item) => item.skill.id);
      const result = await invoke<AgentRunResult>("run_agent", {
        input: createOrionModelPlannerRunInput({
          provider,
          task,
          chatLines: options.chatLinesOverride ?? chatLines,
          memoryContext: formatOrionMemoryContext(options.memoryEntriesOverride ?? orionMemoryEntriesRef.current),
          capabilityGapContext: formatOrionCapabilityGapContext(orionCapabilityGaps),
          skillContext: formatOrionSkillContext(skillMatches.map((item) => item.skill)),
          accessModeContext: formatOrionAccessModeContext(orionAccessMode),
          projectContext: summary?.root ? `root=${summary.root}; files=${summary.files.length}` : projectPath,
          processContext: currentOrionProcessContext(),
        }),
      });
      const decision = parseOrionModelDecision(result.output);
      const memoryDecision = formatOrionModelDecisionForMemory(decision);
      await rememberOrionDecision(task, "model_planner", memoryDecision.decision, memoryDecision.reason);
      return decision;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setLogLines((lines) => [...lines, `ORION model planner failed: ${message}`]);
      return null;
    } finally {
      setOrionChatRunning(false);
    }
  }

  function recordOrionCapabilityGap(task: string, draft: NonNullable<Extract<OrionModelDecision, { kind: "ask_user" }>["capability_gap"]>) {
    const gap = createOrionCapabilityGap(task, draft);
    setOrionCapabilityGaps((gaps) => appendOrionCapabilityGap(gaps, gap));
    setLogLines((lines) => [...lines, `ORION capability gap: ${formatOrionCapabilityGapLine(gap)}`, `推荐处理：${gap.recommendation.title} - ${gap.recommendation.detail}`]);
  }

  function recordWorkflowNodeFailure(step: WorkflowStep | null, message: string, kind?: WorkflowNodeFailure["kind"]) {
    const failure = createWorkflowNodeFailure({ step, message, kind });
    setWorkflowNodeFailure(failure);
    return failure;
  }

  async function runOrionWorkflowDriver(task: string): Promise<OrionWorkflowDriverDecision | null> {
    if (!canUseTauriCommands()) return null;
    setOrionChatRunning(true);
    try {
      const provider = providerInputForRole("administrator");
      const result = await invoke<AgentRunResult>("run_agent", {
        input: createOrionWorkflowDriverRunInput({
          provider,
          task,
          workflows,
          projectContext: summary?.root ? `root=${summary.root}; files=${summary.files.length}` : projectPath,
          processContext: currentOrionProcessContext(),
        }),
      });
      const decision = parseOrionWorkflowDriverDecision(result.output);
      await rememberOrionDecision(task, "workflow_driver", decision.workflow, decision.reason, decision.confidence);
      return decision;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setLogLines((lines) => [...lines, `ORION workflow driver failed: ${message}`]);
      return null;
    } finally {
      setOrionChatRunning(false);
    }
  }

  async function runOrionWorkflowObserver(task: string, step: WorkflowStep, output: string): Promise<OrionWorkflowObservation | null> {
    if (!canUseTauriCommands()) {
      return createFallbackOrionWorkflowObservation({ owner: step.owner, stage: step.stage, reason: "tauri command runtime unavailable" });
    }
    try {
      const provider = providerInputForRole("administrator");
      const result = await invoke<AgentRunResult>("run_agent", {
        input: createOrionWorkflowObserverRunInput({
          provider,
          task,
          owner: step.owner,
          stage: step.stage,
          output,
          processContext: currentOrionProcessContext(),
        }),
      });
      return parseOrionWorkflowObservation(result.output);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setLogLines((lines) => [...lines, `ORION workflow observer failed: ${message}`]);
      return createFallbackOrionWorkflowObservation({ owner: step.owner, stage: step.stage, reason: message });
    }
  }

  async function rememberOrionWorkflowSummary(input: {
    task: string;
    status: OrionWorkflowRunStatus;
    summaryText: string;
    upstream: string;
    archive: TaskArchiveRef | null;
  }) {
    if (!canUseTauriCommands()) {
      await rememberOrionProcess(createOrionWorkflowSummaryMemoryEntry({
        task: input.task,
        status: input.status,
        summary: createFallbackOrionWorkflowSummary({
          status: input.status,
          summaryText: input.summaryText,
          reason: "tauri command runtime unavailable",
        }),
        archivePath: input.archive?.path,
      }), input.archive, input.task);
      return;
    }
    try {
      const provider = providerInputForRole("administrator");
      const result = await invoke<AgentRunResult>("run_agent", {
        input: createOrionWorkflowSummaryRunInput({
          provider,
          task: input.task,
          status: input.status,
          summaryText: input.summaryText,
          upstream: input.upstream,
          processContext: currentOrionProcessContext(),
        }),
      });
      const summary = parseOrionWorkflowSummary(result.output);
      await rememberOrionProcess(createOrionWorkflowSummaryMemoryEntry({
        task: input.task,
        status: input.status,
        summary,
        archivePath: input.archive?.path,
      }), input.archive, input.task);
      setLogLines((lines) => [...lines, `ORION workflow summary remembered: ${summary.outcome}`, summary.summary]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setLogLines((lines) => [...lines, `ORION workflow summary failed: ${message}`]);
      await rememberOrionProcess(createOrionWorkflowSummaryMemoryEntry({
        task: input.task,
        status: input.status,
        summary: createFallbackOrionWorkflowSummary({
          status: input.status,
          summaryText: input.summaryText,
          reason: message,
        }),
        archivePath: input.archive?.path,
      }), input.archive, input.task);
    }
  }

  function fallbackOrionWorkflowDriverDecision(fallbackWorkflow: WorkflowDefinition, reason: string): OrionWorkflowDriverDecision {
    const workflow = fallbackWorkflow.id === "bug-fix"
      ? "bug"
      : fallbackWorkflow.id === "test-only"
        ? "test"
        : "full";
    return {
      workflow,
      confidence: 0.55,
      needs_clarification: false,
      add_scout: false,
      add_arch_review: false,
      add_qa: workflow !== "test",
      reason: `模型驾驶决策不可用，沿用 ORX 现有推荐：${reason}`,
    };
  }

  function orionObservationRerunIndex(observation: OrionWorkflowObservation, currentIndex: number, steps: WorkflowStep[]) {
    const targetStage = observation.target_stage?.trim();
    if (!targetStage) return currentIndex;
    const targetIndex = steps.findIndex((item) => item.stage === targetStage || `${item.owner} / ${item.stage}` === targetStage);
    if (targetIndex < 0) return currentIndex;
    return Math.min(targetIndex, currentIndex);
  }

  async function runOrionOrdinaryChat(task: string) {
    if (!canUseTauriCommands()) {
      return "ORION：我在。普通聊天需要在 Tauri 客户端里调用当前模型服务，浏览器预览里暂时只能返回这条兜底回复。";
    }
    setOrionChatRunning(true);
    try {
      const provider = providerInputForRole("administrator");
      const result = await invoke<AgentRunResult>("run_agent", {
        input: createOrionChatRunInput({
          provider,
          task,
          chatLines,
          memoryContext: formatOrionMemoryContext(selectFreshOrionMemoryEntries(orionMemoryEntries, orionMemoryEntriesRef.current)),
          processContext: currentOrionProcessContext(),
        }),
      });
      return normalizeOrionChatOutput(result.output);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setLogLines((lines) => [...lines, `ORION ordinary chat failed: ${message}`]);
      return `ORION：我在，但普通聊天模型调用失败了：${message}`;
    } finally {
      setOrionChatRunning(false);
    }
  }

  async function createOrionPlan(task: string, options: { userLine?: string } = {}) {
    const draft = await runOrionCustomWorkflowDraft(task);
    const workflow = draft.workflow;
    const actions = createOrionActionPlan(workflow);
    const plan = { task, workflow, actions };
    const planRisk = highestOrionRisk(actions);
    setOrionPendingPlan(plan);
    setInspectorView("output");
    setChatLines((lines) => [
      ...lines,
      ...(options.userLine === "" ? [] : [options.userLine ?? `你：${task}`]),
      `ORION：我已为这个任务拟定工作流草案「${workflow.name}」，先不执行。`,
      `ORION：${workflow.steps.map((step, index) => `${index + 1}. ${step.owner} / ${step.stage}${step.skill_ids?.length ? `（${step.skill_ids.join(", ")}）` : ""}`).join("；")}`,
      `ORION：请审阅后选择“同意并运行”或“只保存工作流”；不合适可以驳回，也可以继续输入要求，例如“加 QA 全量覆盖”“让 DEV 参考某个文件”“先 Trellis 澄清”。`,
    ]);
    setLogLines((lines) => [...lines, `ORION draft requires user confirmation: ${planRisk}`, `ORION plan: ${workflow.name}`, `ORION draft source: ${draft.reason}`, ...actions.map((action) => `${action.kind} risk=${action.risk} ${action.summary}`)]);
  }

  async function runOrionCustomWorkflowDraft(task: string) {
    if (!canUseTauriCommands()) {
      const fallback = createFallbackOrionWorkflowDraft(task, "tauri command runtime unavailable");
      const memory = formatOrionWorkflowDraftDecisionForMemory(fallback, { source: "fallback", reason: fallback.reason });
      await rememberOrionDecision(task, "workflow_draft_fallback", memory.decision, memory.reason, memory.confidence);
      return fallback;
    }
    setOrionChatRunning(true);
    try {
      const provider = providerInputForRole("administrator");
      const result = await invoke<AgentRunResult>("run_agent", {
        input: createOrionWorkflowDraftRunInput({
          provider,
          task,
          projectContext: summary?.root ? `root=${summary.root}; files=${summary.files.length}` : projectPath,
          processContext: currentOrionProcessContext(),
        }),
      });
      const workflow = parseOrionWorkflowDraft(result.output, { task });
      if (!workflow) throw new Error("model returned an empty or unsafe workflow draft");
      const draft = { workflow, reason: "model generated custom workflow draft" };
      const memory = formatOrionWorkflowDraftDecisionForMemory(draft, { source: "model", reason: draft.reason });
      await rememberOrionDecision(task, "workflow_draft", memory.decision, memory.reason, memory.confidence);
      return draft;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setLogLines((lines) => [...lines, `ORION workflow draft model failed: ${message}`]);
      const fallback = createFallbackOrionWorkflowDraft(task, message);
      const memory = formatOrionWorkflowDraftDecisionForMemory(fallback, { source: "fallback", reason: fallback.reason });
      await rememberOrionDecision(task, "workflow_draft_fallback", memory.decision, memory.reason, memory.confidence);
      return fallback;
    } finally {
      setOrionChatRunning(false);
    }
  }

  async function handleOrionConversationCommand(text: string, hasPendingPlan: boolean) {
    const command = parseOrionCommand(text, hasPendingPlan);
    if (!orionPendingPlan) return;
    if (command.type === "approve_once") {
      await executeOrionPendingPlan(orionPendingPlan, "text");
      return;
    }
    if (command.type === "approve_session") {
      await executeOrionPendingPlan(orionPendingPlan, "session");
      return;
    }
    if (command.type === "reject") {
      rejectOrionPendingPlan(text || "驳回");
      return;
    }
    if (command.type === "modify_plan") {
      modifyOrionPendingPlan(command.modification, command.note);
      return;
    }
    if (command.type === "node_instruction") {
      addOrionNodeInstruction(command.targetOwner, command.note);
      return;
    }
    if (command.type === "explain_plan") {
      setRequirement("");
      setChatLines((lines) => [...lines, `你：${text}`, `ORION：当前计划是「${orionPendingPlan.workflow.name}」，目标是：${orionPendingPlan.task}`, `ORION：流程步骤：${orionPendingPlan.workflow.steps.map((step, index) => `${index + 1}. ${step.owner} / ${step.stage}`).join("；")}`]);
      return;
    }
    if (command.type === "list_actions") {
      setRequirement("");
      setChatLines((lines) => [...lines, `你：${text}`, `ORION：动作列表：${orionPendingPlan.actions.map((action) => `${action.kind}[${action.risk}]`).join(" -> ")}`]);
      return;
    }
    if (command.type === "explain_permission") {
      setRequirement("");
      setChatLines((lines) => [...lines, `你：${text}`, `ORION：这份草案最高权限是 ${orionRiskLabel(highestOrionRisk(orionPendingPlan.actions))}，因为同意后会保存工作流、挂载 capability，${orionPendingPlan.actions.some((action) => action.kind === "workflow.run") ? "并启动 ORCH 执行。" : "但不会自动运行。"}我不会在你确认前执行。`]);
      return;
    }
    await reviseOrionPendingPlanWithModel(text);
  }

  async function reviseOrionPendingPlanWithModel(note: string) {
    const plan = orionPendingPlan;
    if (!plan) return;
    setRequirement("");
    setChatLines((lines) => [...lines, `你：${note}`]);
    if (!canUseTauriCommands()) {
      setChatLines((lines) => [...lines, "ORION：当前模型运行环境不可用，我保留了原草案。你可以稍后重试，也可以使用明确的节点修改要求。"]);
      return;
    }
    setOrionChatRunning(true);
    try {
      const provider = providerInputForRole("administrator");
      const result = await invoke<AgentRunResult>("run_agent", {
        input: createOrionWorkflowRevisionRunInput({
          provider,
          task: plan.task,
          revision: note,
          workflow: plan.workflow,
          projectContext: summary?.root ? `root=${summary.root}; files=${summary.files.length}` : projectPath,
          processContext: currentOrionProcessContext(),
        }),
      });
      const workflow = parseOrionWorkflowRevision(result.output, plan.workflow);
      if (!workflow) throw new Error("model returned an empty or unsafe workflow revision");
      const nextPlan = applyOrionWorkflowRevision(plan, workflow);
      setOrionPendingPlan(nextPlan);
      setInspectorView("output");
      const memory = formatOrionWorkflowDraftDecisionForMemory({ workflow, reason: "model revised pending workflow draft" }, { source: "model", reason: `user revision: ${note}` });
      await rememberOrionDecision(plan.task, "workflow_revision", memory.decision, memory.reason, memory.confidence);
      setChatLines((lines) => [...lines, `ORION：我已根据你的要求修订工作流草案「${workflow.name}」。右侧预览已更新，你可以继续提要求，也可以同意并运行或驳回。`]);
      setLogLines((lines) => [...lines, `ORION workflow revision: ${workflow.name}`, ...nextPlan.actions.map((action) => `${action.kind} risk=${action.risk} ${action.summary}`)]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setChatLines((lines) => [...lines, "ORION：这次没有生成可安全采用的修订版，我保留了原草案。你可以继续描述想调整的部分。"]);
      setLogLines((lines) => [...lines, `ORION workflow revision model failed: ${message}`]);
      await rememberOrionDecision(plan.task, "workflow_revision_failed", "retained original pending workflow", `user revision: ${note}; error: ${message}`, 0.4);
    } finally {
      setOrionChatRunning(false);
    }
  }

  async function handleOrionAssistantCommand(text: string) {
    if (!orionPendingAssistant) return;
    const normalized = text.trim();
    if (/^(同意|执行|确认|允许|approve|yes|y)$/i.test(normalized)) {
      await approveOrionPendingAssistant();
      return;
    }
    if (/^(驳回|拒绝|取消|不要|reject|no|n)$/i.test(normalized)) {
      await rejectOrionPendingAssistant(text || "驳回");
      return;
    }
    setRequirement("");
    setChatLines((lines) => [...lines, `你：${text}`, "ORION：当前有本机助手动作等待确认。请回复“同意/允许”执行，或回复“驳回/取消”。"]);
  }

  function modifyOrionPendingPlan(modification: OrionPlanModification, note: string) {
    if (!orionPendingPlan) return;
    const nextPlan = applyOrionPlanModification(orionPendingPlan, modification);
    setOrionPendingPlan(nextPlan);
    setRequirement("");
    setInspectorView("output");
    const label = modification === "save_only"
      ? "只保存工作流，不自动运行"
      : modification === "add_arch_review"
        ? "加入 ARCH CodeReview"
        : modification === "add_clarification"
          ? "加入 Trellis 需求澄清"
          : modification === "add_qa"
            ? "加入 QA 测试覆盖"
            : "移除 QA 测试节点";
    setChatLines((lines) => [...lines, `你：${note}`, `ORION：已修改工作流草案：${label}。右侧预览已更新；你可以继续提要求，也可以同意并运行或驳回。`]);
    setLogLines((lines) => [...lines, `ORION modify: ${modification}`, ...nextPlan.actions.map((action) => `${action.kind} risk=${action.risk} ${action.summary}`)]);
  }

  function addOrionNodeInstruction(targetOwner: string, note: string) {
    if (!orionPendingPlan) return;
    const nextPlan = applyOrionNodeInstruction(orionPendingPlan, targetOwner, note);
    setOrionPendingPlan(nextPlan);
    setRequirement("");
    setInspectorView("output");
    setChatLines((lines) => [...lines, `你：${note}`, `ORION：已把这条补充指令挂到 ${targetOwner}。等 ORCH 执行到对应节点时，我会转交给该 Agent。`]);
    setLogLines((lines) => [...lines, `ORION node instruction: ${targetOwner}`, note]);
  }

  async function approveOrionPendingPlan(alwaysAllowSession: boolean) {
    if (!orionPendingPlan) return;
    await executeOrionPendingPlan(orionPendingPlan, alwaysAllowSession ? "session" : "once");
  }

  async function approveOrionPendingAssistant() {
    if (!orionPendingAssistant) return;
    const pending = orionPendingAssistant;
    setOrionPendingAssistant(null);
    setRequirement("");
    setInspectorView("output");
    await executeOrionAssistantActions(pending, "允许本次");
  }

  async function executeOrionAssistantActions(pending: OrionPendingAssistant, approvalLine: string) {
    await rememberOrionUserAssistantEvent(
      pending.task,
      approvalLine === "直接执行" ? "assistant.auto_executed" : "assistant.approved",
      approvalLine,
      pending.actions,
      taskArchive,
    );
    setChatLines((lines) => [...lines, `ORION：开始执行 ${pending.actions.length} 个本机助手动作。`]);
    setOrionAssistantActionCount(pending.actions.length);
    let memoryArchive = taskArchive;
    let memoryEntriesSnapshot = selectFreshOrionMemoryEntries(orionMemoryEntries, orionMemoryEntriesRef.current);
    const actionResultMessages: string[] = [];
    let stoppedAfterAction = false;
    try {
      for (const [index, action] of pending.actions.entries()) {
        setOrionActivityRun((run) => run ? markOrionActivityActionRunning(run, action.id) : run);
        try {
          const result = await executeOrionAssistantAction(action);
          const memoryEntry = createOrionMemoryEntry(pending.task, action, result.message, {
            traceId: pending.traceId,
            round: index + 1,
          });
          memoryEntriesSnapshot = appendFreshOrionMemoryEntry(memoryEntriesSnapshot, orionMemoryEntriesRef.current, memoryEntry);
          replaceOrionConversationMemory(memoryEntriesSnapshot);
          memoryArchive = await tryPersistOrionMemoryArchive(memoryArchive, pending.task, memoryEntriesSnapshot);
          setOrionActivityRun((run) => run ? markOrionActivityActionDone(run, action.id, result.message) : run);
          setChatLines((lines) => [...lines, `ORION：${result.message}`]);
          actionResultMessages.push(`${action.kind}: ${result.message}`);
          setLogLines((lines) => [...lines, `ORION assistant action done: ${action.kind}`, result.message]);
          if (result.stop) {
            stoppedAfterAction = true;
            setChatLines((lines) => [...lines, "ORION：已停止后续本机助手动作，避免在失败状态下继续执行。"]);
            setLogLines((lines) => [...lines, "ORION assistant action sequence stopped after failed command."]);
            break;
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const retryAction = createInsecureWebFetchRetryAction(action, message);
          setOrionActivityRun((run) => run ? markOrionActivityActionFailed(run, action.id, message) : run);
          setChatLines((lines) => [
            ...lines,
            `ORION：动作执行失败：${formatOrionAssistantActionError(message)}`,
            ...(retryAction ? ["ORION：目标网站的 HTTPS 证书无效。可以切换为“不安全读取重试”，我会忽略证书校验继续读取，但页面内容可能不可信。"] : []),
          ]);
          actionResultMessages.push(`failed: ${message}`);
          setLogLines((lines) => [...lines, `ORION assistant action failed: ${action.kind}`, message]);
          if (retryAction) {
            const retryRun = createOrionActivityRun(pending.task, [retryAction]);
            setOrionActivityRun(retryRun);
            setOrionPendingAssistant({
              task: pending.task,
              message: "ORION insecure web fetch retry after certificate validation failure.",
              actions: [retryAction],
              traceId: retryRun.id,
              matchedSkillIds: pending.matchedSkillIds,
              continuationRound: pending.continuationRound ?? 0,
            });
          }
          stoppedAfterAction = true;
          break;
        }
      }
      if (actionResultMessages.length > 0 && !stoppedAfterAction) {
        recordOrionSkill(pending.task, pending.actions, actionResultMessages, stoppedAfterAction, pending.matchedSkillIds ?? []);
        const continued = await continueOrionAssistantLoop(pending, actionResultMessages, memoryEntriesSnapshot, memoryArchive);
        if (!continued) {
          const summaryReply = await runOrionActionResultSummary(pending.task, actionResultMessages);
          if (summaryReply) {
            setChatLines((lines) => [...lines, summaryReply]);
            await rememberOrionAssistantSummary({
              task: pending.task,
              reply: summaryReply,
              resultMessages: actionResultMessages,
              traceId: pending.traceId,
              archive: memoryArchive,
              round: (pending.continuationRound ?? 0) + pending.actions.length + 1,
            });
          }
        }
      }
      if (actionResultMessages.length > 0 && stoppedAfterAction) {
        await rememberOrionAssistantSummary({
          task: pending.task,
          reply: "ORION stopped the local assistant action sequence after a failed or unsafe tool result.",
          resultMessages: actionResultMessages,
          traceId: pending.traceId,
          archive: memoryArchive,
          round: (pending.continuationRound ?? 0) + actionResultMessages.length + 1,
          status: "stopped",
        });
      }
    } finally {
      setOrionAssistantActionCount(0);
    }
  }

  async function continueOrionAssistantLoop(
    pending: OrionPendingAssistant,
    actionResultMessages: string[],
    memoryEntriesSnapshot: OrionMemoryEntry[],
    memoryArchive: TaskArchiveRef | null,
  ) {
    const round = pending.continuationRound ?? 0;
    if (!shouldContinueOrionAssistantLoop({ round, resultCount: actionResultMessages.length, stopped: false })) {
      return false;
    }

    const continuationTask = createOrionAssistantContinuationTask({
      originalTask: pending.task,
      resultMessages: actionResultMessages,
    });
    const modelDecision = await runOrionModelPlanner(continuationTask, {
      chatLinesOverride: [...chatLines, `ORION 工具结果：${actionResultMessages.join("；")}`],
      memoryEntriesOverride: memoryEntriesSnapshot,
    });
    const decision = modelDecision ?? fallbackOrionModelDecision(continuationTask);
    if (!modelDecision) await rememberOrionModelPlannerFallback(continuationTask, decision);
    setLogLines((lines) => [...lines, `ORION assistant loop decision: ${decision.kind}`]);

    if (decision.kind === "propose_actions") {
      await prepareOrionAssistantActions(
        pending.task,
        decision.actions,
        `ORION assistant loop: ${decision.reason}`,
        pending.matchedSkillIds ?? [],
        round + 1,
      );
      return true;
    }

    if (decision.kind === "ask_user") {
      if (decision.capability_gap) recordOrionCapabilityGap(pending.task, decision.capability_gap);
      await rememberOrionQuestion(pending.task, decision.question, `assistant-loop: ${decision.reason}`);
      setChatLines((lines) => [...lines, `ORION：${decision.question}`]);
      setLogLines((lines) => [...lines, `ORION assistant loop asks user: ${decision.reason}`]);
      return true;
    }

    if (decision.kind === "chat" && decision.reply.trim()) {
      const reply = normalizeOrionChatOutput(decision.reply);
      setChatLines((lines) => [...lines, reply]);
      await rememberOrionAssistantSummary({
        task: pending.task,
        reply,
        resultMessages: actionResultMessages,
        traceId: pending.traceId,
        archive: memoryArchive,
        round: round + 1,
      });
      setLogLines((lines) => [...lines, `ORION assistant loop final reply: ${decision.reason}`]);
      return true;
    }

    return false;
  }

  function createInsecureWebFetchRetryAction(action: OrionAction, message: string) {
    if (action.kind !== "web.fetchUrl" || !orionWebFetchErrorLooksLikeInvalidCertificate(message)) return null;
    const url = typeof action.payload.url === "string" && action.payload.url.trim()
      ? action.payload.url.trim()
      : extractUrlFromText(`${action.payload.request ?? ""} ${action.summary} ${action.title}`);
    if (!url) return null;
    return createOrionAction(
      "web.fetchUrlInsecure",
      "不安全读取网页",
      `忽略 HTTPS 证书校验后重试读取：${url}`,
      {
        ...action.payload,
        url,
        include_html: action.payload.include_html !== false,
        include_headers: action.payload.include_headers !== false,
        max_bytes: typeof action.payload.max_bytes === "number" ? action.payload.max_bytes : 200000,
      },
    );
  }

  function orionWebFetchErrorLooksLikeInvalidCertificate(message: string) {
    return /certificate|cert|tls|invalid peer certificate|expired|not valid/i.test(message);
  }

  function formatOrionAssistantActionError(message: string) {
    if (orionWebFetchErrorLooksLikeInvalidCertificate(message)) {
      return `目标网站 HTTPS 证书无效或已过期，ORX 已阻止安全读取。原始错误：${message}`;
    }
    return message;
  }

  function recordOrionSkill(task: string, actions: OrionAction[], resultMessages: string[], stopped: boolean, matchedSkillIds: string[] = []) {
    const skill = createOrionSkillFromResults({
      task,
      actionKinds: actions.map((action) => action.kind),
      resultMessages,
      stopped,
    });
    if (!skill) {
      setLogLines((lines) => [...lines, "ORION skill distill skipped: result trace is not stable enough."]);
      return;
    }
    const matchedSkillId = matchedSkillIds[0];
    if (matchedSkillId) {
      const result = reinforceOrionSkill(orionSkillsRef.current, matchedSkillId, {
        task: skill.task,
        actionKinds: skill.actionKinds,
        resultSummary: skill.resultSummary,
        now: skill.updatedAt,
      });
      const reinforced = result.reinforced;
      if (reinforced) {
        orionSkillsRef.current = result.skills;
        setOrionSkills(result.skills);
        setLogLines((lines) => [...lines, `ORION skill reinforced: ${formatOrionSkillLine(reinforced)}`]);
        return;
      }
    }
    const nextSkills = appendOrionSkill(orionSkillsRef.current, skill);
    orionSkillsRef.current = nextSkills;
    setOrionSkills(nextSkills);
    setLogLines((lines) => [...lines, `ORION skill distilled: ${formatOrionSkillLine(skill)}`]);
  }

  async function runOrionActionResultSummary(task: string, resultMessages: string[]) {
    if (!canUseTauriCommands()) return "";
    setOrionChatRunning(true);
    try {
      const provider = providerInputForRole("administrator");
      const result = await invoke<AgentRunResult>("run_agent", {
        input: {
          provider,
          owner: "ORION",
          stage: "结果整理",
          task: [
            `用户目标：${task}`,
            "下面是 ORX 已安全执行完成的工具结果。请作为 ORION 用自然语言告诉用户结论。",
            "不要输出“可交付产物/风险/下一步建议/节点完成”这类节点报告字段。",
            "只有在确实有后续建议时才给建议；如果没有明确建议，直接给结论。",
          ].join("\n"),
          upstream: resultMessages.join("\n\n"),
        },
      });
      return normalizeOrionChatOutput(result.output);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setLogLines((lines) => [...lines, `ORION result summary failed: ${message}`]);
      return "";
    } finally {
      setOrionChatRunning(false);
    }
  }

  async function tryPersistOrionMemoryArchive(archive: TaskArchiveRef | null, task: string, entries: OrionMemoryEntry[]) {
    if (!canUseTauriCommands() || entries.length === 0) return archive;
    try {
      const targetArchive = archive ?? await tryStartTaskArchive(`ORION 本机助手：${task}`);
      if (!targetArchive) return archive;
      await invoke<GeneratedArtifactWriteResult>("orion_write_generated_artifact", {
        input: {
          task_dir: targetArchive.path,
          relative_path: "orion-memory.json",
          content: formatOrionMemoryJson(entries),
        },
      });
      await invoke<GeneratedArtifactWriteResult>("orion_write_generated_artifact", {
        input: {
          task_dir: targetArchive.path,
          relative_path: "orion-findings.md",
          content: formatOrionFindingsMarkdown(entries),
        },
      });
      setLogLines((lines) => [...lines, `ORION memory persisted: ${targetArchive.path}\\generated\\orion-memory.json`]);
      return targetArchive;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setLogLines((lines) => [...lines, `ORION memory persist failed: ${message}`]);
      return archive;
    }
  }

  async function rejectOrionPendingAssistant(inputText = "驳回") {
    if (!orionPendingAssistant) return;
    const pending = orionPendingAssistant;
    await rememberOrionUserAssistantEvent(pending.task, "assistant.rejected", inputText, pending.actions, taskArchive);
    setChatLines((lines) => [...lines, `你：${inputText}`, "ORION：已取消这组本机助手动作。"]);
    setLogLines((lines) => [...lines, `ORION assistant reject: ${pending.task}`]);
    setOrionPendingAssistant(null);
    setRequirement("");
  }

  async function executeOrionAssistantAction(action: OrionAction): Promise<{ message: string; stop: boolean }> {
    const validation = validateOrionToolAction(action);
    if (!validation.ok) {
      return { message: validation.message, stop: true };
    }
    if (action.kind === "local.inspectConfig") {
      if (!canUseTauriCommands()) {
        return {
          message: `当前项目：${projectPath}；产物总目录：${appSettings.artifact_output_dir || "未设置，默认只保存到任务归档目录"}。完整本机配置路径需要在 Tauri 客户端中读取。`,
          stop: false,
        };
      }
      const result = await invoke<LocalConfigInspectionResult>("orion_inspect_local_config", { currentProject: projectPath });
      return {
        message: [
          `设置文件：${result.settings_path}`,
          `产物总目录：${result.artifact_output_dir || "未设置，默认只保存到任务归档目录"}`,
          `任务归档目录：${result.tasks_dir}`,
          `当前项目：${result.current_project}`,
        ].join("；"),
        stop: false,
      };
    }
    if (action.kind === "file.searchProject") {
      if (!canUseTauriCommands()) {
        throw new Error("项目搜索需要在 Tauri 客户端中执行；浏览器预览不可用。");
      }
      const query = typeof action.payload.query === "string" ? action.payload.query : "";
      const maxResults = typeof action.payload.max_results === "number" ? action.payload.max_results : 30;
      const result = await invoke<ProjectSearchResult>("orion_search_project", {
        input: { project_root: projectPath, query, max_results: maxResults },
      });
      return {
        message: formatProjectSearchResult(result),
        stop: false,
      };
    }
    if (action.kind === "web.fetchUrl" || action.kind === "web.fetchUrlInsecure") {
      if (!canUseTauriCommands()) {
        throw new Error("网页读取需要在 Tauri 客户端中执行；浏览器预览不可用。");
      }
      const url = typeof action.payload.url === "string" && action.payload.url.trim()
        ? action.payload.url.trim()
        : extractUrlFromText(`${action.payload.request ?? ""} ${action.summary} ${action.title}`);
      if (!url) {
        return { message: "ORION 已识别到网页读取动作，但缺少 URL。请补充要读取的网址。", stop: true };
      }
      const result = await invoke<WebFetchResult>("orion_fetch_url", {
        input: {
          url,
          include_html: action.payload.include_html !== false,
          include_headers: action.payload.include_headers !== false,
          max_bytes: typeof action.payload.max_bytes === "number" ? action.payload.max_bytes : 200000,
          danger_accept_invalid_certs: action.kind === "web.fetchUrlInsecure",
        },
      });
      return {
        message: formatWebFetchResult(result),
        stop: false,
      };
    }
    if (action.kind === "web.searchPublic" || action.kind === "web.searchSensitive") {
      if (!canUseTauriCommands()) {
        throw new Error("联网查询需要在 Tauri 客户端中执行；浏览器预览不可用。");
      }
      const query = typeof action.payload.query === "string" && action.payload.query.trim()
        ? action.payload.query.trim()
        : extractUrlFromText(`${action.payload.request ?? ""} ${action.summary} ${action.title}`) || String(action.payload.request ?? "").trim();
      if (!query) {
        return { message: "ORION 已识别到联网查询动作，但缺少查询词或网址。请补充要查询的关键词或 URL。", stop: true };
      }
      const maxResults = typeof action.payload.max_results === "number" ? action.payload.max_results : 5;
      const result = await invoke<WebSearchResult>("orion_web_search", {
        input: { query, max_results: maxResults },
      });
      return {
        message: formatWebSearchResult(result),
        stop: false,
      };
    }
    if (action.kind === "file.writeGeneratedArtifactAuto" || action.kind === "file.writeGeneratedArtifact") {
      if (!canUseTauriCommands()) {
        throw new Error("写入产物文件需要在 Tauri 客户端中执行；浏览器预览不可用。");
      }
      const relativePath = typeof action.payload.relative_path === "string" ? action.payload.relative_path : "";
      const content = typeof action.payload.content === "string" ? action.payload.content : "";
      if (!relativePath || !content) {
        return { message: "ORION 识别到你想写文件，但还缺少文件名/相对路径或要写入的具体内容。请补充例如“写入 generated/demo.txt，内容是 ...”。", stop: true };
      }
      const archive = taskArchive ?? await tryStartTaskArchive(`ORION 本机助手：${action.payload.request ?? action.title}`);
      if (!archive) {
        return { message: "无法创建任务归档目录，已停止写入。", stop: true };
      }
      const result = await invoke<GeneratedArtifactWriteResult>("orion_write_generated_artifact", {
        input: { task_dir: archive.path, relative_path: relativePath, content },
      });
      return {
        message: `已写入 generated 产物：${result.path}（${result.bytes} bytes）。`,
        stop: false,
      };
    }
    if (action.kind === "command.runWhitelisted") {
      if (!canUseTauriCommands()) {
        throw new Error("需要在 Tauri 客户端中执行本机命令；浏览器预览不可用。");
      }
      const program = typeof action.payload.program === "string" ? action.payload.program : "";
      const args = Array.isArray(action.payload.args) ? action.payload.args.filter((item): item is string => typeof item === "string") : [];
      if (!program) {
        return { message: "这个本机命令还没有解析出可执行程序；安装类动作需要先接入明确的软件源白名单。", stop: true };
      }
      const cwd = typeof action.payload.cwd === "string" && action.payload.cwd.trim() ? action.payload.cwd : projectPath;
      const result = await invoke<WhitelistedCommandResult>("orion_run_whitelisted_command", {
        input: { program, args, cwd },
      });
      return {
        message: formatWhitelistedCommandResult(result),
        stop: shouldStopAfterCommandResult(result),
      };
    }
    if (action.kind === "command.runWorktreeSandbox") {
      if (!canUseTauriCommands()) {
        throw new Error("worktree 沙箱需要在 Tauri 客户端中执行；浏览器预览不可用。");
      }
      const program = typeof action.payload.program === "string" ? action.payload.program : "";
      const args = Array.isArray(action.payload.args) ? action.payload.args.filter((item): item is string => typeof item === "string") : [];
      if (!program) {
        return { message: "这个沙箱命令还没有解析出可执行程序，已停止。", stop: true };
      }
      const projectRoot = typeof action.payload.cwd === "string" && action.payload.cwd.trim() ? action.payload.cwd : projectPath;
      const result = await invoke<SandboxCommandResult>("orion_run_sandboxed_command", {
        input: { project_root: projectRoot, program, args, timeout_secs: 120 },
      });
      return {
        message: formatSandboxCommandResult(result),
        stop: shouldStopAfterCommandResult(result),
      };
    }
    if (action.kind === "command.reviewSandbox") {
      const program = typeof action.payload.program === "string" ? action.payload.program : "";
      const args = Array.isArray(action.payload.args) ? action.payload.args.filter((item): item is string => typeof item === "string") : [];
      const cwd = typeof action.payload.cwd === "string" && action.payload.cwd.trim() ? action.payload.cwd : projectPath;
      return {
        message: `已生成沙箱命令审核草案：${program} ${args.join(" ")}（cwd: ${cwd}）。当前版本不会直接执行非白名单命令；接入沙箱 runner 后可在人工确认下运行。`,
        stop: true,
      };
    }
    if (action.kind === "memory.search") {
      const query = typeof action.payload.query === "string" ? action.payload.query : "";
      const matches = retrieveRelevantMemoryRules(query, summary?.context_brief ?? "", memoryRules);
      return {
        message: matches.length > 0
          ? `本地记忆命中：${matches.map((rule) => rule.title).join("；")}`
          : "本地记忆没有命中相关资料；可以继续要求 ORION 上网查询公开资料。",
        stop: false,
      };
    }
    return { message: `已跳过暂未支持的本机助手动作：${action.kind}`, stop: false };
  }

  async function saveOrionPendingPlanOnly() {
    if (!orionPendingPlan) return;
    const nextPlan = applyOrionPlanModification(orionPendingPlan, "save_only");
    await executeOrionPendingPlan(nextPlan, "save-only");
  }

  function rejectOrionPendingPlan(inputText = "驳回") {
    if (!orionPendingPlan) return;
    setChatLines((lines) => [...lines, `你：${inputText}`, "ORION：已取消这份动作计划。你可以继续输入新的目标或修改意见。"]);
    setLogLines((lines) => [...lines, `ORION reject: ${orionPendingPlan.workflow.id}`]);
    setOrionPendingPlan(null);
    setRequirement("");
  }

  async function executeOrionPendingPlan(plan: OrionPendingPlan, _approvalMode: "once" | "session" | "text" | "save-only" = "text") {
    const nextWorkflows = [...workflows.filter((workflow) => workflow.id !== plan.workflow.id), plan.workflow];
    setWorkflows(nextWorkflows);
    setActiveWorkflowId(plan.workflow.id);
    setOrionPendingPlan(null);
    setRequirement("");
    const shouldRun = plan.actions.some((action) => action.kind === "workflow.run");
    setChatLines((lines) => [...lines, shouldRun ? `ORION：已保存工作流「${plan.workflow.name}」，现在交给 ORCH Core 执行。` : `ORION：已保存工作流「${plan.workflow.name}」，不会自动运行。`]);
    setLogLines((lines) => [...lines, `ORION execute: saved workflow ${plan.workflow.id}`]);
    if (shouldRun) {
      await startRealWorkflow(plan.task, [], plan.workflow, { initiatedBy: "orion-custom-workflow", echoUserTask: false });
    }
  }

  function requestStopWorkflow() {
    if (workflowStopRequestedRef.current) {
      setChatLines((lines) => [...lines, "ORCH：终止请求已记录，正在等待当前节点返回。"]);
      return;
    }
    workflowStopRequestedRef.current = true;
    setCurrentActivity("正在终止当前流程");
    setChatLines((lines) => [...lines, "你：终止流程", "ORCH：已收到终止请求。当前节点如果已经发出，会在返回后停止后续节点。"]);
    setLogLines((lines) => [...lines, "用户请求终止当前流程。"]);
  }

  function handleComposerPaste(event: React.ClipboardEvent<HTMLTextAreaElement>) {
    const files = event.clipboardData.files;
    if (files.length > 0) void addAttachmentFiles(files);
  }

  function handleComposerDrop(event: React.DragEvent<HTMLFormElement>) {
    event.preventDefault();
    setComposerDragActive(false);
    if (event.dataTransfer.files.length > 0) void addAttachmentFiles(event.dataTransfer.files);
  }

  async function startRealWorkflow(task: string, attachments: PendingAttachment[] = [], workflowOverride?: WorkflowDefinition, options: WorkflowRunOptions = {}) {
    if (!canUseTauriCommands()) {
      setLogLines((lines) => [...lines, "真实流程需要在 Tauri 客户端中运行；浏览器预览只能查看界面。"]);
      return;
    }
    if (shouldBlockRecentlyStoppedTask({
      task,
      lastStoppedTask: lastStoppedWorkflowRef.current.task,
      lastStoppedAt: lastStoppedWorkflowRef.current.at,
      now: Date.now(),
    })) {
      setRequirement("");
      setChatLines((lines) => [...lines, `你：${task}`, "ORCH：刚刚已经终止过相同任务，我不会自动重复启动。确实要重跑的话，请输入“重新运行”加任务内容。"]);
      setLogLines((lines) => [...lines, `重复启动已拦截：${task}`]);
      return;
    }
    workflowStopRequestedRef.current = false;
    const routeDecision = workflowOverride
      ? {
        workflow: workflowOverride,
        confidence: "high" as const,
        reason: options.routeReason ?? (options.initiatedBy === "orion-existing-workflow" ? "ORION 已判断为开发任务，使用已有工作流。此路径不需要审核自定义工作流草案。" : "ORION 已确认并保存该工作流。"),
        matchedKind: "current" as const,
      }
      : recommendWorkflowForTask(task, workflows, activeWorkflowId);
    const selectedWorkflow = routeDecision.workflow;
    const enabledSteps = selectedWorkflow.steps.filter((step) => step.enabled !== false);
    if (selectedWorkflow.id !== activeWorkflowId && routeDecision.confidence !== "low") {
      setActiveWorkflowId(selectedWorkflow.id);
    }
    setInspectorView("output");
    setError("");
    const workflowStart = Date.now();
    setWorkflowStartedAt(workflowStart);
    setWorkflowMetrics([]);
    setOrionSuggestions([]);
    setTaskArchive(null);
    setApprovalGate(null);
    setClarificationGate(null);
    setOrionObservationGate(null);
    setWorkflowNodeFailure(null);
    setApprovalNote("");
    setCurrentActivity("ORCH 实时巡检中");
    const approvalSummary = workflowApprovalSummary(enabledSteps);
    const attachmentLine = attachments.length > 0 ? `\n附件：${attachments.map((item) => item.name).join("、")}` : "";
    setChatLines((lines) => [...lines, ...(options.echoUserTask === false ? [] : [`你：${task}${attachmentLine}`]), "ORCH：收到任务，正在读取流程配置。", `ORCH：动态路由选择：${selectedWorkflow.name}（${routeDecision.confidence}，${routeDecision.reason}）`, `ORCH：当前工作流：${selectedWorkflow.name}（${enabledSteps.length} 个节点）。`, `ORCH：${approvalSummary}`, `ORCH：启用实时巡检，节点完成后立即推进。`]);
    setLogLines((lines) => [...lines, "> start_workflow real", `用户任务：${task}`, `动态路由：${selectedWorkflow.name} / ${routeDecision.confidence} / ${routeDecision.reason}`, `当前工作流：${selectedWorkflow.name} / ${enabledSteps.length} 个节点`, approvalSummary, `巡检模式：实时巡检 / 节点完成即推进`, `ORCH：读取流程配置，准备顺序调度 ${enabledSteps.length} 个节点。`]);
    const archive = await tryStartTaskArchive(task);
    let attachmentContext = "";
    try {
      attachmentContext = await trySaveTaskAttachments(archive, attachments);
    } catch {
      setCurrentActivity("");
      setChatLines((lines) => [...lines, "ORCH：附件归档失败，流程未启动。请查看右侧输出。"]);
      return;
    }
    setPendingAttachments([]);
    const projectContext = `${summary?.context_brief ?? "尚未读取项目上下文。"}\n${workspaceContextBrief()}`;
    const relevantRules = retrieveRelevantMemoryRules(task, projectContext, memoryRules);
    const memoryContext = buildMemoryContextBlock(relevantRules);
    if (relevantRules.length > 0) {
      setLogLines((lines) => [...lines, `长期记忆命中：${relevantRules.map((rule) => rule.title).join("；")}`]);
    }
    const upstream = createOrionWorkflowStartUpstream({
      task,
      projectContext,
      projectPath,
      memoryContext,
      orionMemoryEntries: orionMemoryEntriesRef.current,
      attachmentContext,
    });
    await continueWorkflow({
      task,
      enabledSteps,
      nextIndex: 0,
      upstream,
      archive,
      workflowStart,
      runTotals: { elapsed_ms: 0, input_tokens: 0, output_tokens: 0, total_tokens: 0 },
      artifactRetries: {},
      observationRetries: {},
      skipNodeApprovals: options.skipNodeApprovals,
    });
  }

  async function continueWorkflow(runtime: WorkflowRuntime) {
    setWorkflowRunning(true);
    setApprovalGate(null);
    setClarificationGate(null);
    setOrionObservationGate(null);
    let activeStep: WorkflowStep | null = null;
    let pausedForApproval = false;
    let pausedForClarification = false;
    let pausedForObservation = false;
    let stoppedByUser = false;
    try {
      for (let stepIndex = runtime.nextIndex; stepIndex < runtime.enabledSteps.length; stepIndex += 1) {
        if (shouldStopWorkflow(workflowStopRequestedRef)) {
          stoppedByUser = true;
          break;
        }
        const step = runtime.enabledSteps[stepIndex];
        activeStep = step;
        const role = ownerToRole(step.owner);
        const provider = providerInputForRole(role);
        const endpoint = providerEndpoint(provider);
        const nodeInstructionContext = orionNodeInstructionContext(step);
        const stepCompletionCriteria = formatWorkflowStepCompletionCriteria(step);
        const stepUpstream = trimWorkflowContext(`${runtime.upstream}${nodeInstructionContext}${stepCompletionCriteria}`);
        const upstreamBeforeStep = runtime.upstream;
        setCurrentActivity(`${step.owner} 处理中`);
        setWorkflowMetrics((metrics) => [...metrics, { stage: step.stage, owner: step.owner, status: "running", elapsed_ms: 0, input_tokens: 0, output_tokens: 0, total_tokens: 0, output_preview: "处理中..." }]);
        setChatLines((lines) => [...lines, `ORCH：已下发 ${step.stage} 给 ${step.owner}。`]);
        setLogLines((lines) => [
          ...lines,
          `ORCH -> ${step.owner}: 下发节点 ${step.stage}`,
          `节点诊断：stage=${step.stage} owner=${step.owner} role=${role} provider=${provider.name} model=${provider.model}`,
          `调用地址：${endpoint}`,
          `代理路线：${provider.use_proxy_route ? provider.proxy_url : "未启用"}`,
        ]);
        const result = await invoke<AgentRunResult>("run_agent", {
          input: { provider, owner: step.owner, stage: step.stage, task: runtime.task, upstream: stepUpstream },
        });
        runtime.runTotals.elapsed_ms += result.elapsed_ms;
        runtime.runTotals.input_tokens += result.input_tokens;
        runtime.runTotals.output_tokens += result.output_tokens;
        runtime.runTotals.total_tokens += result.total_tokens;
        const nextUpstream = trimWorkflowContext(`${stepUpstream}\n\n[${result.owner} / ${result.stage}]\n${result.output}`);
        if (stepUsesInteractiveClarification(step)) {
          const clarificationDecision = parseClarificationOutput(result.output);
          runtime = { ...runtime, upstream: nextUpstream, nextIndex: stepIndex + 1 };
          if (clarificationDecision.status === "needs_user_input") {
            pausedForClarification = true;
            setWorkflowMetrics((metrics) => metrics.map((metric) => metric.stage === step.stage && metric.owner === step.owner && metric.status === "running" ? {
              stage: result.stage,
              owner: result.owner,
              status: "done",
              elapsed_ms: result.elapsed_ms,
              input_tokens: result.input_tokens,
              output_tokens: result.output_tokens,
              total_tokens: result.total_tokens,
              output_preview: previewOutput(result.output),
            } : metric));
            setWorkflowRunning(false);
            setCurrentActivity(`等待澄清：${step.owner} / ${step.stage}`);
            setClarificationGate({ step, stepIndex, result, runtime: { ...runtime, nextIndex: stepIndex }, prompt: clarificationDecision.prompt });
            setChatLines((lines) => [...lines, `${step.owner}：${clarificationDecision.prompt}`, "ORCH：Trellis 正在澄清需求，请直接回复问题；这不是审批，PRD 审核会在后续保留。"]);
            setLogLines((lines) => [...lines, `Trellis 澄清暂停：${step.owner} / ${step.stage}`, `澄清问题：${previewOutput(clarificationDecision.prompt)}`]);
            return;
          }
        }
        const needsFileArtifact = taskLikelyNeedsFileArtifact(`${runtime.task}\n${runtime.upstream}`) && stepShouldProduceFileArtifact(step);
        const artifactSave = await trySaveTaskArtifact(runtime.archive, result, "done", result.output);
        if (needsFileArtifact && (!outputHasFileArtifact(result.output) || !artifactSave.ok)) {
          const retryKey = `${step.owner}/${step.stage}`;
          const retryCount = runtime.artifactRetries?.[retryKey] ?? 0;
          if (retryCount < 1) {
            const retryReason = artifactSave.ok ? "未输出可落盘代码产物" : `产物保存/校验失败：${artifactSave.message}`;
            const retryNote = `DEV 节点${retryReason}。当前任务需要实际非空文件，请输出 Markdown 代码块，并在代码块第一行写明文件名，例如 <!-- FILE: index.html -->，代码块内容不能为空。`;
            const failure = recordWorkflowNodeFailure(step, retryNote, "artifact_missing");
            const retryUpstream = trimWorkflowContext(`${runtime.upstream}\n\n[ORCH / artifact gate]\n${retryNote}\n上一次 DEV 输出仅作为失败记录，不得继续交给 QA。`);
            setWorkflowMetrics((metrics) => metrics.map((metric) => metric.stage === step.stage && metric.owner === step.owner && metric.status === "running" ? { ...metric, status: "failed", output_preview: retryNote } : metric));
            setChatLines((lines) => [...lines, formatWorkflowNodeFailureForChat(failure), `ORCH：已自动打回 ${step.stage} 重做。`]);
            setLogLines((lines) => [...lines, `产物闸门：${retryNote}`, `回滚目标：${step.owner} / ${step.stage}`]);
            runtime = { ...runtime, upstream: retryUpstream, nextIndex: stepIndex, artifactRetries: { ...(runtime.artifactRetries ?? {}), [retryKey]: retryCount + 1 } };
            stepIndex -= 1;
            continue;
          }
          const finalArtifactMessage = `${step.owner} / ${step.stage} 未生成有效非空代码产物；QA 无法执行真实测试。请让 DEV 输出带 FILE 标记且内容非空的代码块，例如 <!-- FILE: index.html -->。${artifactSave.ok ? "" : ` 保存错误：${artifactSave.message}`}`;
          recordWorkflowNodeFailure(step, finalArtifactMessage, "artifact_missing");
          throw new Error(finalArtifactMessage);
        }
        await rememberOrionProcess(createOrionWorkflowNodeMemoryEntry({
          task: runtime.task,
          owner: result.owner,
          stage: result.stage,
          output: result.output,
          status: "done",
          archivePath: runtime.archive?.path,
          artifactPaths: extractRecentArtifactPaths({
            taskArchive: runtime.archive,
            artifactOutputDir: appSettings.artifact_output_dir,
            memoryEntries: orionMemoryEntriesRef.current,
            chatLines,
            logLines,
          }),
        }), runtime.archive, runtime.task);
        setWorkflowMetrics((metrics) => metrics.map((metric) => metric.stage === step.stage && metric.owner === step.owner && metric.status === "running" ? {
          stage: result.stage,
          owner: result.owner,
          status: "done",
          elapsed_ms: result.elapsed_ms,
          input_tokens: result.input_tokens,
          output_tokens: result.output_tokens,
          total_tokens: result.total_tokens,
          output_preview: previewOutput(result.output),
        } : metric));
        setChatLines((lines) => [...lines, `${step.owner}：${step.stage} 节点完成，耗时 ${formatDuration(result.elapsed_ms)}，已通知 ORCH。`, `ORCH：收到 ${step.owner} 产物，准备推进下一节点。`]);
        setLogLines((lines) => [...lines, `${step.owner} -> ORCH: 节点完成`, `返回地址：${result.endpoint}`, `节点统计：耗时 ${formatDuration(result.elapsed_ms)} / input ${result.input_tokens || "未返回"} / output ${result.output_tokens || "未返回"} / total ${result.total_tokens || "未返回"}`, `产物预览：${previewOutput(result.output)}`]);
        const modelObservation = await runOrionWorkflowObserver(runtime.task, step, result.output);
        const observedRuntime = {
          ...runtime,
          upstream: trimWorkflowContext(modelObservation ? appendOrionObservationToUpstream(nextUpstream, modelObservation) : nextUpstream),
          nextIndex: stepIndex + 1,
        };
        if (modelObservation) {
          await rememberOrionProcess(createOrionWorkflowObservationMemoryEntry({
            task: runtime.task,
            owner: step.owner,
            stage: step.stage,
            observation: modelObservation,
            archivePath: runtime.archive?.path,
          }), runtime.archive, runtime.task);
          setLogLines((lines) => [
            ...lines,
            `ORION workflow observer: ${modelObservation.decision} confidence=${modelObservation.confidence}`,
            modelObservation.summary,
            ...(modelObservation.memory_note ? [`ORION observer memory note: ${modelObservation.memory_note}`] : []),
          ]);
          if (observationRequiresUserInput(modelObservation)) {
            pausedForObservation = true;
            setWorkflowRunning(false);
            setCurrentActivity(`等待 ORION 观察确认：${step.owner} / ${step.stage}`);
            setOrionObservationGate({ step, stepIndex, runtime: observedRuntime, observation: modelObservation });
            setChatLines((lines) => [...lines, `ORION：${formatOrionObservationPrompt(modelObservation)}`]);
            return;
          }
          if (observationRequestsRerun(modelObservation)) {
            const targetIndex = orionObservationRerunIndex(modelObservation, stepIndex, runtime.enabledSteps);
            const targetStep = runtime.enabledSteps[targetIndex] ?? step;
            const retryKey = `${targetStep.owner}/${targetStep.stage}`;
            const retryCount = runtime.observationRetries?.[retryKey] ?? 0;
            if (retryCount < 1) {
              setWorkflowMetrics((metrics) => metrics.map((metric) => metric.stage === targetStep.stage && metric.owner === targetStep.owner ? { ...metric, status: "failed", output_preview: modelObservation.rerun_instruction || modelObservation.summary } : metric));
              setChatLines((lines) => [...lines, `ORION：${modelObservation.user_message || modelObservation.summary} 我会带着这条观察回到 ${targetStep.owner} / ${targetStep.stage} 重跑一次。`]);
              setLogLines((lines) => [...lines, `ORION observation rerun: ${targetStep.owner} / ${targetStep.stage}`, modelObservation.rerun_instruction || modelObservation.summary]);
              runtime = {
                ...runtime,
                upstream: trimWorkflowContext(appendOrionObservationRerunToUpstream(upstreamBeforeStep, modelObservation)),
                nextIndex: targetIndex,
                observationRetries: { ...(runtime.observationRetries ?? {}), [retryKey]: retryCount + 1 },
              };
              stepIndex = targetIndex - 1;
              continue;
            }
            pausedForObservation = true;
            setWorkflowRunning(false);
            setCurrentActivity(`等待 ORION 重跑确认：${targetStep.owner} / ${targetStep.stage}`);
            setOrionObservationGate({
              step: targetStep,
              stepIndex: targetIndex,
              runtime: observedRuntime,
              observation: {
                ...modelObservation,
                decision: "ask_user",
                user_message: `ORION 已经自动重跑过 ${targetStep.owner} / ${targetStep.stage} 一次，但模型仍建议重跑。请确认是继续推进，还是补充新的处理意见。`,
              },
            });
            setChatLines((lines) => [...lines, "ORION：这个节点已经按观察结果自动重跑过一次，我先暂停，避免陷入循环。请回复继续推进或给出新的处理意见。"]);
            return;
          }
          if (shouldSurfaceOrionWorkflowObservation(modelObservation)) {
            setChatLines((lines) => [...lines, `ORION：${modelObservation.user_message || modelObservation.summary}`]);
          }
        }
        const suggestions = shouldRunFallbackOrionNodeMonitor(modelObservation ?? createFallbackOrionWorkflowObservation({
          owner: step.owner,
          stage: step.stage,
          reason: "workflow observer returned no observation",
        }))
          ? monitorOrionNodeResult({ task: runtime.task, step, output: result.output })
          : [];
        setOrionSuggestions((items) => [...suggestions, ...items].slice(0, 8));
        const activeSuggestions = suggestions.filter((suggestion) => suggestion.kind !== "continue");
        if (activeSuggestions.length > 0) {
          setChatLines((lines) => [...lines, `ORION：我发现 ${step.owner} / ${step.stage} 可能需要干预：${activeSuggestions.map((suggestion) => suggestion.title).join("；")}。我先只给建议，不会自动执行。`]);
          setLogLines((lines) => [...lines, ...activeSuggestions.map((suggestion) => `ORION suggestion ${suggestion.kind}: ${suggestion.summary}`)]);
        } else {
          setLogLines((lines) => [...lines, `ORION monitor: ${step.owner} / ${step.stage} 建议继续。`]);
        }
        if (step.stage === "Retrospective") {
          proposeMemoryRuleCandidate(result.output, runtime.archive, step.stage);
        }
        runtime = observedRuntime;
        if (shouldStopWorkflow(workflowStopRequestedRef)) {
          stoppedByUser = true;
          break;
        }
        if (step.approval === "user" && !runtime.skipNodeApprovals) {
          pausedForApproval = true;
          setWorkflowRunning(false);
          setCurrentActivity(`等待审批：${step.owner} / ${step.stage}`);
          setApprovalGate({ step, stepIndex, result, runtime, preview: result.output, upstreamBefore: upstreamBeforeStep });
          setApprovalNote("");
          setInspectorView("output");
          setChatLines((lines) => [...lines, getApprovalPrompt({ step, stepIndex, runtime, upstreamBefore: upstreamBeforeStep })]);
          setLogLines((lines) => [...lines, `审批暂停：${step.owner} / ${step.stage}`, `预览产物已显示在右侧输出。`]);
          return;
        }
      }
      const wallElapsed = Date.now() - runtime.workflowStart;
      if (stoppedByUser) {
        const stoppedAt = activeStep ? `${activeStep.owner} / ${activeStep.stage}` : "等待下一个节点";
        lastStoppedWorkflowRef.current = { task: runtime.task, at: Date.now() };
        const summaryText = `# Retrospective\n\n- 状态: stopped\n- 停止位置: ${stoppedAt}\n- 总耗时: ${formatDuration(wallElapsed)}\n- 节点累计耗时: ${formatDuration(runtime.runTotals.elapsed_ms)}\n\nORCH：用户手动终止流程，后续节点未继续推进。\n`;
        await tryFinishTaskArchive(runtime.archive, "stopped", wallElapsed, runtime.runTotals, summaryText);
        await rememberOrionProcess(createOrionWorkflowRunMemoryEntry({
          task: runtime.task,
          status: "stopped",
          message: summaryText,
          archivePath: runtime.archive?.path,
          artifactPaths: extractRecentArtifactPaths({ taskArchive: runtime.archive, artifactOutputDir: appSettings.artifact_output_dir, memoryEntries: orionMemoryEntriesRef.current, chatLines, logLines }),
        }), runtime.archive, runtime.task);
        await rememberOrionWorkflowSummary({
          task: runtime.task,
          status: "stopped",
          summaryText,
          upstream: runtime.upstream,
          archive: runtime.archive,
        });
        setChatLines((lines) => [...lines, `ORCH：流程已终止，停止位置：${stoppedAt}。`]);
        setLogLines((lines) => [...lines, `流程已由用户终止：${stoppedAt}`]);
        return;
      }
      const summaryText = `# Retrospective\n\n- 状态: completed\n- 总耗时: ${formatDuration(wallElapsed)}\n- 节点累计耗时: ${formatDuration(runtime.runTotals.elapsed_ms)}\n- input tokens: ${runtime.runTotals.input_tokens || "未返回"}\n- output tokens: ${runtime.runTotals.output_tokens || "未返回"}\n- total tokens: ${runtime.runTotals.total_tokens || "未返回"}\n\nORCH：全部流程节点已完成，PM 已按交付总结规则汇总 DEV 改动、产物、原文件修改和 QA 覆盖结论。\n`;
      await tryFinishTaskArchive(runtime.archive, "completed", wallElapsed, runtime.runTotals, summaryText);
      await rememberOrionProcess(createOrionWorkflowRunMemoryEntry({
        task: runtime.task,
        status: "completed",
        message: `${summaryText}\n\n${runtime.upstream}`,
        archivePath: runtime.archive?.path,
        artifactPaths: extractRecentArtifactPaths({ taskArchive: runtime.archive, artifactOutputDir: appSettings.artifact_output_dir, memoryEntries: orionMemoryEntriesRef.current, chatLines, logLines }),
      }), runtime.archive, runtime.task);
      await rememberOrionWorkflowSummary({
        task: runtime.task,
        status: "completed",
        summaryText,
        upstream: runtime.upstream,
        archive: runtime.archive,
      });
      setChatLines((lines) => [...lines, `ORCH：全部流程节点已完成，总耗时 ${formatDuration(wallElapsed)}，PM 已汇总 DEV 改动、产物、原文件修改和 QA 覆盖结论。`]);
      setLogLines((lines) => [...lines, `ORCH：全部流程节点已完成。总耗时 ${formatDuration(wallElapsed)}，节点累计 ${formatDuration(runtime.runTotals.elapsed_ms)}，Token input ${runtime.runTotals.input_tokens || "未返回"} / output ${runtime.runTotals.output_tokens || "未返回"} / total ${runtime.runTotals.total_tokens || "未返回"}。`]);
    } catch (runError) {
      const message = runError instanceof Error ? runError.message : String(runError);
      const failedAt = activeStep ? `${activeStep.owner} / ${activeStep.stage}` : "未知节点";
      const wallElapsed = Date.now() - runtime.workflowStart;
      setError(message);
      const failure = recordWorkflowNodeFailure(activeStep, message);
      if (activeStep) {
        setWorkflowMetrics((metrics) => metrics.map((metric) => metric.stage === activeStep?.stage && metric.owner === activeStep.owner && metric.status === "running" ? { ...metric, status: "failed", output_preview: message } : metric));
      }
      setChatLines((lines) => [...lines, formatWorkflowNodeFailureForChat(failure), "ORCH：失败详情已放到右侧输出，可以据此排查或决定回滚重做。"]);
      setLogLines((lines) => [...lines, `流程执行失败节点：${failedAt}`, `流程执行失败：${message}`]);
      const summaryText = `# Retrospective\n\n- 状态: failed\n- 失败节点: ${failedAt}\n- 总耗时: ${formatDuration(wallElapsed)}\n\n${message}\n`;
      await tryFinishTaskArchive(runtime.archive, "failed", wallElapsed, runtime.runTotals, summaryText);
      await rememberOrionProcess(createOrionWorkflowRunMemoryEntry({
        task: runtime.task,
        status: "failed",
        message: summaryText,
        archivePath: runtime.archive?.path,
        artifactPaths: extractRecentArtifactPaths({ taskArchive: runtime.archive, artifactOutputDir: appSettings.artifact_output_dir, memoryEntries: orionMemoryEntriesRef.current, chatLines, logLines }),
      }), runtime.archive, runtime.task);
      await rememberOrionWorkflowSummary({
        task: runtime.task,
        status: "failed",
        summaryText,
        upstream: runtime.upstream,
        archive: runtime.archive,
      });
    } finally {
      setWorkflowRunning(false);
      workflowStopRequestedRef.current = false;
      if (!pausedForApproval && !pausedForClarification && !pausedForObservation) setCurrentActivity("");
    }
  }

  function updateWorkflowStep(index: number, patch: Partial<WorkflowStep>) {
    setWorkflows((items) => updateWorkflowSteps(items, activeWorkflowId, steps.map((step, stepIndex) => stepIndex === index ? { ...step, ...patch } : step)));
  }

  function moveWorkflowStep(index: number, direction: -1 | 1) {
    const nextSteps = (() => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= steps.length) return steps;
      const movedSteps = [...steps];
      [movedSteps[index], movedSteps[nextIndex]] = [movedSteps[nextIndex], movedSteps[index]];
      return movedSteps;
    })();
    setWorkflows((items) => updateWorkflowSteps(items, activeWorkflowId, nextSteps));
  }

  function addWorkflowStep() {
    setWorkflows((items) => updateWorkflowSteps(items, activeWorkflowId, [...steps, { stage: `Step${steps.length + 1}`, owner: "PM Agent", instruction: "描述这个步骤要产出的内容、检查点和打回条件。", enabled: true, approval: "none" }]));
  }

  function removeWorkflowStep(index: number) {
    setWorkflows((items) => updateWorkflowSteps(items, activeWorkflowId, steps.filter((_, stepIndex) => stepIndex !== index)));
  }

  function resetWorkflowSteps() {
    setWorkflows((items) => updateWorkflowSteps(items, activeWorkflowId, defaultSteps));
    setLogLines((lines) => [...lines, "> workflow_config reset", `已恢复 ${activeWorkflow?.name ?? "当前工作流"} 的默认完整步骤。`]);
  }

  function createWorkflow() {
    const result = addWorkflow(workflows);
    setWorkflows(result.workflows);
    setActiveWorkflowId(result.activeWorkflowId);
  }

  function copyWorkflow(workflowId = activeWorkflowId) {
    const result = duplicateWorkflow(workflows, workflowId);
    setWorkflows(result.workflows);
    setActiveWorkflowId(result.activeWorkflowId);
    setContextMenu(null);
  }

  async function copyChatMessage(text: string, messageKey: string) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.setAttribute("readonly", "");
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
      }
      setCopiedMessageKey(messageKey);
      window.setTimeout(() => {
        setCopiedMessageKey((current) => current === messageKey ? "" : current);
      }, 1400);
      setLogLines((lines) => [...lines, "已复制对话消息。"]);
    } catch (copyError) {
      const message = copyError instanceof Error ? copyError.message : String(copyError);
      setLogLines((lines) => [...lines, `复制对话消息失败：${message}`]);
    }
  }

  function renderCopyMessageButton(text: string, messageKey: string) {
    const copied = copiedMessageKey === messageKey;
    return <button
      type="button"
      className={`copy-message-button${copied ? " copied" : ""}`}
      aria-label={copied ? "已复制" : "复制这条消息"}
      title={copied ? "已复制" : "复制"}
      onClick={() => { void copyChatMessage(text, messageKey); }}
    >{copied ? "✓" : "⧉"}</button>;
  }

  function removeWorkflow(workflowId = activeWorkflowId) {
    const result = deleteWorkflow(workflows, workflowId, activeWorkflowId);
    setWorkflows(result.workflows);
    setActiveWorkflowId(result.activeWorkflowId);
    setContextMenu(null);
  }

  function makeWorkflowDefault(workflowId = activeWorkflowId) {
    setWorkflows((items) => setDefaultWorkflow(items, workflowId));
    setActiveWorkflowId(workflowId);
    setContextMenu(null);
  }

  function updateActiveWorkflow(patch: Partial<Omit<WorkflowDefinition, "id" | "steps">>) {
    setWorkflows((items) => updateWorkflow(items, activeWorkflowId, patch));
  }

  function renderFolderIcon() {
    return <svg className="tree-icon folder-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3.5 7.2h6.1l1.7 2h9.2v8.3a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2V7.2Z" />
      <path d="M3.5 7.2V6.5a2 2 0 0 1 2-2h4.1l1.7 2h7.2a2 2 0 0 1 2 2v.7" />
    </svg>;
  }

  function renderFileIcon() {
    return <svg className="tree-icon file-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 3.5h6.7L18 7.8V19a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 19V5A1.5 1.5 0 0 1 7.5 3.5Z" />
      <path d="M13.5 3.7v4.4h4.3" />
    </svg>;
  }

  function renderFileTree(nodes: FileTreeNode[], depth = 0) {
    return nodes.map((node) => {
      const isDirectory = node.kind === "directory";
      const isExpanded = expandedPaths.has(node.path);
      const isSelected = workspaceFilePaths.has(node.path);
      const indent = 12 + depth * 18;
      if (isDirectory) {
        return <div className="tree-group" key={node.path}>
          <button
            type="button"
            className="tree-row directory"
            style={{ paddingLeft: indent }}
            onClick={() => toggleTreePath(node.path)}
            onContextMenu={(event) => {
              event.preventDefault();
              setContextMenu({ kind: "folder", x: event.clientX, y: event.clientY, folder: node });
            }}
            title={`${node.path} · 右键加入工作区`}
          >
            <span className="tree-caret">{isExpanded ? "▾" : "▸"}</span>{renderFolderIcon()}<strong className="tree-label">{node.name}</strong>
          </button>
          {isExpanded && <div>{renderFileTree(node.children, depth + 1)}</div>}
        </div>;
      }
      return <button
        type="button"
        className={`tree-row file ${isSelected ? "selected" : ""}`}
        style={{ paddingLeft: indent }}
        key={node.path}
        title={`${node.path} · 右键${isSelected ? "移出" : "加入"}工作区`}
        onDoubleClick={() => addFileToWorkspace({ path: node.path, kind: node.kind, bytes: node.bytes })}
        onContextMenu={(event) => {
          event.preventDefault();
          setContextMenu({ kind: "file", x: event.clientX, y: event.clientY, file: { path: node.path, kind: node.kind, bytes: node.bytes } });
        }}
      >
        <span className="tree-caret placeholder"></span>{renderFileIcon()}<strong className="tree-label">{node.name}</strong><em>{node.kind || "support"}</em>
      </button>;
    });
  }

  function renderOrionActionPayload(action: OrionAction) {
    if (action.risk === "direct") return null;
    return <div className="orion-action-payload">
      {formatOrionToolPayloadPreview(action).map(([key, value]) => <p key={`${action.id}-${key}`}><span>{key}</span><em>{value}</em></p>)}
    </div>;
  }

  function renderOrionActionGroups(plan: { actions: OrionAction[] }) {
    const grouped = groupOrionActionsByRisk(plan.actions);
    const groups: OrionRiskLevel[] = ["direct", "confirm", "strong-confirm"];
    return <div className="orion-action-groups">
      {groups.map((risk) => grouped[risk].length > 0 && <section className={`orion-action-group ${risk}`} key={risk}>
        <header><strong>{orionRiskLabel(risk)}</strong><span>{grouped[risk].length} actions</span></header>
        {grouped[risk].map((action) => <article className="orion-action-row" key={action.id}>
          <div><strong>{action.kind}</strong><span>{action.title}</span></div>
          <p>{action.summary}</p>
          {renderOrionActionPayload(action)}
        </article>)}
      </section>)}
    </div>;
  }

  function renderOrionWorkflowPreview(plan: OrionPendingPlan) {
    return <article className="orion-preview">
      <header>
        <div><strong>ORION 工作流草案</strong><span>{plan.workflow.name}</span></div>
        <em>{orionRiskLabel(highestOrionRisk(plan.actions))}</em>
      </header>
      <p className="orion-preview-task">{plan.task}</p>
      <div className="orion-preview-steps">
        {plan.workflow.steps.map((step, index) => <div className="orion-preview-step" key={`${step.owner}-${step.stage}-${index}`}>
          <p><span>{index + 1}</span><strong>{step.owner} / {step.stage}</strong><em>{step.skill_ids?.join(", ") || "no skill"}</em></p>
          <small>{step.instruction}</small>
          {step.orion_notes?.map((note) => <small key={`${step.owner}-${step.stage}-${note}`}>ORION：{note}</small>)}
        </div>)}
      </div>
      {renderOrionActionGroups(plan)}
    </article>;
  }

  function renderOrionAssistantPreview(plan: OrionPendingAssistant) {
    return <article className="orion-preview">
      <header>
        <div><strong>ORION Local Assistant</strong><span>本机助手动作</span></div>
        <em>{orionRiskLabel(highestOrionRisk(plan.actions))}</em>
      </header>
      <p className="orion-preview-task">{plan.task}</p>
      <p>{plan.message}</p>
      {renderOrionActionGroups(plan)}
    </article>;
  }

  function renderOrionActivityRun(run: OrionActivityRun) {
    const doneCount = run.steps.filter((step) => step.status === "done").length;
    const statusLabel = run.status === "running" ? "执行中" : run.status === "failed" ? "失败" : run.status === "done" ? "完成" : "待执行";
    return <article className={`orion-activity-run ${run.status}`}>
      <header><div><strong>ORION 临时任务</strong><span>{run.task}</span></div><em>{statusLabel} · {doneCount}/{run.steps.length}</em></header>
      <div className="orion-activity-steps">
        {run.steps.map((step) => <section className={`orion-activity-step ${step.status}`} key={step.id}>
          <span aria-hidden="true">{step.status === "done" ? "✓" : step.status === "failed" ? "!" : step.status === "running" ? "●" : ""}</span>
          <div><strong>{step.title}</strong><p>{step.detail}</p></div>
        </section>)}
      </div>
    </article>;
  }

  function renderOrionActivityFloat(run: OrionActivityRun) {
    const doneCount = run.steps.filter((step) => step.status === "done").length;
    return <>
      <header>
        <div><strong>任务进度</strong><span>ORION 临时任务</span></div>
        <em>{doneCount}/{run.steps.length}</em>
        <button type="button" className="activity-float-toggle" aria-label="收纳任务进度" onClick={() => setActivityFloatExpanded(false)}><span aria-hidden="true"></span></button>
      </header>
      <div className="workflow-progress-list">
        {run.steps.map((step) => <article className={`workflow-progress-step ${step.status}`} key={step.id}>
          <span className="workflow-progress-icon" aria-hidden="true">{step.status === "done" ? "✓" : step.status === "failed" ? "!" : ""}</span>
          <div><strong>{step.title}</strong><small>{orionActivityStepStatusLabel(step.status)}</small></div>
        </article>)}
      </div>
    </>;
  }

  function orionNodeInstructionContext(step: WorkflowStep) {
    if (!step.orion_notes?.length) return "";
    return `\n\n[ORION 转交给 ${step.owner} / ${step.stage} 的补充指令]\n${step.orion_notes.map((note) => `- ${note}`).join("\n")}`;
  }

  const shellBaseClassName = inspectorCollapsed ? "app-shell inspector-collapsed" : "app-shell";
  const shouldShowWorkflowProgressFloat = workflowMetrics.length > 0
    && inspectorCollapsed
    && !approvalGate
    && !orionObservationGate
    && !configPanel
    && !orionPendingPlan
    && !orionPendingAssistant
    && !pendingMemoryCandidate;
  const shouldShowActivityFloat = shouldShowOrionActivityFloat({
    run: orionActivityRun,
    inspectorCollapsed,
    workflowMetricCount: workflowMetrics.length,
    hasApprovalGate: Boolean(approvalGate),
    hasConfigPanel: Boolean(configPanel),
    hasPendingPlan: Boolean(orionPendingPlan),
    hasPendingAssistant: Boolean(orionPendingAssistant),
    hasPendingMemoryCandidate: Boolean(pendingMemoryCandidate),
  });
  const shouldShowAnyActivityFloat = shouldShowWorkflowProgressFloat || (shouldShowActivityFloat && Boolean(orionActivityRun));
  const shellClassName = `${shellBaseClassName}${shouldShowAnyActivityFloat ? " has-activity-float" : ""}`;
  const activityFloatCollapsedSummary = shouldShowActivityFloat && orionActivityRun
    ? activityFloatSummary({
      title: "任务进度",
      subtitle: "ORION 临时任务",
      done: orionActivityDoneCount,
      total: orionActivityTotal,
      active: activityFloatActive,
    })
    : activityFloatSummary({
      title: "流程进度",
      subtitle: activeWorkflow?.name ?? "ORION 自动判断",
      done: workflowDoneCount,
      total: workflowProgressTotal,
      active: activityFloatActive,
    });

  return (
    <main className={shellClassName} onClick={() => { setContextMenu(null); setWorkflowMenuOpen(false); setAccessModeMenuOpen(false); }}>
      <aside className="sidebar">
        <div className="sidebar-kicker">WORKSPACES</div>
        <nav className="sidebar-nav" aria-label="主导航">
          <button type="button" onClick={() => setConfigPanel("workflow")}><span>⌁</span>工作流</button>
          <button type="button" onClick={() => setConfigPanel("provider")}><span>◇</span>模型服务</button>
          <button type="button" onClick={() => setConfigPanel("settings")}><span>·</span>设置</button>
        </nav>
        <section className="project-panel">
          <div className="sidebar-section-title"><span>项目</span><button className="project-add-button" type="button" onClick={addCurrentProject} aria-label="新增项目" title="新增项目">+</button></div>
          <p className="project-path-hint" title={projectPath}>{projectPath}</p>
          <div className="project-list" aria-label="已保存项目">
            {projects.length === 0 ? <p>暂无已保存项目。</p> : projects.map((project) => {
              const projectExpanded = expandedProjectIds.has(project.id);
              const projectConversations = conversations.filter((conversation) => conversation.projectId === project.id);
              return <div className="project-group" key={project.id}>
              <button
                type="button"
                className="project-row"
                onClick={() => toggleProject(project.id)}
                onDoubleClick={() => scanProject(project)}
                onContextMenu={(event) => {
                  event.preventDefault();
                  setContextMenu({ kind: "project", x: event.clientX, y: event.clientY, project });
                }}
              ><span className="project-caret tree-caret">{projectExpanded ? "▾" : "▸"}</span>{renderFolderIcon()}<span className="project-name">{project.name}</span><em>{project.source_count} src / {project.test_count} test</em></button>
              {projectExpanded && <div className="conversation-list">
                {projectConversations.length === 0 ? <p>右键项目新建对话</p> : projectConversations.map((conversation) => <button
                  type="button"
                  className={activeConversationId === conversation.id ? "active" : ""}
                  key={conversation.id}
                  onClick={() => selectConversation(conversation)}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setContextMenu({ kind: "conversation", x: event.clientX, y: event.clientY, conversation });
                  }}
                >{conversation.title}</button>)}
              </div>}
            </div>;
            })}
          </div>
        </section>
      </aside>

      <section className="workspace">
        <header className="workspace-topbar">
          <div className="workspace-session">
            <span>ORX</span>
            <em>{activeWorkflow?.name ?? "ORION 自动判断"}</em>
          </div>
        </header>
        <section className="terminal-log" aria-label="ORCH 对话">
          <div className="flow-column" aria-label="系统输出流">
            {chatTimelineItems.map((item, index) => {
              const messageKey = `chat-${item.side}-${index}`;
              return item.side === "user"
                ? <article className="user-message-row" key={`chat-${item.text}-${index}`} onMouseLeave={() => setCopiedMessageKey((current) => current === messageKey ? "" : current)}><div className="user-message-bubble"><span>{item.text}</span></div><div className="message-copy-actions">{renderCopyMessageButton(item.text, messageKey)}</div></article>
                : <p className={item.tone === "error" ? "error-line" : "system-line"} key={`chat-${item.text}-${index}`} onMouseLeave={() => setCopiedMessageKey((current) => current === messageKey ? "" : current)}><span>$</span><span className="line-text"><span>{item.text}</span></span><span className="message-copy-actions">{renderCopyMessageButton(item.text, messageKey)}</span></p>;
            })}
            {(workflowRunning || approvalGate || clarificationGate || orionObservationGate || orionAssistantRunning || orionChatRunning) && <p className="thinking-line" aria-live="polite"><span>$</span><span className="thinking-content">{orionChatRunning ? "ORION 正在等待模型回复" : orionAssistantRunning ? assistantActivityLine(orionAssistantActionCount) : currentActivity || "ORCH 处理中"}{(workflowRunning || orionAssistantRunning || orionChatRunning) && <><i></i><i></i><i></i></>}</span></p>}
          </div>
        </section>
        {shouldShowAnyActivityFloat && !activityFloatExpanded && <button type="button" className="workflow-progress-float collapsed" aria-label="展开流程流转进度" aria-expanded={false} onClick={() => setActivityFloatExpanded(true)}>
          <span>{activityFloatCollapsedSummary.title}</span>
          <strong>{activityFloatCollapsedSummary.progress}</strong>
          <em>{activityFloatCollapsedSummary.status === "运行中" ? "运行中" : activityFloatCollapsedSummary.subtitle}</em>
        </button>}
        {shouldShowWorkflowProgressFloat && activityFloatExpanded && <aside className="workflow-progress-float expanded" aria-label="流程流转进度">
          <header>
            <div><strong>流程进度</strong><span>{activeWorkflow?.name ?? "ORION 自动判断"}</span></div>
            <em>{workflowDoneCount}/{workflowProgressSteps.length}</em>
            <button type="button" className="activity-float-toggle" aria-label="收纳流程进度" onClick={() => setActivityFloatExpanded(false)}><span aria-hidden="true"></span></button>
          </header>
          <div className="workflow-progress-list">
            {workflowProgressSteps.map((step) => <article className={`workflow-progress-step ${step.status}`} key={`${step.owner}-${step.stage}-${step.index}`}>
              <span className="workflow-progress-icon" aria-hidden="true">{step.status === "done" ? "✓" : step.status === "failed" ? "!" : ""}</span>
              <div><strong>{step.owner} / {step.stage}</strong><small>{step.status === "running" ? currentActivity || "正在运行" : step.status === "done" ? formatDuration(step.elapsed_ms) : step.status === "failed" ? "已停止" : "等待中"}</small></div>
            </article>)}
          </div>
        </aside>}
        {shouldShowActivityFloat && orionActivityRun && activityFloatExpanded && <aside className="workflow-progress-float orion-activity-float expanded" aria-label="ORION 临时任务轨迹">
          {renderOrionActivityFloat(orionActivityRun)}
        </aside>}
        <form
          className={`composer${composerDragActive ? " drag-active" : ""}`}
          onSubmit={(event) => { event.preventDefault(); void handleComposerSubmit(); }}
          onDragEnter={(event) => { event.preventDefault(); setComposerDragActive(true); }}
          onDragOver={(event) => { event.preventDefault(); setComposerDragActive(true); }}
          onDragLeave={(event) => { if (event.currentTarget === event.target) setComposerDragActive(false); }}
          onDrop={handleComposerDrop}
        >
          {orionPendingPlan && <section className="orion-permission-request" aria-label="ORION 工作流草案确认">
            <header>
              <strong>ORION 工作流草案待确认</strong>
              <span>{orionPendingPlan.workflow.name}</span>
            </header>
            <p>{orionRiskLabel(highestOrionRisk(orionPendingPlan.actions))} · {actionRiskSummary(orionPendingPlan.actions)}。你可以同意、只保存、驳回，或继续输入对 Agent/节点的修改要求。</p>
            <div className="orion-permission-options">
              <button type="button" onClick={() => { void approveOrionPendingPlan(false); }}>同意并运行</button>
              <button type="button" onClick={() => { void saveOrionPendingPlanOnly(); }}>只保存工作流</button>
              <button type="button" className="danger-button" onClick={() => rejectOrionPendingPlan()}>驳回</button>
            </div>
          </section>}
          {orionPendingAssistant && <section className="orion-permission-request" aria-label="ORION 本机助手权限请求">
            <header>
              <strong>ORION 请求：执行本机助手动作</strong>
              <span>{orionPendingAssistant.task}</span>
            </header>
            <p>{orionRiskLabel(highestOrionRisk(orionPendingAssistant.actions))} · {actionRiskSummary(orionPendingAssistant.actions)}</p>
            <div className="orion-permission-options">
              <button type="button" onClick={() => { void approveOrionPendingAssistant(); }}>允许本次</button>
              <button type="button" className="danger-button" onClick={() => { void rejectOrionPendingAssistant(); }}>驳回</button>
            </div>
          </section>}
          {pendingMemoryCandidate && <section className="memory-candidate-request" aria-label="长期记忆候选">
            <header>
              <strong>长期记忆候选</strong>
              <span>{pendingMemoryCandidate.candidate.source_task_id}</span>
            </header>
            <label>
              <span>标题</span>
              <input value={pendingMemoryCandidate.candidate.title} onChange={(event) => updatePendingMemoryCandidateDraft({ title: event.target.value })} />
            </label>
            <label>
              <span>内容</span>
              <textarea value={pendingMemoryCandidate.candidate.body} onChange={(event) => updatePendingMemoryCandidateDraft({ body: event.target.value })} />
            </label>
            <label>
              <span>标签</span>
              <input value={pendingMemoryCandidate.candidate.tags.join(", ")} onChange={(event) => updatePendingMemoryCandidateDraft({ tagsText: event.target.value })} />
            </label>
            <div className="memory-candidate-options">
              <button type="button" onClick={() => { void savePendingMemoryCandidate(); }}>保存记忆</button>
              <button type="button" className="danger-button" onClick={ignorePendingMemoryCandidate}>忽略</button>
            </div>
          </section>}
          {pendingAttachments.length > 0 && <div className="attachment-tray" aria-label="待发送附件">
            {pendingAttachments.map((attachment) => <div className="attachment-chip" key={attachment.id}>
              <span>{attachment.name}</span>
              <em>{attachment.kind} · {attachment.bytes} bytes</em>
              <button type="button" aria-label={`移除附件 ${attachment.name}`} onClick={() => removePendingAttachment(attachment.id)}>×</button>
            </div>)}
          </div>}
          <textarea value={requirement} disabled={orionAssistantRunning || orionChatRunning} placeholder={orionChatRunning ? "ORION 正在等待模型回复" : orionAssistantRunning ? "ORION 正在执行本机助手动作" : orionObservationGate ? "回复 ORION 的观察问题，或输入“继续”推进" : clarificationGate ? "直接回答 Trellis 的澄清问题" : "告诉 ORION 你想做什么，或粘贴/拖入文件"} onPaste={handleComposerPaste} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} onChange={(event) => setRequirement(event.target.value)} aria-label="需求描述" />
          <div className="composer-toolbar">
            <div className="template-picker" onClick={(event) => event.stopPropagation()}>
              <button type="button" aria-haspopup="listbox" aria-expanded={workflowMenuOpen} onClick={() => setWorkflowMenuOpen((open) => !open)}>{activeWorkflow?.name ?? "ORION 自动判断"}</button>
              {workflowMenuOpen && <div className="template-menu" role="listbox">
                <button type="button" role="option" aria-selected={!activeWorkflowId} onClick={() => { setActiveWorkflowId(""); setWorkflowMenuOpen(false); }}>ORION 自动判断</button>
                {workflows.map((workflow) => <button type="button" role="option" aria-selected={activeWorkflowId === workflow.id} key={workflow.id} onClick={() => { setActiveWorkflowId(workflow.id); setWorkflowMenuOpen(false); }}>{workflow.name}{workflow.isDefault ? " · 默认" : ""}</button>)}
              </div>}
            </div>
            <div className="access-mode-picker" onClick={(event) => event.stopPropagation()}>
              <button type="button" aria-haspopup="listbox" aria-expanded={accessModeMenuOpen} onClick={() => setAccessModeMenuOpen((open) => !open)}><span>◎</span>{accessModeOption.label}</button>
              {accessModeMenuOpen && <div className="access-mode-menu" role="listbox">
                {orionAccessModeOptions.map((option) => <button type="button" role="option" aria-selected={orionAccessMode === option.id} key={option.id} onClick={() => { setOrionAccessMode(option.id); setAccessModeMenuOpen(false); }}>
                  <span>{option.label}</span>
                  <em>{option.description}</em>
                </button>)}
              </div>}
            </div>
            <button type="submit" className={composerButtonState.className} disabled={composerButtonState.disabled} aria-label={composerButtonState.ariaLabel} title={composerButtonState.title}>{composerButtonState.content}</button>
          </div>
        </form>
      </section>

      <aside className="context-panel">
        <div className="inspector-shell-controls">
          <button type="button" className="inspector-toggle-button" aria-label={inspectorCollapsed ? "展开右侧栏" : "收起右侧栏"} title={inspectorCollapsed ? "展开右侧栏" : "收起右侧栏"} onClick={(event) => { event.stopPropagation(); setInspectorCollapsed((collapsed) => !collapsed); }}>{inspectorCollapsed ? "◧" : "◨"}</button>
        </div>
        <div className="inspector-content">
        <div className="inspector-tabs" role="tablist" aria-label="右侧信息切换"><button type="button" className={inspectorView === "output" ? "active" : ""} onClick={() => setInspectorView("output")}>输出</button><button type="button" className={inspectorView === "context" ? "active" : ""} onClick={() => setInspectorView("context")}>上下文</button><button type="button" className={inspectorView === "files" ? "active" : ""} onClick={() => setInspectorView("files")}>项目文件</button></div>
        {inspectorView === "output" && <section className="panel inspector-card detail-output"><h2>输出详情</h2>
          <div className="run-summary">
            <span>总耗时 {workflowStartedAt ? formatDuration((workflowRunning ? Date.now() : Date.now()) - workflowStartedAt) : "0ms"}</span>
            <span>节点耗时 {formatDuration(workflowTotals.elapsed_ms)}</span>
            <span>输入 {workflowTotals.input_tokens || "未返回"}</span>
            <span>输出 {workflowTotals.output_tokens || "未返回"}</span>
            <span>总计 {workflowTotals.total_tokens || "未返回"}</span>
          </div>
          {orionPendingPlan && renderOrionWorkflowPreview(orionPendingPlan)}
          {orionPendingAssistant && renderOrionAssistantPreview(orionPendingAssistant)}
          {!orionPendingPlan && !orionPendingAssistant && workflowMetrics.length === 0 && orionActivityRun && renderOrionActivityRun(orionActivityRun)}
          {orionSuggestions.length > 0 && <details className="orion-suggestions" open>
            <summary><strong>ORION 运行建议</strong><span>{orionSuggestions.length} 条</span></summary>
            {orionSuggestions.map((suggestion) => <section className={`orion-suggestion ${suggestion.kind}`} key={suggestion.id}>
              <div><strong>{suggestion.title}</strong><em>{suggestion.kind}</em></div>
              <p>{suggestion.summary}</p>
              <span>{suggestion.targetOwner} / {suggestion.targetStage}</span>
              <small>{suggestion.reason}</small>
            </section>)}
          </details>}
          {approvalGate && <article className="approval-hint"><strong>等待审批</strong><span>{approvalGate.step.owner} / {approvalGate.step.stage}</span><p>审批预览已在中间弹窗打开。</p></article>}
          {clarificationGate && <article className="approval-hint"><strong>等待澄清</strong><span>{clarificationGate.step.owner} / {clarificationGate.step.stage}</span><p>Trellis 正在追问需求，直接回复即可。</p></article>}
          {orionObservationGate && <article className="approval-hint"><strong>等待 ORION 观察确认</strong><span>{orionObservationGate.step.owner} / {orionObservationGate.step.stage}</span><p>{formatOrionObservationPrompt(orionObservationGate.observation)}</p></article>}
          {workflowNodeFailure && <article className={`workflow-failure-card ${workflowNodeFailure.kind}`}>
            <header><strong>{workflowNodeFailure.title}</strong><span>{workflowNodeFailure.owner} / {workflowNodeFailure.stage}</span></header>
            <p>{workflowNodeFailure.summary}</p>
            <small>{workflowNodeFailure.recovery}</small>
          </article>}
          {taskArchive && <p>task archive: {taskArchive.path}</p>}
          {workflowMetrics.length > 0 && <article className="output-focus-card">
            <header><strong>当前流程摘要</strong><span>{workflowMetrics.filter((metric) => metric.status === "done").length}/{workflowProgressSteps.length} done</span></header>
            <p>{workflowMetrics[workflowMetrics.length - 1]?.output_preview ?? currentActivity}</p>
          </article>}
          {workflowMetrics.length > 0 && <details className="metric-details">
            <summary>节点详细输出 · {workflowMetrics.length}</summary>
            {workflowMetrics.map((metric, index) => <article className={`metric-row ${metric.status}`} key={`${metric.stage}-${metric.owner}-${index}`}>
              <header><strong>{metric.owner}</strong><span>{metric.stage}</span><em>{metric.status === "running" ? "running" : metric.status === "done" ? "done" : "failed"}</em></header>
              <p>耗时 {metric.elapsed_ms ? formatDuration(metric.elapsed_ms) : "-"} · input {metric.input_tokens || "未返回"} · output {metric.output_tokens || "未返回"} · total {metric.total_tokens || "未返回"}</p>
              <p>{metric.output_preview}</p>
            </article>)}
          </details>}
          {error && <p className="error-line">当前错误：{error}</p>}
          <details className="log-details">
            <summary>最近输出 · {latestOutput.length}</summary>
            {latestOutput.slice(-10).map((line, index) => <p className={line.includes("失败") || line.includes("error=") || line.includes("HTTP ") ? "error-line" : ""} key={`${line}-${index}`}>{line}</p>)}
          </details>
          <details className="log-details">
            <summary>系统日志</summary>
            {logLines.slice(0, 6).map((line, index) => <p key={`system-${line}-${index}`}>{line}</p>)}
          </details>
        </section>}
        {inspectorView === "context" && <section className="panel inspector-card"><h2>上下文摘要</h2><p>{summary?.context_brief ?? "添加项目后，这里展示 README、manifest、源码和测试文件摘要。"}</p>{summary?.project_profile && <div className="project-profile"><h3>项目画像</h3><p>{projectProfileBrief(summary.project_profile)}</p></div>}<div className="stats"><span>src {summary?.source_count ?? 0}</span><span>test {summary?.test_count ?? 0}</span><span>workspace {workspaceFiles.length}</span></div>{workspaceFiles.length > 0 && <div className="workspace-files"><h3>工作区上下文</h3>{workspaceFiles.map((file) => <button type="button" key={file.path} onClick={() => removeFileFromWorkspace(file.path)} title="点击移出工作区"><span>{file.path}</span><em>移出</em></button>)}</div>}</section>}
        {inspectorView === "files" && <section className="panel inspector-card file-list"><h2>项目文件</h2><p>右键文件或文件夹加入工作区，双击文件快速加入。</p>{fileTree.length === 0 ? <p>等待扫描。</p> : <div className="file-tree">{renderFileTree(fileTree)}</div>}</section>}
        </div>
      </aside>

      {contextMenu && <div className="file-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={(event) => event.stopPropagation()}>
        {contextMenu.kind === "file" && (workspaceFilePaths.has(contextMenu.file.path)
          ? <button type="button" onClick={() => { removeFileFromWorkspace(contextMenu.file.path); setContextMenu(null); }}>移出工作区</button>
          : <button type="button" onClick={() => addFileToWorkspace(contextMenu.file)}>加入工作区</button>)}
        {contextMenu.kind === "folder" && <button type="button" onClick={() => addFolderToWorkspace(contextMenu.folder)}>文件夹加入工作区</button>}
        {contextMenu.kind === "project" && <>
          <button type="button" onClick={() => createConversation(contextMenu.project.id, `${contextMenu.project.name} 对话`)}>新建对话</button>
          <button type="button" onClick={() => { void removeProject(contextMenu.project); }}>移除项目</button>
        </>}
        {contextMenu.kind === "conversation" && <button type="button" onClick={() => deleteConversation(contextMenu.conversation)}>删除对话</button>}
        {contextMenu.kind === "workflow" && <>
          <button type="button" onClick={() => copyWorkflow(contextMenu.workflow.id)}>复制</button>
          <button type="button" onClick={() => makeWorkflowDefault(contextMenu.workflow.id)} disabled={contextMenu.workflow.isDefault}>设为默认</button>
          <button type="button" onClick={() => removeWorkflow(contextMenu.workflow.id)} disabled={contextMenu.workflow.isDefault}>删除</button>
        </>}
      </div>}

      {approvalGate && <div className="approval-modal-backdrop" role="dialog" aria-modal="true" aria-label="审批预览">
        <article className="approval-modal" onClick={(event) => event.stopPropagation()}>
          <header>
            <div>
              <strong>待审批预览</strong>
              <span>{approvalGate.step.owner} / {approvalGate.step.stage}</span>
            </div>
            <em>{approvalGate.step.rollback_target ? `打回到 ${approvalGate.step.rollback_target}` : "按当前节点打回"}</em>
          </header>
          <pre>{approvalGate.preview}</pre>
          <label className="approval-note"><span>审批意见（可选）</span><textarea value={approvalNote} onChange={(event) => setApprovalNote(event.target.value)} placeholder="例如：方向可以继续，但国家字段必须作为必填项；或说明为什么打回。" /></label>
          <footer>
            <button type="button" onClick={() => { void approveCurrentGate(approvalNote.trim()); }}>同意继续</button>
            <button type="button" className="danger-button" onClick={() => { void rejectCurrentGate(approvalNote.trim()); }}>否决打回</button>
          </footer>
        </article>
      </div>}

      {configPanel && <div className="config-backdrop" role="dialog" aria-modal="true" aria-label={configPanelTitle(configPanel)}>
        <section className="config-sheet">
          <header><h2>{configPanelTitle(configPanel)}</h2><div className="config-header-actions"><button type="button" onClick={() => { void saveCurrentConfigPanel(); }} disabled={savingConfig}>{savingConfig ? "保存中..." : "保存"}</button><button className="icon-button" type="button" aria-label="关闭配置弹窗" title="关闭" onClick={() => setConfigPanel(null)}>×</button></div></header>
          {configPanel === "provider" && <div className="provider-manager config-content">
            <aside className="provider-list-panel">
              <div className="provider-list">
                {providerSnapshot.providers.map((provider) => <button type="button" className={provider.id === providerForm.id ? "active" : ""} key={provider.id} onClick={() => selectProviderConfig(provider)}>
                  <span>{provider.name}</span>
                  <em>{provider.model || "未填写模型"}</em>
                </button>)}
                {!providerSnapshot.providers.some((provider) => provider.id === providerForm.id) && <button type="button" className="active draft-provider">
                  <span>{providerForm.name || "未保存模型配置"}</span>
                  <em>{providerForm.model || "草稿"}</em>
                </button>}
              </div>
              <button type="button" onClick={newProviderConfig}>新建模型配置</button>
            </aside>
            <section className="provider-panel">
              <label><span>ID</span><input value={providerForm.id} onChange={(event) => setProviderForm({ ...providerForm, id: event.target.value })} /></label>
              <label><span>名称</span><input value={providerForm.name} onChange={(event) => setProviderForm({ ...providerForm, name: event.target.value })} /></label>
              <label><span>API 协议</span><select value={providerForm.api_protocol} onChange={(event) => setProviderForm({ ...providerForm, api_protocol: event.target.value as ProviderApiProtocol })}>{Object.entries(providerProtocolLabels).map(([protocol, label]) => <option key={protocol} value={protocol}>{label}</option>)}</select></label>
              <label><span>Base URL</span><input value={providerForm.base_url} onChange={(event) => setProviderForm({ ...providerForm, base_url: event.target.value })} /></label>
              <label className="toggle-row proxy-toggle"><input type="checkbox" checked={providerForm.use_proxy_route} onChange={(event) => setProviderForm({ ...providerForm, use_proxy_route: event.target.checked })} /><span>通过本机 Clash 代理请求</span></label>
              <label><span>代理地址</span><input value={providerForm.proxy_url} placeholder="例如：http://127.0.0.1:7897" onChange={(event) => setProviderForm({ ...providerForm, proxy_url: event.target.value })} /></label>
              <label><span>模型</span><input value={providerForm.model} placeholder="例如：gpt-5.5 / deepseek-chat" onChange={(event) => setProviderForm({ ...providerForm, model: event.target.value })} /></label>
              <label><span>API Key 引用</span><input value={providerForm.api_key_ref} placeholder="例如：GPT_LOCAL_API_KEY" onChange={(event) => setProviderForm({ ...providerForm, api_key_ref: event.target.value })} /></label>
              <button type="button" onClick={testCurrentProvider} disabled={testingProvider}>{testingProvider ? "测试中..." : "测试连接"}</button>
              {providerTestResult && <div className={providerTestResult.ok ? "test-result ok" : "test-result fail"}><strong>{providerTestResult.ok ? "连接正常" : "连接失败"} · {providerTestResult.status}</strong><span>{providerTestResult.endpoint}</span><p>{providerTestResult.message}</p></div>}
              <div className="config-action-row"><button type="button" onClick={saveProviderConfig} disabled={savingConfig}>保存模型服务</button><button type="button" className="danger-button" onClick={() => { void deleteCurrentProvider(); }} disabled={savingConfig || providerSnapshot.providers.length <= 1}>删除当前模型服务</button></div>
              <div className="inline-grid"><select aria-label="绑定角色" value={agentForm.role} onChange={(event) => setAgentForm({ ...agentForm, role: event.target.value })}>{Object.entries(roleLabels).map(([role, label]) => <option key={role} value={role}>{label} Agent · {roleDescriptions[role]}</option>)}</select><select aria-label="绑定 Provider" value={agentForm.provider_id} onChange={(event) => setAgentForm({ ...agentForm, provider_id: event.target.value })}>{providerSnapshot.providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name} · {provider.model}</option>)}{!providerSnapshot.providers.some((provider) => provider.id === providerForm.id) && <option value={providerForm.id}>{providerForm.name || "未保存模型配置"}</option>}</select></div>
              <button type="button" onClick={bindAgentProvider}>绑定 Agent</button>
              <button type="button" onClick={bindAllAgentsToCurrentProvider}>绑定全部 Agent 到当前 Provider</button>
            </section>
          </div>}
          {configPanel === "workflow" && <div className="workflow-manager config-content">
            <aside className="workflow-list-panel">
              <div className="workflow-list">
                <button
                  type="button"
                  className={!activeWorkflowId ? "active" : ""}
                  onClick={() => setActiveWorkflowId("")}
                >
                  <span>ORION 自动判断</span>
                  <em>不预选流程</em>
                </button>
                {workflows.map((workflow) => <button
                  type="button"
                  className={workflow.id === activeWorkflowId ? "active" : ""}
                  key={workflow.id}
                  onClick={() => setActiveWorkflowId(workflow.id)}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setActiveWorkflowId(workflow.id);
                    setContextMenu({ kind: "workflow", x: event.clientX, y: event.clientY, workflow });
                  }}
                >
                  <span>{workflow.name}</span>
                  <em>{workflow.isDefault ? "默认" : `${workflow.steps.filter((step) => step.enabled !== false).length} 步`}</em>
                </button>)}
              </div>
              <div className="workflow-list-actions">
                <button type="button" onClick={createWorkflow}>新建工作流</button>
              </div>
            </aside>
            <section className="flow-list">
              {!activeWorkflow && <article className="workflow-empty-state">
                <strong>当前不预选工作流</strong>
                <p>默认由 ORION 判断任务：本机助手任务不会进入 ORCH；明确的 Bug、测试或完整开发任务仍可自动切换到对应流程。</p>
              </article>}
              {activeWorkflow && <><div className="workflow-meta">
                <label><span>工作流名称</span><input value={activeWorkflow?.name ?? ""} onChange={(event) => updateActiveWorkflow({ name: event.target.value })} /></label>
                <label><span>说明</span><textarea value={activeWorkflow?.description ?? ""} onChange={(event) => updateActiveWorkflow({ description: event.target.value })} /></label>
              </div>
              <div className="flow-toolbar"><button type="button" onClick={addWorkflowStep}>新增步骤</button><button type="button" onClick={resetWorkflowSteps}>恢复默认步骤</button><button type="button" onClick={loadWorkflowBlueprint}>读取后端蓝图</button></div>
              {steps.map((step, index) => <article className="workflow-step" key={`${step.stage}-${index}`}>
                <div className="step-header"><label className="toggle-row"><input type="checkbox" checked={step.enabled !== false} onChange={(event) => updateWorkflowStep(index, { enabled: event.target.checked })} /><span>{index + 1}. 启用</span></label><div className="step-actions"><button type="button" onClick={() => moveWorkflowStep(index, -1)} disabled={index === 0}>上移</button><button type="button" onClick={() => moveWorkflowStep(index, 1)} disabled={index === steps.length - 1}>下移</button><button type="button" onClick={() => removeWorkflowStep(index)}>删除</button></div></div>
                <div className="inline-grid"><label><span>阶段</span><select value={`${step.owner}/${step.stage}`} onChange={(event) => { const option = stageOptions.find((item) => `${item.owner}/${item.stage}` === event.target.value); if (option) updateWorkflowStep(index, { stage: option.stage, owner: option.owner }); }}>{stageOptions.map((option) => <option key={`${option.owner}/${option.stage}`} value={`${option.owner}/${option.stage}`}>{option.label}</option>)}</select></label><label><span>负责人</span><select value={step.owner} onChange={(event) => updateWorkflowStep(index, { owner: event.target.value })}>{agentOwners.map((owner) => <option key={owner} value={owner}>{owner}</option>)}</select></label></div>
                <label><span>执行说明</span><textarea value={step.instruction} onChange={(event) => updateWorkflowStep(index, { instruction: event.target.value })} /></label>
                <div className="inline-grid"><label><span>交付确认</span><select value={step.approval ?? "none"} onChange={(event) => updateWorkflowStep(index, { approval: event.target.value as WorkflowStep["approval"] })}>{Object.entries(approvalLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label><span>失败打回</span><select value={step.rollback_target ?? ""} onChange={(event) => updateWorkflowStep(index, { rollback_target: event.target.value || undefined })}><option value="">不打回</option>{steps.map((targetStep) => <option key={targetStep.stage} value={targetStep.stage}>{targetStep.stage}</option>)}</select></label></div>
              </article>)}</>}
            </section>
          </div>}
          {configPanel === "settings" && <div className="settings-panel config-content">
            <section className="settings-group"><h3>产物存放</h3><div className="setting-row"><span>总目录</span><em>{appSettings.artifact_output_dir || "未设置，默认只保存到任务归档目录"}</em></div><div className="settings-actions"><button type="button" onClick={chooseArtifactOutputDir}>选择总目录</button><button type="button" onClick={() => { const nextSettings = { ...appSettings, artifact_output_dir: "" }; setAppSettings(nextSettings); void saveAppSettings(nextSettings); }}>清空目录</button></div><div className="setting-row"><span>自动分类</span><em>运行时会自动创建 task-id/pd、task-id/dev、task-id/arch、task-id/qa、task-id/pm 子目录。</em></div></section>
            <section className="settings-group"><h3>日志与诊断</h3><div className="setting-row"><span>页面日志</span><em>主窗口中间终端区 / 右侧输出面板</em></div><div className="setting-row"><span>开发运行日志</span><em>运行 npm --cache D:\npm-cache run tauri -- dev 的 PowerShell 终端</em></div><div className="setting-row"><span>计划中的本地日志</span><em>%APPDATA%\ORX\logs\app.log</em></div></section>
            <section className="settings-group orion-tool-catalog-group">
              <header>
                <div><h3>ORION 工具目录</h3><span>{orionToolCatalogRows.length} 个已接入工具</span></div>
              </header>
              <div className="orion-tool-catalog-list">
                {orionToolCatalogRows.map((tool) => <article className={`orion-tool-catalog-row ${tool.risk}`} key={tool.kind}>
                  <div><strong>{tool.kind}</strong><em>{orionRiskLabel(tool.risk)}</em></div>
                  <p>{tool.purpose}</p>
                  <small>必填：{tool.required} · 参数：{tool.schema}</small>
                </article>)}
              </div>
            </section>
            <section className="settings-group capability-gap-group">
              <header>
                <div><h3>ORION 能力缺口</h3><span>{orionCapabilityGaps.length > 0 ? `${orionCapabilityGaps.length} 类待补工具` : "暂无记录"}</span></div>
                <button type="button" onClick={() => setOrionCapabilityGaps([])} disabled={orionCapabilityGaps.length === 0}>清空</button>
              </header>
              {orionCapabilityGaps.length === 0
                ? <p className="capability-gap-empty">当 AI 提出 ORX 暂不支持的工具时，这里会记录能力名、替代工具和最近触发任务。</p>
                : <div className="capability-gap-list">
                  {orionCapabilityGaps.slice().reverse().map((gap) => <article className="capability-gap-row" key={gap.id}>
                    <div><strong>{gap.toolKind}</strong><em>{gap.alternative || "暂无替代工具"}</em></div>
                    <p>{gap.latestTask || "未记录任务"}</p>
                    <p className={`capability-gap-recommendation ${gap.recommendation.kind}`}><strong>{gap.recommendation.title}</strong><span>{gap.recommendation.actionLabel}</span></p>
                    <small>{gap.recommendation.detail}</small>
                    <small>{gap.reason} · {gap.count} 次{gap.payloadPreview ? ` · ${gap.payloadPreview}` : ""}</small>
                  </article>)}
                </div>}
            </section>
            <section className="settings-group"><h3>运行环境</h3><div className="setting-row"><span>Tauri command</span><em>{canUseTauriCommands() ? "可用，当前在客户端中运行" : "不可用，当前是浏览器预览"}</em></div><div className="setting-row"><span>Provider 测试</span><em>需要 Tauri 客户端和 API Key 环境变量</em></div><div className="setting-row"><span>ORCH 巡检</span><em>实时巡检：节点完成后立即推进；失败时立即停止并输出诊断。</em></div><div className="setting-row"><span>角色代号</span><em>ORCH=调度器，PM=流程管理 Agent，PD=产品，DEV=开发，ARCH=架构师，QA=测试。</em></div></section>
            <section className="settings-group orion-skill-group">
              <header>
                <div><h3>ORION Skills / SOP</h3><span>{orionSkills.length > 0 ? `${orionSkills.length} 个已沉淀技能` : "暂无技能"}</span></div>
                <button type="button" onClick={() => setOrionSkills([])} disabled={orionSkills.length === 0}>清空</button>
              </header>
              {orionSkills.length === 0
                ? <p className="capability-gap-empty">ORION 完成本机助手任务后，会把成功的工具路径沉淀为可复用 SOP，后续规划时优先参考。</p>
                : <div className="orion-skill-list">
                  {orionSkills.slice().reverse().map((skill) => <article className={`orion-skill-row ${orionSkillMaturity(skill)}`} key={skill.id}>
                    <div><strong>{skill.title}</strong><em>{orionSkillMaturityLabel(skill)} · {orionSkillTrainingEventLabel(skill.lastTrainingEvent)} · 复用 {skill.uses} 次</em></div>
                    <p>{skill.actionKinds.join(" -> ")}</p>
                    <small>{skill.resultSummary}</small>
                  </article>)}
                </div>}
            </section>
            <section className="settings-group"><h3>密钥读取</h3><div className="setting-row"><span>当前引用名</span><em>{providerForm.api_key_ref}</em></div><div className="setting-row"><span>读取顺序</span><em>先读环境变量，读不到再读用户密钥文件</em></div><div className="setting-row"><span>密钥文件</span><em>%APPDATA%\ORX\secrets.json</em></div><div className="setting-row"><span>后续增强</span><em>迁移到系统 keychain，避免明文文件</em></div></section>
          </div>}
        </section>
      </div>}
    </main>
  );
}

export default App;

