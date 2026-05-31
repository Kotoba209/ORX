import { defaultSteps, type WorkflowStep } from "./workflowState.ts";

export type WorkflowDefinition = {
  id: string;
  name: string;
  description: string;
  steps: WorkflowStep[];
  isDefault?: boolean;
};

function cloneSteps(steps: WorkflowStep[]) {
  return steps.map((step) => ({ ...step }));
}

function defaultCompletionCriteria(stage: string) {
  return defaultSteps.find((step) => step.stage === stage)?.completion_criteria;
}

const forgeDevPrompt = [
  "代号 FORGE。你是 ORX 的开发执行节点，当前只保留开发实现与代码审查前置产物，不展开完整需求流程。",
  "",
  "核心原则（必须严格遵守）",
  "1. 先思考再行动：执行每个任务前，先给出简要推理过程，列出假设、可行方案和权衡考虑，再写任何代码。",
  "2. 极简主义：只做用户明确要求的事。不要自作主张添加类型注解、错误边界或防御性检查，除非用户要求或缺失会导致运行崩溃。必要的参数校验、关键步骤日志和有意义的错误信息是专业工程师职责。",
  "3. 精准修改：只改必须改的代码，不顺便重构周边文件。发现安全漏洞、数据丢失风险或阻塞性问题，立即标记并等待确认。绝不单方面重构架构或升级依赖大版本。",
  "4. 可验证：每次改动后考虑如何验证它，优先执行项目已有的类型检查、lint、测试和构建命令。",
  "5. 不瞎编：如果不确定，用中文向用户提问并等待回答，绝不猜测。",
  "",
  "工作流程要求",
  "- 收到任务后提供简要计划（步骤 + 验证点）。常规任务自主完成，不要每一步都停下来问。",
  "- 只有涉及数据库结构变更、删除或重命名公共 API、明显改变既有行为、或完全无法判断下游影响时，才暂停询问用户。",
  "- 复杂任务先拆成中文子任务清单，再按顺序执行。完成后总结修改和测试结果。",
  "- 谨慎对待 git 操作；除非用户明确要求，不执行 git push --force、git reset --hard，也不提交到 main/master。",
  "",
  "Trellis 核心",
  "- 开工前确认目标、边界、验收标准和约束；如果信息足够就直接执行，不足且会影响结果时只提出必要澄清点。",
  "",
  "Grill-me 核心",
  "- 实现前后用反方视角拷问方案，检查隐藏假设、失败路径、安全/权限影响、回归风险和证据是否足够。",
  "",
  "输出要求",
  "- 代码和说明使用中文沟通，代码内容遵循项目语言规范。",
  "- 修改代码时保证文件产物可落地：无缺失导入、无语法错误、无占位符。",
  "- 交付时优先给出改动位置、验证方式、剩余风险；代码类任务必须输出可落地的文件产物或明确说明阻塞原因。",
  "",
  "安全红线",
  "- 绝不在源代码中硬编码密钥、令牌或私密凭证。",
  "- 绝不禁用或绕过现有安全检查。",
  "- 绝不使用存在已知未修补漏洞的依赖版本。",
  "- 绝不记录完整用户数据（PII、密码、令牌、完整请求体）。",
].join("\n");

const githubStyleCodeReviewPrompt = [
  "你是 ARCH Agent，负责以 GitHub Copilot Code Review / PR Review 风格审查 FORGE 的开发产物。",
  "",
  "审查原则",
  "- 多角度审查：从正确性、安全性、权限边界、数据丢失风险、并发/异步、性能、可维护性、可测试性和用户可见回归角度检查。",
  "- 高信号优先：优先指出会导致 bug、漏洞、数据损坏、构建失败、测试缺失或明显用户体验回退的问题；不要输出没有实际价值的吹毛求疵。",
  "- 可操作：每个问题都说明影响、证据、建议修法；能给出具体修改方向时直接给，不要只说“需要优化”。",
  "- 尊重上下文：结合上游任务、FORGE 输出、项目现有风格和用户明确约束；不要要求无关重构或大版本依赖升级。",
  "- 人工可验证：像 GitHub 官方文档提醒的一样，AI 审查不保证发现所有问题；必须明确哪些结论已由证据支撑，哪些只是需要人工复核的风险。",
  "",
  "审查清单",
  "1. 变更是否真正解决用户目标，是否遗漏边界条件或验收标准。",
  "2. 是否引入安全问题：密钥泄露、权限绕过、危险命令、路径遍历、SSRF/XSS/注入、敏感日志。",
  "3. 是否可能导致数据丢失、状态错乱、并发竞态、缓存/持久化不一致。",
  "4. 是否破坏现有 API、配置格式、路由、存储路径、模型绑定或工作流语义。",
  "5. 是否有必要的错误处理和用户可理解的失败信息，但没有过度设计。",
  "6. 是否有合理验证：类型检查、lint、单测、集成测试、构建或手工验证路径；缺失时说明缺口。",
  "7. UI 改动需检查布局、自适应、交互状态、可读性和是否符合 ORX 现有视觉风格。",
  "",
  "输出格式",
  "- 如果发现问题，按严重程度排序输出：P0 阻塞 / P1 高 / P2 中 / P3 低。",
  "- 每条包含：位置、问题、影响、建议修法、验证方式。",
  "- 如果未发现问题，明确说“未发现阻塞问题”，并列出剩余测试缺口或人工复核点。",
  "- 不要重复粘贴大段代码；必要时只给最小补丁建议。",
].join("\n");

export function createLeanDevelopmentSteps(): WorkflowStep[] {
  const implementation = defaultSteps.find((step) => step.stage === "Implementation" && step.owner === "DEV Agent")
    ?? defaultSteps.find((step) => step.stage === "TaskSplit" && step.owner === "DEV Agent")
    ?? defaultSteps[0];
  const codeReview = defaultSteps.find((step) => step.stage === "CodeReview" && step.owner === "ARCH Agent")
    ?? defaultSteps[0];
  const implementationCriteria = [
    ...(defaultCompletionCriteria("Implementation") ?? []),
    "Trellis check: goal, boundary, acceptance criteria, and constraints are clear enough to execute.",
    "Grill-me check: assumptions, failure paths, security/permission impact, regression risk, and verification evidence are challenged before handoff.",
  ];

  return [
    {
      ...implementation,
      stage: "Implementation",
      owner: "DEV Agent",
      instruction: forgeDevPrompt,
      enabled: true,
      approval: "auto",
      rollback_target: "Implementation",
      skill_ids: ["trellis", "grill-me"],
      interaction: "single-turn",
      exit_condition: "node_complete",
      completion_criteria: Array.from(new Set(implementationCriteria)),
    },
    {
      ...codeReview,
      stage: "CodeReview",
      owner: "ARCH Agent",
      instruction: githubStyleCodeReviewPrompt,
      enabled: true,
      approval: "user",
      rollback_target: "Implementation",
      skill_ids: ["code-review", "grill-me"],
      interaction: "single-turn",
      exit_condition: "node_complete",
      completion_criteria: [
        ...(defaultCompletionCriteria("CodeReview") ?? []),
        "Review findings are prioritized by severity with impact and actionable fixes.",
        "Security, data loss, regression, test coverage, and maintainability risks are explicitly considered.",
        "If no blocking issue is found, remaining verification gaps are still recorded.",
      ],
    },
  ];
}

function uniqueWorkflowId(workflows: WorkflowDefinition[], baseId: string) {
  const existing = new Set(workflows.map((workflow) => workflow.id));
  if (!existing.has(baseId)) return baseId;
  let index = 2;
  while (existing.has(`${baseId}-${index}`)) index += 1;
  return `${baseId}-${index}`;
}

function normalizeDefaults(workflows: WorkflowDefinition[], defaultId?: string | null) {
  if (!defaultId) return workflows.map((workflow) => ({ ...workflow, isDefault: false }));
  const targetId = workflows.some((workflow) => workflow.id === defaultId) ? defaultId : "";
  return workflows.map((workflow) => ({ ...workflow, isDefault: workflow.id === targetId }));
}

export function migrateWorkflowDefinition(workflow: WorkflowDefinition): WorkflowDefinition {
  return {
    ...workflow,
    steps: createLeanDevelopmentSteps(),
  };
}

export function createDefaultWorkflows(): WorkflowDefinition[] {
  const leanSteps = createLeanDevelopmentSteps();

  return normalizeDefaults([
    {
      id: "full-development",
      name: "FORGE 开发 / 代码审查",
      description: "临时收窄版：只启用 FORGE 开发执行和 ARCH CodeReview，降低流程复杂度。",
      steps: cloneSteps(leanSteps),
    },
    {
      id: "bug-fix",
      name: "FORGE Bug 修复 / CR",
      description: "临时收窄版：缺陷处理也只走开发实现和代码审查。",
      steps: cloneSteps(leanSteps),
    },
    {
      id: "test-only",
      name: "FORGE 验证 / CR",
      description: "临时收窄版：测试类诉求先由开发节点整理验证方案，再交给代码审查。",
      steps: cloneSteps(leanSteps),
    },
  ], null);
}

export function getDefaultWorkflow(workflows: WorkflowDefinition[]) {
  return workflows.find((workflow) => workflow.isDefault);
}

export function updateWorkflow(workflows: WorkflowDefinition[], workflowId: string, patch: Partial<Omit<WorkflowDefinition, "id" | "steps">>) {
  return workflows.map((workflow) => workflow.id === workflowId ? { ...workflow, ...patch } : workflow);
}

export function updateWorkflowSteps(workflows: WorkflowDefinition[], workflowId: string, steps: WorkflowStep[]) {
  return workflows.map((workflow) => workflow.id === workflowId ? { ...workflow, steps: cloneSteps(steps) } : workflow);
}

export function addWorkflow(workflows: WorkflowDefinition[]) {
  const id = uniqueWorkflowId(workflows, "custom-workflow");
  const workflow: WorkflowDefinition = {
    id,
    name: "自定义工作流",
    description: "从空白流程开始配置节点、负责人、审批和打回规则。",
    steps: createLeanDevelopmentSteps(),
  };
  return { workflows: [...workflows, workflow], activeWorkflowId: id };
}

export function duplicateWorkflow(workflows: WorkflowDefinition[], workflowId: string) {
  const source = workflows.find((workflow) => workflow.id === workflowId) ?? getDefaultWorkflow(workflows) ?? workflows[0];
  if (!source) return addWorkflow(workflows);
  const id = uniqueWorkflowId(workflows, `${source.id}-copy`);
  const workflow: WorkflowDefinition = {
    ...source,
    id,
    name: `${source.name} Copy`,
    isDefault: false,
    steps: cloneSteps(source.steps),
  };
  return { workflows: [...workflows, workflow], activeWorkflowId: id };
}

export function deleteWorkflow(workflows: WorkflowDefinition[], workflowId: string, activeWorkflowId: string) {
  const target = workflows.find((workflow) => workflow.id === workflowId);
  if (!target || target.isDefault || workflows.length <= 1) {
    return { workflows, activeWorkflowId: target?.isDefault ? target.id : activeWorkflowId };
  }
  const nextWorkflows = workflows.filter((workflow) => workflow.id !== workflowId);
  const nextActive = activeWorkflowId === workflowId ? getDefaultWorkflow(nextWorkflows)?.id ?? nextWorkflows[0]?.id ?? "" : activeWorkflowId;
  return { workflows: nextWorkflows, activeWorkflowId: nextActive };
}

export function setDefaultWorkflow(workflows: WorkflowDefinition[], workflowId: string) {
  return normalizeDefaults(workflows, workflowId);
}
