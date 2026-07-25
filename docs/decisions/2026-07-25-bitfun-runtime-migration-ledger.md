# Agent Runtime 上游迁移台账

日期：2026-07-25  
适用分支：`codex/agent-runtime-upgrades`

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

切片 B-E 的迁移决策在开始各切片时追加；本文件不预先宣称尚未完成的迁移。
