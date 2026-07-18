# Web UI 性能边界

本文定义 Web UI 可选功能的依赖与生命周期边界。详细背景见 [Web UI Performance Phase 1 设计](../superpowers/specs/2026-07-14-web-ui-performance-phase1-design.md)，实施步骤见 [Web UI Performance Phase 1 计划](../superpowers/plans/2026-07-14-web-ui-performance-phase1.md)。

## 依赖边界

- 应用 bootstrap（例如 `main.tsx`）不得静态导入 Monaco、终端、短剧中心等可选功能 runtime。可选 runtime 只能由所属 feature 在首次使用时加载。
- 共享组件总入口不得静态导出依赖 Monaco 等大型 runtime 的实现。若必须保留公共 API，应导出只依赖轻量 runtime 的 lazy facade；明确消费者也可以通过专用路径按需导入。
- 空状态、标签栏和其他轻量入口不得导入完整 feature barrel。入口应直接引用轻量组件文件；重型面板应使用指向具体实现文件的动态导入。
- Monaco 主题同步属于编辑器集成，不是通用主题入口能力。编辑器只能从 `infrastructure/theme/integrations/MonacoThemeSync` 在首次启动时动态加载；`infrastructure/theme` 总入口不得重新导出该实例。
- UI、route 和应用入口只负责组合与渲染。文件系统、Tauri、网络等外部系统访问必须经过所属 feature 的 adapter 或 service。
- 类型依赖必须使用 type-only import。只有实际需要 registry fallback 时，才允许动态加载对应 runtime。

推荐依赖方向：

```text
UI / Route -> Feature Interface -> Feature Adapter / Service -> External System
```

### 已登记的遗留例外

`BrowserScene.tsx` 与 `BrowserPanel.tsx` 目前仍在 UI 内动态调用 Tauri window/webview/dpi/core，并重复编排原生 WebView 生命周期，不满足上面的目标依赖方向。第一阶段为控制回归范围，只把 URL 轮询和“最后一次任务生效”闸门隔离为可单测模块，并收紧现有异步生命周期；不得继续向这两个组件增加新的外部系统判断。下一阶段应先补齐行为测试，再提取统一的 browser feature controller/adapter。

## 生命周期边界

已挂载但非活动的场景必须停止定时器、observer、stream 和媒体工作。重新激活时可以恢复；卸载或停止后，迟到的异步结果不得继续更新 UI。

浏览器 WebView 的 URL 加载遵循“最后一次请求生效”：每次加载取得新 token，切换为非活动或卸载时立即使 token 失效；连接检查、创建、定位、显示和聚焦的每个异步边界都必须复核 token、活动状态和当前 handle。显示/隐藏切换必须串行化，迟到的 holder window 必须关闭，不能在卸载后遗留原生窗口。

### 工作区媒体预览边界

- 媒体卡片只有进入当前筛选作用域且进入视口 overscan 区域后，才允许读取本地预览；虚拟节点卸载或离开 overscan 后必须退出待处理集合。
- 图片和视频共用一个全局并发预算，当前上限为 2。筛选/工作区切换时，旧请求在完成前仍计入该预算，禁止通过重建 Hook 突破上限。
- 纯排序只改变调度优先级，不改变候选作用域；不得使同一文件的在途读取失效并重复读取。
- 已解析的 data URL 必须有界。当前只保留最近 48 项 ready 预览；失败和图片尺寸缓存必须使用包含媒体 ID、路径和修改时间的版本 key。
- 60 项及以下继续使用原 CSS 瀑布流；超过 60 项使用虚拟瀑布流。普通预览状态更新不得让虚拟器重新计算全部 item key。
- 不支持 `IntersectionObserver` 的 WebView 使用“当前已挂载虚拟节点”作为兼容可见窗口，不能永久固定为候选数组前 N 项。
- 文档隐藏时不得保留媒体扫描 timeout；重新可见时立即扫描并恢复 5 秒生成中 / 30 秒空闲节奏。
- 当前 `workspaceAPI.readFileContent` 不支持 `AbortSignal`。UI 负责拒绝迟到结果并将不可取消的遗留读取限制在最多 2 个；真正取消文件读取属于 adapter 能力扩展，不能在展示组件中伪造。

## 构建 Gate

合并前必须检查生产构建 manifest、静态/动态 import 警告和 entry 预算。新增可选功能不得进入启动 entry；entry JS 或 CSS 增长时，必须先定位依赖路径并记录原因。预算阈值应由 CI gate 执行，不能只依赖人工观察。

## 验证命令

```powershell
pnpm --dir src/web-ui test:run src/app/performance/performanceImportBoundaries.test.ts src/app/components/panels/content-canvas/short-drama/ShortDramaMediaPreviewLayout.test.ts src/app/components/panels/content-canvas/short-drama/ShortDramaEpisodeNavigationState.test.ts
pnpm --dir src/web-ui test:run src/app/scenes/browser/browserTaskGate.test.ts src/app/scenes/browser/browserUrlPolling.test.ts
pnpm --dir src/web-ui test:run src/app/components/panels/content-canvas/workspace-media/WorkspaceMediaGallery.test.tsx src/app/components/panels/content-canvas/workspace-media/useWorkspaceMediaPreviewQueue.test.tsx src/app/components/panels/content-canvas/workspace-media/WorkspaceMediaVirtualMasonry.test.tsx
pnpm --dir src/web-ui run type-check
pnpm --dir src/web-ui exec vite build --outDir D:\codex\void-source\.void\perf-phase1-after --emptyOutDir --manifest
```

构建后比较 `.void/perf-phase1-before/.vite/manifest.json` 与 `.void/perf-phase1-after/.vite/manifest.json`，检查 entry JS/CSS、总 JS、chunk 关系和 Vite 静态/动态 import 警告。
