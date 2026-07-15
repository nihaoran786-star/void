# 空闲单例生命周期性能设计

## 目标

消除 FlowChat 处理状态和工具执行服务在无工作时常驻的 60 秒定时器，并保证桌面事件监听在销毁、注册失败和异步竞态下都不会泄漏。现有 UI、Hook、Tauri 事件名、后端协议与工具结果归一化语义不变。

## 模块边界

```text
FlowChat 调用方 -> ProcessingStatusManager -> 状态通知/完成历史
React Hook      -> ToolExecutionService    -> Tauri event adapter（动态加载）
```

- `ProcessingStatusManager` 独占状态清理定时器；调用方只使用原 public API。
- `ToolExecutionService` 独占监听器生命周期和事件去重；Web runtime 不加载 Tauri event 模块。
- 不向 UI、store、短剧模块或后端增加生命周期判断。

## 状态机

### ProcessingStatusManager

```text
idle（0 状态、0 interval）
  --registerStatus--> active（>0 状态、1 interval）
  --删除部分状态--> active
  --最后状态被立即/延迟删除、clear、cleanup--> idle
```

模块导入不启动 interval。HMR dispose 仅停止现有 interval。最短展示时间、监听通知以及最近 10 条完成历史保持原语义。

### ToolExecutionService

```text
created -> Web: ready（0 Tauri import/listener）
created -> Tauri: registering(generation N) -> ready（4 listeners）
registering/ready --destroy--> destroyed（generation N+1、0 listeners）
registering --failure/stale generation--> local rollback
```

每次注册使用局部 `UnlistenFn[]`。只有当前代次可接管监听器；失败或销毁后晚到的监听器立即局部回滚。回调也校验代次，不能写入已销毁实例。`destroy()` 幂等，旧引用不能清空新 singleton。

事件去重不再依赖 interval：每次插入后按 `Set` 插入顺序删除最旧 key，始终保留最近 1000 条。

## 验证标准

- 模块导入和 Web runtime 空闲时没有 interval，也不加载 Tauri event。
- 首个处理状态启动一个 interval；所有删除路径移除最后状态时停止。
- Tauri 正常注册 4 个监听器，正常销毁、部分失败和异步销毁均逐个且仅释放一次。
- 销毁后的排队回调不改变状态；FIFO 第 1001 条只淘汰最旧 key。
- HMR 只销毁已有实例，不创建 singleton。
