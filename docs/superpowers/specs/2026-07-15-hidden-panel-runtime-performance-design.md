# 隐藏面板运行时性能优化设计

## 目标

在不影响短剧生成、FlowChat 流式响应、子代理任务、资产写入和会话恢复的前提下，让不可见的内容画布、媒体库和短剧中心停止展示型后台工作，降低桌面端空闲 CPU、磁盘扫描、预览解码和无效 React 更新。

## 设计选择

采用现有可见性链路：

```text
ContentCanvas.isSceneActive
  -> EditorArea / EditorGroup
  -> FlexiblePanel.isActive
  -> WorkspaceMediaGallery.isActive
  -> ShortDramaCenterPanel.isActive
```

`isActive` 只表示面板当前是否可见，不表示业务任务是否运行。隐藏时保留组件和业务状态，不卸载面板，也不引入新的全局 store、context 或 Tauri 调用。

未采用以下方案：

- 全局 `document.visibilityState`：无法区分窗口隐藏与应用内场景切换，会错误影响仍应继续的后台任务。
- 隐藏即卸载：虽然降载更激进，但会丢失局部选择、滚动和预览缓存，并在恢复时产生重建抖动。

## 模块边界

### ContentCanvas

- 场景隐藏时停止每 5 秒媒体可用性探测。
- 场景恢复时立即探测一次，再恢复周期探测。
- 同一可见周期不允许重叠探测；隐藏前发起的异步结果不得打开标签。
- 显式的“打开媒体库/短剧中心”事件继续有效。

### WorkspaceMediaGallery

- 新增默认值为 `true` 的 `isActive` 展示属性。
- 隐藏时停止媒体库扫描、回收站扫描、5 秒轮询、刷新事件重试和新预览解析。
- 恢复时立即刷新；隐藏期间累计的刷新 token 不丢失。
- 使用活动代次隔离异步结果：旧代次结果不能覆盖恢复后的新状态，旧扫描也不能阻塞新代次扫描。
- 隐藏时只暂停组件根节点内正在播放的 `video`/`audio`；恢复后不自动播放。
- 待生成项、筛选、选择、缓存和用户操作状态保持不变。

### ShortDramaCenterPanel

- 新增默认值为 `true` 的 `isActive` 展示属性。
- 隐藏时停止空项目的 2.5 秒机会式轮询、展示用工作区媒体扫描、滚动同步 RAF/监听和根节点内媒体播放。
- 恢复时立即刷新展示数据；旧异步结果不得写回。
- ToolRunBus、FlowChat 订阅、子代理绑定/启动、项目加载、runtime bridge、主 AI 上下文、生成任务和资产写入全部保持现有逻辑。

## 状态与竞态

每个展示模块维护本地活动代次。`isActive` 或工作区发生变化时递增代次；异步操作只在“仍挂载、仍激活、代次一致”时提交结果。轮询在同一代次内去重，但新的活动代次允许立即开始新请求，避免被隐藏前的慢请求卡住。

预览解析在隐藏时不启动。已经进入 `loading` 且因隐藏失效的记录恢复为可重试状态，避免恢复后永久停在 loading。

## 验证标准

- `ContentCanvas`：隐藏 15 秒不探测；恢复立即探测；隐藏前的晚到结果不打开标签。
- `WorkspaceMediaGallery`：隐藏时无扫描、回收站、轮询、重试和预览解析；恢复立即扫描；旧结果不覆盖；媒体只暂停不自动恢复。
- `ShortDramaCenterPanel`：隐藏时无空项目轮询、展示媒体扫描和滚动调度；业务订阅与 runtime bridge 不受 `isActive` 限制；媒体只暂停不自动恢复。
- `FlexiblePanel` 正确下传 `isActive`。
- 定向 Vitest、Web 类型检查、生产构建和性能预算 Gate 全部通过。
