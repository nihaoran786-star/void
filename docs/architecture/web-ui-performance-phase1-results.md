# Web UI 性能第一阶段结果

本文记录 `codex/performance-phase1` 最终工作树的可复现实测结果。依赖与生命周期约束见 [Web UI 性能边界](web-ui-performance-boundaries.md)。

## 完成范围

- 浏览器场景非活动时停止 URL 轮询；URL 加载采用最后一次请求生效的 token，并串行化原生 WebView 显示/隐藏，阻止迟到的连接检查、创建、聚焦和 holder window 在失活或卸载后继续生效。
- Monaco runtime、worker 配置和基础 CSS 只在首次打开编辑器时加载。
- 编辑器、Git diff 与短剧中心从具体实现文件动态加载，不再通过重型 feature barrel 进入首屏。
- 共享组件总入口保留 `CodeEditor` 公共 API，但导出只依赖 React 的 lazy facade；普通按钮等基础控件不会连带加载编辑器 runtime。
- 修复主题初始化失败后的重试与主题变更通知生命周期，避免延迟加载带来行为回归。

## 生产构建对比

构建命令：

```powershell
pnpm --dir src/web-ui exec vite build --outDir D:\codex\void-source\.void\perf-phase1-after --emptyOutDir --manifest
```

对比 `.void/perf-phase1-before` 与 `.void/perf-phase1-after`：

| 指标 | 优化前 | 优化后 | 变化 |
| --- | ---: | ---: | ---: |
| 首屏 JS | 8,688,411 B | 4,509,649 B | -4,178,762 B（-48.10%） |
| 首屏 CSS | 1,377,704 B | 1,036,281 B | -341,423 B（-24.78%） |
| `assets/` JS | 14,151,319 B | 14,148,880 B | -2,439 B（-0.02%） |
| `assets/` CSS | 1,776,449 B | 1,833,439 B | +56,990 B（+3.21%） |
| 构建目录 | 77,589,605 B | 77,657,239 B | +67,634 B（+0.09%） |
| `assets/` JS 文件数 | 582 | 606 | +24 |
| `assets/` CSS 文件数 | 33 | 45 | +12 |

首屏内容检查：

- `MonacoEnvironment`：不存在。
- Monaco `editor.main.css` 独特选择器：不存在。
- `short-drama-center` 样式：不存在。
- `ShortDramaCenterPanel` 为独立动态入口，JS 约 166.11 kB，CSS 约 24.28 kB。
- 组件库 `CodeEditor` 公共 API 指向独立动态实现，不再静态进入首屏。
- Monaco runtime 与约 131.28 kB 的基础 CSS 位于非首屏 `MonacoInitManager` 依赖图。

全部 CSS 略增是代码分割带来的 chunk 边界开销；它不再全部进入首屏，但仍是后续去重与 CSS 分层的优化目标。

## 桌面空闲 CPU

2026-07-15 在 Windows 开发模式启动并稳定后，按进程创建时间过滤 PID 复用，连续采样 30.003 秒：

| 进程组 | 进程数 | CPU 时间增量 | 非归一化 CPU | 工作集 |
| --- | ---: | ---: | ---: | ---: |
| Vite + esbuild | 2 | 0.000 s | 0.000% | 227,545,088 B |
| `void-desktop` + WebView2 | 7 | 0.000 s | 0.000% | 706,605,056 B |

本地页面通过 `http://127.0.0.1:1422/` 返回 HTTP 200。用户先前现场观察的 Vite 进程约 150% CPU 可作为问题基线，但它不是同一时刻、同一采样脚本的严格对照，因此这里只做方向性比较。

本机 `localhost` 会解析到不可连接的 IPv6 回环地址；桌面验证使用项目已支持的环境变量启动，不修改默认项目配置：

```powershell
$env:TAURI_DEV_HOST = '127.0.0.1'
node scripts/dev.cjs desktop
```

## 验证结果

```powershell
pnpm --dir src/web-ui test:run src/app/performance/performanceImportBoundaries.test.ts src/app/scenes/browser/browserTaskGate.test.ts src/app/scenes/browser/browserUrlPolling.test.ts src/app/scenes/browser/browserUrlCheck.test.ts src/app/scenes/browser/browserWebviewLabels.test.ts src/app/components/panels/content-canvas/short-drama/ShortDramaMediaPreviewLayout.test.ts src/app/components/panels/content-canvas/short-drama/ShortDramaEpisodeNavigationState.test.ts src/infrastructure/theme/core/ThemeService.test.ts src/infrastructure/theme/presets/startupThemeBootstrap.test.ts src/tools/editor/services/MonacoRuntimeBootstrap.test.ts src/tools/editor/services/MonacoStartupWarmup.test.ts src/tools/editor/services/ThemeManager.test.ts
pnpm --dir src/web-ui run type-check
pnpm --dir src/web-ui exec eslint --no-warn-ignored src/app/components/panels/base/FlexiblePanel.tsx src/app/performance/performanceImportBoundaries.test.ts src/app/scenes/browser/BrowserScene.tsx src/app/scenes/browser/BrowserPanel.tsx src/app/scenes/browser/browserTaskGate.ts src/app/scenes/browser/browserTaskGate.test.ts src/component-library/components/CodeEditor/index.ts src/component-library/components/index.ts
```

- 聚焦测试：12 个文件，45/45 通过。
- TypeScript：通过。
- 定向 ESLint：通过。
- 生产构建：通过。
- 独立终审已批准：无 Critical、无未解决 Important。审查发现的公共 API、浏览器异步生命周期与懒加载翻译键问题均已修复并复验。

## 剩余风险

- 首屏 JS 仍为 4.51 MB，Vite 仍报告大于 500 kB 的 chunk；下一阶段应分析 Flow Chat、Tauri API 与通用组件入口的静态闭包。
- 构建仍有多组“同时静态和动态导入”警告，说明终端、API、事件总线等模块还有无效分包边界。
- 开发模式工作集仍较高；上述 CPU 结果不能替代 release 安装包的冷启动、交互延迟和内存基准。
- `BrowserScene` 与 `BrowserPanel` 仍重复编排现有 Tauri WebView 生命周期；本轮抽出了纯任务闸门并修复竞态，下一阶段应在保留行为测试后收敛为浏览器 feature adapter。
- `BrowserPanel` 的 holder window 仍使用单例固定 label；若未来允许多个面板实例并存，需要由统一 controller 负责引用计数与释放。
- `useEditorTheme` 当前没有调用方，且尚未显式处理 `themeManager.initialize()` 的拒绝 Promise；未来启用该 hook 前应补充错误收敛。
- 本轮自动测试覆盖隐藏轮询和模块边界；编辑器、Git diff、短剧中心的完整交互仍需桌面端人工走查。
