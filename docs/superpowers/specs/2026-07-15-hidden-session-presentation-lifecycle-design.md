# 隐藏 Session 展示生命周期设计

## 目标

当 Session 场景仍挂载但不可见时，停止对话转录层的展示型订阅、观察器、
计时器和动画帧；恢复可见时直接读取最新状态。短剧生成、消息发送/取消、
子代理执行、会话持久化和历史加载等业务状态机必须持续运行。

## 边界与数据流

```text
SessionScene.isActive
  -> ChatPane.isPresentationActive
  -> ModernFlowChatContainer
  -> FlowChatPresentationActivityProvider
  -> presentation selectors / virtual list / projected subagents
```

- `FlowChatManager` 与 `FlowChatStore` 仍是业务事实来源，不受展示活动状态控制。
- `FlowChatPresentationActivityProvider` 只表达“当前这棵 UI 是否可见”，不得用于
  暂停生成、网络、持久化、队列、草稿或工具执行。
- Modern 投影 store 允许在隐藏期间暂时不向该 UI 发布；展示 selector 保存最后
  一份可见快照并取消订阅，恢复后一次性读取当前最新快照，不重放中间 token。
- 页面组件只下传活动状态，不推断会话来源或业务状态。

## 隐藏时暂停的工作

- legacy-to-modern 自动展示同步和标题展示监听器；恢复时重新订阅并同步最新状态。
- VirtualMessageList 的 legacy session 与状态机投影订阅；恢复时立即读取最新处理状态。
- VirtualMessageList 的 Resize/Mutation 观察器、滚动监听、布局测量、历史窗口交接、
  未读定位与跟随输出 RAF。
- 子代理投影视图的展示订阅、尺寸观察、滚动监听和自动滚动 RAF。
- 搜索定位、导航聚焦、快捷键、弹层镜像和 header pin 的展示副作用。
- Header 的弹层/document 监听与 `SessionFilesBadge` 嵌套订阅；恢复时重新挂载 badge。
- ProcessingIndicator 的延迟显示 timeout 与提示轮换 interval。

清理必须可取消：隐藏前排队的 RAF、异步聚焦和观察器回调不得在隐藏后继续写 UI。

## 保留行为

隐藏期间继续运行消息生成、发送、取消、子代理、ToolRunBus、文件/资产写入、会话
历史加载、草稿与队列。重新显示时保留组件局部状态，并以业务源中的最新结果刷新
转录内容；不通过卸载整个 ChatPane 换取性能。

## 后续隔离批次

本批只覆盖 Session 的主转录展示链。以下嵌套运行时必须在独立小批次中接入同一
活动语义，避免扩大当前改动的模块边界：

- MCP tool card 的 iframe、消息桥和嵌套 runtime；
- AuxPane/TaskDetailPanel 的 store、wheel/scroll 与 RAF；
- ChatInput 及个别 tool card 的直接 store 订阅。

后续实现仍须遵守同一原则：只暂停展示消费者，不能暂停业务生产者。

## 验证标准

- 活跃 selector 随 store 更新；隐藏后无订阅且快照冻结；恢复立即显示最新快照。
- `useFlowChatSync(false)` 不创建监听，活动切换时正确清理并在恢复后重建。
- Session 状态投影隐藏时同时释放 legacy store 与状态机监听，恢复读取最新状态。
- Header 隐藏时卸载 SessionFilesBadge，恢复时重新渲染。
- 隐藏 ProcessingIndicator 后 timeout/interval 数量归零。
- 跟随输出在隐藏时取消已排队和连续 RAF，迟到回调不触发滚动。
- 既有历史会话、用户消息和虚拟列表边界测试继续通过。
