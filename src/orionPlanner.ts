import type { WorkflowDefinition } from "./workflowConfig.ts";
import type { WorkflowStep } from "./workflowState.ts";
import { createOrionAction, type OrionAction } from "./orionActions.ts";

export type OrionIntentMode = "workflow" | "assistant";

export type OrionIntentContext = {
  projectFiles?: string[];
};

export type OrionIntentDecision = {
  mode: OrionIntentMode;
  reason: string;
};

export type OrionAssistantResponse = {
  mode: "assistant";
  message: string;
  actions: OrionAction[];
};

const codebaseMarkers = [
  "package.json",
  "cargo.toml",
  "pyproject.toml",
  "pom.xml",
  "build.gradle",
  "settings.gradle",
  "go.mod",
  "composer.json",
  "requirements.txt",
  "src/",
];

const trustedInstallPackages = [
  {
    name: "Feishu",
    packageId: "ByteDance.Feishu",
    aliases: ["feishu", "飞书"],
  },
  {
    name: "Lark",
    packageId: "ByteDance.Lark",
    aliases: ["lark"],
  },
];

export function classifyOrionIntent(task: string, context: OrionIntentContext = {}): OrionIntentDecision {
  const normalized = task.trim().toLowerCase();

  if (taskLooksLikeSoftwareWork(normalized)) {
    return { mode: "workflow", reason: "task_mentions_software_work" };
  }
  if (taskLooksLikeLocalAssistantWork(normalized)) {
    return { mode: "assistant", reason: "task_mentions_local_assistant_work" };
  }
  if (projectLooksLikeCodebase(context.projectFiles ?? [])) {
    return { mode: "workflow", reason: "current_context_looks_like_codebase" };
  }
  return { mode: "assistant", reason: "no_development_intent_or_codebase_context" };
}

export function projectLooksLikeCodebase(projectFiles: string[]) {
  return projectFiles.some((file) => {
    const normalized = file.replace(/\\/g, "/").toLowerCase();
    return codebaseMarkers.some((marker) => normalized === marker || normalized.endsWith(`/${marker}`) || normalized.startsWith(marker));
  });
}

export function createOrionAssistantResponse(task: string): OrionAssistantResponse {
  const normalized = task.trim();
  const actions = createAssistantActions(normalized);
  const actionSummary = actions.length > 0
    ? `I prepared ${actions.length} local action draft${actions.length === 1 ? "" : "s"} for confirmation.`
    : taskLooksLikeInstallWork(normalized)
      ? "I could not match this client to a trusted installer package yet. Add it to the trusted installer catalog before running an install."
    : "I will handle this as a local assistant conversation first and ask before doing anything that changes your machine.";

  return {
    mode: "assistant",
    message: `ORION local assistant mode: ${actionSummary}`,
    actions,
  };
}

export function draftOrionWorkflow(task: string): WorkflowDefinition {
  if (/(bug|缺陷|报错|错误|异常|失败|修复|fix|崩溃)/i.test(task)) {
    return {
      id: `orion-bug-investigation-${Date.now()}`,
      name: "Bug Investigation",
      description: "由 ORION 根据用户目标生成的 Bug 排查工作流。",
      steps: [
        step("Intake", "PM Agent", "收集 bug 现象、影响范围、环境和用户约束。"),
        {
          ...step("BugClarification", "PD Agent", "使用 Trellis 澄清复现路径、期望行为、实际行为、边界条件和验收标准。"),
          skill_ids: ["trellis"],
          interaction: "multi-turn",
          exit_condition: "requirements_ready",
        },
        { ...step("BugTrace", "DEV Agent", "定位可能根因，给出修复方案和需要验证的代码路径。"), skill_ids: ["bug-investigation"] },
        { ...step("ReproductionTest", "QA Agent", "设计复现测试、回归路径和执行证据。"), skill_ids: ["test-planning"] },
        step("Retrospective", "PM Agent", "总结 bug 原因、修复证据、残留风险和可沉淀规则。"),
      ],
    };
  }

  return {
    id: `orion-workflow-${Date.now()}`,
    name: "ORION Custom Workflow",
    description: "由 ORION 根据用户目标生成的自定义工作流。",
    steps: [
      step("Intake", "PM Agent", "收集任务目标、项目上下文和约束。"),
      {
        ...step("Clarification", "PD Agent", "使用 Trellis 澄清目标用户、核心场景、边界和验收标准。"),
        skill_ids: ["trellis"],
        interaction: "multi-turn",
        exit_condition: "requirements_ready",
      },
      step("TaskSplit", "DEV Agent", "拆分实现任务、风险和验证路径。"),
      step("Retrospective", "PM Agent", "总结执行结果、阻塞点和下一步。"),
    ],
  };
}

export function attachCapabilityToStep(workflow: WorkflowDefinition, stage: string, capability: string): WorkflowDefinition {
  return {
    ...workflow,
    steps: workflow.steps.map((workflowStep) => {
      if (workflowStep.stage !== stage) return { ...workflowStep };
      const skills = new Set(workflowStep.skill_ids ?? []);
      skills.add(capability);
      return { ...workflowStep, skill_ids: Array.from(skills) };
    }),
  };
}

export function createOrionActionPlan(workflow: WorkflowDefinition): OrionAction[] {
  const skillActions = workflow.steps
    .flatMap((workflowStep) => (workflowStep.skill_ids ?? []).map((skill) => createOrionAction(
      "skill.attach",
      `挂载 ${skill}`,
      `给 ${workflowStep.owner} / ${workflowStep.stage} 挂载 ${skill} capability。`,
      { workflow_id: workflow.id, stage: workflowStep.stage, skill },
    )));

  return [
    createOrionAction("workflow.create", "保存工作流", `保存 ORION 工作流：${workflow.name}`, { workflow }),
    ...skillActions,
    createOrionAction("workflow.run", "运行工作流", `启动 ORCH 执行：${workflow.name}`, { workflow_id: workflow.id }),
  ];
}

function taskLooksLikeSoftwareWork(task: string) {
  return /(bug|defect|error|exception|failure|failed|fix|crash|implement|feature|develop|code|coding|refactor|test|unit test|integration test|e2e|需求|开发|实现|代码|修改|修复|缺陷|报错|错误|异常|失败|崩溃|测试|重构|页面|组件|接口|模块)/i.test(task);
}

function taskLooksLikeLocalAssistantWork(task: string) {
  return /(install|setup|download|run|execute|command|shell|script|status|check|lookup|search|read docs|research|client|desktop client|安装|下载|客户端|执行|运行|命令|脚本|状态|查询|查阅|搜索|资料|文档|本机|电脑|环境|打开)/i.test(task);
}

function taskLooksLikeInstallWork(task: string) {
  return /(install|setup|download|安装|下载|客户端)/i.test(task);
}

function createAssistantActions(task: string) {
  if (taskLooksLikeFileWrite(task)) {
    const draft = parseWriteRequest(task);
    const safeGeneratedWrite = taskLooksLikeGeneratedWrite(task) && draft.relative_path && draft.content;
    return [
      createOrionAction(
        safeGeneratedWrite ? "file.writeGeneratedArtifactAuto" : "file.writeGeneratedArtifact",
        safeGeneratedWrite ? "自动写入产物文件" : "准备文件写入",
        safeGeneratedWrite ? "写入任务 generated 产物目录。" : "写入请求涉及项目或配置文件，执行前需要确认。",
        { ...draft, request: task },
      ),
    ];
  }
  if (taskLooksLikeLocalConfigLookup(task)) {
    return [
      createOrionAction(
        "local.inspectConfig",
        "查看本机配置路径",
        "读取 ORX 本机配置、产物目录和任务归档目录。",
        { request: task, include: ["settings_path", "artifact_output_dir", "tasks_dir", "current_project"] },
      ),
    ];
  }
  if (taskLooksLikeProjectSearch(task)) {
    return [
      createOrionAction(
        "file.searchProject",
        "搜索当前项目",
        `在当前项目内搜索：${extractProjectSearchQuery(task)}`,
        { query: extractProjectSearchQuery(task), request: task, max_results: 30 },
      ),
    ];
  }
  if (taskLooksLikeWebSearch(task)) {
    const query = extractWebSearchQuery(task);
    return [
      createOrionAction(
        webSearchLooksSensitive(query) ? "web.searchSensitive" : "web.searchPublic",
        webSearchLooksSensitive(query) ? "准备敏感联网查询" : "联网查询公开资料",
        webSearchLooksSensitive(query) ? "查询内容可能包含本机路径、日志或代码片段，执行前需要确认。" : `联网查询公开资料：${query}`,
        { query, request: task, max_results: 5 },
      ),
    ];
  }
  if (taskLooksLikeProjectHealthCheck(task)) {
    return projectHealthActions(task);
  }
  if (/(run|execute|command|shell|script|执行|运行|命令|脚本)/i.test(task)) {
    const command = parseWhitelistedCommandRequest(task);
    return [
      createOrionAction(
        "command.runWhitelisted",
        "Prepare command",
        `Prepare a local command action for: ${task}`,
        { ...command, request: task },
      ),
    ];
  }
  if (taskLooksLikeVersionCheck(task)) {
    return toolVersionActions(task);
  }
  if (taskLooksLikeInstallWork(task)) {
    const installPackage = resolveTrustedInstallPackage(task);
    if (!installPackage) return [];
    return [
      createOrionAction(
        "command.runWhitelisted",
        "Prepare install command",
        `Install ${installPackage.name} from the trusted winget catalog.`,
        installerPayload(task, installPackage, ["install", "--id", installPackage.packageId, "--exact", "--accept-package-agreements", "--accept-source-agreements"]),
      ),
      createOrionAction(
        "command.runWhitelisted",
        "Verify installed client",
        `Check whether ${installPackage.name} is visible to winget after installation.`,
        installerPayload(task, installPackage, ["list", "--id", installPackage.packageId, "--exact"]),
      ),
    ];
  }
  if (/(lookup|search|read docs|research|查询|查阅|搜索|资料|文档)/i.test(task)) {
    return [
      createOrionAction(
        "memory.search",
        "Prepare research",
        `Prepare a research lookup for: ${task}`,
        { query: task },
      ),
    ];
  }
  return [];
}

function taskLooksLikeLocalConfigLookup(task: string) {
  return /(artifact|output dir|settings\.json|config path|task archive|产物|生成配置|配置路径|任务归档|保存到哪里|目录在哪|路径在哪)/i.test(task);
}

function taskLooksLikeProjectSearch(task: string) {
  return /(search|grep|find in project|项目里搜索|项目内搜索|在项目里搜|在项目内搜|搜索代码|查找代码|搜文件|查找文件)/i.test(task)
    && !taskLooksLikeWebSearch(task);
}

function extractProjectSearchQuery(task: string) {
  return task
    .trim()
    .replace(/^(please\s+)?(search|grep|find)\s+/i, "")
    .replace(/^(在)?(当前)?项目(里|内)?(搜索|搜|查找)\s*/i, "")
    .replace(/^(搜索|查找)(代码|文件)?\s*/i, "")
    .trim();
}

function taskLooksLikeWebSearch(task: string) {
  return /(web search|search web|internet|online|google|bing|duckduckgo|上网|联网|网上|网页|搜索引擎)/i.test(task);
}

function extractWebSearchQuery(task: string) {
  return task
    .trim()
    .replace(/^(please\s+)?(web search|search web|search online|google|bing|duckduckgo)\s*/i, "")
    .replace(/^(帮我|请)?(上网|联网|网上|网页)(查询|搜索|查一下|查|搜一下|搜)?\s*/i, "")
    .trim();
}

function webSearchLooksSensitive(query: string) {
  return /([a-z]:\\|\\\\|\/home\/|\/users\/|appdata|\.env|token|api[_-]?key|secret|password|报错日志|错误日志|代码片段|私有|内网)/i.test(query);
}

function taskLooksLikeFileWrite(task: string) {
  return /(write|save|create file|写入|写到|自动写|保存|生成文件|创建文件)/i.test(task);
}

function taskLooksLikeGeneratedWrite(task: string) {
  return /(generated|artifact|产物目录|生成目录|generated\s*目录|任务产物)/i.test(task);
}

function parseWriteRequest(task: string) {
  const contentMatch = task.match(/(?:内容|content)\s*[:：]\s*([\s\S]+)$/i);
  const beforeContent = contentMatch ? task.slice(0, contentMatch.index).trim() : task.trim();
  const pathMatch = beforeContent.match(/([^\s"'：:]+?\.(?:md|txt|json|html|css|ts|tsx|js|jsx|rs|toml|yaml|yml))\b/i);
  return {
    relative_path: pathMatch?.[1] ?? "",
    content: contentMatch?.[1]?.trim() ?? "",
  };
}

function commandPayload(task: string, program: string, args: string[], commandRole: string) {
  return { program, args, cwd: "", request: task, command_role: commandRole };
}

function projectHealthActions(task: string) {
  return [
    createOrionAction(
      "command.runWhitelisted",
      "Check Git status",
      "Check the current branch and working tree before running project checks.",
      commandPayload(task, "git", ["status", "--short", "--branch"], "project-status"),
    ),
    createOrionAction(
      "command.runWhitelisted",
      "Run workflow self-tests",
      "Run the ORX workflow self-test suite.",
      commandPayload(task, "npm", ["run", "workflow:selftest"], "project-selftest"),
    ),
    createOrionAction(
      "command.runWhitelisted",
      "Run production build",
      "Run the TypeScript and Vite production build.",
      commandPayload(task, "npm", ["run", "build"], "project-build"),
    ),
  ];
}

function toolVersionActions(task: string) {
  return [
    createOrionAction("command.runWhitelisted", "Check Node version", "Check the local Node.js version.", commandPayload(task, "node", ["--version"], "node-version")),
    createOrionAction("command.runWhitelisted", "Check npm version", "Check the local npm version.", commandPayload(task, "npm", ["--version"], "npm-version")),
    createOrionAction("command.runWhitelisted", "Check Rust version", "Check the local Rust compiler version.", commandPayload(task, "rustc", ["-V"], "rustc-version")),
    createOrionAction("command.runWhitelisted", "Check Cargo version", "Check the local Cargo version.", commandPayload(task, "cargo", ["-V"], "cargo-version")),
  ];
}

function taskLooksLikeProjectHealthCheck(task: string) {
  return /(health|healthy|status.*build|test.*build|build.*test|check.*project|project.*check|检查.*(项目|状态|构建|测试)|项目.*(状态|构建|测试|健康))/i.test(task);
}

function taskLooksLikeVersionCheck(task: string) {
  return /(version|versions|environment|toolchain|node|npm|rust|cargo|环境|版本|工具链)/i.test(task);
}

function resolveTrustedInstallPackage(task: string) {
  const normalized = task.toLowerCase();
  return trustedInstallPackages.find((item) => item.aliases.some((alias) => normalized.includes(alias.toLowerCase())));
}

function installerPayload(task: string, installPackage: { name: string; packageId: string }, args: string[]) {
  return {
    program: "winget",
    args,
    cwd: "",
    request: task,
    package_id: installPackage.packageId,
    package_name: installPackage.name,
    source: "winget",
  };
}

function parseWhitelistedCommandRequest(task: string) {
  const commandText = task
    .trim()
    .replace(/^(run|execute|command|shell|script)\s+/i, "")
    .replace(/^(执行|运行|命令|脚本)\s*/, "")
    .trim();
  const parts = commandText.match(/"[^"]+"|'[^']+'|\S+/g)?.map((part) => part.replace(/^["']|["']$/g, "")) ?? [];
  return {
    program: parts[0] ?? "",
    args: parts.slice(1),
    cwd: "",
  };
}

function step(stage: string, owner: string, instruction: string): WorkflowStep {
  return {
    stage,
    owner,
    instruction,
    enabled: true,
    approval: "none",
    interaction: "single-turn",
    exit_condition: "node_complete",
  };
}
