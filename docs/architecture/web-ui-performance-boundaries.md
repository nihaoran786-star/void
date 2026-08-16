# Web UI 性能边界

本文定义 Web UI 可选功能的依赖与生命周期边界，是该主题唯一的当前规格。

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

### 可选弹窗边界

- `NewProjectDialog` 与 `RemoteConnectDialog` 的公共 barrel 只导出轻量 lazy facade；调用方无需知道实现是否拆包。
- facade 在 `isOpen === false` 时必须先返回 `null`，不能创建 `Suspense`、触发动态 import 或启动弹窗内部副作用。
- facade 只负责 `React.lazy`、`Suspense` 和 props 透传。目录选择、输入校验、连接探测、网络请求、免责声明状态与错误分类继续由原具体弹窗实现负责。
- `AppLayout` 是 workspace presentation 的唯一 Portal 根所有者。它通过 `applyWorkspacePresentationToPortalRoot(document.body, presentation)` 把互斥的 Minimal / Classic 类同步到 `body`，所有 body portal 从该祖先继承主题；导航、footer 和具体弹窗不得重复读取 presentation。通用 `overlayClassName` 仅保留为独立挂载/兼容接口，不再是应用内主题传播主链。
- Portal 样式使用 `.void-ui--minimal .surface` 祖先选择器，不要求每个 overlay 自身重复携带主题类。具体弹窗不得因样式模式分叉文件系统、网络或连接行为。
- 生产 manifest 必须把两个具体实现记录为 required dynamic entry；任一实现重新进入启动静态图都视为性能 Gate 失败。
- `AboutDialog`、`UpdateAvailableDialog` 与 `UpdateInstallProgressModal` 遵守相同边界。About 在关闭时不加载；每日更新 Gate 只保留检查定时器与 update store 订阅，提示/进度组件及其 CSS 仅在确实可见时动态加载。检查更新、下载、安装、重启和错误分类仍由原 controller/store 负责。
- 全局媒体预览保留 `MediaPreviewOverlay` 作为同步轻量事件壳：它只监听 `MEDIA_PREVIEW_EVENT`、维护递增 request sequence，并在首次打开/关闭/卸载时保存和恢复焦点。媒体 DOM、Tab 焦点循环、复制、i18n、图标、URL fallback、resolver 与 overlay SCSS 全部属于按需加载的 `MediaPreviewOverlayContent`。
- 内容 chunk 尚未完成时的新预览事件必须 latest-wins；关闭后迟到的 chunk 不得重新打开。每个 request sequence 重新挂载内容实例，旧媒体的异步 fallback 不能写入新预览。生产 manifest 必须把该内容实现记录为 required dynamic entry，且 `.media-preview-overlay` 不得进入启动 entry CSS。
- Slice 34 独立生产构建验证该拆分：7,456 modules / 50.99s；entry JS 从 2,337,223 降至 2,334,851 raw bytes（减少 2,372），entry CSS 从 633,862 降至 632,070 raw bytes（减少 1,792）；gzip 分别从 682,047 降至 681,279、从 89,626 降至 89,309。55 个 required dynamic entries 保持存在，`MediaPreviewOverlayContent` 拥有独立 JS/CSS chunk，unresolved static imports 为 0，overall `PASS`。gzip 相对参考值仍为 `+1,237` / `+791` 监控 `WARN`，不得写成 gzip 无回退。

### Portal 展示样式边界

- 组件基础 SCSS 只保留 Classic 结构、共享语义与不依赖 presentation 的可访问性样式。Minimal 的尺寸、密度、颜色、阴影和焦点投影必须放在同目录 `*.minimal.scss` mixin 中。
- `minimalWorkspacePresentation.scss` 是这些 mixin 的唯一应用入口。组件不得直接静态导入自己的 Minimal 文件，也不得读取 presentation store、URL 参数或 body class 来分叉业务行为。
- Branch selection、Quick Look、editor breadcrumb、两类 fullscreen diff、remote file browser 和 editor status popover 等 Portal/浮层仍使用原 Git API、workspace API、`sshApi`、Monaco/editor service 和回调接口；展示聚合层只组合 token mixin，不得静态导入组件实现或所属 runtime。
- 遗留 fullscreen 样式中的通用类名必须限定在各自 overlay 根节点下；Minimal 密度/颜色只进入同目录 `*.minimal.scss`。这既阻止 `.header-actions`、`.file-name` 等规则泄漏到其他模块，也避免为修复样式而在组件中增加 presentation 分支。
- 新增 Portal 投影后必须检查 production manifest。Minimal CSS 可以进入已有按需 presentation 资源，但不得让可选组件实现或重型 runtime 回流到启动静态图。
- Slice 10 独立生产构建已验证该边界：7,455 modules / 34.79s；entry JS 为 2,334,390 raw / 681,511 gzip bytes，entry CSS 为 627,314 raw / 88,766 gzip bytes。raw 值分别低于 2,337,259 与 633,915 的硬限制，54 个 required dynamic entries 保持存在，unresolved static imports 为 0，budget unit tests 34/34，overall `PASS`。gzip 相对参考值分别为 `+1,469` 与 `+248`，属于明确保留的监控 `WARN`，不得写成 gzip 无回退。
- 后续深色窄窗桌面 Gate 在同一 worker/window 内依次覆盖 1280x800 `void-light` 与 1024x720 `void-dark`。它只允许挂载真实组件、临时替换并恢复 `sshApi.readDir`，不得把 fixture 或 presentation 判断写入生产组件。编辑器 23px 状态栏是有记录的高密度例外：内部 action 可保持 19px 高，但必须至少 28px 宽、可见、中心可命中且不造成横向溢出；独立 icon-only 入口仍需至少 28x28。
- 长路径验证仅触发 `RemoteFileBrowser.minimal.scss` 的展示修复：28x28 编辑入口固定在现有工具栏旁，并用 token 背景遮住保留控制区下方的滚动路径文字。该改动不增加组件 import，也不触碰 SSH adapter/API。Slice 11 独立构建再次验证该边界：7,455 modules / 36.51s；entry JS 为 2,334,390 raw / 681,522 gzip bytes，entry CSS 为 627,314 raw / 88,766 gzip bytes；54 个 required dynamic entries、0 个 unresolved static imports、budget unit tests 34/34，overall `PASS`。gzip 相对参考值 `+1,480` / `+248` 仍为监控 `WARN`；受保护的 generated version 文件 hash 与 mtime 均未变化。
- Automation populated/detail 的桌面 fixture 只挂载真实 `AutomationProvider` 和展示组件；不导入 `AutomationScene.tsx`，不启动 Cron/API，不写持久化，所有 create/delete/run/toggle 回调必须保持零调用。fixture 仅在测试页直接加载场景基础 SCSS，临时隐藏并 `inert` 原应用根，结束后逐项恢复 root style、`aria-hidden`、`inert`、全局 fixture key、主题、URL 和窗口尺寸。详情焦点管理使用组件本地 ref/effect，不注册 window 级键盘监听，也不引入新的 provider、store 或 runtime 订阅。
- Slice 16 独立构建验证上述语义改动没有扩大启动边界：7,455 modules / 34.53s；entry JS 为 2,334,390 raw / 681,521 gzip bytes，entry CSS 为 627,314 raw / 88,766 gzip bytes；54 个 required dynamic entries、0 个 unresolved static imports、budget unit tests 34/34，overall `PASS`。gzip 相对参考值 `+1,479` / `+248` 仍是监控 `WARN`。构建输出位于包目录下的 `src/web-ui/.void/perf-phase1-after`；受保护文件 hash 与 mtime 均未变化。

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

### 极简短剧团队展示边界

- 团队轨道只属于 `minimal` 展示层。真实子代理标签、会话生命周期、关闭/重排/pin/popout、状态投影和媒体调用继续由原 `EditorGroup` 与现有 runtime 负责；`classic` 必须始终回退到原生分栏。
- `short-drama-center` 可以在阶段代理创建期间用不占画布宽度的按需团队入口替代空白半屏；`workspace-media-gallery` 只有在 secondary 至少包含一个真实短剧阶段代理、没有混入其他工具，且已登记的工作区路径一致时才允许进入团队展示。
- 展开/收起只使用 `EditorArea` 的展示态，不得写入共享 `splitRatio`。展开面板由 minimal CSS 作为覆盖式抽屉限制为最多 420px，收起时 secondary 容器宽度为 0 且只保留一个可命中的打开入口；primary surface 始终保持 100% 宽度。抽屉打开时只隐藏无效的 SplitHandle，不得重写 Canvas 布局状态。
- 展示态必须绑定当前 primary surface 和可见阶段代理集合。离开工作面、团队集合改变或 selector 失效时立即清空展开态，返回原工作面时默认恢复为轨道。
- secondary 没有真实活动标签时不得伪造第一个标签为选中；零代理准备态不得提供可打开空面板的 toggle。

## 构建 Gate

合并前必须检查生产构建 manifest、静态/动态 import 警告和 entry 预算。新增可选功能不得进入启动 entry；entry JS 或 CSS 增长时，必须先定位依赖路径并记录原因。预算阈值应由 CI gate 执行，不能只依赖人工观察。

## 验证命令

```powershell
pnpm --dir src/web-ui test:run src/app/performance/performanceImportBoundaries.test.ts src/app/components/panels/content-canvas/short-drama/ShortDramaMediaPreviewLayout.test.ts src/app/components/panels/content-canvas/short-drama/ShortDramaEpisodeNavigationState.test.ts
pnpm --dir src/web-ui test:run src/app/scenes/browser/browserTaskGate.test.ts src/app/scenes/browser/browserUrlPolling.test.ts
pnpm --dir src/web-ui test:run src/app/components/panels/content-canvas/workspace-media/WorkspaceMediaGallery.test.tsx src/app/components/panels/content-canvas/workspace-media/useWorkspaceMediaPreviewQueue.test.tsx src/app/components/panels/content-canvas/workspace-media/WorkspaceMediaVirtualMasonry.test.tsx
pnpm --dir src/web-ui test:run src/app/components/panels/content-canvas/editor-area/shortDramaTeamPanelPresentation.test.ts src/app/components/panels/content-canvas/editor-area/ShortDramaTeamPanelControls.test.tsx src/app/components/panels/content-canvas/editor-area/EditorArea.short-drama-team.test.tsx src/app/components/panels/content-canvas/editor-area/EditorArea.minimal-layout.test.ts
pnpm --dir src/web-ui test:run src/app/components/NewProjectDialog/LazyNewProjectDialog.test.tsx src/app/components/RemoteConnectDialog/LazyRemoteConnectDialog.test.tsx src/app/performance/performanceImportBoundaries.test.ts
pnpm --dir src/web-ui run type-check
pnpm --dir src/web-ui exec vite build --outDir .void/perf-phase1-after --emptyOutDir --manifest
node --test scripts/check-web-performance-budget.test.mjs
node scripts/check-web-performance-budget.mjs --dist src/web-ui/.void/perf-phase1-after
```

构建后比较 `src/web-ui/.void/perf-phase1-before/.vite/manifest.json` 与
`src/web-ui/.void/perf-phase1-after/.vite/manifest.json`，检查 entry JS/CSS、
总 JS、chunk 关系和 Vite 静态/动态 import 警告。
