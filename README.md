# dsh-claude-code-delegate

**Claude Code 代理** —— DeepSeek Harness 的 Agent preset 插件：新建会话时选择这个模式，
会话就只做调度，每个实际任务都通过 `subagent_claude_code` 交给 **Claude Code 子代理**执行，
主代理负责理解需求、组织任务说明、转交和汇报结果。

```
你 → 主代理（调度器） → subagent_claude_code → Claude Code（真正干活） → 主代理汇报 → 你
```

## 安装

```bash
dsh plugin --profile <profile> add dsh-claude-code-delegate
```

或在 Web/Desktop 的 **插件** 页面安装（`plugin_manager` 的 `install_bundle`，target 为
`dsh-claude-code-delegate`）。安装后新建会话，在模式列表里选择 **Claude Code 代理**。

### 前置条件

- 本机 Claude Code 已完成登录。它的原生 `settings.json` / `~/.claude.json` 是认证与
  其它原生设置的权威来源，本插件不会替你登录或改写这些文件。
- DSH 版本满足本包的 `engines.dsh`（见 `package.json`）。

`@deepseek-ai/dsh-subagent-claude-code`（Claude Code SDK 载荷与进程外运行能力）已经声明为
本包的依赖，`dsh plugin add` 会一并装好；本插件的 patch 自己注册专用 provider，所以**不需要**
额外启用那个 bundle。你若手动启用了它也不冲突：它注册的是全局 `claude-code` provider 与全局
工具，本插件用的是另一个名字的专用 provider。

## 这个模式里有什么

preset 只注册两个工具：

| 工具 | 作用 |
|---|---|
| `subagent_claude_code` | 唯一的干活入口，指向本插件注册的专用 provider |
| `ask_user_question` | 需求有关键歧义时先问用户 |

> **注意**：profile 级的全局工具依然存在（例如 `working_directory`、MCP 工具、插件管理工具），
> 它们对 preset 里的 Agent 仍然可见。本插件目前**只靠 persona 约束**主代理不去使用它们。
> 如果你需要硬隔离（把这些全局工具从该 preset 的 Agent 里隐藏），需要额外的 Agent 级
> `ctx.tools.restrict()` 插件；注意在 preset 作用域调用 `restrict()` 会连同 preset 自己注册的
> 工具一起藏掉，所以这类 gate 必须按 Agent 作用域实现。

系统提示词（`complete: true`，只有这一段）把主代理定义成调度器：判断是否实际工作、写
自包含任务说明、一次只派一件事、等完成通知、汇报结果、区分"子代理报告完成"与"已验证"、
失败时给出阶段与原因。纯寒暄或对结果的简短追问可以直接回答，其余一律委派。另外挂了
compaction 组，长会话会压缩，不会因为不断累积的子代理结果撑爆上下文。

Claude Code 是**一次性外部子代理**：看不到会话历史、不接受追加消息、结束后不能恢复。
所以任务说明必须自包含；本插件的 persona 已经要求主代理这样写。

## 它怎么接进去

`cordis.patch.yml` 插入两行：

1. **Host 行 `subagent-claude-code-delegate`**：一个专用 Claude Code provider 实例
   （`providerName: claude-code-delegate`，默认 `permissionMode: auto`）。它**不注册任何全局
   工具**，所以其它模式里由官方 bundle 提供的全局 `subagent_claude_code` 完全不受影响。
2. **Preset 行 `preset-claude-code`**：声明 preset `claude-code`。preset 内的
   `subagent_claude_code` 与全局工具同名，按 Agent 作用域规则遮蔽全局工具，从而落到专用
   provider 上。

## 配置

在本机 profile 的 `cordis.patch.yml` 里按行 id 覆盖即可，不需要改本插件的文件：

```yaml
- id: subagent-claude-code-delegate
  name: '@deepseek-ai/dsh-subagent-claude-code'
  config:
    providerName: claude-code-delegate   # 改了必须同步下面 preset 里的 provider
    permissionMode: auto                 # dontAsk | acceptEdits | auto | plan | bypassPermissions
    # model: '<claude-model-id>'         # 固定 Claude Code 使用的模型，省略则用 Claude 原生设置
```

| permissionMode | 行为 |
|---|---|
| `dontAsk` | 不弹提示，未在 Claude 设置里预授权的操作直接拒绝（最保守） |
| `acceptEdits` | 自动接受文件编辑，其余权限请求拒绝（能改文件，基本跑不了命令） |
| `auto` | 由 Claude Code 原生分类器逐项裁决。**不是沙箱**：仍可能读写文件、执行命令，危险操作是否被拒取决于策略与版本（默认） |
| `plan` | 原生规划模式：只出计划，不执行 |
| `bypassPermissions` | 跳过所有权限检查；风险最高，不建议日常使用 |

修改后重新应用配置层（重启应用，或 profile 启用了 HMR 时的热重载）即可；preset 的改动只影响
之后新建的会话。

## 装完怎么验证

按顺序检查三层，任意一层不对就停在那层：

1. **行激活**：`plugin_manager` → `list_plugins`，确认 `subagent-claude-code-delegate` 与
   `preset-claude-code` 都是 `enabled: true`、`fiberPhase: active`。
2. **preset 已注册**：`cordis_inspect_query` → `Config.listConfigs`（name 过滤
   `@deepseek-ai/dsh-agent-preset`），应能看到 `preset-claude-code`。
3. **真实委派**：新建会话选「Claude Code 代理」，先派一个无害任务（例如在临时文件里写一行再读回来），
   确认 `subagent_claude_code` 工具存在、子代理返回结果并被汇报。

常见故障：

| 现象 | 可能原因 | 处理 |
|---|---|---|
| 模式列表里没有「Claude Code 代理」 | 插件未启用 / preset 行挂载失败 | 回到第 1、2 步看诊断 |
| 有模式，但主代理说没有 `subagent_claude_code` 工具 | provider 包解析不到或 Host 行未激活 | `list_plugins` 看 `subagent-claude-code-delegate` |
| 委派立刻失败，诊断指向 query-start | Claude Code 未登录 / SDK 载荷缺失 / 平台不支持 | 先在终端跑一次 `claude` 确认可登录 |
| 子代理能读不能写、跑不了命令 | `permissionMode` 过于保守（`dontAsk` / `acceptEdits`） | 改成 `auto`，或接受其限制 |

## 卸载

```bash
dsh plugin --profile <profile> remove dsh-claude-code-delegate
```

或 `plugin_manager` 的 `remove_bundle`。

## 兼容性

`engines.dsh` 见 `package.json`（`>=0.2.1 <0.3.0-0`）。依赖 Harness 的 Agent preset、
`dsh-tool-subagent` 与 `dsh-subagent-claude-code` 接口；官方包版本变化后建议先派一个无害任务
验证一次。

## 开发

```bash
npm test        # 无依赖的静态 smoke test：patch/package/locale/文件清单一致性
npm pack --dry-run
```

## 许可证

MIT
