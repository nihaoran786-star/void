# AI 客服面板 · 呈现层落地实现方案 v2

日期：2026-07-22（2026-07-23 v2：定稿交互模型、最终视觉契约、调研修正、cowork 门控）
配套设计：[2026-07-22-ai-customer-service-design.md](2026-07-22-ai-customer-service-design.md)
交互样机（用户已确认）：Widget `widget_3d90c948-8ed5-4217-9527-f098d0b9bed1`（极简定稿）；`widget_00ffe78e-5cf9-4688-b948-d6225d905b9e`（三主态样机间）

> 状态说明（2026-08-14）：本文的客服产品、交互、状态和 Cowork 门控契约仍有效；
> 其中直接扩展 `PanelContentType`、`FlexiblePanel` switch 和 `ContentCanvas` 全局事件的
> 硬接线步骤已由当前
> [Canvas 插件平台规范](../../features/canvas-plugin-platform-prd.md)替代。未来实现应在
> Canvas 注册表基础阶段完成后，以 Canvas contribution 接入，不再新增中心硬编码。

## 目标

把 AI 客服面板落地为 Content Canvas **一级面板**（surface pill：媒体 / 短剧 / 客服），**仅 cowork 会话可开启**，随软件 void-light 主题，复刻已确认的极简信息架构：HERO 大环 → 今日节奏流线 → 回复范围 → 知识库细带 → 规则行。

## 定稿交互模型（用户已确认）

- **三主态信号**：`signal: on | off | attention` + `reason` 大白话，守护进程/看门狗显式写入，UI 原样渲染，零推断。
  - `on` 回复中（绿）；`off` 已暂停（灰：手动暂停 / 人工接管 / 静默时段）；`attention` 需要注意（琥珀：窗口丢失 / 熔断 / 离线 / 白名单为空）。
  - 身份待确认不是主状态，是 `on` 上的琥珀 micro pill，不打断主信号。
- **回复范围两级模型**：`全部回复`（默认）/ `指定回复`；指定回复下白名单、黑名单为两个独立页签，各自逗号分隔批量维护、即时计数；白名单为空 → `signal: attention`；切回全部回复名单保留并提示。
- **面板无会话区**：逐会话上下文、指纹去重、接管检测归守护进程；号主在微信中亲自回复时守护进程自动对该会话静默。
- **健康信息全隐身**：窗口、巡检、计数等正常态不占版面，异常才出现并写明原因与主操作。
- **cowork 门控**：仅 `session.mode === 'cowork'` 出现面板入口与守护启用入口。

## 最终视觉契约

扁平分区、发丝线、无瓦片无阴影；随软件主题，深色主机主题下同一 token 体系自动适配：

1. **chrome 行**：surface pill（媒体 / 短剧 / 客服● / +1）+ 巡检摘要 pill。
2. **HERO 大环**（约 172px）：状态词 + 回复率弧（末端进度珠）+ 回/收小字 + reason + 主操作（暂停 / 继续 / 复位 / 启动，随状态切换）。
3. **今日节奏流线**：24h 收（灰）/ 回（绿）平滑曲线（Catmull-Rom），静默时段暗纹，当前时刻墨点。
4. **回复范围行**：两级分段器（`Tabs type="pill"` 或 FilterPill）+ 名单页签 + 批量 Textarea（渐进展开）+ 群聊 Switch。
5. **知识库细带**：4px 命中分布条 + 行内图例 + 待清理琥珀 + 重新索引 / 打开目录。
6. **规则行**：拟人发送 Switch、群聊 Switch、上限与静默一行小字。

void-light 取值（落地必须用 `tokens.scss` 语义变量表达，不硬编码 hex）：

| 用途 | void-light 值 | 落地 token |
|---|---|---|
| 工作区底 / 面板 | `#f3f3f5` / `#ffffff` | `--color-bg-primary` / `--color-bg-scene` |
| 文字三级 | `#1e293b` / `#3d4f66` / `#64748b` / `#94a3b8` | `--color-text-primary/-secondary/-muted/-disabled` |
| 成功（环弧、回、LIVE） | `#5b9a6f` | `--color-success` |
| 警示（待确认、待清理） | `#c08c42` | `--color-warning` |
| 发丝线 | `rgba(100,116,139,.15/.22)` | `--border-subtle/base` |
| 元素底（分段器、静默纹） | `rgba(15,23,42,.045)` | `--element-bg-subtle` |
| 主按钮 | 黑底白字 | 组件库 Button primary |

## 调研结论（2026-07-23 核实修正）

- **面板注册**：无通用注册表，一级面板硬接线。`PanelContentType` 现有 **30 个字面量**（`base/types.ts` L6-36），其中 4 个无 switch case 的死类型（`planner` / `ui-editor` / `ui-relation-graph` / `design-tokens`）——新增类型必须同步加 case。`FlexiblePanel.tsx`：lazy L41-137，switch L263；`ContentCanvas.tsx` 打开入口 L191 / L222。
- **workspaceAPI**（`infrastructure/api/service-api/WorkspaceAPI.ts`）：`readFileContent`（L356）/ `writeFile`（L231）/ `writeFileContent`（L242）/ `createDirectory`（L287）/ `getFileMetadata`（L366，可作 exists）/ `startFileWatch`（L939，轮询之外的备选）。读写样板：`ShortDramaWorkspaceManifestAdapter.ts:10-24`（catch → undefined 即"文件不存在"语义）。**v1 不加 Tauri 命令成立**。
- **组件原语**：`Switch`、`Tabs`（`type: 'line' | 'card' | 'pill'`）、`Textarea` 现成（`component-library/components/`）；无图表库，手写 SVG——`SessionUsagePanel.tsx:674-691` 环形表盘（strokeDasharray）为先例。
- **轮询先例**：`ContentCanvas.tsx` L30 `MEDIA_AUTO_OPEN_CHECK_INTERVAL_MS = 5000`，L287-295 范式（`cancelled` 标志 + `isChecking` 重入保护 + cleanup clearInterval）。
- **i18n**：`en-US` / `zh-CN` / `zh-TW` 三套 `components.json`。
- **测试**：`WorkspaceMediaGallery.test.tsx`、`ShortDramaCenterPanel.presentation.test.tsx` 同目录 vitest 先例（service 以接口注入 mock）。
- **修正**：`--kimi-color-*` 在 web-ui 不存在（那是 Widget 沙箱 token）；落地映射 `tokens.scss` 的 `--color-*` / `--card-bg-*` / `--border-*`。主题审计门 `check:theme-colors` / `check:theme-visual-contract` 会拦硬编码色值。
- **cowork 事实**：会话启动模式 `'code' | 'cowork' | 'media'`（`SessionCreateLauncher.tsx:12`）；会话对象有 `mode` 字段（`FlowChatStore.updateSessionMode` L572）。

## 模块划分（保持依赖方向）

```text
AiCustomerServiceCenterPanel（presentation）
  -> shared/services/ai-customer-service/（Module Interface）
       Types.ts                         显式状态联合 + SignalState + DTO
       CustomerServiceStatusAdapter.ts  端口：read/write status、config
       WorkspaceCustomerServiceAdapter.ts  适配器：workspaceAPI，唯一 IO 点
       CustomerServiceLibraryService.ts load / save / 5 秒轮询
       CustomerServiceEligibility.ts    cowork 门控谓词：canOpen(sessionMode)
       CustomerServiceViewModel.ts      纯函数视图模型（signal→环色/文案/主操作，scope→范围行）
       index.ts
  -> customer_service/status.json + config.json（守护进程拥有，见设计文档）
```

- **门控接线**：ContentCanvas / 入口菜单仅调用 `CustomerServiceEligibility.canOpen(session.mode)`，判定逻辑全在服务模块；非 cowork 会话不渲染入口 pill 与菜单项。守护进程的启用入口同口径（非 cowork 工作区不出现"启用 AI 客服"）。
- v1 不新增 Tauri 命令；推送通道 v2 复用 `agentic://tool-event` → `agent:tool-run-event` 领域事件链，v1 用 5 秒轮询。

## 显式状态契约（UI 不推断）

- `AiCustomerServiceLibraryState`：`idle | loading | ready | unconfigured | unavailable | error`。
  - `unconfigured`：工作区无 `customer_service/` → 空态 + "启用 AI 客服"引导（不是报错）。
  - `unavailable`：文件存在但解析失败/版本不符 → 显式降级文案。
- 运行视图：`signal` + `reason` + `quiet` + `counters` + `pending_identity` + 知识库统计，全部来自 `status.json` 显式字段。
- 配置视图：`scope.mode`（`all | custom`）+ `scope.listMode`（`white | black`）+ 两份名单数组 + `group` + 规则，映射 `config.json`；面板写操作只改 `config.json`，守护进程下个周期生效。

## 最小触碰清单

1. `base/types.ts`：`PanelContentType` 增加 `'ai-customer-service'`（并同步加 case，勿踩 4 个死类型）。
2. `base/utils.ts`：新增 `PanelContentConfig`（displayName/icon/`showHeader: false`）。
3. `base/FlexiblePanel.tsx`：lazy import + switch case（仅分派）。
4. 新建 `content-canvas/ai-customer-service/`：`AiCustomerServiceCenterPanel.tsx` + `.scss` + `index.ts` + 同目录测试。
5. `ContentCanvas.tsx`：打开事件常量 + `handleOpenAiCustomerService` + 监听器（仅接线）；入口可见性经 `CustomerServiceEligibility.canOpen`。
6. surface 切换：`tab-bar/tabBarLayout.ts` + `TabBar.tsx` + 切换 pill 增加 `customer-service`，同样过门控。
7. 新建 `shared/services/ai-customer-service/`（结构见上节，含 Eligibility）。
8. i18n：三份 `components.json` 增加 `customerService` 块；过 `i18n:contract:test` 与 `i18n:audit`。
9. 主题：样式全用 `tokens.scss` 语义变量；过 `check:theme-colors` 与 `check:theme-visual-contract`。
10. Rust 侧本期不动；若 v2 需要专属 Tauri 命令，走 `apps/desktop/src/lib.rs` + `service-api/*API.ts` 包装。
11. 工作区现有未提交改动（含 `FlexiblePanel.tsx`）为 user-owned，接线在其上增量进行。

## 分期

- **Phase 1（本方案范围）**：服务模块 + Eligibility 门控 + 面板骨架（极简视觉契约）+ 示例 `status.json/config.json` 驱动 + 空态 + 5 秒轮询。
- **Phase 2**：守护进程 POC 收编（`prototypes/ai-customer-service/` → core service），写 `status.json` 点亮面板；接 `agentic://` 推送链。
- **Phase 3**：名单写回、知识库重新索引/打开目录、待确认身份归并 UI。

## 不变量

- `ContentCanvas.tsx`、`FlexiblePanel.tsx`、`TabBar.tsx`、`EditorArea.tsx` 是编排热点：只加接线，业务与门控全部在服务模块。
- 展示组件不调用 Tauri/文件/进程；IO 只在 `WorkspaceCustomerServiceAdapter`。
- UI 只渲染显式状态联合；禁止从空数组/原始字符串推断运行、能力或错误状态。
- cowork 门控判定只在 `CustomerServiceEligibility`，UI 不直接读 `session.mode` 做展示决策。
- 样式只用 `tokens.scss` 语义变量，不硬编码色值。
- 复用 `agentic://` 事件链与 `globalEventBus`；不新增平行推送通道。
- 短剧、媒体面板的既有行为（自动打开、surface 切换、minimal 呈现）不回归。

## 验证

```powershell
pnpm run check:core-boundaries
pnpm run check:theme-colors
pnpm run check:theme-visual-contract
pnpm run i18n:contract:test
pnpm run i18n:audit
pnpm run type-check:web
pnpm run lint:web
pnpm --dir src/web-ui run test:run
```

另加同目录呈现测试：三态 `signal` → 环色/文案/主操作映射；`attention` 各原因行（窗口丢失/熔断/离线/空白名单）；两级范围模型与名单批量解析（逗号/顿号/换行）；`unconfigured` 空态；config 写回往返；**门控**：`canOpen('cowork') === true`，`'code' | 'media'` 为 false，非 cowork 会话无入口渲染。
