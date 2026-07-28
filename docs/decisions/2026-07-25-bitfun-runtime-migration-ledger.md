# Agent Runtime 上游迁移台账

日期：2026-07-25
适用分支：`codex/agent-runtime-upgrades`

集成状态：台账对应能力已随 `6c3e651a3` 合并至
`codex/minimal-workspace-ui`；本文件继续作为迁移取舍和来源追踪证据。

## 切片 A：按需工具加载

| BitFun 参考 | 决策 | Void 落地 |
| --- | --- | --- |
| `c56456f7ff08701dafc5a100da683fc614953e01` deferred gateway | Adapt | 重写为 Void `agent-tools` 契约与 core pipeline effective-target 执行，不复制物理目录 |
| 同提交 loaded spec state | Adapt | 保留 Void 消息事实源；用 `catalog_generation` 过滤恢复结果 |
| `0e89723fe00f63b278b55c9490ee9840d12c3f94` MCP deferred | Adapt | 只在 core MCP adapter 设置 exposure，`agent-tools` 不依赖 MCP |
| `5bad25e6da1020010496e5f1b2f21136a34857b4` identity/permission | Adopt semantics | wire identity 保持 gateway；allowed、restriction、validation、permission、取消和 hooks 使用 effective target |
| BitFun registry 进程代际计数 | Reject | Void 使用有序 snapshot 的确定性 FNV-1a 指纹，可跨重启重建 |
| BitFun crate/assembly 物理布局 | Reject | 保持 Void `agent-tools -> tool-packs plan -> core product runtime` 边界 |
| 直接 cherry-pick | Reject | 所有变化按 Void 接口与测试重新实现 |

## 切片 B：持久化与恢复

| BitFun 参考行为 | 决策 | Void 落地 |
| --- | --- | --- |
| 子任务跨重启保存 | Adapt | 复用 Void 会话存储，增加版本化任务、launch spec、checkpoint 与 recovery block |
| `delivering` 崩溃恢复 | Adapt | 租约过期后仅对幂等结果重新认领；持久化 attempt 与 receipt，拒绝不安全重投 |
| 压缩后续跑 | Adapt | 从验证过的 checkpoint 恢复原 child，不创建语义不明的新任务 |
| 任意上下文透传 | Reject | 恢复上下文采用严格字段白名单、体积预算和敏感值过滤，并在读取时再次校验 |

## 切片 C：运行时 Web 投影

| BitFun 参考行为 | 决策 | Void 落地 |
| --- | --- | --- |
| 子任务状态面板 | Adapt | 通过 typed Tauri/WS 事件和列表查询投影到既有 Flow Chat Task 展示 |
| UI 推断后台状态 | Reject | UI 只渲染明确的状态、错误和恢复阻塞码，不直接访问持久化或协调器 |

## 切片 D：长期记忆

| BitFun 参考行为 | 决策 | Void 落地 |
| --- | --- | --- |
| 会话记忆提取 | Adapt | 服务端 feature gate、授权后读取安全 transcript、严格限额并使用快速模型提取候选 |
| 自动写入记忆 | Reject | 候选必须经用户编辑/同意；合并与删除使用版本检查，删除需要确认 |
| BTW 可选记忆 | Adapt | 关系 sidecar 保存显式开关；未授权、跨工作区或关闭状态都拒绝提取 |

## 切片 E：BTW 持久化与 hydration

| BitFun 参考行为 | 决策 | Void 落地 |
| --- | --- | --- |
| 子会话重启后恢复 | Adapt | `EphemeralChild` 内部持久化但继续从普通会话列表隐藏，按 typed lineage 恢复同一 child ID 和 turns |
| 从展示文字重建引用 | Reject | 使用版本化 `ComposerPresentation` 恢复文本、文件、图片、媒体、Skill 和 session-reference |
| 自动恢复执行 | Reject | 重启只恢复 transcript 与展示状态；下一次显式发送时才恢复运行，避免无授权副作用 |

以上切片均按 Void Module Interface 和 Adapter 边界重新实现，没有复制
BitFun 整个客户端、页面或运行时文件。
