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

- 本机 Claude Code 已完成登录；它的原生 `settings.json` / `~/.claude.json` 是认证与
  其它原生设置的权威来源，本插件不会替你登录或改写这些文件。
- Node.js 22+（pnpm 安装依赖时使用）。

`@deepseek-ai/dsh-subagent-claude-code`（Claude Code SDK 载荷与进程外运行能力）已经声明为
本包的依赖，`dsh plugin add` 会一并装好；本插件的 patch 自己注册专用 provider，所以**不需要**
额外启用那个 bundle。你若手动启用了它也不冲突：它注册的是全局 `claude-code` provider 与全局
工具，本插件用的是另一个名字的专用 provider。

## 这个模式里有什么

主代理只有三个工具：

| 工具 | 作用 |
|---|---|
| `subagent_claude_code` | 唯一的干活入口，指向本插件注册的专用 provider |
| `ask_user_question` | 需求有关键歧义时先问用户 |
| `working_directory` | 全局工具，用来切工作目录 |

系统提示词（`complete: true`，只有这一段）把主代理定义成调度器：判断是否实际工作、写
自包含任务说明、一次只派一件事、等完成通知、汇报结果、失败时给出阶段与原因。另外挂了
compaction 组，长会话会压缩，不会因为不断累积的子代理结果撑爆上下文。

Claude Code 是**一次性外部子代理**：看不到会话历史、不接受追加消息、结束后不能恢复。
所以任务说明必须自包含；本插件的 persona 已经要求主代理这样写。

## 它怎么接进去

`cordis.patch.yml` 插入两行：

1. **Host 行 `subagent-claude-code-delegate`**：一个专用 Claude Code provider 实例
   （`providerName: claude-code-delegate`，默认 `permissionMode: auto`）。它**不注册任何全局
   工具**，所以其它模式里的全局 `subagent_claude_code` 完全不受影响。
2. **Preset 行 `preset-claude-code`**：声明 preset `claude-code`。preset 内的
   `subagent_claude_code` 与全局工具同名，按 Agent 作用域规则遮蔽全局工具，从而落到专用
   provider 上。

## 配置

在本机 profile 的 `cordis.patch.yml` 里按行 id 覆盖即可，不需要改本插件的文件：

```yaml
- id: subagent-claude-code-delegate
  name: '@deepseek-ai/dsh-subagent-claude-code'
  config:
    providerName: claude-code-delegate
    permissionMode: auto          # dontAsk | acceptEdits | auto | plan | bypassPermissions
    # model: claude-sonnet-5[1M]  # 固定 Claude Code 使用的模型，省略则用 Claude 原生设置
```

| permissionMode | 行为 |
|---|---|
| `dontAsk` | 不弹提示，未在 Claude 设置里预授权的操作直接拒绝（最保守） |
| `acceptEdits` | 自动接受文件编辑，其余权限请求拒绝（能改文件，基本跑不了命令） |
| `auto` | 由 Claude Code 原生分类器逐项裁决，危险操作自动拒绝（默认） |
| `plan` | 原生规划模式：只出计划，不执行 |
| `bypassPermissions` | 跳过所有权限检查（最高风险） |

修改后重新应用配置层（重启应用或触发 HMR）即可；preset 的改动只影响之后新建的会话。

## 卸载

```bash
dsh plugin --profile <profile> remove dsh-claude-code-delegate
```

或 `plugin_manager` 的 `remove_bundle`。

## 兼容性

声明 `engines.dsh: >=0.2.1`。依赖 Harness 的 Agent preset、`dsh-tool-subagent` 与
`dsh-subagent-claude-code` 接口，这些在 0.2.x 线内保持稳定。

## 许可证

MIT
