# TaskDetail 隐藏展示生命周期设计

## 目标

TaskDetail 面板保持挂载但不可见时，停止它的 FlowChatStore 展示订阅、延迟水合、
分批渲染、滚动监听、自动滚动和已用时间 interval。恢复可见时保留面板局部 UI 状态，
并从当前 FlowChatStore 重新读取最新任务与子代理投影。

子代理执行、超时控制、会话持久化和取消语义属于业务层，不能被展示活动状态暂停。
隐藏、恢复或卸载面板都不得调用 `agentAPI.cancelSession`；该调用只属于用户点击
“停止子代理”按钮的显式操作。

## 边界与信号流

```text
EditorGroup 已有活动标签状态
  -> FlexiblePanel.isActive
  -> TaskDetailPanel.isActive
  -> FlowChatPresentationActivityProvider
  -> SubagentProjectionView / ToolTimeoutIndicator
```

- `FlexiblePanel` 只透传已有 `isActive`，不读取 FlowChatStore，也不判断任务状态。
- `TaskDetailPanel` 是展示快照、分批渲染和滚动副作用的唯一生命周期边界。
- `FlowChatPresentationActivityProvider` 复用主 FlowChat 的展示语义，使嵌套
  `SubagentProjectionView` 释放其订阅、观察器和 RAF。
- `useSessionGoalModeActive(sessionId, enabled)` 仅在展示活动时订阅 Store；首次隐藏挂载时
  只做一次 O(1) session 查询以初始化正确的 Goal 模式超时默认值，随后冻结快照，恢复后
  读取当前值。若 Goal 模式在隐藏期间开启，超时控制在恢复时同步为禁用，不发出重复 API。
- `ToolTimeoutIndicator` 从展示 context 读取活动状态；`useLiveElapsedTime` 隐藏时不更新
  state、不保留 interval，恢复时立即按 `Date.now()` 重算。

## 状态与恢复

TaskDetail 保留最后一次可见的 `TaskDetailSnapshot`、分批渲染进度、滚动意图和停止按钮
局部状态。隐藏不会把快照重置为初始 tool item，也不会销毁整棵任务 UI。

活动周期开始后仍保留原有双 RAF 延迟水合，避免扫描大 Store 和渲染长转录阻塞面板
首帧。只有活动面板会创建这两个 RAF；第二帧才读取当时最新的 FlowChatStore、原子
更新快照并按运行状态建立订阅。若在任一帧前再次隐藏，清理函数会取消排队 RAF，
且不会建立订阅。Store 更新的合并 RAF、分批渲染 RAF 和自动滚动 RAF同样可取消。

隐藏期间 Store 可以继续推进任务。恢复后的水合直接读取当前结果，不重放隐藏期间的
中间 token，也不依赖隐藏前的旧 snapshot。

## 保留的业务行为

- 不修改 FlowChatManager、任务状态机、终端、BTW 或短剧模块。
- 不暂停子代理、工具、网络、持久化或超时 API。
- 不将空数组或展示活动状态解释为任务完成、取消或失败。
- `agentAPI.cancelSession` 仍只位于停止按钮回调中。
- 默认 `isActive=true`，保证现有非 FlexiblePanel 调用方保持原行为。

## 验证标准

- inactive 初始挂载没有 TaskDetail Store 订阅、hydration/渲染/滚动 RAF、wheel 监听或
  elapsed interval。
- active 后仅在双 RAF 水合完成时建立 TaskDetail 订阅并展示 Store 当前快照。
- active → inactive 会清理订阅、监听和排队 RAF，并保留最后快照。
- inactive 期间 Store 更新不唤醒面板；再次 active 并完成 RAF 后展示最新快照。
- `FlowChatPresentationActivityProvider` 的值能到达子代理投影和超时计时器。
- 隐藏、恢复和卸载不取消子代理；只有显式停止按钮会调用取消 API。
- 聚焦 Vitest、Web 类型检查、相关文件 ESLint 与 `git diff --check` 通过。
