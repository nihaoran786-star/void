# Flow Chat 工具卡懒加载边界

Flow Chat 的启动路径只静态加载工具元数据、分类规则、懒加载注册表和通用占位卡。具体工具卡通过 `toolCardRegistry.tsx` 的模块级 `React.lazy` 实例按首次展示加载，避免工具卡及其 Markdown、终端、媒体、MCP、MiniApp 等依赖进入首屏静态闭包。

## 边界规则

- `toolCardMetadata.ts` 只维护显示名和确认策略；不依赖具体卡片。
- `toolCardClassification.ts` 是纯分类模块；store 和轮次渲染直接导入它。
- `toolCardRegistry.tsx` 是具体卡片的唯一装配层。共享实现必须共享同一个 lazy 实例，未知工具只记录一次警告并使用默认卡。
- `FlowToolCard.tsx` 在错误边界内部使用局部 `Suspense`，加载期间显示稳定的紧凑占位，不阻塞整段对话。
- `MediaGenerationToolGroupRenderer.tsx` 为媒体组合卡提供同样的局部加载与错误边界，失败不会替换整段对话或应用页面。
- 浏览器会缓存失败的模块 URL；因此普通渲染错误使用局部重试，而 JS chunk、动态模块和 CSS preload 错误明确要求重新加载应用，以重新获取最新入口与 manifest。
- `tool-cards/index.ts` 仅保留轻量兼容导出，禁止重新静态导出具体工具卡。

新增工具卡时，应同时补注册表映射、元数据和 import-boundary 测试，并将其加入 Web 性能 Gate 的动态入口与静态不可达断言。

## 2026-07-15 验证基线

- 主入口静态模块：836，未解析导入：0。
- 首屏 JavaScript：2,596,145 bytes raw / 767,721 bytes gzip。
- 首屏 CSS：703,657 bytes raw / 99,742 bytes gzip。
- 相比上一版受控预算，首屏 JavaScript raw 减少 386,986 bytes，gzip 减少 96,632 bytes；CSS raw 减少 140,492 bytes，gzip 减少 17,740 bytes。

`scripts/web-performance-budget.json` 用精确上限、26 个工具卡相关动态入口、静态不可达清单和工具卡独占 CSS selector 锁定该边界；后续改动不得通过放宽预算绕过回归。
