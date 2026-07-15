# Deep Review 事件驱动容量队列设计

## 目标

移除 Deep Review 每个排队 reviewer 的固定轮询。等待者只在名额、控制状态或动态并发状态真正变化时唤醒，并为业务超时保留至多一个 deadline；供应商重试协议、队列事件结构和前端控制语义保持不变。

## 问题证据

- 本地 reviewer 容量等待和供应商容量重试在生产环境每秒 `sleep` 一次。
- 每个等待者每次醒来都会重复读取 active reviewer、控制状态和动态并发状态，并可能再次发送队列 IPC 事件。
- 用户暂停后仍然每秒唤醒；队列已经超时但仍有 active reviewer 时，会继续永久轮询。
- 等待者数量增加时，后台 wakeup、锁访问和 IPC 近似按等待者数量线性增长。

## 模块边界

```text
Task adapter（队列状态机 / deadline）
  -> Deep Review policy（唯一全局转换入口）
     -> budget tracker（每 turn 的 watch 通知与原子 admission）

既有 coordinator events -> UI（事件结构不变）
既有 provider executor  -> capacity reason（重试协议不变）
```

- `budget.rs` 拥有每个 parent dialog turn 的广播 epoch、active reviewer 计数和动态并发状态。
- `deep_review_policy.rs` 仍是 task adapter 访问全局 tracker 的唯一入口；控制写入完成后才广播。
- `task_adapter.rs` 只组合队列状态、业务 deadline 和原子 admission，不把通知当作 permit。
- 不修改 `task_tool.rs`、Agent API、事件 DTO、前端、供应商 adapter、短剧或媒体模块。

## 通知与 admission 模型

每个 turn budget 保存一个 `tokio::sync::watch` sender。所有等待者先订阅，再读取 active count、控制快照和动态并发快照，因此状态变化发生在“订阅”和“等待”之间时也不会丢失。

以下变化广播新的 epoch：

- active reviewer guard 释放：先递减 active count 和 batch count，释放 DashMap guard，再广播；
- Pause / Continue / Cancel / SkipOptional：先完整写入控制 tracker，再广播；
- capacity error、成功观测和用户 override：先更新动态并发状态，再广播。

`watch` 只表达“状态可能变化”，不分配名额。所有被唤醒的 waiter 必须重新读取状态，并继续通过现有 tracker 原子获取 reviewer guard；多个 waiter 同时醒来时仍只有符合容量限制的 waiter 能成功。

turn 的通知 channel 在 DashMap entry 内原子创建，避免并发订阅者拿到不同 sender。清理逻辑保留 active reviewer 或仍有 live receiver 的 turn；channel 异常关闭时 waiter 会重新订阅并重新读取状态。

## Deadline 模型

本地 reviewer 队列每次只等待以下 deadline 中最早的一个：

1. 尚未到期的 active queue wait 剩余时间；
2. 动态并发 `retry_after` 的剩余时间。

队列时间已经到期但仍有 active reviewer 时，不建立零时长 timer，而是等待真实状态信号；这样保留原有“active reviewer 结束后再次 admission”的语义，同时消除热循环。`retry_after` 到期仍会按一次 deadline 醒来，以便无需外部事件也能恢复 effective capacity。

供应商容量重试保留原有 bounded backoff deadline。只有 `ProviderConcurrencyLimit` 和 `TemporaryOverload` 可以因 active reviewer 数下降而提前探测；`RetryAfter` 和 `RateLimit` 即使收到 reviewer release 广播，也会重新读取后继续等待原 deadline，不会提前请求供应商。

Pause 状态不建立 queue 或 recovery timer，暂停时间不计入 active queue wait。Continue、Cancel 和 SkipOptional 通过控制广播立即唤醒。

## 事件与兼容性

- `DeepReviewQueueState` 字段和状态枚举不变。
- `queue_elapsed_ms` 变为状态转换、真实信号或 deadline 时的采样值，不再依赖每秒后台 IPC 心跳。
- Running、CapacitySkipped、取消、可选 reviewer 跳过和终态指标仍只在原有业务出口产生。
- 快速 Pause→Continue 可能在 waiter 实际观察 Pause 前被 watch 合并；这与旧轮询实现无法观察短于轮询周期的暂停相同，本轮不扩大控制状态模型。

## 安全不变量

- 通知发生在状态写入完成且 DashMap guard 释放之后。
- admission 仍由 budget tracker 原子判断，广播不会绕过 max parallel 或 launch batch 顺序。
- 不同 parent dialog turn 的 channel 完全隔离。
- 暂停期间 capacity deadline 到期不会自行启动 reviewer。
- 动态容量恢复、用户控制和 reviewer 释放都无需固定轮询即可推进队列。
- 不新增跨层 API、前端业务判断或供应商重试分支。

## 验证矩阵

- 同一 turn 多 waiter 都能收到广播，其他 turn 不被唤醒。
- active guard 释放后，waiter 看到的 active count 已经递减。
- live receiver 阻止 TTL 清理；receiver 释放后 stale turn 可清理。
- Cancel 能在远小于旧生产轮询周期的时间内唤醒本地队列。
- `retry_after` 到期可在没有外部事件时恢复 dynamic capacity。
- Pause 跨过 `retry_after` deadline 仍保持 parked，Continue 后才 admission。
- queue 已到期且 active reviewer 仍存在时保持 parked，控制信号可立即唤醒。
- 既有本地容量、launch batch、暂停、取消、optional skip、供应商 release early probe 和 RetryAfter 不提前探测测试全部通过。
- 静态检查中不存在 `DEEP_REVIEW_QUEUE_POLL_INTERVAL` 或对应生产 `sleep`。
