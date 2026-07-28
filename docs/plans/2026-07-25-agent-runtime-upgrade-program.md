# 多代理运行时能力升级计划

日期：2026-07-25
状态：已完成；相关运行时切片随 `6c3e651a3` 合并至
`codex/minimal-workspace-ui`
负责人分支：`codex/agent-runtime-upgrades`
隔离工作树：Void 主仓库旁的独立 agent-runtime worktree

本文件保留为实施计划证据，不再作为当前工作队列。最终能力和合并状态见
[BitFun capability upgrade results](../qa/bitfun-capability-upgrade-results-2026-07-26.md)。

## 1. 基线、目标与本轮边界

### 1.1 固定基线

| 仓库 | 路径 | 分支 | 对照 SHA |
| --- | --- | --- | --- |
| Void | 主工作树 | `codex/minimal-workspace-ui` | `18f8f1d4f15f353116496414330ae2dc805299e1` |
| Void 隔离工作树 | agent-runtime worktree | `codex/agent-runtime-upgrades` | 从上述 Void SHA 创建 |
| BitFun | 本地只读上游镜像 | `main` | `21c0382d418424514f9a4db7ad3d232da6956886` |

本计划与第一批 Web UI 工作共享 Void 基线 `18f8f1d4`，但不合并、修改或依赖对方未提交的 UI 工作。后续每个运行时切片都从本隔离分支独立提交。

### 1.2 总目标

在不破坏现有 Flow Chat、BTW、子代理投影、Review Team、Goals、Multitask、Automation、媒体与短剧能力的前提下，按以下顺序升级运行时：

1. 按需工具加载；
2. 子代理任务持久化；
3. 上下文压缩后的可恢复继续执行；
4. BTW 子会话持久化与水合；
5. Agent 工具组与 Skill 组。

### 1.3 本轮允许与禁止

Phase 1 已完成。当前执行阶段允许按 A -> B -> C -> D -> E 的独立切片边界
修改代码、测试和实施证据；依赖、生成文件和 Web UI 仍不在切片 A 范围。

后续实施的长期边界：

- 依赖方向保持 `UI / Route -> Module Interface -> Adapter / Service -> External System`。
- DTO、状态枚举和 trait 放在稳定 Interface 层；具体注册表、持久化、进程级协调留在 `void-core`。
- `void-runtime-ports` 只承载 DTO/trait，不承载具体运行时。
- `void-agent-tools` 承载可移植的工具契约、清单与策略，不接管具体产品运行时。
- `void-tool-packs` 继续承载 provider group 组装计划，不成为会话状态存储。
- 不为追随 BitFun 的物理目录而新建 `void-agent-runtime` crate。
- 不将数据库、文件系统、Tauri、进程命令或 provider transport 下沉到页面和展示组件。

明确禁止在本分支承载运行时业务逻辑的文件：

- `src/web-ui/src/components/chat/ChatInput.tsx`
- `src/web-ui/src/stores/FlowChatStore.ts`
- `src/web-ui/src/components/content/ContentCanvas.tsx`
- `src/web-ui/src/components/short-drama/ShortDramaCenterPanel.tsx`
- 其他页面、视觉组件和 Web UI 布局文件
- 生成文件及其非生成器所有者

## 2. 对照方法与总体结论

对照采用：

- Void 当前架构文档、模块接口、运行时、持久化、会话与测试的只读检查；
- BitFun 固定 SHA、相关历史提交及当前实现的只读检查；
- 结构图查询用于确认 `GetToolSpecTool -> Tool trait -> product runtime` 等影响路径；
- 不以 BitFun 的目录形态作为目标架构，只提取状态模型、幂等语义和恢复规则。

总体结论：

| 能力 | Void 当前基础 | 主要缺口 | BitFun 可借鉴部分 |
| --- | --- | --- | --- |
| A 按需工具 | Expanded/Collapsed、manifest、`GetToolSpec`、权限门禁 | 目标 schema 仍以 stub 进入上下文；缺少通用延迟调用网关和 catalog 代际 | `CallDeferredTool`、消息派生 loaded state、catalog generation |
| B 子代理任务持久化 | 隐藏子会话、关系、投影、队列、取消和超时 | 协调任务状态只在内存；重启后无任务级恢复与单次交付保证 | owner token、事务式 claim、旧进程任务中断、单获胜者交付 |
| C 压缩后续跑 | 自动/手动压缩、结构化摘要、最新用户意图与 todo | 自动压缩后没有显式恢复状态、阻塞原因和防重复工具调用规则 | 自动压缩使用单条 user 恢复边界与继续提醒 |
| D BTW 持久化 | typed relationship、hidden BTW turn、会话关系构建 | Web 路径将 BTW 视为 transient 并跳过独立持久化；缺少 canonical hydration 状态 | durable typed child、父锚点、恢复分组、默认关闭记忆 |
| E 工具/Skill 分组 | flat agent tools、Skill group、固定 Skill policy、tool provider group scaffold | 缺少统一、版本化、可诊断的 Agent capability profile | 版本化用户分组配置和运行时 group descriptors |

## 3. 跨模块目标数据流

```text
Web UI / Route
  -> Runtime Interface DTO + command/query
  -> void-core coordinator / resolver
  -> agent-tools manifest | session manager | persistence adapter
  -> project storage / provider / external tool
  -> typed event + explicit state DTO
  -> Web UI projection
```

约束：

- UI 只渲染显式状态，不从空数组、原始错误字符串或消息形态推断 support、source、hydration 或 failure。
- 持久化先写 canonical record，再发布投影事件；投影不是事实源。
- 任何恢复都必须携带 schema version、原因和诊断；不得静默降级。
- 权限确认、用户取消和已完成工具调用是恢复过程的硬边界。

## 4. 切片 A：按需工具加载

### 4.1 Void 与 BitFun 差异

Void 已有：

- `ToolExposure::{Expanded, Collapsed}`；
- 稳定 manifest、collapsed stub definition、allowed-list 和执行门禁；
- `GetToolSpec` 工具及从历史消息推导已加载工具；
- product runtime、registry 与覆盖顺序测试。

当前问题是 collapsed 工具仍以 stub schema 占用模型上下文，且模型取得完整 schema 后仍直接以目标工具名调用。动态/MCP 工具也缺少统一的延迟调用协议和 catalog 变更失效机制。

BitFun 参考提交：

- `c56456f7ff08701dafc5a100da683fc614953e01`：内建工具迁移到 deferred execution；
- `0e89723fe00f63b278b55c9490ee9840d12c3f94`：MCP 动态工具 deferred；
- `523bc4cf19a60132f209e06f72ee609910f7a34a`：deferred loading 开关；
- `5bad25e6da1020010496e5f1b2f21136a34857b4`：权限与工具身份强化。

### 4.2 目标接口与状态

在 `void-agent-tools` 定义可移植协议，在 `void-core` 的 product runtime 实现解析和执行：

```text
ToolLoadState
  NotLoaded
  Loading
  Loaded { catalogGeneration }
  Failed { code, message, retryable }
  Unsupported { reason }
  Denied { reason }
```

新增稳定概念：

- `DeferredToolCatalog { generation, entries }`
- `DeferredToolSpecResult { toolName, definition, catalogGeneration }`
- `DeferredToolCallRequest { toolName, arguments, catalogGeneration }`
- `DeferredToolCallResult { invocationId, targetIdentity, outcome }`

模型可见工具定义只包含：

- 当前 expanded/direct 工具；
- `GetToolSpec`；
- `CallDeferredTool`。

延迟目标的完整 schema 不进入初始上下文。`GetToolSpec` 成功结果与 `catalogGeneration` 一起进入消息；loaded state 继续由持久消息派生，不创建第二套不可恢复的内存真相。

### 4.3 执行流

1. registry 生成有序 catalog 和 generation；
2. manifest 根据 agent policy、allowed-list、provider 可用性和 exposure 解析 direct/deferred；
3. 模型调用 `GetToolSpec`；
4. runtime 验证工具仍存在、允许且 generation 当前；
5. 模型通过 `CallDeferredTool` 提交目标名和参数；
6. gateway 以目标工具真实身份重新执行权限、确认、支持性和参数校验；
7. 工具结果记录 gateway invocation 与 target invocation，供压缩恢复去重。

`CallDeferredTool` 不能绕过目标工具原有权限；provider/MCP/ACP、媒体、短剧工具继续经过原策略。

### 4.4 实施步骤

1. 在 `void-agent-tools` 增加 deferred DTO、catalog 和 gateway contract；
2. 在 core registry 生成稳定 generation；
3. 在 product runtime 注册 `CallDeferredTool` 并复用现有 manifest/allowed-list；
4. 将 collapsed definition 从 stub 改为 catalog-only；
5. 接入动态/MCP catalog 更新与旧 generation 失效；
6. 以运行时配置分阶段启用，默认工具集合和顺序不回退。

### 4.5 验收与测试

- 初始工具 schema 数量和 token/字节数显著下降，并记录固定夹具前后数据；
- 未加载目标不能直接执行；
- gateway 不改变权限、确认和审计身份；
- catalog 更新后旧 spec 明确失效并可重新加载；
- 压缩、会话恢复后 loaded state 可重建；
- 动态/MCP 工具增删不产生幽灵工具；
- 现有工具顺序、默认工具、媒体、短剧、Computer Use、WebDriver、ACP 回归通过。

### 4.6 实施状态（2026-07-25）

状态：实现完成，聚焦验证通过，等待父协调器复核并创建独立提交。

- 初始 manifest 已省略 deferred target schema，并固定暴露唯一双 gateway；
- generation 已改为 registry snapshot 的确定性指纹，恢复时旧 generation 失效；
- pipeline 已区分 wire/effective identity，全部安全门禁与 runtime hooks 使用
  effective target，ToolResult 保持 gateway wire identity；
- MCP wrapper 已纳入 deferred exposure；
- 结果见
  `docs/results/2026-07-25-agent-runtime-upgrade-result.md`；
- 上游迁移决策见
  `docs/decisions/2026-07-25-bitfun-runtime-migration-ledger.md`。

## 5. 切片 B：子代理任务持久化

### 5.1 Void 与 BitFun 差异

Void 已持久化隐藏子会话和 parent relationship，也能恢复子代理投影；但 `coordination/state_manager.rs`、scheduler queue 和 active execution 主要是进程内状态。会话存在不等于任务协调记录存在，重启后缺少 objective、last progress、owner、delivery 和终态来源。

BitFun 参考提交：

- `0996621044411656f1d429e523aa5d0f4a31734d`：SQLite coordination store；
- `b47c01edf4f0d4ef34a99d0b72ffada709726cb4`：显式 wait result。

借鉴 owner token、single-winner claim、旧进程 running 转 interrupted、父子 turn/tool-call 锚点；不直接复制其 SQLite schema，也不把“已持久化 session”误判成“已持久化 task”。

### 5.2 目标接口与状态

`void-runtime-ports` 增加 DTO 与 store trait：

```text
SubagentTaskStatus
  Pending -> Running
  Running -> Completed | Failed | Cancelled | Blocked
  Pending -> Cancelled
  Blocked -> Pending | Cancelled
```

`SubagentTaskRecord` 至少包含：

- `schemaVersion`
- `taskId`
- `parentSessionId` / `childSessionId`
- `role` / `objective`
- `status`
- `createdAt` / `updatedAt`
- `lastProgress`
- `resultSummary` / `errorDetail`
- `provenance`
- `parentDialogTurnId` / `parentToolCallId`
- `executionOwner` / `attempt`
- `deliveryState` / `deliveredAt`

store trait 提供：

- create-if-absent；
- compare-and-set 状态迁移；
- claim execution；
- append progress；
- complete/fail/cancel/block；
- claim delivery；
- query by parent/child/status。

### 5.3 持久化决策

第一切片采用项目作用域、版本化 JSON ledger，由 core adapter 实现，并复用现有 project persistence 的锁、原子替换和损坏诊断方式：

```text
~/.void/projects/<project>/sessions/runtime/subagent-tasks.v1.json
```

最终路径必须由 `PathManager` 提供，不在调用方拼接。选择 JSON 的原因是当前 session persistence 以项目 JSON 为主，可避免在首个切片引入 SQLite 依赖和锁文件变更。

若后续压测证明多进程竞争或记录量超过可接受阈值，再单独 ADR 评估 SQLite；不得在未测量前迁移整个 session persistence。

### 5.4 恢复规则

- 新进程启动生成新的 `executionOwner`；
- 属于旧 owner 的 `Running` 记录转换为 `Blocked`，原因 `interrupted_by_restart`；
- 不自动重新发起子代理，避免重复外部副作用；
- coordinator 可依据显式 retry command 将 `Blocked -> Pending` 并增加 attempt；
- delivery claim 只能有一个获胜者；
- child session 投影从 canonical task + session relationship 合成，但 task store 为任务状态事实源。

### 5.5 验收与测试

- 创建、进度、完成、失败、取消、阻塞均可跨重启恢复；
- 并发 claim 只有一个执行 owner 和一个 delivery winner；
- 旧 running 不会静默重复执行；
- malformed/未知版本明确报错并保留原文件；
- parent 删除、fork、child 缺失都有确定策略和诊断；
- Review Team、Multitask、Goals、subagent projection 与取消/超时行为回归；
- Automation 不因 task ledger 被错误恢复或重复投递。

## 6. 切片 C：上下文压缩后的可恢复继续执行

### 6.1 Void 与 BitFun 差异

Void 的 `ContextCompressor` 已区分 Auto/Manual，并保留最新用户请求、todo 和结构化摘要；但两种模式都形成 user boundary + assistant summary。自动压缩后缺少明确的“恢复并继续”输入，也没有可观察的 resume state、pending permission checkpoint 和 completed tool 去重规则。

BitFun 参考提交：

- `fb325ae62af1c4e79d120ffa8289aa2f800bcacf`：自动压缩后恢复任务。

借鉴其“Auto 生成一条 user CompressionSummary 并附继续提醒；Manual 保持 user/assistant 边界”的语义。Void 需在此之上增加真正的状态与幂等协议。

### 6.2 目标状态

```text
CompressionResumeState
  Idle
  Compressing { compressionId }
  Restoring { schemaVersion }
  Resumable { reason, intentDigest }
  Blocked { blocker }
  Failed { diagnostic }
  Resumed { resumeTurnId }
```

`blocker` 明确分类：

- `PendingPermission`
- `PendingConfirmation`
- `UserCancelled`
- `MissingEvidence`
- `UnsupportedCheckpointVersion`

`ResumeCheckpoint` 包含：

- compression id/version/source；
- latest user intent 与 digest；
- pending tool calls（invocation id、状态、幂等键）；
- completed invocation ids/digests；
- 待确认事实，不保存或伪造批准；
- cancellation epoch；
- deferred tool catalog generation 和 loaded specs。

### 6.3 恢复规则

- 只对 Auto compression 自动继续；Manual compression 不擅自续跑；
- 已完成 invocation 永不重放；
- pending permission/confirmation 必须恢复为阻塞，不自动批准；
- 用户取消优先于 resumable；
- catalog generation 不一致时回到重新加载工具 spec，而不是调用旧 schema；
- checkpoint 无法验证时进入 `Failed` 或 `Blocked`，不得假装完成；
- 每次 resume 生成唯一 turn id，并以 compare-and-set 保证一次恢复。

### 6.4 验收与测试

- 自动压缩后模型收到明确的继续边界，未完成任务可继续；
- 手动压缩行为保持兼容；
- 完成工具不重复执行，pending 工具不丢失；
- 权限和确认不会被恢复流程越权；
- cancel-before-compress、cancel-during-compress、cancel-before-resume 均停止；
- session restore 后可从 checkpoint 继续或给出明确 blocker；
- Goals/todo、BTW/子代理 turn 和 transcript reference 不丢失。

## 7. 切片 D：BTW 子会话持久化与水合

### 7.1 Void 与 BitFun 差异

Void 已有 `SessionRelationshipKind::Btw`、父会话关系字段和 hidden BTW turn；但 Web 侧 `BtwThreadService` 将其标记为 transient，持久化模块跳过 transient session，创建关系时也没有完整 parent dialog turn/index。现有结构允许表达 BTW，不代表当前路径会持久保存和恢复它。

BitFun 参考提交：

- `4714e0c243b5d4fd1fd435750da5ead433b24d86`：持久化 side thread 和 opt-in memory；
- `8a3a57b0d029a745b9211cf6e7755986f86aecc4`：稳定 side question lifecycle；
- `1dd649103fc817a2f75ad571383fc173d7aa28f6`：继承父模型与模式。

借鉴 durable standard child session、typed parent anchor、恢复分组和默认关闭记忆；不复制其大范围 UI/hotspot 修改。

### 7.2 目标接口与状态

```text
BtwSessionState
  Creating | Running | Completed | Failed | Cancelled | Orphaned

BtwHydrationState
  NotLoaded | Loading | Ready | Partial | Failed
```

`BtwSessionProjection` 包含：

- `schemaVersion`
- `childSessionId`
- `parentSessionId`
- `parentDialogTurnId`
- `parentTurnIndex`
- `requestId`
- `state`
- `hydrationState`
- `source`
- `diagnostic`

后台 start command 接收完整父锚点和幂等 `requestId`，返回 canonical projection/turn id。查询接口支持按 parent 列出、按 child 水合和显式 retry hydration。

### 7.3 生命周期与迁移

- `(parentSessionId, requestId)` 唯一，防止双击、重连或恢复造成重复 child；
- child 必须只有一个 canonical parent binding；
- 新 BTW 使用 typed relationship 和持久 child session；
- 旧 transient BTW 在当前进程中继续兼容，但不从空消息或原始字符串猜测关系；
- 仅对 typed metadata 或无歧义旧字段执行迁移；
- memory inclusion 默认关闭，必须由明确策略开启；
- parent 删除通过 SessionManager 的领域操作级联 child 与关系记录，UI 不直接删除文件；删除前测试保护其他 relationship kind；
- child 丢失或父锚点失效时返回 `Orphaned/Partial`，不隐藏问题。

### 7.4 验收与测试

- BTW 创建后重启可按父 turn 恢复和排序；
- 重复 request 不创建第二个 child；
- hydration 状态、source、failure 明确；
- parent/child 删除和孤儿修复可预测；
- legacy transient 会话不中断；
- Flow Chat restore、Review/Deep Review relationship、普通 ephemeral child 无回归；
- 不修改 `FlowChatStore.ts` 等 UI hotspot。

## 8. 切片 E：Agent 工具组与 Skill 组

### 8.1 Void 与 BitFun 差异

Void 的 agent 配置仍以 flat `default_tools`、added/removed tools、enabled/disabled user skills 为主；同时已有：

- office/meta/computer-use/gstack/short-drama Skill group；
- fixed mode Skill policy；
- `void-tool-packs` 的 core/feature provider group scaffold。

缺口不是“没有分组”，而是缺少把这些来源统一解析成版本化、可诊断、可供 UI 消费的 capability profile。

BitFun 参考提交：

- `5a089bf6a6bca04b7a2edc74f9a733e6eadfec61`：Agent grouped tool/skill configuration；
- `1c6481605c11e822dc26513bf67dbc120533699a`：Skill source/coverage；
- `d8818b03e24411d06e6f60e07e711ebbdf2a52ef`：Skill ownership 调整。

BitFun 的用户 group 多为 picker preference，其 product assembly 物理结构不适合作为 Void 的运行时权威。Void 只借鉴版本化配置和 group descriptor。

### 8.2 目标接口

```text
AgentCapabilityProfile
  schemaVersion
  agentId
  toolGroups
  skillGroups
  fixedSkills
  optionalSkills
  deniedTools
  permissionPolicy
  resolutionDiagnostics
  fallbackState
```

另提供：

- `CapabilityGroupDescriptor { key, labelKey, members, source, availability }`
- `CapabilityResolution { resolvedTools, resolvedSkills, provenance, diagnostics }`
- `FallbackState::{None, LegacyFlatConfig, MissingGroup, UnsupportedVersion}`

解析优先级：

1. denied tool 与 permission ceiling；
2. fixed Skill policy（不能被用户删除）；
3. group selection；
4. added/removed tool 与 optional Skill；
5. agent defaults；
6. legacy fallback，并产生显式 diagnostic。

工具 group descriptor 可由 `void-tool-packs` 提供；Skill group provider 保持现有 ownership；core resolver 组合二者，不让任一展示层成为权威。

### 8.3 迁移与验收

- flat profile 读取时转换为 `LegacyFlatConfig`，只在用户或系统明确变更时写入新版；
- 未知 group key 保留诊断，不静默丢配置；
- fixed Skill 始终获胜，denied tool 始终压过 group/default；
- resolved capability 集合参与 prompt/tool cache hash；
- Agent 默认工具、Review Team、媒体/短剧固定 Skill、Automation profile 回归；
- Web UI 仅消费 descriptors/profile 和提交 group keys，不自行解析权限或固定策略。

## 9. 实施顺序、依赖和提交边界

严格按 A -> B -> C -> D -> E 实施，每个切片一个可独立审查的提交：

| 顺序 | 切片 | 前置 | 独立交付物 |
| --- | --- | --- | --- |
| A | 按需工具加载 | 现有 manifest/GetToolSpec | deferred contracts、gateway、generation、测试 |
| B | 子代理任务持久化 | 现有 scheduler/session relationship | task store interface、JSON adapter、恢复测试 |
| C | 压缩后续跑 | A 的 invocation/catalog checkpoint；B 的持久状态模式可复用但不强耦合 | resume checkpoint/state machine、压缩测试 |
| D | BTW 持久化 | 现有 SessionManager；可复用 B 的幂等/owner 经验 | backend interface、durable child、hydration 测试 |
| E | Agent 分组 | A 可继续兼容 flat policy，无需等待 E | capability profile/resolver/migration 测试 |

每个提交必须：

- 只包含该切片的接口、adapter/runtime、测试和必要文档；
- 更新本计划的实施状态；
- 新增对应 result 文档；若发生架构选择，再新增 ADR/decision；
- 不夹带 UI 视觉改动、无关格式化或生成文件。

## 10. BitFun 迁移决策台账

| 来源 | 决策 | Void 处理 |
| --- | --- | --- |
| deferred `GetToolSpec + CallDeferredTool` | Adapt | 复用 Void manifest/registry/权限，重写 gateway contract |
| loaded spec 由消息派生 + catalog generation | Adopt/Adapt | 保持消息为可恢复事实，generation 由 Void registry 生成 |
| BitFun 全量工具迁移提交 | Reject direct copy | 不 cherry-pick 74 文件，不引入上游产品目录边界 |
| SQLite coordination store | Adapt semantics | 借 owner/claim/delivery；首切片用项目 JSON adapter |
| Auto compression 单 user 恢复边界 | Adopt | 保留 Manual 行为，增加 Void checkpoint/state machine |
| BTW durable typed child | Adapt | 在 SessionManager/backend 落地，UI 另行集成 |
| BitFun BTW UI 批量改动 | Reject | 不触碰 Web UI hotspot |
| versioned tool/skill group config | Adapt | 建立统一 capability profile 与 diagnostics |
| BitFun ProductAssemblyPlan/六层物理布局 | Reject | 遵循 Void 已批准的 crate ownership |
| 直接 cherry-pick 任一功能提交 | Reject | 所有变化按 Void 接口和测试重新实现 |

## 11. Web UI 集成接口

本分支只定义和提供稳定后端契约；第一批 Web UI 或后续 UI 分支按以下接口集成：

| 能力 | UI 查询/命令 | UI 必须渲染的显式状态 |
| --- | --- | --- |
| A | list deferred catalog、load spec、call deferred | loading/loaded/failed/unsupported/denied、generation |
| B | list tasks、retry blocked、cancel、wait | pending/running/completed/failed/cancelled/blocked、progress、provenance |
| C | get resume state、resume、cancel | compressing/restoring/resumable/blocked/failed/resumed、blocker |
| D | start/list/hydrate/retry BTW | session state、hydration state、source、diagnostic |
| E | get descriptors/profile、update selections | resolved/fallback/diagnostics、fixed/optional/denied |

事件命名建议：

- `agent.tool_catalog_changed`
- `agent.tool_load_state_changed`
- `agent.subagent_task_changed`
- `agent.compression_resume_changed`
- `agent.btw_session_changed`
- `agent.capability_profile_changed`

事件 payload 与 query DTO 使用同一版本化类型。UI 不根据消息是否为空、tool name 字符串、session kind 字符串或数组长度反推状态。

### 11.1 与 Web UI 分支的冲突控制

- 运行时分支先交付 Interface/DTO 和 backend query/command；
- UI 分支只在接口稳定后接入；
- 如必须调整共享 TypeScript contract，单独提交且先通知 UI 负责人；
- 不直接编辑对方正在修改的 layout、store、chat input、canvas 和 short-drama panel；
- 合并顺序为 runtime contracts -> runtime implementation -> UI adapter -> UI presentation。

## 12. 验证矩阵

每个切片先运行最小测试，再按风险扩大：

| 切片 | 定向测试 | 必要仓库门禁 |
| --- | --- | --- |
| A | agent-tools manifest/deferred、product runtime、permissions、MCP/ACP | `check:core-boundaries`、相关 Rust tests |
| B | task store、coordinator、scheduler、restart/concurrency | `cargo test --locked -p void-core` 的相关过滤与全包回归 |
| C | compressor、resume state、idempotency、permission/cancel | core 定向测试 + session lifecycle 回归 |
| D | session persistence、relationship、BTW backend、restore/delete | core 定向测试 + Web contract type check（仅接口变更时） |
| E | profile resolver、legacy migration、fixed policy、cache hash | agent/tool/skill 定向测试 + core boundaries |

每个切片至少执行：

```powershell
pnpm run check:repo-hygiene
pnpm run check:core-boundaries
cargo check --workspace
```

按改动范围追加：

```powershell
pnpm run type-check:web
pnpm run lint:web
pnpm --dir src/web-ui run test:run
cargo test --locked -p void-core
```

不得将当前审计已记录的 E2E、严格 TypeScript、Rust fmt/Clippy 或覆盖缺口静默描述为通过；结果文档必须区分本轮新增失败与既有基线。

## 13. 完成标准

程序级完成需要同时满足：

- 五个切片按顺序独立提交并可逐个回滚；
- 每个状态、错误、fallback 和 hydration source 都有版本化 DTO；
- 没有业务逻辑进入页面、入口文件或四个 orchestration hotspot；
- 没有绕过 Module Interface、权限或确认；
- 重启、压缩、重连和并发不会重复执行已完成外部副作用；
- legacy 会话和 flat agent 配置有明确迁移与诊断；
- protected capabilities 的定向回归已记录；
- 每个切片有测试证据和 result 文档；
- 所有与 BitFun 不同的架构选择已进入 decision/ADR，而非只存在于提交说明。

Phase 1 的完成标准仅为：本计划经过文档级检查，工作树除本文件外无其他新增改动，尚未开始任何运行时代码实现。
