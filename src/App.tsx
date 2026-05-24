import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import "./App.css";
import {
  defaultSteps,
  getApprovalPrompt,
  getRollbackIndex,
  nextRuntimeAfterRejection,
  outputHasFileArtifact,
  parseApprovalInput,
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
  getDefaultWorkflow,
  setDefaultWorkflow,
  updateWorkflow,
  updateWorkflowSteps,
  type WorkflowDefinition,
} from "./workflowConfig";
import { buildFileTree, type FileTreeNode, type ProjectFile } from "./projectTree";
import { toChatTimelineItems } from "./chatTimeline";
import { createWorkflowStageOptions } from "./workflowStageOptions";

type ProjectSummary = { root: string; files: ProjectFile[]; source_count: number; test_count: number; important_files: string[]; context_brief: string };
type RegisteredProject = { id: string; name: string; path: string; source_count: number; test_count: number; context_brief: string; updated_at: number };
type AddProjectResult = { project: RegisteredProject; summary: ProjectSummary };
type ProviderConfig = { id: string; name: string; kind: string; base_url: string; use_proxy_route: boolean; proxy_url: string; model: string; api_key_ref: string };
type ProviderConnectionResult = { ok: boolean; status: number; endpoint: string; message: string };
type AgentRunResult = { owner: string; stage: string; endpoint: string; output: string; elapsed_ms: number; input_tokens: number; output_tokens: number; total_tokens: number };
type AgentBinding = { role: string; provider_id: string; model: string; temperature: number };
type ProviderSnapshot = { providers: ProviderConfig[]; agents: AgentBinding[] };
type WorkflowConfigSnapshot = { workflows: WorkflowDefinition[]; active_workflow_id: string };
type AppSettings = { artifact_output_dir: string };
type PendingAttachment = { id: string; path?: string; name: string; kind: string; bytes: number; inlineBytes?: number[] };
type TaskAttachmentRecord = { original_name: string; path: string; bytes: number; kind: string; text_preview?: string | null };
type TaskAttachmentSaveResult = { task_id: string; attachments: TaskAttachmentRecord[]; context_block: string };
type InlineAttachmentInput = { original_name: string; bytes: number[] };
type WorkflowMetric = { stage: string; owner: string; status: "running" | "done" | "failed"; elapsed_ms: number; input_tokens: number; output_tokens: number; total_tokens: number; output_preview: string };
type TaskArchiveRef = { id: string; path: string };
type WorkflowRuntime = { task: string; enabledSteps: WorkflowStep[]; nextIndex: number; upstream: string; archive: TaskArchiveRef | null; workflowStart: number; runTotals: { elapsed_ms: number; input_tokens: number; output_tokens: number; total_tokens: number }; artifactRetries?: Record<string, number> };
type ApprovalGate = { step: WorkflowStep; stepIndex: number; result: AgentRunResult; runtime: WorkflowRuntime; preview: string; upstreamBefore: string };
type InspectorView = "output" | "context" | "files";
type ConfigPanel = "provider" | "workflow" | "settings" | null;
type ContextMenuState =
  | { kind: "file"; x: number; y: number; file: ProjectFile }
  | { kind: "folder"; x: number; y: number; folder: FileTreeNode }
  | { kind: "project"; x: number; y: number; project: RegisteredProject }
  | { kind: "conversation"; x: number; y: number; conversation: ConversationSession }
  | { kind: "workflow"; x: number; y: number; workflow: WorkflowDefinition }
  | null;
type ConversationSession = { id: string; projectId: string; title: string; updatedAt: number };

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

const defaultProjectPath = "D:\\CodexProjects\\workflow-manager-mvp";
const workflowStorageKey = "workflow-manager.workflows.v1";

function createProviderDraft(index: number): ProviderConfig {
  const suffix = index + 1;
  return {
    id: `provider-${Date.now()}`,
    name: `Model ${suffix}`,
    kind: "openai-compatible",
    base_url: "http://127.0.0.1:8317/v1",
    use_proxy_route: true,
    proxy_url: "http://127.0.0.1:7897",
    model: "",
    api_key_ref: "",
  };
}

function loadWorkflowPreferences() {
  const fallback = createDefaultWorkflows();
  const fallbackId = getDefaultWorkflow(fallback)?.id ?? fallback[0]?.id ?? "";
  if (typeof window === "undefined") return { workflows: fallback, activeWorkflowId: fallbackId };
  try {
    const raw = window.localStorage.getItem(workflowStorageKey);
    if (!raw) return { workflows: fallback, activeWorkflowId: fallbackId };
    const parsed = JSON.parse(raw) as { workflows?: WorkflowDefinition[]; activeWorkflowId?: string };
    const savedWorkflows = Array.isArray(parsed.workflows) && parsed.workflows.length > 0 ? parsed.workflows : fallback;
    const defaultId = getDefaultWorkflow(savedWorkflows)?.id ?? savedWorkflows[0]?.id ?? "";
    const activeWorkflowId = savedWorkflows.some((workflow) => workflow.id === parsed.activeWorkflowId) ? parsed.activeWorkflowId ?? defaultId : defaultId;
    return { workflows: savedWorkflows, activeWorkflowId };
  } catch {
    return { workflows: fallback, activeWorkflowId: fallbackId };
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

function previewOutput(output: string) {
  const compact = output.replace(/\s+/g, " ").trim();
  return compact.length > 260 ? `${compact.slice(0, 260)}...` : compact;
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
  const [providerForm, setProviderForm] = useState<ProviderConfig>({ id: "gpt-local", name: "GPT Local", kind: "openai-compatible", base_url: "http://127.0.0.1:8317/v1", use_proxy_route: true, proxy_url: "http://127.0.0.1:7897", model: "gpt-5.5", api_key_ref: "GPT_LOCAL_API_KEY" });
  const [agentForm, setAgentForm] = useState<AgentBinding>({ role: "developer", provider_id: "gpt-local", model: "gpt-5.5", temperature: 0.2 });
  const [inspectorView, setInspectorView] = useState<InspectorView>("output");
  const [configPanel, setConfigPanel] = useState<ConfigPanel>(null);
  const [providerTestResult, setProviderTestResult] = useState<ProviderConnectionResult | null>(null);
  const [appSettings, setAppSettings] = useState<AppSettings>({ artifact_output_dir: "" });
  const [testingProvider, setTestingProvider] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState("");
  const [conversations, setConversations] = useState<ConversationSession[]>([]);
  const [workflowMenuOpen, setWorkflowMenuOpen] = useState(false);
  const [workflowRunning, setWorkflowRunning] = useState(false);
  const [chatLines, setChatLines] = useState<string[]>(["ORCH：等待任务。"]);
  const [logLines, setLogLines] = useState<string[]>(["codex-workflow-client started", "等待添加本地项目。"]); 
  const [workflowMetrics, setWorkflowMetrics] = useState<WorkflowMetric[]>([]);
  const [workflowStartedAt, setWorkflowStartedAt] = useState<number | null>(null);
  const [taskArchive, setTaskArchive] = useState<TaskArchiveRef | null>(null);
  const [approvalGate, setApprovalGate] = useState<ApprovalGate | null>(null);
  const [currentActivity, setCurrentActivity] = useState("");
  const [approvalNote, setApprovalNote] = useState("");
  const [workspaceFiles, setWorkspaceFiles] = useState<ProjectFile[]>([]);
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [composerDragActive, setComposerDragActive] = useState(false);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => new Set());
  const [expandedProjectIds, setExpandedProjectIds] = useState<Set<string>>(() => new Set());
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const [error, setError] = useState("");

  const fileTree = useMemo(() => buildFileTree(summary?.files ?? []), [summary]);
  const workspaceFilePaths = useMemo(() => new Set(workspaceFiles.map((file) => file.path)), [workspaceFiles]);
  const activeWorkflow = useMemo(() => workflows.find((workflow) => workflow.id === activeWorkflowId) ?? getDefaultWorkflow(workflows), [workflows, activeWorkflowId]);
  const steps = activeWorkflow?.steps ?? [];
  const stageOptions = useMemo(() => createWorkflowStageOptions(steps), [steps]);
  const latestOutput = logLines.slice(-28);
  const chatTimelineItems = useMemo(() => toChatTimelineItems(chatLines), [chatLines]);
  const workflowTotals = useMemo(() => {
    const finished = workflowMetrics.filter((metric) => metric.status === "done");
    return {
      elapsed_ms: finished.reduce((total, metric) => total + metric.elapsed_ms, 0),
      input_tokens: finished.reduce((total, metric) => total + metric.input_tokens, 0),
      output_tokens: finished.reduce((total, metric) => total + metric.output_tokens, 0),
      total_tokens: finished.reduce((total, metric) => total + metric.total_tokens, 0),
    };
  }, [workflowMetrics]);

  useEffect(() => { void loadProjects(); void loadProviderConfig(); void loadAppSettings(); void loadWorkflowConfig(); }, []);
  useEffect(() => {
    if (!workflows.some((workflow) => workflow.id === activeWorkflowId)) {
      setActiveWorkflowId(getDefaultWorkflow(workflows)?.id ?? workflows[0]?.id ?? "");
    }
  }, [workflows, activeWorkflowId]);
  useEffect(() => {
    window.localStorage.setItem(workflowStorageKey, JSON.stringify({ workflows, activeWorkflowId }));
  }, [workflows, activeWorkflowId]);
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
      setActiveWorkflowId(snapshot.workflows.some((workflow) => workflow.id === snapshot.active_workflow_id) ? snapshot.active_workflow_id : getDefaultWorkflow(snapshot.workflows)?.id ?? snapshot.workflows[0]?.id ?? "");
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
    return `${provider.base_url.trim().replace(/\/$/, "")}/responses`;
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

  function resetConversationState(title = "新对话") {
    setChatLines([`ORCH：${title} 已就绪。`]);
    setLogLines(["codex-workflow-client started", `conversation: ${title}`]);
    setWorkflowMetrics([]);
    setWorkflowStartedAt(null);
    setTaskArchive(null);
    setApprovalGate(null);
    setApprovalNote("");
    setCurrentActivity("");
    setPendingAttachments([]);
    setComposerDragActive(false);
    setError("");
  }

  function createConversation(projectId = "workspace", title = "新任务对话") {
    const id = `chat-${Date.now()}`;
    setConversations((items) => [{ id, projectId, title, updatedAt: Date.now() }, ...items]);
    setActiveConversationId(id);
    setContextMenu(null);
    resetConversationState(title);
  }

  function selectConversation(conversation: ConversationSession) {
    setActiveConversationId(conversation.id);
    resetConversationState(conversation.title);
  }

  function deleteConversation(conversation: ConversationSession) {
    setConversations((items) => items.filter((item) => item.id !== conversation.id));
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
      setConversations((items) => items.filter((item) => item.projectId !== project.id));
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
        input: { task, project_path: projectPath, workflow_template: activeWorkflow?.name ?? "默认工作流" },
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
    setApprovalGate(null);
    setChatLines((lines) => [...lines, `你：同意${note.trim() ? `，${note.trim()}` : ""}`, `ORCH：审批通过，继续推进 ${gate.runtime.nextIndex < gate.runtime.enabledSteps.length ? gate.runtime.enabledSteps[gate.runtime.nextIndex].stage : "后续"} 节点。`]);
    setLogLines((lines) => [...lines, `审批结果：approved stage=${gate.step.stage} owner=${gate.step.owner}`, `审批备注：${approvalText}`]);
    await continueWorkflow(gate.runtime);
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
    setApprovalGate(null);
    setChatLines((lines) => [...lines, `你：${note || "否决"}`, `ORCH：已记录否决意见，打回 ${rollbackStep.owner} / ${rollbackStep.stage} 重做。`]);
    setLogLines((lines) => [...lines, `审批结果：rejected stage=${gate.step.stage} owner=${gate.step.owner}`, `回滚目标：${rollbackStep.owner} / ${rollbackStep.stage}`, `否决意见：${rejectionNote}`]);
    await continueWorkflow(rollbackRuntime);
  }

  async function handleComposerSubmit() {
    const text = requirement.trim();
    const attachments = pendingAttachments;
    const taskText = text || (attachments.length > 0 ? "请读取并处理我发送的附件。" : "");
    if (!taskText || workflowRunning) return;
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
    setRequirement("");
    await startRealWorkflow(taskText, attachments);
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

  async function startRealWorkflow(task: string, attachments: PendingAttachment[] = []) {
    if (!canUseTauriCommands()) {
      setLogLines((lines) => [...lines, "真实流程需要在 Tauri 客户端中运行；浏览器预览只能查看界面。"]);
      return;
    }
    const enabledSteps = steps.filter((step) => step.enabled !== false);
    setInspectorView("output");
    setError("");
    const workflowStart = Date.now();
    setWorkflowStartedAt(workflowStart);
    setWorkflowMetrics([]);
    setTaskArchive(null);
    setApprovalGate(null);
    setApprovalNote("");
    setCurrentActivity("ORCH 实时巡检中");
    const approvalSummary = workflowApprovalSummary(enabledSteps);
    const attachmentLine = attachments.length > 0 ? `\n附件：${attachments.map((item) => item.name).join("、")}` : "";
    setChatLines((lines) => [...lines, `你：${task}${attachmentLine}`, "ORCH：收到任务，正在读取流程配置。", `ORCH：当前工作流：${activeWorkflow?.name ?? "未命名流程"}（${enabledSteps.length} 个节点）。`, `ORCH：${approvalSummary}`, `ORCH：启用实时巡检，节点完成后立即推进。`]);
    setLogLines((lines) => [...lines, "> start_workflow real", `用户任务：${task}`, `当前工作流：${activeWorkflow?.name ?? "未命名流程"} / ${enabledSteps.length} 个节点`, approvalSummary, `巡检模式：实时巡检 / 节点完成即推进`, `ORCH：读取流程配置，准备顺序调度 ${enabledSteps.length} 个节点。`]);
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
    const upstream = `用户任务：${task}\n项目上下文：${summary?.context_brief ?? "尚未读取项目上下文。"}\n${workspaceContextBrief()}${attachmentContext ? `\n${attachmentContext}` : ""}`;
    await continueWorkflow({
      task,
      enabledSteps,
      nextIndex: 0,
      upstream,
      archive,
      workflowStart,
      runTotals: { elapsed_ms: 0, input_tokens: 0, output_tokens: 0, total_tokens: 0 },
      artifactRetries: {},
    });
  }

  async function continueWorkflow(runtime: WorkflowRuntime) {
    setWorkflowRunning(true);
    setApprovalGate(null);
    let activeStep: WorkflowStep | null = null;
    let pausedForApproval = false;
    try {
      for (let stepIndex = runtime.nextIndex; stepIndex < runtime.enabledSteps.length; stepIndex += 1) {
        const step = runtime.enabledSteps[stepIndex];
        activeStep = step;
        const role = ownerToRole(step.owner);
        const provider = providerInputForRole(role);
        const endpoint = providerEndpoint(provider);
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
          input: { provider, owner: step.owner, stage: step.stage, task: runtime.task, upstream: runtime.upstream },
        });
        runtime.runTotals.elapsed_ms += result.elapsed_ms;
        runtime.runTotals.input_tokens += result.input_tokens;
        runtime.runTotals.output_tokens += result.output_tokens;
        runtime.runTotals.total_tokens += result.total_tokens;
        const nextUpstream = trimWorkflowContext(`${runtime.upstream}\n\n[${result.owner} / ${result.stage}]\n${result.output}`);
        const needsFileArtifact = taskLikelyNeedsFileArtifact(`${runtime.task}\n${runtime.upstream}`) && stepShouldProduceFileArtifact(step);
        const artifactSave = await trySaveTaskArtifact(runtime.archive, result, "done", result.output);
        if (needsFileArtifact && (!outputHasFileArtifact(result.output) || !artifactSave.ok)) {
          const retryKey = `${step.owner}/${step.stage}`;
          const retryCount = runtime.artifactRetries?.[retryKey] ?? 0;
          if (retryCount < 1) {
            const retryReason = artifactSave.ok ? "未输出可落盘代码产物" : `产物保存/校验失败：${artifactSave.message}`;
            const retryNote = `DEV 节点${retryReason}。当前任务需要实际非空文件，请输出 Markdown 代码块，并在代码块第一行写明文件名，例如 <!-- FILE: index.html -->，代码块内容不能为空。`;
            const retryUpstream = trimWorkflowContext(`${runtime.upstream}\n\n[ORCH / artifact gate]\n${retryNote}\n上一次 DEV 输出仅作为失败记录，不得继续交给 QA。`);
            setWorkflowMetrics((metrics) => metrics.map((metric) => metric.stage === step.stage && metric.owner === step.owner && metric.status === "running" ? { ...metric, status: "failed", output_preview: retryNote } : metric));
            setChatLines((lines) => [...lines, `ORCH：${step.owner} 未提交实际文件产物，已自动打回 ${step.stage} 重做。`]);
            setLogLines((lines) => [...lines, `产物闸门：${retryNote}`, `回滚目标：${step.owner} / ${step.stage}`]);
            runtime = { ...runtime, upstream: retryUpstream, nextIndex: stepIndex, artifactRetries: { ...(runtime.artifactRetries ?? {}), [retryKey]: retryCount + 1 } };
            stepIndex -= 1;
            continue;
          }
          throw new Error(`${step.owner} / ${step.stage} 未生成有效非空代码产物；QA 无法执行真实测试。请让 DEV 输出带 FILE 标记且内容非空的代码块，例如 <!-- FILE: index.html -->。${artifactSave.ok ? "" : ` 保存错误：${artifactSave.message}`}`);
        }
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
        runtime = { ...runtime, upstream: nextUpstream, nextIndex: stepIndex + 1 };
        if (step.approval === "user") {
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
      const summaryText = `# Retrospective\n\n- 状态: completed\n- 总耗时: ${formatDuration(wallElapsed)}\n- 节点累计耗时: ${formatDuration(runtime.runTotals.elapsed_ms)}\n- input tokens: ${runtime.runTotals.input_tokens || "未返回"}\n- output tokens: ${runtime.runTotals.output_tokens || "未返回"}\n- total tokens: ${runtime.runTotals.total_tokens || "未返回"}\n\nORCH：全部流程节点已完成，PM 已按规则完成总结归纳。\n`;
      await tryFinishTaskArchive(runtime.archive, "completed", wallElapsed, runtime.runTotals, summaryText);
      setChatLines((lines) => [...lines, `ORCH：全部流程节点已完成，总耗时 ${formatDuration(wallElapsed)}，PM 已按规则完成总结归纳。`]);
      setLogLines((lines) => [...lines, `ORCH：全部流程节点已完成。总耗时 ${formatDuration(wallElapsed)}，节点累计 ${formatDuration(runtime.runTotals.elapsed_ms)}，Token input ${runtime.runTotals.input_tokens || "未返回"} / output ${runtime.runTotals.output_tokens || "未返回"} / total ${runtime.runTotals.total_tokens || "未返回"}。`]);
    } catch (runError) {
      const message = runError instanceof Error ? runError.message : String(runError);
      const failedAt = activeStep ? `${activeStep.owner} / ${activeStep.stage}` : "未知节点";
      const wallElapsed = Date.now() - runtime.workflowStart;
      setError(message);
      if (activeStep) {
        setWorkflowMetrics((metrics) => metrics.map((metric) => metric.stage === activeStep?.stage && metric.owner === activeStep.owner && metric.status === "running" ? { ...metric, status: "failed", output_preview: message } : metric));
      }
      setChatLines((lines) => [...lines, `ORCH：流程在 ${failedAt} 调用失败，已停止推进。`, "ORCH：失败详情已放到右侧输出，可以据此排查 Provider、地址、代理或模型服务。"]);
      setLogLines((lines) => [...lines, `流程执行失败节点：${failedAt}`, `流程执行失败：${message}`]);
      await tryFinishTaskArchive(runtime.archive, "failed", wallElapsed, runtime.runTotals, `# Retrospective\n\n- 状态: failed\n- 失败节点: ${failedAt}\n- 总耗时: ${formatDuration(wallElapsed)}\n\n${message}\n`);
    } finally {
      setWorkflowRunning(false);
      if (!pausedForApproval) setCurrentActivity("");
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

  function renderFileTree(nodes: FileTreeNode[], depth = 0) {
    return nodes.map((node) => {
      const isDirectory = node.kind === "directory";
      const isExpanded = expandedPaths.has(node.path);
      const isSelected = workspaceFilePaths.has(node.path);
      if (isDirectory) {
        return <div className="tree-group" key={node.path}>
          <button
            type="button"
            className="tree-row directory"
            style={{ paddingLeft: 8 + depth * 14 }}
            onClick={() => toggleTreePath(node.path)}
            onContextMenu={(event) => {
              event.preventDefault();
              setContextMenu({ kind: "folder", x: event.clientX, y: event.clientY, folder: node });
            }}
            title={`${node.path} · 右键加入工作区`}
          >
            <span>{isExpanded ? "▾" : "▸"}</span><strong>{node.name}</strong>
          </button>
          {isExpanded && <div>{renderFileTree(node.children, depth + 1)}</div>}
        </div>;
      }
      return <button
        type="button"
        className={`tree-row file ${isSelected ? "selected" : ""}`}
        style={{ paddingLeft: 8 + depth * 14 }}
        key={node.path}
        title={`${node.path} · 右键${isSelected ? "移出" : "加入"}工作区`}
        onDoubleClick={() => addFileToWorkspace({ path: node.path, kind: node.kind, bytes: node.bytes })}
        onContextMenu={(event) => {
          event.preventDefault();
          setContextMenu({ kind: "file", x: event.clientX, y: event.clientY, file: { path: node.path, kind: node.kind, bytes: node.bytes } });
        }}
      >
        <span>{isSelected ? "●" : "·"}</span><strong>{node.name}</strong><em>{node.kind}</em>
      </button>;
    });
  }

  return (
    <main className="app-shell" onClick={() => { setContextMenu(null); setWorkflowMenuOpen(false); }}>
      <aside className="sidebar">
        <nav className="sidebar-nav" aria-label="主导航">
          <button type="button" onClick={() => setConfigPanel("workflow")}><span>⌁</span>工作流</button>
          <button type="button" onClick={() => setConfigPanel("provider")}><span>◇</span>模型服务</button>
          <button type="button" onClick={() => setConfigPanel("settings")}><span>·</span>设置</button>
        </nav>
        <section className="project-panel">
          <div className="sidebar-section-title"><span>项目</span></div>
          <button className="project-picker-button" type="button" onClick={addCurrentProject}>选择项目文件夹</button>
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
              ><span className="project-caret">{projectExpanded ? "▾" : "▸"}</span><span>{project.name}</span><em>{project.source_count} src / {project.test_count} test</em></button>
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
        <section className="terminal-log" aria-label="ORCH 对话">
          <div className="flow-column" aria-label="系统输出流">
            {chatTimelineItems.map((item, index) => item.side === "user"
              ? <article className="user-message-row" key={`chat-${item.text}-${index}`}><div className="user-message-bubble">{item.text}</div></article>
              : <p className={item.tone === "error" ? "error-line" : "system-line"} key={`chat-${item.text}-${index}`}><span>$</span><span className="line-text">{item.text}</span></p>
            )}
            {workflowMetrics.length > 0 && <div className="activity-stream" aria-label="流程统计流">
              <div className="activity-summary"><strong>Flow</strong><span>{workflowMetrics.filter((metric) => metric.status === "done").length}/{workflowMetrics.length} done</span><span>{formatDuration(workflowTotals.elapsed_ms)}</span></div>
              {workflowMetrics.slice(-5).map((metric, index) => <article className={`activity-event ${metric.status}`} key={`${metric.stage}-${metric.owner}-${index}`}>
                <strong>{metric.status === "running" ? "Running" : metric.status === "failed" ? "Blocked" : "Done"}</strong>
                <span>{metric.owner} / {metric.stage}</span>
                <em>{metric.elapsed_ms ? formatDuration(metric.elapsed_ms) : "..."}</em>
              </article>)}
            </div>}
            {(workflowRunning || approvalGate) && <p className="thinking-line" aria-live="polite"><span>$</span><span className="thinking-content">{currentActivity || "ORCH 处理中"}{workflowRunning && <><i></i><i></i><i></i></>}</span></p>}
          </div>
        </section>
        <form
          className={`composer${composerDragActive ? " drag-active" : ""}`}
          onSubmit={(event) => { event.preventDefault(); void handleComposerSubmit(); }}
          onDragEnter={(event) => { event.preventDefault(); setComposerDragActive(true); }}
          onDragOver={(event) => { event.preventDefault(); setComposerDragActive(true); }}
          onDragLeave={(event) => { if (event.currentTarget === event.target) setComposerDragActive(false); }}
          onDrop={handleComposerDrop}
        >
          {pendingAttachments.length > 0 && <div className="attachment-tray" aria-label="待发送附件">
            {pendingAttachments.map((attachment) => <div className="attachment-chip" key={attachment.id}>
              <span>{attachment.name}</span>
              <em>{attachment.kind} · {attachment.bytes} bytes</em>
              <button type="button" aria-label={`移除附件 ${attachment.name}`} onClick={() => removePendingAttachment(attachment.id)}>×</button>
            </div>)}
          </div>}
          <textarea value={requirement} placeholder="Assign a task to ORCH，或粘贴/拖入文件" onPaste={handleComposerPaste} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} onChange={(event) => setRequirement(event.target.value)} aria-label="需求描述" />
          <div className="composer-toolbar">
            <div className="template-picker" onClick={(event) => event.stopPropagation()}>
              <button type="button" aria-haspopup="listbox" aria-expanded={workflowMenuOpen} onClick={() => setWorkflowMenuOpen((open) => !open)}>{activeWorkflow?.name ?? "选择工作流"}</button>
              {workflowMenuOpen && <div className="template-menu" role="listbox">
                {workflows.map((workflow) => <button type="button" role="option" aria-selected={activeWorkflowId === workflow.id} key={workflow.id} onClick={() => { setActiveWorkflowId(workflow.id); setWorkflowMenuOpen(false); }}>{workflow.name}{workflow.isDefault ? " · 默认" : ""}</button>)}
              </div>}
            </div>
            <button type="submit" aria-label={approvalGate ? "提交审批意见" : "启动工作流"} disabled={workflowRunning}>↑</button>
          </div>
        </form>
      </section>

      <aside className="context-panel">
        <div className="inspector-tabs" role="tablist" aria-label="右侧信息切换"><button type="button" className={inspectorView === "output" ? "active" : ""} onClick={() => setInspectorView("output")}>输出</button><button type="button" className={inspectorView === "context" ? "active" : ""} onClick={() => setInspectorView("context")}>上下文</button><button type="button" className={inspectorView === "files" ? "active" : ""} onClick={() => setInspectorView("files")}>项目文件</button></div>
        {inspectorView === "output" && <section className="panel inspector-card detail-output"><h2>Detailed Output</h2>
          <div className="run-summary">
            <span>wall {workflowStartedAt ? formatDuration((workflowRunning ? Date.now() : Date.now()) - workflowStartedAt) : "0ms"}</span>
            <span>agent {formatDuration(workflowTotals.elapsed_ms)}</span>
            <span>in {workflowTotals.input_tokens || "未返回"}</span>
            <span>out {workflowTotals.output_tokens || "未返回"}</span>
            <span>total {workflowTotals.total_tokens || "未返回"}</span>
          </div>
          {approvalGate && <article className="approval-hint"><strong>等待审批</strong><span>{approvalGate.step.owner} / {approvalGate.step.stage}</span><p>审批预览已在中间弹窗打开。</p></article>}
          {taskArchive && <p>task archive: {taskArchive.path}</p>}
          {workflowMetrics.map((metric, index) => <article className={`metric-row ${metric.status}`} key={`${metric.stage}-${metric.owner}-${index}`}>
            <header><strong>{metric.owner}</strong><span>{metric.stage}</span><em>{metric.status === "running" ? "running" : metric.status === "done" ? "done" : "failed"}</em></header>
            <p>耗时 {metric.elapsed_ms ? formatDuration(metric.elapsed_ms) : "-"} · input {metric.input_tokens || "未返回"} · output {metric.output_tokens || "未返回"} · total {metric.total_tokens || "未返回"}</p>
            <p>{metric.output_preview}</p>
          </article>)}
          {error && <p className="error-line">当前错误：{error}</p>}
          {latestOutput.map((line, index) => <p className={line.includes("失败") || line.includes("error=") || line.includes("HTTP ") ? "error-line" : ""} key={`${line}-${index}`}>{line}</p>)}
          <h2 className="system-log-title">System Logs</h2>
          {logLines.slice(0, 4).map((line, index) => <p key={`system-${line}-${index}`}>{line}</p>)}
        </section>}
        {inspectorView === "context" && <section className="panel inspector-card"><h2>上下文摘要</h2><p>{summary?.context_brief ?? "添加项目后，这里展示 README、manifest、源码和测试文件摘要。"}</p><div className="stats"><span>src {summary?.source_count ?? 0}</span><span>test {summary?.test_count ?? 0}</span><span>workspace {workspaceFiles.length}</span></div>{workspaceFiles.length > 0 && <div className="workspace-files"><h3>工作区上下文</h3>{workspaceFiles.map((file) => <button type="button" key={file.path} onClick={() => removeFileFromWorkspace(file.path)} title="点击移出工作区"><span>{file.path}</span><em>移出</em></button>)}</div>}</section>}
        {inspectorView === "files" && <section className="panel inspector-card file-list"><h2>项目文件</h2><p>右键文件或文件夹加入工作区，双击文件快速加入。</p>{fileTree.length === 0 ? <p>等待扫描。</p> : <div className="file-tree">{renderFileTree(fileTree)}</div>}</section>}
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
              <div className="workflow-meta">
                <label><span>工作流名称</span><input value={activeWorkflow?.name ?? ""} onChange={(event) => updateActiveWorkflow({ name: event.target.value })} /></label>
                <label><span>说明</span><textarea value={activeWorkflow?.description ?? ""} onChange={(event) => updateActiveWorkflow({ description: event.target.value })} /></label>
              </div>
              <div className="flow-toolbar"><button type="button" onClick={addWorkflowStep}>新增步骤</button><button type="button" onClick={resetWorkflowSteps}>恢复默认步骤</button><button type="button" onClick={loadWorkflowBlueprint}>读取后端蓝图</button></div>
              {steps.map((step, index) => <article className="workflow-step" key={`${step.stage}-${index}`}>
                <div className="step-header"><label className="toggle-row"><input type="checkbox" checked={step.enabled !== false} onChange={(event) => updateWorkflowStep(index, { enabled: event.target.checked })} /><span>{index + 1}. 启用</span></label><div className="step-actions"><button type="button" onClick={() => moveWorkflowStep(index, -1)} disabled={index === 0}>上移</button><button type="button" onClick={() => moveWorkflowStep(index, 1)} disabled={index === steps.length - 1}>下移</button><button type="button" onClick={() => removeWorkflowStep(index)}>删除</button></div></div>
                <div className="inline-grid"><label><span>阶段</span><select value={`${step.owner}/${step.stage}`} onChange={(event) => { const option = stageOptions.find((item) => `${item.owner}/${item.stage}` === event.target.value); if (option) updateWorkflowStep(index, { stage: option.stage, owner: option.owner }); }}>{stageOptions.map((option) => <option key={`${option.owner}/${option.stage}`} value={`${option.owner}/${option.stage}`}>{option.label}</option>)}</select></label><label><span>负责人</span><select value={step.owner} onChange={(event) => updateWorkflowStep(index, { owner: event.target.value })}>{agentOwners.map((owner) => <option key={owner} value={owner}>{owner}</option>)}</select></label></div>
                <label><span>执行说明</span><textarea value={step.instruction} onChange={(event) => updateWorkflowStep(index, { instruction: event.target.value })} /></label>
                <div className="inline-grid"><label><span>交付确认</span><select value={step.approval ?? "none"} onChange={(event) => updateWorkflowStep(index, { approval: event.target.value as WorkflowStep["approval"] })}>{Object.entries(approvalLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label><span>失败打回</span><select value={step.rollback_target ?? ""} onChange={(event) => updateWorkflowStep(index, { rollback_target: event.target.value || undefined })}><option value="">不打回</option>{steps.map((targetStep) => <option key={targetStep.stage} value={targetStep.stage}>{targetStep.stage}</option>)}</select></label></div>
              </article>)}
            </section>
          </div>}
          {configPanel === "settings" && <div className="settings-panel config-content">
            <section className="settings-group"><h3>产物存放</h3><div className="setting-row"><span>总目录</span><em>{appSettings.artifact_output_dir || "未设置，默认只保存到任务归档目录"}</em></div><div className="settings-actions"><button type="button" onClick={chooseArtifactOutputDir}>选择总目录</button><button type="button" onClick={() => { const nextSettings = { ...appSettings, artifact_output_dir: "" }; setAppSettings(nextSettings); void saveAppSettings(nextSettings); }}>清空目录</button></div><div className="setting-row"><span>自动分类</span><em>运行时会自动创建 task-id/pd、task-id/dev、task-id/arch、task-id/qa、task-id/pm 子目录。</em></div></section>
            <section className="settings-group"><h3>日志与诊断</h3><div className="setting-row"><span>页面日志</span><em>主窗口中间终端区 / 右侧输出面板</em></div><div className="setting-row"><span>开发运行日志</span><em>运行 npm --cache D:\npm-cache run tauri -- dev 的 PowerShell 终端</em></div><div className="setting-row"><span>计划中的本地日志</span><em>%APPDATA%\WorkflowManagerClient\logs\app.log</em></div></section>
            <section className="settings-group"><h3>运行环境</h3><div className="setting-row"><span>Tauri command</span><em>{canUseTauriCommands() ? "可用，当前在客户端中运行" : "不可用，当前是浏览器预览"}</em></div><div className="setting-row"><span>Provider 测试</span><em>需要 Tauri 客户端和 API Key 环境变量</em></div><div className="setting-row"><span>ORCH 巡检</span><em>实时巡检：节点完成后立即推进；失败时立即停止并输出诊断。</em></div><div className="setting-row"><span>角色代号</span><em>ORCH=调度器，PM=流程管理 Agent，PD=产品，DEV=开发，ARCH=架构师，QA=测试。</em></div></section>
            <section className="settings-group"><h3>密钥读取</h3><div className="setting-row"><span>当前引用名</span><em>{providerForm.api_key_ref}</em></div><div className="setting-row"><span>读取顺序</span><em>先读环境变量，读不到再读用户密钥文件</em></div><div className="setting-row"><span>密钥文件</span><em>%APPDATA%\WorkflowManagerClient\secrets.json</em></div><div className="setting-row"><span>后续增强</span><em>迁移到系统 keychain，避免明文文件</em></div></section>
          </div>}
        </section>
      </div>}
    </main>
  );
}

export default App;
