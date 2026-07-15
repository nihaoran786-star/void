# 隐藏 Session 展示生命周期实施计划

**目标：** 隐藏 Session 保留业务执行和局部状态，同时释放主对话展示链的持续工作。

### 任务 1：传递展示活动状态

- [x] 从 `SessionScene` 经 `ChatPane` 传入 Modern FlowChat。
- [x] 使用展示专用 context 隔离活动语义，默认值保持现有调用兼容。
- [x] 保持 manager、legacy store、生成与发送/取消路径不受影响。

### 任务 2：暂停主转录展示工作

- [x] 隐藏时冻结 Modern selector，并在恢复时读取最新快照。
- [x] 隐藏时释放 legacy session 与状态机投影订阅，恢复时立即同步。
- [x] 暂停自动展示同步、标题监听、滚动/尺寸观察和 RAF。
- [x] 隐藏时关闭 Header 弹层并卸载 SessionFilesBadge 嵌套订阅。
- [x] 暂停子代理投影与 ProcessingIndicator 的展示型副作用。
- [x] 清理隐藏前排队的回调，避免迟到写入。

### 任务 3：回归验证

- [x] 覆盖 selector 活跃订阅、隐藏冻结和恢复最新。
- [x] 覆盖同步监听器 inactive/cleanup/resume。
- [x] 覆盖 legacy session/状态机双订阅 inactive/cleanup/resume。
- [x] 覆盖 SessionFilesBadge 隐藏卸载与恢复挂载。
- [x] 覆盖 ProcessingIndicator timeout/interval 清理。
- [x] 覆盖 follow-output RAF 清理。
- [x] 恢复既有历史会话、用户消息和虚拟列表测试 mock。
- [ ] 由主批次运行 Web 类型检查、生产构建与性能预算 Gate。

### 任务 4：后续嵌套运行时

- [ ] 独立处理 MCP iframe/bridge 生命周期。
- [ ] 独立处理 AuxPane/TaskDetailPanel 的观察器与订阅。
- [ ] 独立审计 ChatInput 和 tool card 的直接 store 订阅。
