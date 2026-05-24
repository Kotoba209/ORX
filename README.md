# ORX

ORX 是一个基于 Tauri + Rust + React 的本地 AI 工作流客户端。它用于把多家模型 API 接入为服务 Agent，并围绕“需求澄清、场景预演、边界探测、开发实现、代码审查、测试计划、复盘沉淀”跑端到端流程。

界面偏 CLI/终端风格：左侧管理项目和对话，中间显示 ORCH 调度与对话时间线，右侧显示产物、上下文和项目文件。

## 核心能力

- 添加本地项目目录，扫描代码上下文。
- 配置 OpenAI-compatible Provider、模型、Base URL、代理和 API Key 引用。
- 为 PM、PD、DEV、ARCH、QA 等 Agent 绑定模型服务。
- 自定义工作流步骤、负责人、审批节点和打回规则。
- 在 PD PRD、ARCH CR 等人工审批点弹出预览窗口，支持审批意见。
- DEV 产物必须是非空文件，空文件或无法落盘会被阻断并打回。
- 可设置一个产物总目录，ORX 会自动按任务和角色分类导出产物。

## 目录结构

```text
D:\CodexProjects\workflow-manager-client
├─ src/                  # React 前端
├─ src-tauri/            # Rust/Tauri 后端
│  ├─ src/               # Tauri commands、Provider、归档、设置
│  └─ icons/             # ORX 图标资源
├─ dist/                 # 前端构建产物
└─ README.md
```

## 安装开发环境

### 1. Node.js

建议安装 Node.js 22 或更高版本。

检查：

```powershell
node -v
npm -v
```

### 2. Rust

安装 Rust stable：

```powershell
rustup default stable
rustc -V
cargo -V
```

### 3. Windows 构建工具

Tauri Windows 打包需要 Visual Studio Build Tools，至少包含：

- Desktop development with C++
- MSVC v143
- Windows 10/11 SDK

### 4. WebView2

Windows 10/11 通常已自带 WebView2 Runtime。若启动失败，请安装 Microsoft Edge WebView2 Runtime。

## 安装依赖

进入项目目录：

```powershell
cd D:\CodexProjects\workflow-manager-client
npm install
```

## 开发运行

```powershell
npm run tauri -- dev
```

如果只想看前端页面：

```powershell
npm run dev
```

注意：浏览器预览模式没有 Tauri command 能力，不能真实保存 Provider、读取本地项目、选择目录或执行完整工作流。

## 构建安装包

```powershell
npm run tauri -- build
```

构建完成后常用文件：

```text
D:\CodexProjects\workflow-manager-client\src-tauri\target\release\ORX.exe
D:\CodexProjects\workflow-manager-client\src-tauri\target\release\bundle\nsis\ORX_0.1.0_x64-setup.exe
D:\CodexProjects\workflow-manager-client\src-tauri\target\release\bundle\msi\ORX_0.1.0_x64_en-US.msi
```

## 本地配置文件

ORX 的用户配置默认存放在：

```text
%APPDATA%\WorkflowManagerClient
```

常用文件：

```text
%APPDATA%\WorkflowManagerClient\providers.json   # Provider 和 Agent 绑定配置
%APPDATA%\WorkflowManagerClient\secrets.json     # API Key 引用文件
%APPDATA%\WorkflowManagerClient\settings.json    # 产物总目录等应用设置
%APPDATA%\WorkflowManagerClient\projects.json    # 已添加项目列表
%APPDATA%\WorkflowManagerClient\tasks\           # ORX 默认任务归档目录
```

## API Key 配置

ORX 不把真实 API Key 写进 `providers.json`。Provider 页面只保存 `api_key_ref`，运行时按以下顺序读取：

1. 先读取同名环境变量。
2. 如果环境变量不存在，再读取 `%APPDATA%\WorkflowManagerClient\secrets.json`。

### secrets.json 样例

创建文件：

```text
%APPDATA%\WorkflowManagerClient\secrets.json
```

内容示例：

```json
{
  "GPT_LOCAL_API_KEY": "your-api-key-here",
  "DEEPSEEK_API_KEY": "your-deepseek-key-here",
  "ANTHROPIC_API_KEY": "your-anthropic-key-here"
}
```

Provider 配置里的 `API Key 引用` 填 `GPT_LOCAL_API_KEY`，ORX 就会读取上面 JSON 里的对应值。

### 环境变量方式

也可以用环境变量：

```powershell
$env:GPT_LOCAL_API_KEY="your-api-key-here"
npm run tauri -- dev
```

如果从 exe 启动，环境变量需要在系统环境变量中配置，或使用 `secrets.json`。

## Provider 配置

打开 ORX 后进入：

```text
模型服务
```

推荐 OpenAI-compatible 配置示例：

```text
ID: gpt-local
名称: GPT Local
Base URL: http://127.0.0.1:8317/v1
模型: gpt-5.5
API Key 引用: GPT_LOCAL_API_KEY
通过本机 Clash 代理请求: 按需勾选
Clash 代理地址: http://127.0.0.1:7897
```

注意：

- Base URL 只填到 `/v1`。
- ORX 会自动拼接 `/responses`。
- 不要把 Base URL 写成 `http://127.0.0.1:8317/v1/responses`。

保存 Provider 后，可以点击“测试连接”。测试通过后，可以点击“绑定全部 Agent 到当前 Provider”。

## Agent 角色

内置角色代号：

```text
ORCH  调度器，负责收集信息、下发任务、监听节点、审批暂停和总结
PM    流程管理 Agent
PD    产品 Agent，负责 PRD、场景预演、边界探测
DEV   开发 Agent，负责任务拆解、实现和代码产物
ARCH  架构师 Agent，负责代码审查、红蓝质询、架构风险
QA    测试 Agent，负责测试计划、集成测试和端到端验证
```

## 工作流配置

进入：

```text
工作流
```

内置流程：

- 完整需求开发流程：包含 PD PRD 审批和 ARCH CR 审批。
- Bug 修复流程：跳过 PD PRD 文档，聚焦复现、修复、CR、测试和复盘。
- 仅测试流程：用于已有实现后的测试计划、测试记录和复盘。

每个步骤可以配置：

- 是否启用
- 阶段
- 负责人
- 执行说明
- 交付确认
- 失败打回目标

阶段下拉会显示对应 Agent，例如：

```text
ScenarioRehearsal（PD Agent）
CodeReview（ARCH Agent）
TaskSplit（DEV Agent）
```

## 人工审批

当工作流走到 `需要我确认` 的节点时，中间会自动弹出审批预览。

你可以：

- 填写审批意见。
- 点击“同意继续”。
- 点击“否决打回”。

也可以在底部输入框回复：

```text
同意，方向可以继续，但国家字段必须必填
```

或：

```text
否决，字段缺少国家，返回 PD 重写 PRD
```

审批动作会作为右侧气泡插入中间流程时间线。

## 产物存放目录

进入：

```text
设置 -> 产物存放
```

只需要选择一个总目录，ORX 会自动创建子目录。

示例：总目录设置为：

```text
D:\ORX-Artifacts
```

运行任务后会生成：

```text
D:\ORX-Artifacts\task-1779600000000\pd\
D:\ORX-Artifacts\task-1779600000000\dev\
D:\ORX-Artifacts\task-1779600000000\arch\
D:\ORX-Artifacts\task-1779600000000\qa\
D:\ORX-Artifacts\task-1779600000000\pm\
```

分类规则：

```text
PD Agent    -> pd
DEV Agent   -> dev
ARCH Agent  -> arch
QA Agent    -> qa
PM Agent    -> pm
```

ORX 同时仍会保留默认任务归档：

```text
%APPDATA%\WorkflowManagerClient\tasks\task-xxxx
```

## DEV 代码产物格式

如果任务需要生成文件，DEV Agent 必须输出 Markdown 代码块，并在代码块第一行声明文件名：

```html
<!-- FILE: index.html -->
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <title>表单</title>
  </head>
  <body>
    <form>
      <label>姓名 <input required /></label>
    </form>
  </body>
</html>
```

完整 Markdown 输出应类似：

````markdown
```html
<!-- FILE: index.html -->
<!doctype html>
<html lang="zh-CN">
...
</html>
```
````

空文件会被拒绝。若生成文件为 `0 KB`，ORX 会阻断流程并打回 DEV，不会继续交给 QA。

## 添加项目和上下文

左侧点击“选择项目文件夹”添加项目。

项目加入后：

- 双击项目可重新扫描。
- 右键项目可新建对话或移除项目。
- 右侧“项目文件”可右键文件/文件夹加入工作区上下文。

Agent 不一定需要完整文件内容。ORX 会把被选中的文件路径作为上下文传给 Agent，让它围绕这些路径定位需求、开发和测试影响面。

## 对话附件

底部输入框支持把本地文件直接粘贴或拖入对话区域。

发送前，文件会显示为附件卡片，可以单独移除。点击发送后，ORX 会先创建当前任务归档，然后把附件复制到：

```text
%APPDATA%\WorkflowManagerClient\tasks\task-xxxx\attachments\
```

随后 ORX 会把附件信息写入工作流上下文，交给后续 Agent 使用。上下文包含：

```text
- 原始文件名
- 归档后的本地路径
- 文件大小
- 类型：text / image / binary
- 文本类小文件的前 8KB 预览
```

文本类附件会提供短预览，便于 PD/DEV/ARCH/QA 快速读取需求或代码片段。图片、压缩包、安装包等二进制附件只提供路径和元数据，Agent 不应臆测文件内容；需要完整内容时，应按归档路径读取。

注意：浏览器预览模式通常拿不到文件的本地路径，附件归档需要在 Tauri 客户端中运行。

## 常见问题

### Provider 测试失败：无法读取 API Key 引用

检查：

1. Provider 的 `API Key 引用` 是否和 `secrets.json` 的 key 一致。
2. `secrets.json` 是否在 `%APPDATA%\WorkflowManagerClient\secrets.json`。
3. JSON 是否有效，不要有多余逗号。

示例：

```json
{
  "GPT_LOCAL_API_KEY": "your-api-key-here"
}
```

### Provider 连接超时

检查：

1. Base URL 是否只写到 `/v1`。
2. 本地模型服务是否启动。
3. 是否需要勾选代理路线。
4. Clash 代理地址是否正确，例如 `http://127.0.0.1:7897`。

### 没有生成文件或文件为空

检查 DEV Agent 输出是否包含：

```text
<!-- FILE: index.html -->
```

并确认代码块中有实际内容。ORX 会拒绝空 generated 文件。

### 浏览器预览不能保存配置

正常。保存项目、保存 Provider、选择目录、读写本地文件都需要在 Tauri 客户端中运行。

## 测试命令

前端工作流自测：

```powershell
npm --cache D:\npm-cache run workflow:selftest
```

Rust 测试：

```powershell
cd src-tauri
cargo test
```

前端构建：

```powershell
npm --cache D:\npm-cache run build
```

Tauri 打包：

```powershell
npm --cache D:\npm-cache run tauri -- build
```

## 品牌与图标

当前应用代号：

```text
ORX
```

Windows 主程序和安装包名称会使用 ORX：

```text
ORX.exe
ORX_0.1.0_x64-setup.exe
ORX_0.1.0_x64_en-US.msi
```

图标资源位于：

```text
src-tauri\icons
```
