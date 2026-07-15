# 微信机器人空闲重试性能设计

## 目标

降低微信 iLink 长轮询在网络异常或认证过期后的空闲唤醒频率，同时保证桌面退出/断开能立即取消等待。配对持久化、启动时自动恢复、现有 UI 连接状态、消息解析与发送语义均保持不变。

## 问题证据

- `wait_for_pairing` 和 `run_message_loop` 在网络失败后固定每 5 秒重试，应用错误固定每 2 秒重试；长期离线时会持续唤醒 runtime 并重复记录日志。
- iLink 返回 `-14` 后，旧实现把会话标记为暂停，但 `get_updates_once` 仍每 2 秒睡眠后构造一次空响应；一小时暂停会产生约 1800 次无效唤醒。
- `post_ilink` 每次调用都新建 `reqwest::Client`，无法复用连接池与底层 TLS/HTTP 资源。
- 固定重试与认证暂停的 `sleep` 不监听停止信号，断开最多要等完整睡眠结束。

## 模块边界

```text
微信配对/消息循环 -> retry（纯重试与可取消等待）
                  -> WeixinBot HTTP adapter -> iLink / 微信 CDN
                  -> 既有 persistence / command router / UI transport（不改）
```

- `bot/retry.rs` 是私有模块，只拥有退避序列、绝对截止时间换算和 `watch` 停止信号等待。
- `weixin.rs` 继续拥有 iLink 协议、认证暂停记录、同步游标、配对和消息处理。
- 不修改 `remote_connect/mod.rs`，因此自动恢复、持久化和 UI `connected` 状态仍走原路径。

## 重试状态

```text
ready
  --网络/非认证应用错误--> 5s -> 10s -> 20s -> 40s -> 60s（封顶）
  --成功响应-----------> ready（重置为 5s）
  --认证 -14-----------> paused（一次睡到一小时 deadline）

retrying/paused --stop=true 或 sender closed--> stopped（立即打断）
```

两个 getupdates 循环各自持有 `RetryBackoff`，不会跨连接或跨循环共享失败计数。网络错误与非 `-14` 应用错误使用相同退避。成功的 `ret=0/errcode=0` 响应重置退避。

`-14` 仍由 `get_updates_once` 写入原有会话暂停表；外层循环读取剩余 `Duration`，只建立一个计时等待。到期后再请求，不再在暂停期构造空响应或每 2 秒唤醒。

## 取消与 HTTP 生命周期

- `sleep_or_stop` 在休眠前先检查 watch 当前值与 channel closed 状态，防止停止信号早于 future 建立时丢失。
- 等待使用绝对 deadline；无关的 `false` 更新不会缩短退避或暂停时间。
- 退避和一小时认证暂停都使用同一可取消等待；停止值或 sender 关闭都会结束循环。
- `WeixinBot` 构造时创建一个 `reqwest::Client`，iLink、入站 CDN 下载和出站 CDN 上传复用该客户端。
- 每个修改过的请求仍在 `RequestBuilder` 上设置明确超时：getupdates/API 使用调用方传入值，CDN 上传下载使用 120 秒。

## 不变量

- 不改变二维码登录的独立请求和会话管理。
- 不改变同步游标的读取、保存时机和消息去重行为。
- 不改变 `-14` 的一小时暂停长度。
- 不改变配对成功后的持久化、自动恢复或 UI 状态映射。
- 不改变消息解析、图片/文件传输、typing 与命令路由。

## 验证标准

- 退避序列为 5/10/20/40/60 秒，继续失败保持 60 秒，成功后重置。
- 已存在的停止值、等待中的停止更新和 channel 关闭都能立即结束等待；`false` 更新不结束等待。
- 认证暂停被换算为一个剩余时长，到期/过期边界正确。
- `get_updates_once` 不包含周期性暂停 sleep 或伪造空响应。
- `WeixinBot` 的修改请求复用同一个客户端并保留请求级 timeout。
- `cargo test -p void-core retry`、微信专项测试、格式检查和 `cargo check -p void-core` 通过。

## 剩余风险

- 二维码登录函数仍按一次 UI 操作创建短生命周期客户端；它不属于后台空闲轮询，本轮不扩展其生命周期边界。
- CDN 上传自身的三次、每次 1 秒重试仍不可由 bot stop 信号取消；该路径只在用户主动发送媒体时运行，不构成空闲 CPU 风险。
- 一小时暂停仍使用系统墙钟，与旧行为一致；系统时间大幅回拨会延长当次暂停。
