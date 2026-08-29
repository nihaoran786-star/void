# 第四期实施计划：把画布做顺手（P4 工作台）

状态：待业主批准的实施计划（本文档只做计划，不改任何源码）
日期：2026-08-25
业主已批准范围：[无限画布能力差距清单](../features/infinite-canvas-capability-gap.md)
的 **P1 全档（P1-1…P1-6）+ P2-2（对齐吸附）**。

上游依据：

- [无限画布与媒体工具契约规范](../features/infinite-canvas-and-media-tools-prd.md)（契约；本期修订 §3/§5/§6）
- [Canvas 插件平台 PRD](../features/canvas-plugin-platform-prd.md)（最高规范）
- [第一期](2026-08-22-infinite-canvas-plugin-phase1.md)、[K2](2026-08-23-infinite-canvas-k2-image-tools.md)、[P3](2026-08-24-infinite-canvas-p3-agent-canvas.md)
- `AGENTS.md`、`src/web-ui/AGENTS.md`、`CONTEXT.md` 无限画布条目
- 参考实现：kunpeng（MIT，见 `THIRD-PARTY-NOTICES.md`）——只借设计思路，代码全部按 Void 规矩重写

**核心前提（延续 K2/P3，业主已定）：不引入任何新 Provider、渠道或密钥；
不新增生成能力。** 本期只把后端**已经存在但前端没露出来**的字段接上，
其余全在画布面板内。

---

## 1. 目标与做完能看到什么

**给业主的一段话：** 这一期不给画布加任何新的"会画什么"，只把它从
"能出图"做成"顺手"。做完之后：图能点开看大图、能存到电脑上；出图前
能挑模型、挑比例、挑清晰度，一次能出好几张挑一张；手滑删错拖乱了能
按 Ctrl+Z 撤回；能框选一片卡、复制粘贴、右键出菜单；一堆图在跑的时候
右下角有个小面板告诉你每个跑到哪了、失败的能重试；拖卡片的时候会出现
对齐参考线，自动吸齐。

做完你能看到：

1. 点卡片上的图 → 全屏查看，可放大缩小拖动，右上角"另存为"把图存到
   电脑任意位置（视频同样可以看、可以存）。
2. 生成卡上多一个"参数"按钮：可选模型、画面比例、清晰度；视频卡还能
   选时长。选完记在这张卡上，下次再生成沿用。
3. 参数里可以选"一次出 2/3/4 张"（只有支持多图的模型才可选）：点一次
   生成 → 第一张落进这张卡，其余的自动在旁边长出新卡并连回来，和"派生"
   一模一样，原图永远不被覆盖。
4. Ctrl+Z 撤销 / Ctrl+Shift+Z 重做：管你自己的编辑（加卡、删卡、拖动、
   连线、改提示词）。**已经出好的图、AI 落下的卡、正在跑的任务不会被
   撤销掉**——这是故意的，理由见 §2.4。
5. 按住 Shift 拖一个框选中一片卡；选中后浮出一个小工具条（复制 / 再制 /
   删除）；右键卡片、右键空白处都有菜单。删除带图的卡会先问一句
   （图片文件本身不会被删）。
6. 右下角"任务"小抽屉：本画布正在跑 / 失败的生成一目了然，可以重试，
   也可以"停止等待"（说明见 §2.6——后端目前没有真正的取消入口）。
7. 拖动卡片时出现对齐辅助线并自动吸齐。

**本期不覆盖**：蒙版画笔、裁剪、分镜拆分、图生提示词、风格缩略图、
分组卡、多文档、工坊同步——见 §5。

### 细节（供执行 AI）

七条能力线，全部长在 K2/P3 已验证的骨架上，**画布文档的唯一写入通道
仍是 `InfiniteCanvasDocumentService.mutateDefaultDocument`**，本期不新增
第二个 writer、不新增事件通道。后端只有两处加法字段（§2.2、§2.3），
其余为纯前端。

---

## 2. 核心架构选型与理由

### 2.1 全屏查看与"另存本地"走哪条路

**给业主的一段话：** 存文件这件事仓库里已经有一条成熟的路（文件面板的
"下载"就是走它）：弹出系统"另存为"窗口，然后后端原样复制文件过去。
我们直接复用，不新开通道、不新加权限。

### 细节（供执行 AI）

- **另存为**：复用 `downloadWorkspaceFileToDisk(filePath, workspace)`
  （`src/web-ui/src/tools/file-system/services/workspaceFileTransfer.ts:227`）
  ——内部 `@tauri-apps/plugin-dialog` 的 `save()` + `workspaceAPI.exportLocalFileToPath`
  （Rust `export_local_file_to_path`，`src/apps/desktop/src/api/commands.rs:2648`，
  二进制安全的 `std::fs::copy`，无路径 scope 限制）。`dialog:allow-save`
  已在 `src/apps/desktop/capabilities/default.json` 授权，**零新命令、零新权限**。
- 源路径 = `infiniteCanvasMediaFilePath(mediaRef)`
  （`infiniteCanvasPreviewResolver.ts:30`），不经 data URL 中转
  （`readFileContent` 单文件 8MB 上限，视频必炸）。
- **注入缝**：面板 props 增加可选端口 `saveMediaAs?: (filePath: string) => Promise<...>`，
  默认实现在 `infiniteCanvasDocumentGateway.ts` 里绑定上面的函数——面板
  本体不直接 import Tauri 插件，测试可注入桩（与既有 `mediaJobReader` /
  `resolvePreviewUrl` 同款注入风格）。
- **顺带**：右键菜单的"在文件夹中显示"复用 `workspaceAPI.revealInExplorer`
  （`reveal_in_explorer`，`commands.rs:2819`，同样已授权）。
- **全屏查看器**：面板内 portal（挂到面板根容器，不挂 `document.body`——
  保住 `.infinite-canvas-panel` 上的 CSS 变量作用域与面板级测试选择器），
  遮罩 + 缩放（0.1–5，按钮 / 滚轮 / Esc 关闭）+ 拖动平移。媒体 URL 复用
  既有 `resolveInfiniteCanvasMediaPreviewUrl`（**必须保持 `forceDataUrl: true`**
  ——本应用未开启 Tauri `assetProtocol`，流式 URL 会被 webview 拒绝，
  CONTEXT.md 已记两次教训）。已知代价：图片 data URL 缓存只有 12 条 /
  单条 8MB 上限，超过 8MB 的大图每次打开都会重读文件——可接受，不为此
  改缓存策略。视频用 `<video controls preload="metadata">`，不自动播放。

### 2.2 生成参数：暴露哪些字段，参数存在哪

**给业主的一段话：** 后端其实早就支持挑模型、挑比例、挑清晰度，只是
画布上没有地方点，全走默认值。我们把**真实存在的**那几个字段接上来，
并且把你选的参数记在这张卡上，下次再生成不用重选。

### 细节（供执行 AI）

**真实字段核实结果**（以
`src/crates/assembly/core/src/agentic/tools/implementations/media_tools.rs`
与 `agentic/media/capabilities.rs` 的代码为准，不引二手结论）：

| 字段 | GenerateImage | GenerateVideo |
|---|---|---|
| `model` | 默认 `gpt-image-2`；另有 `gemini-3-pro-image-preview(-official)`、`gemini-3.1-flash-image-preview(-official)` | 默认 `Omni-Flash-Ext`；另有 `doubao-seedance-2.0(-fast/-face/-fast-face)`、`kling-v3-omni` |
| `size`（比例） | 枚举，按模型不同：`auto,1:1,3:2,2:3,4:3,3:4,5:4,4:5,16:9,9:16,2:1,1:2,3:1,1:3,21:9,9:21`（gpt-image-2 全集；gemini 子集，flash 另有 1:4/4:1/1:8/8:1） | 走 `aspect_ratio` / `size`（Omni-Flash-Ext 仅 16:9 / 9:16） |
| `resolution` | gpt-image-2：`1k/2k/4k`（**小写**）；gemini pro：`1K/2K/4K`；gemini flash：`0.5K/1K/2K/4K`（**大小写按模型不同，照抄**） | 480p / 720p / 1080p / 4k（按模型） |
| `n` | 1..=4，**但 gpt-image-2 的 `n_max = 1`**，n≥2 必须先换 gemini 模型 | 无此字段 |
| `duration` | — | Omni-Flash-Ext：4/6/8/10；seedance：4..=15；kling：3..=15 |

`capabilities.rs:382` 的 `validate_allowed` 对**空允许表 = 全放行**；
非法值返回 `MediaValidationError`，经
`infinite_canvas_media_api.rs:294` 映射为 `invalid_input`，前端按既有
`ImageToolErrorKind.'invalid-input'` 落成卡片失败态（不是白屏、不是 toast）。

**桌面命令今天透传什么**（`src/apps/desktop/src/api/infinite_canvas_media_api.rs:30-57, 278-291`）：
`prompt / model / size / n / image_urls / infinite_canvas`。
**`resolution` 与视频的 `duration`/`aspect_ratio` 根本不在请求结构里**——
这是本期唯一需要动后端的地方（R1，纯加法可选字段，见 §4）。
前端 `DirectImageGenerationGateway.ts:229-240` 今天把 `n` 写死 1、
`model`/`size` 压根不发。

选型：

- **能力表放前端一份 declarative 表**：新文件
  `shared/services/infinite-canvas/infiniteCanvasGenerationCapabilities.ts`
  ——按模型列出 sizes / resolutions / nMax / durations，附来源注释
  （指向 `capabilities.rs` 的行）。**前端只提供后端真实存在的取值**，
  不猜、不自造。漂移风险与对策见 §6-3。
- **参数持久化到节点**：`InfiniteCanvasNode` 增加加法字段
  `generationParams?: { model?, size?, resolution?, n?, duration?, aspectRatio? }`，
  **schemaVersion 保持 `'1'`**，解析容错（损坏值按字段缺失处理，
  与 K2/P3 的 `prompt`/`generation.mediaKind` 同款条款）。旧文档无损；
  旧解析器读到该字段直接忽略（不像 `kind:'video'` 那样致命——它是节点内
  未知字段，parseNode 本就丢弃未知键）。
- **换模型即夹紧**：纯函数 `normalizeGenerationParams(params, model)`——
  切模型时把不被新模型支持的 size/resolution/n/duration 夹回该模型的
  默认值，并在派发前再夹一次（双保险，防止文档里存的旧值把提交打回）。
- **AI 不碰这些参数**：`CanvasOp` 的 `update_node` 白名单本期**不放开**
  `generationParams`（保持 P3 §3.6.4 白名单原样）。理由：AI 改参数会
  放大花钱面，且与"防失控"条款同源；如需放开另行立项。

### 2.3 批量出图 n>1 怎么落成多张卡

**给业主的一段话：** 一次出 4 张，后端其实早就把 4 张都存好了，只是
"回邮标签"上只写了第一张的地址。我们给标签加一栏"全部地址"（老的
第一张地址原样保留，短剧那边一个字不改），前端拿到后：第一张落进你
点的那张卡，第 2–4 张在旁边长出新卡并连回来——和现在的"派生"完全同一
套规则，原图永远不被覆盖。

### 细节（供执行 AI）

**后端现状**（`src/crates/assembly/core/src/agentic/media/jobs.rs`）：
批次结果里**已经有完整的多结果数组**——`batch.items[]`（含 1 基
`item_index`、`status`、`local_path`）与 `batch.assets[]`（含 `item_index`、
`url`、`local_path`），文件落在
`media/generated/{batch_id}/{kind}-{item_index:03}.{ext}`（jobs.rs:770）。
唯一的问题是 `attach_infinite_canvas_media_result`（jobs.rs:559-614）
**硬取第一项**：

```rust
let item_index = first_asset…or_else(first_item)…unwrap_or(1);
metadata_object.insert("outputMediaItemId", json!(format!("{batch_id}-{item_index}")));
```

所以 `outputMediaItemId`/`outputMediaRelativePath` 只描述第 1 项。

**选型（R2）**：在同一个函数里**加法追加**一个数组字段
`outputMediaItems: [{ itemIndex, mediaItemId: "{batch_id}-{item_index}",
mediaKind, relativePath, previewUrl, path }]`，
**现有单数字段一律保持不变**（=第 1 项），于是：

- 老前端读不到新字段 → 行为与今天一字不差（前滚兼容）；
- `attach_short_drama_media_result` 与短剧任何行为**零触碰**（是另一个函数）；
- 相对路径由 Rust 用它已有的同一套换算生成，前端不自己拼路径
  （拼路径 = 未来改目录结构就整片失效）。

**前端落位规则**（本期新不变量，写进契约）：

1. 落位锚点仍是 `operationId`（K2 §3.4 不变）。
2. `outputMediaItems` 按 `itemIndex` 升序；**第 1 项落到绑定的
   `nodeId`**（self 模式 = 空卡自身；derived 模式 = 派发时建的占位卡），
   走既有 `resolveOperationContent`（其"已有 mediaRef 就跳过"的
   never-overwrite 判据原样生效）。
3. 第 2..N 项各生成一张新卡：`kind` 同锚点卡，`mediaRef` = 该项，
   `derivedFrom = { sourceNodeId: 锚点卡, toolId, operationId }`，
   同时新增一条 `锚点卡 → 新卡` 的边（`role: 'derived'`，因此不会被
   `collectReferenceNodes` 当成垫图参考——K2 §3.3 语义保持）。
   位置 = 锚点卡右侧按序偏移（与既有派生卡布局同一 helper）。
4. **新卡 nodeId 必须确定性派生**：`node-<operationId>-i<itemIndex>`。
   理由：回流事件可能重放、pending 对账可能二次应用，随机 ID 会导致
   重复建卡；确定性 ID 让"已存在即 no-op"天然幂等（与 P3 CanvasOp 的
   ID 幂等纪律同源）。
5. **半成功（`status: "partial"`）**：只落 `outputMediaItems` 里真实有
   `relativePath` 的项；若第 1 项缺失但后面有成功项，**把第一个可用项
   落到锚点卡**（不让用户点的那张卡空着），其余仍派生；若一项都没有 →
   走既有失败分类（typed，卡上显示可重试）。
6. `n=1`（默认）时 `outputMediaItems` 长度为 1 → 与今天的行为逐字节等价。

**改动落点（前端）**：`InfiniteCanvasMediaBridge.ts` 的
`ExtractedBinding`(90-101) / `parseBinding`(136) / `classifyCompletedResult`(190)
/ `MutationDecision`(237，**必须从只带 `nodes` 扩成同时带 `edges`**) /
`applyIntent`(255-338 的 resolve 分支 308-317)；镜像路径
`InfiniteCanvasPendingReconciliation.ts` 的 `firstSavedLocalPath`(81-94)
与 `applyIntent`(156-178) 必须**同片同步改**，否则"关画布期间完成"的
批量任务只会补回第一张。

**成本闸门**：`n` 选择器只在所选模型 `nMax > 1` 时可用（gpt-image-2 恒 1，
显示禁用原因）；参数弹层上明示"一次 N 张 = N 次计费"；上限硬编码 4
（后端 schema 上限），不提供自定义输入框。

### 2.4 撤销 / 重做：作用域、不可撤销清单、与并发写入共存

**给业主的一段话：** 撤销只管**你自己的手动编辑**：加卡、删卡、拖动、
连线、改提示词、改参数。**不管**：已经出好的图（撤销不该把你花钱买的
图弄没）、AI 落下的卡（那是另一条写入线，撤销它会和 AI 的待办日志打架）、
正在跑的生成（撤销不会退钱，只会让你以为停了）。另外，撤销记录只在
这次打开画布期间有效，关掉页签就清空——不写进文件。

### 细节（供执行 AI）

**可撤销（用户编辑）**：`addTextNodeContent` / `addImageNodeContent` /
`addBlankGenerationCardContent` / `addBlankVideoCardContent` /
`removeNodesContent` / `removeEdgesContent` / `moveNodeContent`（拖动结束
时的那一次）/ `connectNodesContent` / `setNodeTextContent` /
`setNodePromptContent` / `setNodeStylePresetContent` / 新增的参数写入 /
粘贴与再制。

**明确不可撤销（typed 拒绝 + 说明，不静默）**：

| 操作 | 为什么不可撤销 |
|---|---|
| 生成成功落图（`resolveOperationContent`，含批量派生卡） | 结果是花过钱的真实产物；撤销 = 悄悄扔掉已付费资产。用户要删可以手动删（走删除确认）|
| AI 的 `CanvasOp` 批次落位（OpsBridge / ops 对账） | 另一条写入线，且有 `agentOps.appliedSeq` 水位；撤销会让水位与内容脱节，日志重放又会补回来，形成"撤了又回来"的鬼打墙 |
| 发起生成 / 重试（`beginSelfGenerationContent`、`beginDerivedOperationContent`、`retryOperationContent`）与失败标记 | 任务已经发出去，撤销不撤单；撤掉占位卡等于把回流结果的落点删掉，结果回来无处可落 |
| 视口平移缩放（`setViewportContent`） | 不是内容编辑；把它计入历史会让 Ctrl+Z 变成"回到上一个视角"，噪音压倒有效条目 |

**历史栈存哪：内存，不进文档，不进磁盘。** 选型对照：

| | A（选定）内存栈，随面板生命周期 | B 存进画布文档（新字段） | C 存本地缓存（localStorage） |
|---|---|---|---|
| 契约冲击 | 零（不改 schema） | 文档体积随编辑线性膨胀；要定义裁剪与 CAS 语义 | 零 |
| 与 AI/回流并发 | 每条记录带前置校验，冲突即丢弃（下方） | 历史与 `agentOps` 水位互相纠缠，重放语义爆炸 | 同 A，但多一份可能与文件不一致的状态 |
| 重开是否保留 | 否（明说"本次打开有效"） | 是 | 是，但极易与真实文档漂移（AI 改过之后历史全是坏引用） |
| 复杂度 | 低 | 高 | 中，收益低 |

**并发共存机制（关键）**：不做"整文档快照回滚"（那会把 AI 落的卡、
回流落的图一起抹掉）。改为**逐条反向补丁 + 应用时前置校验**：

- 每条历史项记录 `{ 描述, 受影响的 nodeIds/edgeIds, 反向内容变换 }`。
- 撤销时把反向变换**当作一次普通编辑走 `mutateDefaultDocument`**——
  于是它自动排进 DocumentService 的**按路径串行队列**
  （`mutationQueueByPath`，`InfiniteCanvasDocumentService.ts:336/430`），
  与 MediaBridge / OpsBridge 的写入天然互斥，无竞态、无需新锁。
- 反向变换在 mutator 内部**按最新文档重验**（与 MediaBridge `applyIntent`
  同款纪律）：受影响节点若已获得 `mediaRef`、已挂上 `generation`、
  或已被别人删除 → **该条目作废、整栈中该条及更早条目一起丢弃**
  （防止在错位的基础上继续回退），面板给一条 typed 提示
  （新 i18n key `infiniteCanvas.history.staleDiscarded`）。
- 深度 50 条；面板卸载 / 切工作区即清空；`redo` 栈在任何新编辑发生时清空。
- 快捷键：`Ctrl/Cmd+Z`、`Ctrl+Shift+Z` 与 `Ctrl+Y`；监听器带
  `isEditableTarget` 守卫（输入框 / textarea / contenteditable 内交给
  浏览器原生撤销，不劫持）。
- **不学 kunpeng 的"生成期间整体禁用撤销且不给理由"**（其
  `src/lib/canvas/history.ts` 的做法）——我们允许撤销与生成并行，靠
  逐条前置校验保证安全，且拒绝时有明确文案。

### 2.5 多选 / 复制粘贴 / 右键菜单 / 删除保护

**给业主的一段话：** 复制一张有图的卡，复制的是**这张图的引用**，
不是又存一份文件——两张卡指向同一张图，删掉其中一张不会删文件。
这样不占空间，也符合"画布只引用、不搬运媒体"的既定规矩。要真的复制
一份文件，那属于导出，不在本期。删除带图的卡会先弹确认（多选删除只弹
一次，写清"其中几张有图、几张在跑"），并且**只删卡片，不删文件**。

### 细节（供执行 AI）

- **React Flow 配置**（`@xyflow/react` ^12.11.3；今天
  `InfiniteCanvasPanel.tsx:905-919` 只设了 9 个 props，下列全部缺失）：
  新增 `selectionOnDrag={false}` + 默认 `selectionKeyCode='Shift'`（
  保持左键拖拽 = 平移的现有手感，Shift+拖 = 框选）、
  `multiSelectionKeyCode={['Meta','Control','Shift']}`、
  `deleteKeyCode={null}`（删除改由我们自己接管，才能插入确认）、
  `elevateNodesOnSelect`、`onSelectionChange`。
- **需要 `ReactFlowProvider`**：右键菜单要把屏幕坐标换成画布坐标
  （`screenToFlowPosition`）、辅助线要读 `transform`、任务面板"定位到
  这张卡"要 `setCenter`。做法：**只把 `<ReactFlow>` 及其覆盖层包进
  provider**，需要 hook 的覆盖层（辅助线、菜单定位、定位跳转）拆成
  provider 内的小子组件，`InfiniteCanvasPanel.tsx` 的既有 state 与
  commit 流程一行不动——避免对 940 行主文件做大重构、避免震动四套既有
  面板测试。
- **复制/粘贴语义（结论 + 理由）**：
  - 复制 = **复制引用**。`mediaRef` 原样带过去（同一 `workspacePath` +
    `relativePath`）。理由三条：① PRD §5 明定"节点内嵌媒体是对
    Workspace Media 的引用，不复制媒体真相，也不写 Media 领域数据"，
    复制文件等于画布越界写媒体域；② 复制文件会让存储随手滑翻倍；
    ③ 删卡不删文件的既有语义得以保持一致。
  - 带过去的字段：`kind`、`position`（偏移后）、`size`、`text`、
    `prompt`、`stylePresetId`、`generationParams`、`mediaRef`。
  - **不带**：`generation`（进行中的任务不可复制——一个 operationId
    只能有一个落点）、`derivedFrom`（血缘属于原卡，粘贴出的是新根）、
    `domainRef`（K3 保留字段，任何路径不得赋值）。
  - 边：只复制**两端都在选区内**的边；跨选区的边不复制（否则会悄悄
    改变目标卡的垫图参考顺序）。
  - 剪贴板是**面板内存里的应用私有剪贴板**，不接系统剪贴板（跨应用贴
    图片字节属于另一条能力，本期不做）。
  - "再制（Duplicate）"= 复制 + 立即粘贴（偏移 32px），**不覆盖用户的
    剪贴板内容**（kunpeng 的 `duplicateSelection` 会覆盖，我们不学）。
- **删除保护与批量删除如何共存**：所有删除入口（Delete 键、工具条、
  右键菜单）统一汇进一个 `requestDeleteNodes(nodeIds)` 闸门：
  - 全部是空卡 / 文本卡 / 失败占位卡 → 直接删，不打扰；
  - 只要含 `mediaRef` 或含 `generation.status==='pending'` 的卡 → 弹一次
    确认框，文案给出计数（"将删除 5 张卡：其中 2 张有图、1 张正在生成。
    图片文件不会被删除，仍在媒体库里。"）；
  - 确认后**一次 mutate 删完整批**（现有 `removeNodesContent` 已支持
    数组入参并级联删边），不是 N 次；
  - AI 侧的删除保护（P3：AI 不得删带媒体的卡）**不受影响**——那是
    OpsBridge 里的另一道闸，本闸只管用户手动删除。
- **批量拖动的写放大**：今天 `onNodesChange`(693-708) 对每个位置变更各
  调一次 `commit` → 多选拖 10 张 = 10 次串行 mutate。本片新增
  `moveNodesContent(document, moves[])` 批量纯函数，一次 mutate 落一批。
- **选中工具条**：≥2 选中时浮出（复制 / 再制 / 删除）；定位用选中节点
  DOM 矩形并集（`.react-flow__node[data-id]`，`CSS.escape`），portal 到
  面板根容器。单选不出工具条（单卡操作已在卡片上和右键菜单里）。
- **右键菜单**三态（节点 / 选区 / 空白），同一组件按 `kind` 分支：
  - 节点：全屏查看、另存为…、在文件夹中显示（三项仅带媒体时）、
    生成参数…（仅生成卡）、复制、再制、删除；
  - 选区：复制所选、再制、删除所选；
  - 空白：新建文本卡 / 图片生成卡 / 视频卡（落在右键位置）、粘贴。

### 2.6 任务队列面板：数据从哪来，"取消"到底能不能做

**给业主的一段话：** 任务面板不需要新造一个"任务表"——画布文件里每
张卡上本来就记着"我在跑 / 我失败了"，把它们列出来就是队列。**但是
"取消"要说实话：后端目前根本没有中止入口**（任务发出去就在后台自己
轮询到结束）。所以本期的按钮叫"停止等待"：卡片立刻停止转圈、标成
可重试的失败，**远端任务仍在跑、该花的钱照样花**。要做真取消得给后端
加一套中止机制，属于后端改动，建议单独定（见 §7 业主选项）。

### 细节（供执行 AI）

- **数据源 = 文档本身**：`document.nodes.filter(n => n.generation)`——
  与 `reconcilePendingInfiniteCanvasGenerations`
  （`InfiniteCanvasPendingReconciliation.ts:190-192`）同一判据。
  **不新建 store、不新建订阅**；面板每次 `projectDocument` 后重算即可。
  批次细节（如已完成张数）可选地由既有 `InfiniteCanvasMediaJobReader`
  读 `.void/media-jobs/<batchId>.json` 补充——**本期只读 status 与
  errorKind，不读批次文件**（少一条 IO 路径，少一处失败面）。
- **重试**：复用面板既有 `retryGeneration`(490-538) + `retryOperationContent`；
  额外提供"重试全部失败项"（逐条走同一函数，不并发轰炸，串行发出）。
- **取消（核实结论）**：`agentic/media/jobs.rs` 里**没有任何取消入口**
  ——`start_media_job_polling_with_sink`(173) 是 `tokio::spawn` 的游离任务，
  不保留 `JoinHandle`、无 CancellationToken、无注册表；`poll_media_jobs`(233)
  只有"全部终态"或 120 次 ×5s 超时两个出口；`ApimartClient` 无 cancel 方法；
  桌面侧只有 `submit_infinite_canvas_media_job` 一个命令。文件里出现的
  "cancelled" 只是**读取供应商回报的状态字符串**。
  → 本期**降级为"停止等待"**：前端把该节点置
  `generation.status='failed'`、`errorKind='cancelled'`（七类枚举里已有
  这一类，无需扩枚举），卡片显示"已停止等待，可重试"。
  **明确差异（写进 UI 文案与契约）**：远端任务继续执行、额度照常消耗；
  若结果稍后回流，因锚点 `operationId` 仍在且节点无 `mediaRef`，
  **图仍会落进这张卡**——这是刻意保留的（钱已经花了，不该把结果扔掉），
  测试断言这条行为。
- **面板形态**：面板右下角折叠胶囊 → 展开抽屉（约 320×360），零任务时
  整体不渲染；行内容：卡片提示词首行 / 状态 / 错误码文案 / 操作
  （重试、停止等待、定位到这张卡 → `setCenter`）。
- **⚠️ 事件名陷阱（已踩两次）**：本片若需要监听工具事件，**不得**按原始
  `toolName` 过滤——折叠工具经 `CallDeferredTool` 网关调用，事件里的
  `toolName` 是 `'CallDeferredTool'`。按回执形状匹配（现有
  `InfiniteCanvasMediaBridge` 已是正确写法，照抄）。本期设计上任务面板
  **不直接订阅事件**（只投影文档），从源头绕开该坑。

### 2.7 对齐辅助线与吸附（纯前端）

- 拦截点选 `onNodesChange`（不是 `onNodeDrag`）：找到唯一一条
  `type==='position' && dragging===true` 的变更，在交给既有 handler 之前
  就地修正 `change.position`；`changes.length !== 1` 时（多选拖动）
  **不吸附、不画线**——多选拖动的吸附语义（按哪个节点对齐）含糊，
  收益低于复杂度，明确不做并写进文案。
- 阈值 5 画布单位；比较维度：左/中/右 与 上/中/下 各 5 组配对，
  每轴取最优匹配。`kind:'group'` 节点不参与（本期无渲染器）。
- 辅助线覆盖层是 provider 内的小组件，用 `useStore(s => s.transform)`
  自己做 flow→screen 换算，1px 线走 `--infinite-canvas-accent-line`
  （SCSS 里已有该局部变量）。
- **只影响拖动过程中的坐标，落盘仍只在 `dragging===false` 时提交一次**
  ——不增加任何写盘频率。

---

## 3. 契约设计（本期对 PRD 的加法）

**给业主的一段话：** 这一节把三样新东西的"格式"定死：卡片上多存一份
生成参数、回邮标签上多一栏"全部结果地址"、撤销的边界规则。都是加法，
老画布文件打开完全无感。

### 细节（供执行 AI）

修订 `docs/features/infinite-canvas-and-media-tools-prd.md`：

1. **§5 文档契约**：`InfiniteCanvasNode` 增加
   `generationParams?: { model?: string; size?: string; resolution?: string;
   n?: number; duration?: number; aspectRatio?: string }`（加法，
   schemaVersion 仍 `'1'`，损坏值按字段缺失；节点内未知字段本就被旧解析器
   丢弃，故对旧代码无损——与 P3 的 `kind:'video'` 情况不同，不构成
   `invalid-document` 风险）。
   同节补一条：**AI 的 `update_node` 白名单不含 `generationParams`**。
2. **§3.2 绑定与回流**：完成充实的元数据增加加法数组
   `outputMediaItems: [{ itemIndex, mediaItemId, mediaKind, relativePath,
   previewUrl, path }]`；单数字段 `outputMediaItemId` /
   `outputMediaRelativePath` / `outputPreviewUrl` / `outputMediaPath`
   语义不变（= 第 1 项），旧前端零感知。
3. **§3.4 前端回流不变量**：新增"批量落位规则"四条（§2.3 的 1–5 条），
   含确定性派生 nodeId `node-<operationId>-i<itemIndex>` 与
   `partial` 半成功处置；重申 `mediaRef` 不可变与 never-overwrite。
4. **§3.1 直连命令入参**：补 `resolution`（image）、`duration`/`aspectRatio`
   （video）三个可选字段，并注明取值必须来自
   `capabilities.rs` 的按模型允许表，非法值 → typed `invalid-input`。
5. **§6 阶段边界**：P4 覆盖项（全屏查看与另存、生成参数、批量出图、
   撤销重做、多选与复制粘贴与右键菜单、任务队列、对齐吸附）；
   新增"撤销作用域与不可撤销清单"条款（§2.4 表格照搬）；
   新增"取消 = 停止等待，后端无中止入口"的已知取舍。

---

## 4. 分步任务拆解

**给业主的一段话：** 一共 13 片：1 片改文档（不写代码），2 片很小的后端
加法（把已有参数接通、把"全部结果地址"补上），9 片网页端（从看图另存
开始，一片一个能力），最后 1 片全量收尾。每片单独提交、单独可回滚，
界面片必须真跑完整构建（不是只跑类型检查）。

> 建议分支：`codex/infinite-canvas-p4-workbench`。每片一个独立提交。
> 按既往教训（MEMORY）：**凡改界面的片必须真跑 `pnpm run build:web`**，
> 不得以 type-check / lint 绿替代；新增 i18n key 三语齐全并跑
> `i18n:audit`。

### D0：契约修订（纸面，无代码）

- 改动落点：`docs/features/infinite-canvas-and-media-tools-prd.md`（§3 的
  五处，见 §3）。**本计划获批后由业主自行链入 `docs/README.md`**，
  本期任何切片都不改 `docs/README.md`。
- 验收：文档评审通过 + `pnpm run check:repo-hygiene`。

### 后端（两片，均为可选字段加法）

**R1：直连命令补 `resolution` / `duration` / `aspectRatio` 透传**

- 改动落点：`src/apps/desktop/src/api/infinite_canvas_media_api.rs`
  ——`SubmitInfiniteCanvasMediaJobRequest`(30-57) 增加三个
  `#[serde(default)] Option<...>` 字段；(278-291) 的 `json!` 输入按 kind
  分支补 `resolution`（image）与 `duration`/`aspect_ratio`（video）。
  **不改 `media_tools.rs`、不改 `capabilities.rs`、不改任何校验**——
  校验本来就在工具层，非法值走既有 `invalid_input` 路径。
- 测试：带 / 不带新字段的请求各一条（不带 = 与今天完全一致的 json）；
  video 分支不误发 `n`；非法 resolution 经工具层返回 `invalid_input`。
- 验收：`cargo test --locked -p void-core media` + `cargo check --workspace`。

**R2：完成充实追加 `outputMediaItems` 数组**

- 改动落点：`src/crates/assembly/core/src/agentic/media/jobs.rs`
  的 `attach_infinite_canvas_media_result`(559-614)——在保留全部现有
  单数字段的前提下，遍历 `batch.assets`/`batch.items` 生成数组
  （相对路径用该函数已有的换算，不新拼路径）。
  **`attach_short_drama_media_result`(502-557) 一字不改。**
- 测试：n=1 的输出与改动前逐字段相同（回归护栏）；n=3 完成 → 数组三项、
  itemIndex 1..3、路径各不相同；`partial`（一项失败）→ 数组只含成功项且
  单数字段仍指向第一个成功项；kind=video 断言 `mediaKind:"video"`。
- 验收：`cargo test --locked -p void-core media` + `cargo check --workspace`；
  R1+R2 合并后跑一次全量 `cargo test --locked -p void-core`（短剧与 K2
  用例全绿是回归门）。

### 网页端

**W1：全屏查看器 + 另存本地（P1-1）**

- 改动落点：新文件
  `content-canvas/infinite-canvas/InfiniteCanvasMediaViewer.tsx`；
  `InfiniteCanvasNodes.tsx`（图片/视频区域点击打开、加"查看大图"入口）；
  `InfiniteCanvasPanel.tsx`（viewer 状态 + 新 prop `saveMediaAs`）；
  `infiniteCanvasDocumentGateway.ts`（默认端口 = `downloadWorkspaceFileToDisk`）；
  `InfiniteCanvasPanel.scss` + `.minimal.scss`（新块）；三语
  `locales/*/components.json` 的 `infiniteCanvas.viewer.*`。
- 测试：打开/关闭（Esc、遮罩点击）；缩放上下限与重置；视频卡打开的是
  `<video>` 且未 autoplay；另存调用端口且传入
  `infiniteCanvasMediaFilePath(mediaRef)`；端口抛错 → typed 提示不崩面板；
  空卡无查看入口。
- 验收：目标 Vitest + `type-check:web` + `lint:web` + `i18n:audit` +
  `i18n:contract:test` + **`build:web`**。

**W2：schema 加法 + 模型能力表（P1-2 前置）**

- 改动落点：`shared/services/infinite-canvas/InfiniteCanvasTypes.ts`
  （`generationParams` 字段）；`InfiniteCanvasDocumentService.ts`
  （parseNode 容错解析）；新文件
  `shared/services/infinite-canvas/infiniteCanvasGenerationCapabilities.ts`
  （按模型的 sizes / resolutions / nMax / durations + `normalizeGenerationParams`）；
  `shared/services/infinite-canvas/index.ts`（barrel 导出）。
- 测试：round-trip；损坏 `generationParams`（字符串、数组、非法 n）按缺失
  处理且**不影响同文档其它节点**；旧文档无损；能力表——每个模型的
  默认值必须在自身允许表内；`normalizeGenerationParams` 换模型后夹紧
  （gemini 的 `1K` → gpt-image-2 的 `1k` 大小写、n=4 → n=1）。
- 验收：目标 Vitest + `type-check:web` + `check:core-boundaries`。

**W3：生成参数弹层 + 派发接线（P1-2，n 暂锁 1）**

- 改动落点：新文件
  `content-canvas/infinite-canvas/InfiniteCanvasParamsPopover.tsx`；
  `InfiniteCanvasNodes.tsx`（卡上"参数"按钮 + 折叠摘要药丸，如
  "gemini · 16:9 · 2K"）；`InfiniteCanvasPanel.tsx`（写参数 → commit）；
  `infiniteCanvasGenerationModel.ts`（`setNodeGenerationParamsContent` 纯函数）；
  `DirectImageGenerationGateway.ts`（把 `model`/`size`/`resolution`/
  `duration`/`aspectRatio` 从 invocation 透到请求；**`n` 本片仍固定 1**）；
  `SessionImageGenerationGateway.ts` 的 invocation 类型同步扩字段；
  SCSS + 三语 `infiniteCanvas.params.*`。
- 测试：弹层只列出该模型真实支持的取值；换模型自动夹紧；参数落进节点
  并在重开后仍在；派发请求里带上参数；不选参数时请求与今天逐字段一致
  （回归护栏）；后端返回 `invalid_input` → 卡片失败态 + 参数类错误文案。
- 验收：目标 Vitest + `type-check:web` + `lint:web` + `i18n:audit` +
  **`build:web`**。

**W4：批量出图 n>1 落成多张卡（P1-3，依赖 R2 + W3）**

- 改动落点：`InfiniteCanvasMediaBridge.ts`（§2.3 的五个点，含
  `MutationDecision` 扩 `edges`）；`InfiniteCanvasPendingReconciliation.ts`
  （镜像同一套多结果处置）；`infiniteCanvasPanelModel.ts`
  （新纯函数 `resolveOperationBatchContent(document, operationId, mediaRefs[])`，
  内含确定性 nodeId、派生边 `role:'derived'`、never-overwrite）；
  `DirectImageGenerationGateway.ts`（放开 `n`，取值来自节点参数并按
  模型 nMax 夹紧）；`InfiniteCanvasParamsPopover.tsx`（启用 n 选择器 +
  计费提示）。
- 测试：n=1 行为与改动前逐字段一致（**最重要的回归断言**）；n=3 →
  锚点卡 + 2 张派生卡 + 2 条 `role:'derived'` 边，位置不重叠；
  重复事件 / 对账二次应用 → 幂等无重复卡；`partial` 只落成功项且第一个
  成功项落锚点卡；全失败 → 单一失败态；锚点卡已有 mediaRef（篡改绑定）
  → typed ignored，零写入；关画布期间完成的 n>1 批次经对账补齐全部卡。
- 验收：目标 Vitest + `type-check:web` + `check:core-boundaries` +
  **`build:web`**。

**W5：撤销 / 重做（P1-4）**

- 改动落点：新文件
  `content-canvas/infinite-canvas/infiniteCanvasHistory.ts`
  （纯逻辑：栈、条目形状、`captureUserEdit`、`invert`、前置校验谓词）；
  `InfiniteCanvasPanel.tsx`（在 `commit` 处按"用户编辑"来源打点；
  快捷键监听 + `isEditableTarget` 守卫；工具栏加撤销/重做按钮与禁用态）；
  三语 `infiniteCanvas.history.*`。
- 测试：加卡→撤销→卡消失→重做→回来；拖动撤销回原位；删带图卡→撤销
  →卡与 mediaRef 完整回来；改提示词撤销；**回流落图不进历史**；
  **AI ops 落位不进历史**；**发起生成/重试不进历史**；撤销条目过期
  （目标卡在此期间被回流填了图）→ 该条及更早条目丢弃 + typed 提示；
  连续 60 次编辑后栈深度封顶 50；输入框内 Ctrl+Z 不被劫持。
- 验收：目标 Vitest + `type-check:web` + `lint:web` + `i18n:audit` +
  **`build:web`**。

**W6：多选 / 框选 / 批量移动 / 删除确认（P1-5 上半）**

- 改动落点：`InfiniteCanvasPanel.tsx`（React Flow props、
  `ReactFlowProvider` 包裹、`onSelectionChange` 选中态、
  `requestDeleteNodes` 统一闸门 + 确认框状态）；
  `infiniteCanvasPanelModel.ts`（`moveNodesContent` 批量纯函数 +
  `classifyDeletionTargets(document, nodeIds)` 返回
  `{ mediaCount, pendingCount, plainCount }`）；
  新文件 `InfiniteCanvasConfirmDialog.tsx`（或复用
  `InfiniteCanvasToolInstructionDialog` 的样式壳）；SCSS + 三语
  `infiniteCanvas.delete.*`。
- 测试：Shift 框选选中多张；多选拖动 → **一次** mutate 落全部位置；
  删除纯空卡不弹确认；删除含图卡弹确认且计数正确；取消确认 → 文档零
  变化；确认 → 一次 mutate 删完且级联删边；Delete 键与菜单走同一闸门；
  provider 包裹后既有四套面板测试全绿（回归门）。
- 验收：目标 Vitest + 既有 `InfiniteCanvasPanel.*.test.tsx` 全绿 +
  `type-check:web` + `lint:web` + `i18n:audit` + **`build:web`**。

**W7：复制 / 粘贴 / 再制 / 右键菜单 / 选中工具条（P1-5 下半）**

- 改动落点：新文件 `infiniteCanvasClipboard.ts`（纯函数：
  `copySelectionSnapshot(document, nodeIds)` 与
  `pasteSnapshotContent(document, snapshot, offset)`，§2.5 的字段白名单
  与边规则）；新文件 `InfiniteCanvasContextMenu.tsx`、
  `InfiniteCanvasSelectionToolbar.tsx`；`InfiniteCanvasPanel.tsx`
  （菜单/工具条状态、快捷键 Ctrl+C/V/D、粘贴落点）；SCSS + 三语
  `infiniteCanvas.menu.*`。
- 测试：复制有图卡 → 粘贴出的新卡 `mediaRef` **与原卡逐字段相同**
  （引用语义断言）且 `generation`/`derivedFrom` 未被复制；选区内边被
  复制、跨选区边未被复制；粘贴 ID 全新且不覆盖任何现有节点；再制不
  改剪贴板；右键三态菜单项按卡片形态显隐（空卡无"另存为"）；工具条
  仅 ≥2 选中时出现；菜单动作与快捷键走同一批纯函数。
- 验收：同 W6 全套 + **`build:web`**。

**W8：任务队列面板（P1-6）**

- 改动落点：新文件 `InfiniteCanvasTaskQueuePanel.tsx`；
  `infiniteCanvasPanelModel.ts`（`collectGenerationTasks(document)` 纯投影
  + `stopWaitingContent(document, operationId)`）；
  `InfiniteCanvasPanel.tsx`（挂载面板、重试全部、定位到卡）；
  SCSS + 三语 `infiniteCanvas.tasks.*`（含"停止等待"的差异说明文案）。
- 测试：零任务时不渲染；pending/failed 分组与计数；重试走既有
  `retryOperationContent` 语义；"停止等待" → 节点变 failed/cancelled；
  **停止等待后结果回流仍能落进该卡**（刻意行为断言）；定位按钮触发
  `setCenter`；面板不订阅任何工具事件（断言无事件监听，从源头避开
  `CallDeferredTool` 名称坑）。
- 验收：同 W6 全套 + **`build:web`**。

**W9：对齐辅助线与吸附（P2-2）**

- 改动落点：新文件 `infiniteCanvasHelperLines.ts`（纯函数：给定拖动中
  节点与其它节点，返回 `{ snappedPosition, verticalLine?, horizontalLine? }`）；
  新组件 `InfiniteCanvasHelperLines.tsx`（provider 内覆盖层）；
  `InfiniteCanvasPanel.tsx`（`onNodesChange` 前置拦截）。
- 测试：阈值内吸附到左/中/右与上/中/下各一例；阈值外不吸附；
  多节点同时拖动（changes.length>1）不吸附不画线；group 节点不参与；
  **落盘提交次数不变**（仍只在 dragging===false 提交一次）。
- 验收：目标 Vitest + `type-check:web` + `lint:web` + **`build:web`**。

**Z1（收尾）：全量门 + 手工验收**

- 手工验收清单（业主实机点检）：
  1. 点开一张图 → 全屏、缩放、拖动 → 另存到桌面 → 文件能打开；
     视频同样走一遍；
  2. 生成卡改模型为 gemini、比例 16:9、清晰度 2K → 生成 → 出图符合设置；
     关掉画布重开 → 参数还在；
  3. 参数里选 n=3 → 一次生成 → 三张图：一张落原卡、两张派生连线，
     原图未被覆盖；
  4. 出图途中关掉画布 → 重开 → 三张都补齐；
  5. 删一张有图的卡 → 弹确认 → 确认删除 → Ctrl+Z 撤回 → 卡与图都回来；
  6. 出图进行中按 Ctrl+Z → 已完成的图不会被撤掉、正在跑的任务不受影响；
  7. Shift 框选 5 张 → 工具条 → 再制 → 拖动 → 出现对齐线并吸齐 →
     Ctrl+Z 撤回；
  8. 右键空白 → 新建视频卡；右键有图卡 → 另存为 / 在文件夹中显示；
  9. 任务面板：跑三张图 → 列表正确；断开 APIMart token 再跑 → 失败可
     重试；点"停止等待" → 卡片立刻停转并显示说明；
  10. K2/P3 回归：空卡文生图、垫图 @图一、五件套、AI 指挥画布加卡排布、
      图生视频各走一次，行为与 P4 之前一致；
  11. 短剧中心完整走一次图/视频生成 → 行为一字不变（回归）。
- 最终验收命令（全量门）：相关目标 Vitest 全绿 +
  `pnpm run type-check:web` + `pnpm run lint:web` +
  `pnpm run check:core-boundaries` + `pnpm run check:repo-hygiene` +
  `pnpm run i18n:contract:test` + `pnpm run i18n:audit` +
  `pnpm run build:web` + `cargo test --locked -p void-core` +
  `cargo check --workspace`；按仓库惯例再跑一次
  `pnpm --dir src/web-ui run test:run` 确认无回归。
- 通过后更新 `CONTEXT.md` 与契约文档阶段状态。

---

## 5. 明确不做清单（P4 之外）

- ❌ 蒙版画笔（P2-1）、裁剪（P2-3）、分镜拆分器（P2-4）——需要在画布里
  引入一块图像编辑子界面，与本期"工作台基本功"不同源，K5 立项。
- ❌ 图生提示词（P2-5）、机位预设库（P2-6）、风格缩略图（P2-7）。
- ❌ 分组卡渲染（P3-1）——继续沿用 P3 的排除决定，`CanvasOp` 仍拒绝
  `group`，本期的复制/删除/吸附一律跳过 group 节点。
- ❌ 悬空连线建卡与节点缩放手柄（P2-10）——差距清单曾建议顺带，
  本期**不做**：它们要改连线交互与节点尺寸写入，和多选/撤销同时落地会
  让验收面失焦；成本很小，可作 K5 首片。
- ❌ 真正的后端取消（新增 CancellationToken 注册表 + 新桌面命令）——
  见 §7 业主选项 2。
- ❌ 系统剪贴板互通（跨应用复制图片字节）、复制卡片时复制媒体文件。
- ❌ 撤销记录持久化、跨会话历史。
- ❌ 让 AI 改 `generationParams` 或发起 n>1 批量（`CanvasOp` 白名单与
  `begin_generation` 不放开）。
- ❌ 新 Provider / 渠道 / 密钥；新前端→后端端口（除 R1 的三个可选入参）。
- ❌ 远程 workspace（继续 fail-closed）。
- ❌ 修改短剧任何 runtime 行为、`attach_short_drama_media_result`、
  `ShortDramaCenterPanel.tsx`（AGENTS.md 热点保护）。
- ❌ 改 `docs/README.md`（业主自行链入）。

---

## 6. 风险与对策

**给业主的一段话：** 三个真风险：一是撤销和"AI 改画布 / 图落回来"
可能打架——我们的撤销是一条条带前置检查的，发现情况变了就作废那条，
绝不硬回滚；二是一次出四张会四倍花钱、还可能只成功两张——我们把上限
锁死 4、在按钮旁标明计费、半成功也照样把成功的落好；三是参数选错会被
后端打回——打回是明确的失败卡片加原因，不是白屏，而且我们只让你选
后端真实支持的值。

### 细节（供执行 AI）

1. **撤销 × 回流 / AI 并发**：不做整文档快照回滚。逐条反向补丁经
   `mutateDefaultDocument` 排进既有串行队列，mutator 内按最新文档
   前置校验；任一受影响节点已被回流/AI 改动 → 该条及更早条目整体作废
   并提示。测试必须覆盖"撤销时回流刚好落图"的交错场景（用可控的
   mutate 顺序桩）。
2. **批量出图的成本放大与半成功**：n 上限硬编码 4（后端 schema 上限），
   仅在模型 `nMax > 1` 时可选，弹层明示计费倍数；`partial` 的处置规则
   写进契约并有测试；n=1 的逐字段回归断言是 R2/W4 两片的首要护栏。
3. **前端能力表与 Rust `capabilities.rs` 漂移**：能力表文件头注明
   "唯一真相在 `capabilities.rs`，改后端必须同步此表"，并在 R1/R2 的
   Rust 测试里加一条注释指回该文件。**兜底是 typed 降级**：即使表过时，
   后端也只会返回 `invalid_input`，前端落成可解释的失败卡片（附带
   后端给的参数名与允许值文本），不会静默、不会白屏、不会重复扣费。
   不做"从 Rust 自动生成 TS 表"（需要新的构建产物通道，超出本期边界）。
4. **`ReactFlowProvider` 包裹对既有测试的震动**：W6 把 provider 引入
   面板；四套既有面板测试（interactions / behavior / generation /
   agentops）必须在同片全绿，任何需要改既有断言语义的情况 = 停手上报
   业主（只允许因 DOM 层级增加而做的选择器修正）。
5. **全屏查看器的内存**：`forceDataUrl` 下图片缓存仅 12 条 / 单条 8MB
   上限，大图每次打开重读文件——**已知取舍，不改缓存**。视频用
   `preload="metadata"` 不预载数据。**严禁**为"顺手优化"改成
   `convertFileSrc` 流式 URL（本应用未开 `assetProtocol`，会让整片卡白图；
   CONTEXT.md 记录已踩两次）。
6. **`CallDeferredTool` 事件名坑**：任务面板设计上不订阅事件（只投影
   文档），从源头绕开；若后续有人给它加事件订阅，必须按回执形状匹配、
   把 `toolName` 只当弱过滤器（照抄 `InfiniteCanvasMediaBridge`）。
7. **复制引用语义可能反直觉**：两张卡指向同一张图，删一张不删文件。
   在右键菜单文案与删除确认框里写清"图片文件不会被删除"；PRD §5 加
   一条复制语义条款。
8. **停止等待 ≠ 取消**：远端继续跑、额度照扣、结果可能稍后落回。
   UI 文案与契约都写明；按钮不叫"取消"。
9. **写放大**：多选拖动改批量 `moveNodesContent`；撤销/重做每次只发
   一次 mutate；防抖写盘（800ms）与 CAS 不变。DocumentService 的
   **CAS 冲突今天没有重试**（冲突的合并写会被丢弃，
   `InfiniteCanvasDocumentService.ts:516/555`）——本期**不改这个行为**
   （改它属于持久化层立项），但撤销/批量删除都走同一队列，不会新增
   冲突面。
10. **既有基线债**（Desktop lib-test fixture 等已记录阻断）不计入本期
    失败，也不顺手修。

---

## 7. 审批点与需要业主拍板的选项

| # | 审批点 | 决策内容 |
|---|---|---|
| B1 | 动工前（本文档） | 批准整体计划与 13 片拆分；确认下方三个选项；确认撤销的不可撤销清单（§2.4）与复制=引用语义（§2.5）|
| B2 | R1+R2 合入后 | 业主确认：短剧与画布现有出图实测零变化（n=1 逐字段回归）；批准继续网页端 |
| B3 | W4 合入后 | 业主实机跑一次 n=3 真实出图，确认多卡落位与计费符合预期（这是本期唯一放大花钱的能力）|
| B4 | Z1 验收 | 业主按 §4-Z1 的 11 项手工清单实机验收；通过后更新 `CONTEXT.md` 与契约状态并推送 |

**需要业主拍板的选项：**

| 选项 | A | B |
|---|---|---|
| **1. 两处后端小改动**（R1 参数透传、R2 多结果数组） | **批准（推荐）**：都是可选字段加法，短剧零触碰。优点：清晰度/时长能选、批量出图才有意义。缺点：本期不再是"纯前端" | 砍掉：只暴露模型与比例，批量出图整块延后到 K5。优点：零后端风险。缺点：P1-3 落空，且"清晰度"这个高频诉求仍无处点 |
| **2. 生成任务的"取消"** | **降级为"停止等待"（推荐）**：卡片停转、可重试，远端继续跑、钱照花，结果回来仍会落卡。优点：零后端改动。缺点：不省钱，名不副实 | 本期做真取消：后端加中止令牌注册表 + 新桌面命令（约一个中等 Rust 切片）。优点：能真省钱。缺点：动到轮询主干，风险与工作量明显高于本期其余各片 |
| **3. 悬空连线建卡 + 节点缩放手柄**（差距清单曾建议顺带） | **不做（推荐）**：留作 K5 首片。优点：本期验收面干净 | 加进 W9。优点：手感更完整。缺点：改连线交互，与多选/撤销同期落地容易互相干扰 |
