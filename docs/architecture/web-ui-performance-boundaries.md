# Web UI 性能边界

本文定义 Web UI 可选功能的依赖与生命周期边界。详细背景见 [Web UI Performance Phase 1 设计](../superpowers/specs/2026-07-14-web-ui-performance-phase1-design.md)，实施步骤见 [Web UI Performance Phase 1 计划](../superpowers/plans/2026-07-14-web-ui-performance-phase1.md)。

## 依赖边界

- 应用 bootstrap（例如 `main.tsx`）不得静态导入 Monaco、终端、短剧中心等可选功能 runtime。可选 runtime 只能由所属 feature 在首次使用时加载。
- 空状态、标签栏和其他轻量入口不得导入完整 feature barrel。入口应直接引用轻量组件文件；重型面板应使用指向具体实现文件的动态导入。
- UI、route 和应用入口只负责组合与渲染。文件系统、Tauri、网络等外部系统访问必须经过所属 feature 的 adapter 或 service。
- 类型依赖必须使用 type-only import。只有实际需要 registry fallback 时，才允许动态加载对应 runtime。

推荐依赖方向：

```text
UI / Route -> Feature Interface -> Feature Adapter / Service -> External System
```

## 生命周期边界

已挂载但非活动的场景必须停止定时器、observer、stream 和媒体工作。重新激活时可以恢复；卸载或停止后，迟到的异步结果不得继续更新 UI。

## 构建 Gate

合并前必须检查生产构建 manifest、静态/动态 import 警告和 entry 预算。新增可选功能不得进入启动 entry；entry JS 或 CSS 增长时，必须先定位依赖路径并记录原因。预算阈值应由 CI gate 执行，不能只依赖人工观察。

## 验证命令

```powershell
pnpm --dir src/web-ui test:run src/app/performance/performanceImportBoundaries.test.ts src/app/components/panels/content-canvas/short-drama/ShortDramaMediaPreviewLayout.test.ts src/app/components/panels/content-canvas/short-drama/ShortDramaEpisodeNavigationState.test.ts
pnpm --dir src/web-ui test:run src/app/scenes/browser/browserUrlPolling.test.ts
pnpm --dir src/web-ui run type-check
pnpm --dir src/web-ui exec vite build --outDir D:\codex\void-source\.void\perf-phase1-after --emptyOutDir --manifest
```

构建后比较 `.void/perf-phase1-before/.vite/manifest.json` 与 `.void/perf-phase1-after/.vite/manifest.json`，检查 entry JS/CSS、总 JS、chunk 关系和 Vite 静态/动态 import 警告。
