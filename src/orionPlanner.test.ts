import test from "node:test";
import assert from "node:assert/strict";
import {
  draftOrionWorkflow,
  attachCapabilityToStep,
  createOrionActionPlan,
  classifyOrionIntent,
  createOrionAssistantResponse,
} from "./orionPlanner.ts";

test("drafts a bug investigation workflow with capabilities", () => {
  const draft = draftOrionWorkflow("我想查一个登录失败的 bug");

  assert.equal(draft.name, "Bug Investigation");
  assert.deepEqual(draft.steps.map((step) => step.stage), ["Intake", "BugClarification", "BugTrace", "ReproductionTest", "Retrospective"]);
  assert.deepEqual(draft.steps.find((step) => step.stage === "BugClarification")?.skill_ids, ["trellis"]);
  assert.deepEqual(draft.steps.find((step) => step.stage === "BugTrace")?.skill_ids, ["bug-investigation"]);
  assert.deepEqual(draft.steps.find((step) => step.stage === "ReproductionTest")?.skill_ids, ["test-planning"]);
});

test("can attach a capability to an existing workflow step without mutating the input", () => {
  const draft = draftOrionWorkflow("我想查一个 bug");
  const updated = attachCapabilityToStep(draft, "BugTrace", "code-review");

  assert.deepEqual(draft.steps.find((step) => step.stage === "BugTrace")?.skill_ids, ["bug-investigation"]);
  assert.deepEqual(updated.steps.find((step) => step.stage === "BugTrace")?.skill_ids, ["bug-investigation", "code-review"]);
});

test("creates an action plan to save and run a drafted workflow", () => {
  const draft = draftOrionWorkflow("我想查一个 bug");
  const plan = createOrionActionPlan(draft);

  assert.deepEqual(plan.map((action) => action.kind), ["workflow.create", "skill.attach", "skill.attach", "skill.attach", "workflow.run"]);
  assert.equal(plan.every((action) => action.risk === "direct"), true);
});

test("routes local computer tasks to assistant mode instead of workflow mode", () => {
  const installDecision = classifyOrionIntent("install the Feishu desktop client", {
    projectFiles: ["notes.txt"],
  });
  const commandDecision = classifyOrionIntent("run npm --version and check the script status", {
    projectFiles: ["readme.txt"],
  });
  const researchDecision = classifyOrionIntent("look up how to configure PowerShell profiles", {
    projectFiles: [],
  });

  assert.equal(installDecision.mode, "assistant");
  assert.equal(commandDecision.mode, "assistant");
  assert.equal(researchDecision.mode, "assistant");
});

test("routes existing website analysis to assistant mode before software workflow keywords", () => {
  const decision = classifyOrionIntent("是我个人的，主要做安全测试内容以及靶场练习，我需要页面HTML包括服务器技术栈，地址是 https://hnr.pages.dev/", {
    projectFiles: ["package.json", "src/App.tsx"],
  });

  assert.equal(decision.mode, "assistant");
  assert.equal(decision.reason, "task_mentions_website_analysis");
});

test("keeps software work in workflow mode when task or project context is code related", () => {
  const bugDecision = classifyOrionIntent("fix the login failure bug", {
    projectFiles: ["notes.txt"],
  });
  const featureDecision = classifyOrionIntent("implement a settings page for providers", {
    projectFiles: ["README.md"],
  });
  const codebaseDecision = classifyOrionIntent("review the next steps for this module", {
    projectFiles: ["package.json", "src/App.tsx"],
  });

  assert.equal(bugDecision.mode, "workflow");
  assert.equal(featureDecision.mode, "workflow");
  assert.equal(codebaseDecision.mode, "workflow");
});

test("assistant response drafts non-workflow actions without creating workflow actions", () => {
  const response = createOrionAssistantResponse("run npm --version");

  assert.equal(response.mode, "assistant");
  assert.match(response.message, /local assistant/i);
  assert.deepEqual(response.actions.map((action) => action.kind), ["command.runWhitelisted"]);
  assert.deepEqual(response.actions[0].payload, {
    program: "npm",
    args: ["--version"],
    cwd: "",
    request: "run npm --version",
  });
});

test("assistant response routes non-whitelisted commands to worktree sandbox execution", () => {
  const response = createOrionAssistantResponse("运行 pnpm lint");

  assert.equal(response.mode, "assistant");
  assert.deepEqual(response.actions.map((action) => action.kind), ["command.runWorktreeSandbox"]);
  assert.equal(response.actions[0].risk, "confirm");
  assert.deepEqual(response.actions[0].payload, {
    program: "pnpm",
    args: ["lint"],
    cwd: "",
    request: "运行 pnpm lint",
    sandbox_required: true,
    sandbox_kind: "git-worktree",
  });
});

test("assistant response treats explicit node file writes as command execution", () => {
  const command = `运行 node -e "require('fs').writeFileSync('sandbox-test.txt','ok')"`;
  const response = createOrionAssistantResponse(command);

  assert.equal(response.mode, "assistant");
  assert.deepEqual(response.actions.map((action) => action.kind), ["command.runWorktreeSandbox"]);
  assert.deepEqual(response.actions[0].payload, {
    program: "node",
    args: ["-e", "require('fs').writeFileSync('sandbox-test.txt','ok')"],
    cwd: "",
    request: command,
    sandbox_required: true,
    sandbox_kind: "git-worktree",
  });
});

test("assistant response maps project health checks to status selftest and build commands", () => {
  const response = createOrionAssistantResponse("检查项目状态和构建");

  assert.equal(response.mode, "assistant");
  assert.deepEqual(response.actions.map((action) => action.kind), [
    "command.runWhitelisted",
    "command.runWhitelisted",
    "command.runWhitelisted",
  ]);
  assert.deepEqual(response.actions.map((action) => action.payload), [
    {
      program: "git",
      args: ["status", "--short", "--branch"],
      cwd: "",
      request: "检查项目状态和构建",
      command_role: "project-status",
    },
    {
      program: "npm",
      args: ["run", "workflow:selftest"],
      cwd: "",
      request: "检查项目状态和构建",
      command_role: "project-selftest",
    },
    {
      program: "npm",
      args: ["run", "build"],
      cwd: "",
      request: "检查项目状态和构建",
      command_role: "project-build",
    },
  ]);
});

test("assistant response maps tool version checks to exact version commands", () => {
  const response = createOrionAssistantResponse("检查 Node npm Rust Cargo 环境版本");

  assert.equal(response.mode, "assistant");
  assert.deepEqual(response.actions.map((action) => action.payload), [
    { program: "node", args: ["--version"], cwd: "", request: "检查 Node npm Rust Cargo 环境版本", command_role: "node-version" },
    { program: "npm", args: ["--version"], cwd: "", request: "检查 Node npm Rust Cargo 环境版本", command_role: "npm-version" },
    { program: "rustc", args: ["-V"], cwd: "", request: "检查 Node npm Rust Cargo 环境版本", command_role: "rustc-version" },
    { program: "cargo", args: ["-V"], cwd: "", request: "检查 Node npm Rust Cargo 环境版本", command_role: "cargo-version" },
  ]);
});

test("assistant response maps trusted client install requests to exact winget actions", () => {
  const response = createOrionAssistantResponse("install Feishu desktop client");

  assert.equal(response.mode, "assistant");
  assert.deepEqual(response.actions.map((action) => action.kind), ["command.runWhitelisted", "command.runWhitelisted"]);
  assert.deepEqual(response.actions[0].payload, {
    program: "winget",
    args: ["install", "--id", "ByteDance.Feishu", "--exact", "--accept-package-agreements", "--accept-source-agreements"],
    cwd: "",
    request: "install Feishu desktop client",
    package_id: "ByteDance.Feishu",
    package_name: "Feishu",
    source: "winget",
  });
  assert.deepEqual(response.actions[1].payload, {
    program: "winget",
    args: ["list", "--id", "ByteDance.Feishu", "--exact"],
    cwd: "",
    request: "install Feishu desktop client",
    package_id: "ByteDance.Feishu",
    package_name: "Feishu",
    source: "winget",
  });
});

test("assistant response does not create install actions for unknown clients", () => {
  const response = createOrionAssistantResponse("install TotallyUnknown client");

  assert.equal(response.mode, "assistant");
  assert.deepEqual(response.actions, []);
  assert.match(response.message, /trusted installer/i);
});

test("assistant response inspects local artifact and task paths directly", () => {
  const response = createOrionAssistantResponse("帮我看一下当前产物生成配置路径");

  assert.equal(response.mode, "assistant");
  assert.deepEqual(response.actions.map((action) => action.kind), ["local.inspectConfig"]);
  assert.equal(response.actions[0].risk, "direct");
  assert.deepEqual(response.actions[0].payload, {
    request: "帮我看一下当前产物生成配置路径",
    include: ["settings_path", "artifact_output_dir", "tasks_dir", "current_project"],
  });
});

test("assistant response maps project text search to direct project search", () => {
  const response = createOrionAssistantResponse("在项目里搜索 project_scanner");

  assert.equal(response.mode, "assistant");
  assert.deepEqual(response.actions.map((action) => action.kind), ["file.searchProject"]);
  assert.equal(response.actions[0].risk, "direct");
  assert.deepEqual(response.actions[0].payload, {
    query: "project_scanner",
    request: "在项目里搜索 project_scanner",
    max_results: 30,
  });
});

test("assistant response maps public and sensitive web searches to different risks", () => {
  const publicResponse = createOrionAssistantResponse("上网查询 Tauri v2 opener 文档");
  const sensitiveResponse = createOrionAssistantResponse("上网查一下 E:\\code\\ORX\\src-tauri 报错日志");

  assert.deepEqual(publicResponse.actions.map((action) => action.kind), ["web.searchPublic"]);
  assert.equal(publicResponse.actions[0].risk, "direct");
  assert.deepEqual(publicResponse.actions[0].payload, {
    query: "Tauri v2 opener 文档",
    request: "上网查询 Tauri v2 opener 文档",
    max_results: 5,
  });

  assert.deepEqual(sensitiveResponse.actions.map((action) => action.kind), ["web.searchSensitive"]);
  assert.equal(sensitiveResponse.actions[0].risk, "confirm");
});

test("assistant response treats website analysis with server environment wording as web search", () => {
  const response = createOrionAssistantResponse("分析这个是一个什么网站，运行在什么服务器环境 https://hnr.pages.dev/");

  assert.deepEqual(response.actions.map((action) => action.kind), ["web.searchPublic"]);
  assert.equal(response.actions[0].payload.query, "https://hnr.pages.dev/");
});

test("assistant response allows auto writes only for generated artifact requests", () => {
  const generatedResponse = createOrionAssistantResponse("写到产物目录 orion-note.md 内容：hello");
  const configResponse = createOrionAssistantResponse("自动写 settings.json 内容：hello");

  assert.deepEqual(generatedResponse.actions.map((action) => action.kind), ["file.writeGeneratedArtifactAuto"]);
  assert.equal(generatedResponse.actions[0].risk, "direct");
  assert.deepEqual(generatedResponse.actions[0].payload, {
    relative_path: "orion-note.md",
    content: "hello",
    request: "写到产物目录 orion-note.md 内容：hello",
  });

  assert.deepEqual(configResponse.actions.map((action) => action.kind), ["file.writeGeneratedArtifact"]);
  assert.equal(configResponse.actions[0].risk, "confirm");
});
