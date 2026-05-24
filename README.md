# ORX

ORX 是一个基于 Tauri + Rust + React 的本地 AI 工作流客户端。它用于把多家模型 API 接入为服务 Agent，并围绕需求澄清、场景预演、边界探测、开发实现、代码审查、测试计划和复盘沉淀跑端到端流程。

界面偏 CLI / Codex 客户端风格：左侧管理项目和会话，中间显示 ORCH 调度与对话时间线，右侧显示产物、上下文和项目文件。

## 核心能力

- 添加本地项目目录，扫描代码上下文。
- 配置 OpenAI-compatible Provider、模型、Base URL、代理和 API Key 引用。
- 为 PM、PD、DEV、ARCH、QA 等 Agent 绑定模型服务。
- 自定义工作流步骤、负责人、审批节点和打回规则。
- 在 PD PRD、ARCH CR 等人工审批点弹出预览窗口，支持审批意见。
- DEV 产物必须是非空文件，空文件或无法落盘会被阻断并打回。
- 可设置一个产物总目录，ORX 会按任务和角色分类导出产物。
- 支持粘贴/拖拽附件，图片会作为视觉输入交给支持图片能力的模型。

## 原理文档

如果想了解 ORCH 如何调度 Agent、Agent 之间如何通过上下文交接、实时巡检和审批打回机制如何运行，请看：

```text
docs\orx-core-workflow-principles.md
```

## 项目目录

```text
D:\CodexProjects\ORX
├─ src\                  # React 前端
├─ src-tauri\            # Rust / Tauri 后端
├─ docs\                 # 设计与实施文档
├─ release\              # 当前随仓库上传的安装包
├─ package.json
└─ README.md
```

## 安装开发环境

需要准备：

- Node.js 22 或更高版本
- Rust stable
- Visual Studio Build Tools，包含 Desktop development with C++、MSVC v143、Windows SDK
- Microsoft Edge WebView2 Runtime

检查命令：

```powershell
node -v
npm -v
rustc -V
cargo -V
```

## 安装依赖

```powershell
cd D:\CodexProjects\ORX
npm install
```

## 开发运行

```powershell
npm run tauri -- dev
```

只预览前端页面：

```powershell
npm run dev
```

浏览器预览模式没有 Tauri command 能力，不能真实保存 Provider、读取本地项目、选择目录或执行完整工作流。

## 构建安装包

```powershell
npm run tauri -- build
```

构建完成后的常用文件：

```text
D:\CodexProjects\ORX\src-tauri\target\release\ORX.exe
D:\CodexProjects\ORX\src-tauri\target\release\bundle\nsis\ORX_0.1.0_x64-setup.exe
D:\CodexProjects\ORX\src-tauri\target\release\bundle\msi\ORX_0.1.0_x64_en-US.msi
```

当前仓库也包含一份已构建安装包：

```text
release\ORX_0.1.0_x64-setup.exe
release\ORX_0.1.0_x64_en-US.msi
```

## 本地配置文件

ORX 的用户配置默认保存到：

```text
%APPDATA%\ORX
```

常用文件：

```text
%APPDATA%\ORX\providers.json   # Provider 和 Agent 绑定配置
%APPDATA%\ORX\secrets.json     # API Key 引用文件
%APPDATA%\ORX\settings.json    # 产物总目录等应用设置
%APPDATA%\ORX\projects.json    # 已添加项目列表
%APPDATA%\ORX\workflows.json   # 工作流配置
%APPDATA%\ORX\tasks\           # 默认任务归档目录
```

## API Key 配置

ORX 不把真实 API Key 写进 `providers.json`。Provider 页面只保存 `api_key_ref`，运行时按以下顺序读取：

1. 读取同名环境变量。
2. 如果环境变量不存在，再读取 `%APPDATA%\ORX\secrets.json`。

创建文件：

```text
%APPDATA%\ORX\secrets.json
```

内容示例：

```json
{
  "GPT_LOCAL_API_KEY": "your-api-key-here",
  "DEEPSEEK_API_KEY": "your-deepseek-key-here",
  "ANTHROPIC_API_KEY": "your-anthropic-key-here"
}
```

Provider 配置里的 `API Key 引用` 填 `GPT_LOCAL_API_KEY`，ORX 会读取上面 JSON 里的对应值。

也可以使用环境变量：

```powershell
$env:GPT_LOCAL_API_KEY="your-api-key-here"
npm run tauri -- dev
```

如果从 exe 启动，环境变量需要配置到系统环境变量中，或使用 `secrets.json`。

## Provider 配置

在客户端中打开「模型服务」：

- 名称：例如 `GPT Local`
- 类型：`openai-compatible`
- Base URL：例如 `http://127.0.0.1:8317/v1`
- 模型：例如 `gpt-5.5`
- API Key 引用：例如 `GPT_LOCAL_API_KEY`
- 代理：可勾选是否走代理路线，代理地址可编辑

Base URL 只需要配置到 `/v1`，ORX 会自动调用 `/responses`。

## 工作流配置

在「工作流」面板中可以：

- 新增工作流
- 复制当前工作流
- 删除非默认工作流
- 设为默认工作流
- 编辑每个节点的阶段、Agent、指令、审批方式和打回目标

默认完整流程包含：

```text
PM / Intake
PD / ScenarioRehearsal
PD / BoundaryProbe
ARCH / RedBlueChallenge
DEV / TaskSplit
ARCH / CodeReview
QA / TestPlan
PM / Retrospective
```

其中 PD 文档和 ARCH CR 可配置为需要人工审批。审批时可以填写意见，否决后会按打回规则回滚。

## 产物输出

ORX 有两类产物位置：

1. 默认任务归档：`%APPDATA%\ORX\tasks\task-xxxx`
2. 设置面板中配置的产物总目录

如果设置了产物总目录，ORX 会按任务和角色自动生成子目录，例如：

```text
<产物总目录>\task-xxxx\pd
<产物总目录>\task-xxxx\dev
<产物总目录>\task-xxxx\arch
<产物总目录>\task-xxxx\qa
<产物总目录>\task-xxxx\pm
```

DEV 生成的真实文件会落到 `generated` 并导出到 `dev` 分类下。ARCH、QA、PD 报告里的示例代码不会被当成真实文件产物导出。

## 附件与图片

可以在输入框粘贴或拖拽文件。对于图片：

- 客户端会保存到任务归档的 `attachments` 目录。
- 调用 Responses API 时会把图片作为 `input_image` 传给模型。
- 需要模型本身支持视觉能力，否则 Agent 会返回不支持或无法识别。

附件目录示例：

```text
%APPDATA%\ORX\tasks\task-xxxx\attachments\
```

## 验证命令

前端工作流自测：

```powershell
npm --cache D:\npm-cache run workflow:selftest
```

前端生产构建：

```powershell
npm --cache D:\npm-cache run build
```

Rust 测试：

```powershell
cd D:\CodexProjects\ORX\src-tauri
cargo test
```

## 常见问题

### Provider 测试失败，提示无法读取 API Key

检查：

1. Provider 的 `API Key 引用` 是否和 `secrets.json` 的 key 一致。
2. `secrets.json` 是否在 `%APPDATA%\ORX\secrets.json`。
3. JSON 是否有效，不要有多余逗号。

### Base URL 应该怎么填

只填到 `/v1`：

```text
http://127.0.0.1:8317/v1
```

不要填 `/responses`，ORX 会自动拼接。
