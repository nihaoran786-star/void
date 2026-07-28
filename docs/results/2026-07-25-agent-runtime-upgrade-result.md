# Agent Runtime 切片 A 实施结果

日期：2026-07-25
分支：`codex/agent-runtime-upgrades`
基线：`18f8f1d4f15f353116496414330ae2dc805299e1`

集成状态：本切片及后续运行时能力已随 `6c3e651a3` 合并至
`codex/minimal-workspace-ui`。以下内容保留为隔离分支实施证据。

## 结果

按需工具加载已形成完整运行时闭环：

- 初始 manifest 只包含 direct 工具、唯一 `GetToolSpec` 和唯一
  `CallDeferredTool`；deferred 目标 schema 不再以 stub 进入上下文。
- `GetToolSpec` 结果携带由有序 registry snapshot 确定性重建的
  `catalog_generation`。消息恢复只接受当前 generation，旧结果明确失效。
- `CallDeferredTool` 保持模型可见 wire identity；流水线内部以 effective
  target identity 和 target arguments 重走 allowed-list、runtime restriction、
  direct/deferred gate、输入校验、permission/confirmation、取消、超时、
  runtime hook、snapshot 和结果存储。
- 当前 resolved manifest 标记为 collapsed 的目标即使已经加载也禁止直接调用，
  只能经过 gateway；manifest 显式 Expanded/Collapsed override 均覆盖 registry
  默认 exposure。
- 动态 MCP wrapper 默认 deferred；registry 指纹包含动态 provider/MCP
  元数据、schema、readonly、exposure 与顺序。
- `void-tool-packs` 的 `core.agent` 清单、core materializer 和顺序测试均加入
  `CallDeferredTool`，未增加依赖。

## Manifest 对比

聚焦夹具 `Read + WebFetch + GetFileDiff + Git`：

| 项目 | 旧实现 | 新实现 |
| --- | ---: | ---: |
| direct schema | 1 | 1 |
| deferred stub schema | 3 | 0 |
| gateway schema | 1 | 2 |
| 初始 definitions 总数 | 5 | 3 |

deferred 目标数量继续增加时，新实现保持固定两个 gateway schema；旧实现则
每个目标增加一个 stub。测试同时序列化当前 definitions 与旧 stub，验证移除
stub 后的序列化输入严格减少。

## 验证证据

本次最终复核实际执行：

- `cargo test -p void-agent-tools --test tool_contracts`：85 项通过。
- `cargo check -p void-core`：通过。
- `cargo test -p void-core --lib manifest_ -- --nocapture`：31 项通过。
- `cargo test -p void-core --lib
  product_catalog_facade_exposes_view_image_as_collapsed_after_runtime_gates_pass
  -- --nocapture`：1 项通过。
- `cargo test -p void-core --lib deferred_gateway_ -- --nocapture`：2 项通过。
- `node scripts/check-core-boundaries.mjs`：通过。
- `git diff --check`：通过。
- `cargo fmt --all -- --check`：未通过；输出包含大量本切片之外的既有格式
  差异，本轮未做全仓格式化，也未据此宣称通过。

新增 pipeline 定向用例覆盖：

- effective target 执行与 wire result identity；
- stale generation 拒绝；
- target permission/confirmation 生效；
- direct deferred 调用拒绝；
- default Collapsed + manifest Expanded override 可直接调用；
- default Expanded + manifest Collapsed override 直调拒绝、gateway 成功；
- deterministic generation 与消息派生 stale invalidation。

## 未改变范围

- 未修改 Web UI 或四个 orchestration hotspot。
- 未改变 `ToolUseContext` 公共结构以承载 gateway identity。
- 未增加 crate、依赖或锁文件。
- 未改变媒体、短剧、Computer Use、ACP、Review Team、Goals、Multitask、
  Automation 的业务策略；它们继续通过既有 allowed-list、restriction 和
  concrete Tool runtime。

## 后续接口交接

Web UI 无需解析 deferred target 权限。后续若展示加载状态，只消费：

- `tool_name`
- `catalog_generation`
- `not_loaded | loaded | stale | denied | failed`

执行仍提交模型协议 `CallDeferredTool { tool_name, arguments,
catalog_generation }`，UI 不直接调用 concrete provider。
