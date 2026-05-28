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
