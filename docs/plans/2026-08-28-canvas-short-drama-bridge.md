# 实施计划：无限画布 ↔ AI 短剧中心 打通（K3）

- 日期：2026-08-28
- 分支基线：`main`（`244bdaf7e`）
- 状态：待业主拍板后开工
- 前序：`docs/plans/2026-08-26-infinite-canvas-p5-creation.md`、`docs/plans/2026-08-25-infinite-canvas-p4-workbench.md`

---

## 1. 一句话目标与做完能看到什么

**目标**：让短剧里的一张图能"送进画布精修"，改好之后能"回到它原来的位置"，并且**旧图永远还在**。

做完之后，业主能看到的：

1. 在短剧中心的角色卡（或场景卡、分镜卡）上，出现一个明确的按钮：**"在画布中精修"**。
2. 点它，右侧切到无限画布，画布上多出一张卡，卡上就是那张图，卡角有一条小标签：**"来自短剧 · 角色 CHAR-001"**。
3. 在画布上随便怎么改（重绘、扩图、局部重画、裁剪），改完点卡上的**"送回短剧"**。
4. 回到短剧中心，那张角色卡变成**"待审阅"**，显示新图，旁边有**"确认采用"**按钮。点确认才真正生效；不点，或者点"保留原图"，原来那张一点没动。
5. 无论确认与否，这张卡的**修订历史**里都多了一条记录，写着"来自画布精修"，旧图在历史里能翻回来。

**分两步走**（业主已拍板）：

- **第一步：只送出去**。短剧 → 画布，单向。画布上多一张带标签的卡，仅此而已，短剧那边**一个字节都不改**。零风险，可以先用手感。
- **第二步：再回流**。确认手感后，才做"送回短剧"。回流走短剧**既有的"修订 + 待审阅"机制**，不新增任何候选数组。

### 细节（供执行 AI）

- 本计划**只写计划，不改源码**。开工需业主在 §9 审批点逐条确认。
- 三个短剧资产类型共用一个实体 `ShortDramaArtifact`（`src/web-ui/src/shared/services/short-drama/ShortDramaTypes.ts:272`），靠 `type` 区分：`character` / `location` / `storyboard`。本计划对三者一视同仁，不做类型分叉。
- 术语：本文说"短剧资产"一律指 `ShortDramaArtifact`；说"画布卡"一律指 `InfiniteCanvasNode`。

---

## 2. 已核实的地基（落笔前重新核对过，行号在 `244bdaf7e` 上成立）

| 事实 | 落点 | 核实结论 |
| --- | --- | --- |
| 短剧只有一种资产实体 | `ShortDramaTypes.ts:272` `ShortDramaArtifact` | 成立。`type: ShortDramaArtifactType` 区分角色/场景/分镜 |
| 资产媒体是**单槽** | `ShortDramaTypes.ts:217` `ShortDramaMediaReference` | 成立。主键 `mediaItemId`，另有冗余 `localPath` / `filePath` / `relativePath` / `previewUrl` / `thumbnailUrl` |
| 画布卡的媒体引用 | `InfiniteCanvasTypes.ts` `InfiniteCanvasNode.mediaRef?: { workspacePath; relativePath }` | 成立。§7.6 后另有 `mediaVariants[]` + `activeVariantIndex`，`mediaRef` 恒等于当前变体 |
| **唯一可换算的公共栏是 `relativePath`** | 两边都指向 workspace 下 `media/generated/...` | 成立。**严禁任何一侧自己拼路径** |
| 既有回流链路 | `jobs.rs:502` `attach_short_drama_media_result` → `ShortDramaRuntimeBridge` → `ShortDramaProjectViewModel:2448` | 成立。覆盖 `mediaReference` + append `revision` + append `attempt` + 状态置 `reviewing` |
| 审阅通过入口 | `ShortDramaProjectViewModel.ts:2506` `approveShortDramaArtifactReview` | 成立。`reviewing → ready`，并把"Agent output is ready for review."那条 revision 改写为正式记录 |
| 前端唯一写路径 | `ShortDramaProjectViewModel`（纯函数）→ `ShortDramaRuntimeBridge.saveProject` → `ShortDramaWorkspaceManifestAdapter` → `.void/short-drama/manifest.json` | 成立。后端另有 `short_drama_project_tool.rs` 供 AI 写 |
| 短剧面板已有"聚焦某资产"接缝 | `ShortDramaCenterPanel.tsx:122` `activeArtifactFocusByStage`、`:846` `handleArtifactFocus`、`:2093` `ArtifactFocusButton`（当前 `sr-only`） | 成立。`ArtifactFocusButton` 在 5 处被渲染（:1566 / :1681 / :1850 / :1965 / :2002 / :2050） |
| 画布 surface 拒绝任何 input | `firstPartyCanvasSurfaces.ts:242-252` `validateInput`，理由 "must be empty in phase 1"，`:233 existingInstanceStrategy: 'focus'`，`:255 createInstanceKey` 只含 workspaceId | 成立。**要带资产进画布，第一处必改就是这里** |
| 带 payload 打开 surface 的现成模板 | Agent Studio：`firstPartyCanvasSurfaces.ts:174-215`（`{ definitionId }` + 实例键含 definitionId）+ `agentStudioCapabilityInput.ts` | 成立，可照抄结构 |
| **`'update'` 策略已有先例** | 短剧自己的 surface `firstPartyCanvasSurfaces.ts:46 existingInstanceStrategy: 'update'`；宿主实现 `CanvasStoreHostAdapter.ts:180-196` | 成立。`update` 会 `updateTabContent` + `showTab` + `switchToTab`，正是"已开着的画布收到新 payload"所需 |
| 画布 K3 预留字段 | `InfiniteCanvasTypes.ts:33` `InfiniteCanvasDomainRef { moduleId; kind; id; role }`，挂在 `InfiniteCanvasNode.domainRef?` | 成立，注释写着 "no phase-1 writer may set it" |
| **四道门主动挡 domainRef** | ① 解析器不读回 `InfiniteCanvasDocumentService.ts:256`；② AI `update_node` 白名单排除 `InfiniteCanvasAgentOps.ts:145,402`；③ Rust 侧拒绝 `canvas_tools.rs:532,835,2149`；④ 剪贴板丢弃 `infiniteCanvasClipboard.ts:21` | 全部成立，且有测试断言其恒为 `undefined` |
| 画布内预览必须 `forceDataUrl` | `infiniteCanvasPreviewResolver.ts:53` | 成立。**不得**复用短剧或 WorkspaceMedia 的 `thumbnailUrl`（`convertFileSrc` 产物，webview 拒载） |
| 从 Workspace Media 选图建卡的现成路径 | `InfiniteCanvasImagePicker.tsx:51,76` `onPick(mediaRef)` | 成立。"给一个 `{ workspacePath, relativePath }` 就建卡"已经有实现，第一步可直接复用其下游 |
| 阶段代理的工具集是**代码固定**的 | `subagent.rs:230` `DEFAULT_TOOLS`、`:252 runtime_tools()`、`:271 short_drama_media_tools()` | 成立。AssetAI/SplitAI 已固定获得 `GenerateImage` / `GetMediaTaskStatus` / `UploadMediaImage`，且固定提示词已要求带 `short_drama` 元数据（`subagent.rs:399-400`） |
| 红线 | `AGENTS.md:55`（`ShortDramaCenterPanel.tsx` 是 orchestration hotspot）、`AGENTS.md:65`（短剧 project facts / stage agents / fixed Skill policies / attempts / revisions / change requests / 媒体工具 / final preview 均为受保护能力） | 成立 |
| 短剧测试规模 | 约 45 个文件 / 13856 行 / ~345 用例 + 2 个 Playwright E2E | 采纳，回归成本见 §8 |

---

## 3. 第一步：把短剧资产送进画布（单向，零风险）

### 3.1 短剧侧入口放哪

**结论：新增一个可见动作，不改造 `ArtifactFocusButton`。**

`ArtifactFocusButton`（`:2093`）当前是 `sr-only` 的无障碍激活按钮，语义是"把这个资产设为本阶段焦点"，它驱动 `activeArtifactFocusByStage`，而这个状态又喂给 6 处下游（:607 / :635 / :658 / :711 / :883 / :1008 / :1027）——其中包括发给阶段代理的上下文包。**把"送到画布"塞进这个按钮，等于让一次跨面板打开顺带改写了阶段代理的焦点上下文**，这是不可接受的副作用。

因此：

- 新增一个**可见**的图标按钮 `ArtifactSendToCanvasButton`，与 `ArtifactFocusButton` 并列渲染在同样的 6 个卡片位置。
- 它只在资产**已有 `mediaReference` 且 `kind === 'image'`** 时渲染；没图的资产（还没生成）不渲染，避免"点了什么也没有"。
- 点击时 `event.stopPropagation()`，**不**触碰 `activeArtifactFocusByStage`。
- 视频/音频资产本期不送（画布虽有 video 卡，但精修管线是图像管线，见 §10 不做清单）。

**红线遵守**：`ShortDramaCenterPanel.tsx` 是 orchestration hotspot。因此该文件里**只加一个 prop 与一个纯展示按钮组件**，所有判断与调用逻辑放进新文件 `shortDramaCanvasHandoff.ts`。面板不得直接 import `canvasSurfaceCommandService`——它调用注入进来的回调，回调在容器层（`ShortDramaCanvasSurfaceRenderer` 一侧）接线。**不得发业务 DOM 事件**，全程 typed service。

### 3.2 typed input 的形状

**结论：`{ domainRef, requestId }`。**

```ts
// 新文件：app/components/panels/content-canvas/registry/infiniteCanvasCapabilityInput.ts
// 结构照抄 agentStudioCapabilityInput.ts
export interface InfiniteCanvasSurfaceInput {
  /** 缺省 = 只开画布，等价于今天的行为 */
  domainRef?: InfiniteCanvasDomainRef;
  /** 一次性导入的幂等键；同一个 requestId 只导入一次 */
  requestId?: string;
}
```

- `domainRef` 用画布**自己**已经预留的形状，不发明第二套：
  - `moduleId: 'short-drama'`
  - `kind: artifact.type`（`'character' | 'location' | 'storyboard'`）
  - `id: artifact.id`（**用 `id` 不用 `handle`**：handle 可改名，`previousHandles` 的存在就是证据；`id` 才是稳定主键）
  - `role: 'refine'`（本期只有这一种角色；预留 `'reference'` 给将来）
- **`domainRef` 里不放路径、不放 `mediaItemId`**。它是"指向哪个资产"，不是"指向哪张图"。图由 `mediaRef` 表达，两者分离，这样资产换了图也不会让 `domainRef` 失效。
- `requestId` 由发起方生成（`shortDramaCanvasHandoff` 里用 `crypto.randomUUID()`），同时作为 `canvasSurfaceCommandService.open()` 的 `idempotencyKey`。

**图的路径怎么过去**：**不放进 input**。画布收到 `domainRef` 后，自己去问短剧要"这个资产当前那张图的 `relativePath`"。理由：input 里带路径 = 两处真相，一旦资产在打开前刚换了图就会送错。见 §3.5。

### 3.3 `validateInput` 怎么放开

改 `firstPartyCanvasSurfaces.ts:242-252`：

```
undefined / null / {}                    → valid, value: {}              （今天的行为，保留）
{ domainRef, requestId } 且两者都合法      → valid, value: 规范化后的对象
其它任何形状（多余键、domainRef 缺字段、
moduleId 不是 'short-drama'）              → invalid，理由字符串明确说明
```

校验规则（全部 fail-closed）：

- `domainRef.moduleId` 必须严格等于 `'short-drama'`。本期只认这一个模块，别的模块以后自己开。
- `kind` 必须在 `['character', 'location', 'storyboard']` 白名单内。
- `id`、`role` 非空字符串，trim 后再存。
- `role` 必须是 `'refine'`。
- 有 `domainRef` 就**必须**有 `requestId`；只有 `requestId` 没有 `domainRef` 视为无效。
- `checkWorkspace` 的远程 workspace fail-closed **保持不变**。

### 3.4 实例键与"已经开着一个画布"怎么办

**结论：实例键不含 artifact，但 `existingInstanceStrategy` 从 `'focus'` 改成 `'update'`。**

- 实例键保持 `infinite-canvas:${workspaceId}`（`:255`、`:268 duplicateCheckKey` 同）。一个 workspace 一张画布文档，这是画布的地基假设；按 artifact 开 N 个标签页会造出 N 个指向同一份文档的标签，是灾难。
- 但 `'focus'`（`CanvasStoreHostAdapter.ts:166-178`）**只切标签、不更新 content**，第二次送资产就会静默丢失。改成 `'update'`（`:180-196`）后走 `updateTabContent` + `showTab` + `switchToTab`，新 payload 会真正抵达面板——这正是短剧自己的 surface 已经在用的策略（`:46`）。
- **幂等是这次改动的成本**：`'update'` 每次开都会重写 content，而画布标签会被会话恢复（`useFirstPartyCanvasSurfaceRestore`）重新挂载。因此：
  - 面板用一个 `handledImportRequestIdRef` 记住已处理的 `requestId`，重复的一律忽略。
  - **恢复路径必须剥掉 `domainRef`/`requestId`**：`useFirstPartyCanvasSurfaceRestore` 造出来的 open 请求不带 input，恢复出来的标签也不得从旧 content 里继承 pending import。这条要有专门的单测。

### 3.5 画布收到之后建什么卡

**结论：建一张普通的图片卡，`mediaRef` 指向短剧那张图的同一个文件，外加 `domainRef` 标签。不复制文件。**

- 卡的字段：
  - `kind: 'image'`
  - `mediaRef: { workspacePath, relativePath }` ← 由 `relativePath` 换算而来（见下）
  - `domainRef: { moduleId: 'short-drama', kind, id, role: 'refine' }`
  - `position`：放在当前视口中心的空位，复用 P4 已有的落点算法（`find empty space` 那套 helper）；不覆盖已有卡。
  - 不写 `prompt`、不写 `derivedFrom`、不写 `generation`。这张卡是**根**，不是任何东西的版本。
- **共享同一个文件**。短剧和画布指向同一份 `media/generated/...`。这与剪贴板的既定原则一致（`infiniteCanvasClipboard.ts:5-13`："复制的是引用不是文件"）。画布**永不写媒体域**。
- 预览一律走 `resolveInfiniteCanvasMediaPreviewUrl`（`infiniteCanvasPreviewResolver.ts:53`，`forceDataUrl: true`）。**严禁**把短剧的 `mediaReference.thumbnailUrl` / `previewUrl` 搬过来当图源。

### 3.6 `relativePath → mediaRef` 的换算放哪一层

**结论：放在一个新的、双方都不属于的薄适配文件里，两边都不下沉。**

新文件：`src/web-ui/src/shared/services/canvas-short-drama/shortDramaCanvasRefBridge.ts`

它只做两件纯函数的事：

```ts
// 短剧 → 画布
toCanvasMediaRef(
  media: ShortDramaMediaReference,
  workspacePath: string,
): { workspacePath: string; relativePath: string } | null
// media.relativePath 缺失/为空/含 '..'/是绝对路径 → 返回 null（fail-closed）

// 画布 → 短剧（第二步用）
toShortDramaRelativePath(
  mediaRef: { workspacePath: string; relativePath: string },
  expectedWorkspacePath: string,
): string | null
// workspacePath 不等价（走 areCanvasWorkspacePathsEquivalent）→ null
```

规则：

- **只读 `relativePath`。** `localPath` / `filePath` 是冗余字段，不参与换算；`mediaItemId` 是短剧域主键，画布不认识也不存。
- **绝不拼路径。** 不做 `join`、不做 `resolve`、不做 `replace(workspacePath, '')`。拿不到干净的 `relativePath` 就返回 `null`，上层报"这张图暂时不能送进画布"。
- 这个文件**不 import React、不 import Tauri、不 import 两侧的面板**。它只认两个纯数据形状。依赖方向仍是 `UI → 适配 → 服务`。

### 3.7 卡面怎么显示归属

- 卡片右上角一条小徽标：`来自短剧 · 角色 CHAR-001`。
  - 前半段固定文案（i18n key `infiniteCanvas.domainRef.fromShortDrama`）。
  - 中段按 `domainRef.kind` 映射：角色 / 场景 / 分镜。
  - 后段显示**短剧资产的 handle**（如 `CHAR-001`），不是 UUID。handle 不在 `domainRef` 里，所以要在建卡时一并存进卡的显示层——**存哪里？**见下。
- **handle 不进 `domainRef`。** `domainRef` 是四字段定长契约，加第五个字段等于改契约。显示用的 handle 走**运行时解析**：面板持有一份"当前 workspace 的短剧项目摘要"（只读，通过既有的短剧只读读取口），用 `domainRef.id` 查出 handle 与标题。查不到就退化成 `来自短剧 · 角色（已不存在）`，见 §5.3 悬空引用。
- 徽标是**只读展示**，不可编辑、不可点掉。想解除归属只能删卡。

### 3.8 短剧领域模块是否零改动

**第一步：短剧领域模块（`shared/services/short-drama/**`）零改动。** 只有 `ShortDramaCenterPanel.tsx` 加一个 prop + 一个展示按钮，加上 i18n 三份文案。ViewModel、Bridge、Adapter、manifest schema、Rust 侧**一行不改**。

唯一需要新增的短剧侧读取能力是"按 artifact id 查 handle/title/媒体"——核实结论：`ShortDramaProjectViewModel` 已有按 `idOrHandle` 定位资产的既有能力（`activeArtifactIdOrHandle` 一路用的就是它），**复用即可，不新增读接口**。

---

## 4. 第二步：回流（画布精修图 → 短剧待审阅）

### 4.1 两条路线的取舍

| | **A. 生成时就带 `short_drama` 绑定**（复用 `jobs.rs:502`） | **B. 画布落图后再调一次短剧写入口** |
| --- | --- | --- |
| 怎么走 | 画布提交生成任务时把 `{ projectId, stage, artifactId, outputMediaLabel }` 一起提交，后端 `attach_short_drama_media_result` 自动把结果挂回短剧 | 画布拿到成品图之后，前端调 `shortDramaCanvasWriteBack`（typed service）→ ViewModel 纯函数 → `saveProject` |
| 利 | 后端链路现成，前端几乎不用写；与 AssetAI/SplitAI 的既有做法完全一致 | 覆盖**所有**来源：生成、裁剪、扩图、局部重画、外部导入、变体切换；画布失败不污染短剧的 attempt 账本；幂等键完全由画布掌握；短剧域只加一个纯函数 |
| 弊 | **只覆盖"在画布上新生成"这一种**。裁剪、合成、手动切变体全都回不去；绑定必须在**提交任务那一刻**定死，之后改不了；画布的失败/取消也会写进短剧的 `attempts`，把短剧的重试计数与 `needs_intervention` 判定搞脏（`ViewModel:2478` 那段逻辑） | 新增一条写路径，要与 A 路径**防双写**；跨 workspace / 跨项目校验要自己做 |

**结论：第二步选 B。** 理由用业主的话说：*"送回去"是用户按下按钮时的决定，不是提交任务时的决定。* 用户在画布上折腾五轮才挑中一张，这个选择只有 B 能表达。

**A 不废弃**，它在第三步（§6）会自然复活——那时卡片带着短剧归属去生成，绑定顺带就带上了。**因此两条路必须在同一处收敛**：短剧侧的写入纯函数以 `(artifactId, mediaItemId)` 为幂等键，谁先到算谁，第二个静默跳过。这条是第三步能安全落地的前提，必须在第二步就实现好。

### 4.2 回流的字段映射

新增短剧域纯函数（`ShortDramaProjectViewModel.ts`，紧邻 `approveShortDramaArtifactReview`）：

```ts
export interface ShortDramaCanvasRefinement {
  artifactId: string;
  mediaReference: ShortDramaMediaReference; // 由适配层构造
  operationId: string;   // 画布侧的幂等键
  canvasNodeId: string;  // 溯源用
  timestamp: number;
}

export function applyShortDramaCanvasRefinement(
  project: ShortDramaProject,
  refinement: ShortDramaCanvasRefinement,
): ShortDramaProject
```

它做且只做：

1. 定位 artifact；不存在 → **原样返回 project**（不抛错，让上层报"这个资产已经不在了"）。
2. **幂等**：若 `artifact.revisions` 里已有一条 `sourceOperationId === refinement.operationId`，或已有一条 revision 的 `mediaItemId === refinement.mediaReference.mediaItemId`，**原样返回**。
3. append 一条 `revision`：
   - `id: revision-canvas-${operationId}`
   - `version: artifact.revisions.length + 1`
   - `summary`：固定文案 "Refined on the infinite canvas."（i18n 在 UI 层做，manifest 里存英文事实串，与既有 `createRuntimeRevisionReason` 一致）
   - `mediaItemId: refinement.mediaReference.mediaItemId`
   - 新增可选字段 `sourceOperationId`、`sourceCanvasNodeId`（**additive，manifest schema 版本不动**；老 manifest 读不到这两个字段等价于"不是画布来的"）
   - `createdAt: refinement.timestamp`
   - **不写 `approvedBy`**——没人批准，所以才要审阅
4. `mediaReference = refinement.mediaReference`
5. `status = 'reviewing'`，`revisionCount = revisions.length`
6. **不 append `attempt`**。画布精修不是一次代理运行，塞进 `attempts` 会污染重试计数与 `needs_intervention` 阈值判定。这是与既有 `jobs.rs` 链路的**有意差异**，要写进契约。

**旧图去哪了**：留在上一条 revision 的 `mediaItemId` 里，文件本身在 `media/generated/` 下原封不动（画布从不删文件，短剧也不删）。这就是业主所说的"不覆盖"。

**用户点确认之后**：走既有的 `approveShortDramaArtifactReview`（`:2506`）→ `reviewing → ready`。**这个函数一行不改。** 核实：它会去找 `summary === 'Agent output is ready for review.'` 的那条 revision 并改写它；我们的 revision summary 不同，所以它会走 else 分支 append 一条 approved revision——**这正是我们要的**（画布那条记录保留原样，另加一条批准记录）。

### 4.3 跨项目 / 跨 workspace 拒绝

三道闸，全部 fail-closed，在适配层（`shortDramaCanvasRefBridge` + 写回 service）做，不进 ViewModel：

1. **workspace**：卡的 `mediaRef.workspacePath` 与当前 workspace 必须 `areCanvasWorkspacePathsEquivalent`。不等价 → 拒绝，提示"这张图不在当前工作区"。
2. **项目**：当前 workspace 的短剧项目 id 必须与卡建立时记录的项目一致。**问题：`domainRef` 没有项目字段。** 解决：不加字段——一个 workspace 只有一份 `.void/short-drama/manifest.json`，workspace 相同即项目相同。若将来支持多项目，那时再立项。（这条要写进契约的"已知限制"。）
3. **资产存在性**：`domainRef.id` 在当前项目里能查到，且 `type === domainRef.kind`。查不到或类型对不上 → 拒绝并把卡标记为悬空（§5.3）。

远程 workspace：surface 层已 fail-closed（`:235`），回流路径再加一次断言，双保险。

### 4.4 用户在两侧分别看到什么

**画布侧**：带 `domainRef` 的卡，卡上多一个按钮 **"送回短剧"**。

- 未点过 → 普通可点状态。
- 点击后 → 短暂 pending，成功后徽标变成 `来自短剧 · 角色 CHAR-001 · 待审阅`。
- 失败（三道闸任一不过）→ 卡上出现一行明确原因，**不静默**。
- **可以重复送**。第二次送一张新图，短剧那边再记一条 revision，仍然是 reviewing。幂等只挡"同一张图重复送"，不挡"送不同的图"。

**短剧侧**：**不新增审阅 UI**。资产状态变 `reviewing`，既有的 `StatusPill`（`:2085`）和既有的审阅确认入口原样工作。唯一新增的是卡上一行**来源说明**："本次修改来自无限画布"——从最新一条 revision 有没有 `sourceCanvasNodeId` 推断。

**这一条很重要**：不新增审阅按钮 = 不碰 AGENTS.md 保护的 revisions / change requests 能力的既有形状，回归面收窄一大截。

---

## 5. `domainRef` 的开门规则

今天它被四道门挡着且有测试断言恒为 `undefined`。本期要把它从"保留"变成"可写可读"，**但只开一条缝**。

### 5.1 谁能写、谁不能写

| 通道 | 现状 | 本期 | 理由 |
| --- | --- | --- | --- |
| 短剧 → 画布打通链路（新） | 不存在 | **✅ 唯一写入方** | 这是本期的目的 |
| 文档解析器读回 `InfiniteCanvasDocumentService.ts:256` | ❌ 不读回 | **✅ 改为读回 + 校验** | 不读回就等于存了也丢，第一步就废了 |
| 剪贴板 `infiniteCanvasClipboard.ts:21` | ❌ 丢弃 | **❌ 保持丢弃** | 见 §5.2 |
| AI `update_node` 白名单 `InfiniteCanvasAgentOps.ts:145,402` | ❌ 排除 | **❌ 保持排除** | AI 不得改归属 |
| AI 建卡（`add_node` 等） | ❌ 无此字段 | **❌ 保持无** | 同上 |
| Rust `canvas_tools.rs:532,835,2149` | ❌ 拒绝 | **❌ 保持拒绝** | 同上 |
| 用户手工编辑 | ❌ 无入口 | **❌ 保持无入口** | 归属不是可编辑属性 |

一句话规则：**只有"从短剧送过来"这一个动作能写 `domainRef`，写完就是只读的；删卡是唯一的解除方式。**

AI 侧的三道门（AgentOps × 2 + Rust × 1）**一行不改**，只把注释里的 "K3 reserved / no writer may set it" 更新成 "K3: written only by the short-drama handoff; still not writable through any agent op"。相关测试断言从"恒为 undefined"改为"agent op 无法改变既有值"——这是**加强**，不是放松：要新增用例证明"一张已经带 domainRef 的卡，AI 调 update_node 之后 domainRef 原封不动"。

### 5.2 复制卡片带不带 domainRef

**结论：不带。** 保持 `infiniteCanvasClipboard.ts:21` 现状。

理由与 `generation` / `derivedFrom` 的既定理由同构（该文件 :16-22 已写明）：**一个短剧资产在画布上只应有一个"官方精修位"。** 复制出第二张带同样归属的卡，就会出现两张卡争着"送回短剧"，用户无从判断哪张是真的。粘贴出来的卡是一张干净的新卡（图还在，归属没了），想送回短剧就从短剧那边重新送一次。

这条要在剪贴板文件的注释里从"K3 保留，无人可写"改写为"K3 起可写，但**故意**不随复制走"，并保留既有测试。

### 5.3 解析器读回后怎么校验、悬空引用怎么办

`InfiniteCanvasDocumentService.ts:256` 改为读回，规则：

- 结构不对（不是对象、四字段缺一、非字符串、空串）→ **整个 `domainRef` 视为不存在**，节点其余部分照常解析。**不让文档变成 `invalid-document`**——一条坏标签不该毁掉整张画布。
- `moduleId` 不在已知白名单（本期只有 `'short-drama'`）→ 同样视为不存在。这样将来别的模块写进来的标签，在旧版本里会被静默丢弃而不是炸掉；是可接受的向前兼容代价，写进契约。
- 结构合法就**原样保留**，解析器**不**去校验"这个 artifact 是不是还存在"——那是运行时的事，解析器不该依赖短剧域。

**悬空引用**（图还在、短剧资产被删了 / handle 查不到）：

- 画布**不删卡、不清 `domainRef`**。用户的图还在，凭什么删。
- 徽标降级显示：`来自短剧 · 角色（已不存在）`，灰色。
- **"送回短剧"按钮禁用**，hover 提示"原来的短剧资产已被删除"。
- 解析时不做任何清理，也不写回文档——避免"打开一次画布就静默改一次文档"。
- 反向的悬空（短剧还在、画布卡被删了）：短剧完全无感，因为短剧根本不知道画布的存在。这是单向依赖的红利。

---

## 6. 第三步："谁拥有数据，谁负责生成"

业主拍板的规矩：画布按钮生图继续不经 AI；会话里让主 AI 操作画布仍归主 AI；**但卡片若带着短剧归属标签，其生成应由对应阶段代理负责**（角色 → AssetAI，分镜 → SplitAI）。

### 6.1 合规性核实（先做的事，结论在此）

**核实过程**：读了 `subagent.rs:230-283`（工具集计算）、`subagent.rs:389-413`（固定策略提示词）、`fixed_team_definitions.rs:110-155`（固定 Team 成员定义）、`ShortDramaTeamAdapter.ts:75-85`（`recordType: 'fixed_team'`、`origin: 'fixed_runtime'`、`managementSupport: 'readonly_fixed'`）、`AGENTS.md:60-67`（受保护能力）。

**三条结论：**

1. **不需要给 AssetAI / SplitAI 增加任何能力。** `subagent.rs:271 short_drama_media_tools()` 已经固定给这两位发 `GenerateImage` / `GetMediaTaskStatus` / `UploadMediaImage`；`subagent.rs:399-400` 的固定策略提示词已经明确要求它们在调 `GenerateImage` 时带 `short_drama` 元数据（`projectId` / `stage` / `artifactId` / `artifactHandle` / `outputMediaLabel`）。**"让阶段代理负责生成"是现成的，不是新功能。**

2. **给它们加画布工具会违规。** 若要让 AssetAI 去"操作画布"，就得往 `runtime_tools()` 里塞 `CanvasOp` 之类的工具——那是在改 `AGENTS.md:65` 明文保护的 **stage agents / fixed Skill policies**，也会改 `managementSupport: 'readonly_fixed'` 的固定 Team 定义。更直接的证据：`fixed_team_definitions.rs:110` 里 MainAI 的固定提示词写着"短剧专用画布由宿主自动打开，你不得调用 ComputerUse、CallDeferredTool 或浏览器工具去打开、查找、点击或检查这个画布"——**产品设计上，代理就不该去驱动画布 UI。** 结论：**本期不做，将来也不建议做。**

3. **合规的替代做法（选定）**：归属靠**数据**表达，不靠给代理加权限。带 `domainRef` 的卡在画布上点生成时，画布**照旧走自己的直连媒体管线**（不经 AI），但**在提交任务时附上 `short_drama` 坐标**——这用的是 `jobs.rs:502` 与 AssetAI 完全相同的那条既有链路，一个新参数都不需要发明。效果上，"这张图属于 CHAR-001 的资产生成"这件事在系统里被记录、被归档、被审阅，和 AssetAI 自己生成的图走完全一样的账本。**这就是"谁拥有数据谁负责生成"在本仓库能落地的、合规的形态。**
   - 若业主坚持要"真的由 AssetAI 发起"，合规路径是：**在短剧侧发起**（既有的派发 / ChangeRequest 链路，AssetAI 用它现成的 `GenerateImage`），画布只做展示与精修。这同样不需要新能力，但用户手感是"回短剧点一下"，不是"在画布点一下"。**这是需要业主拍板的选项 C（§9）。**

### 6.2 第三步要做的事（很小）

- 画布提交生成任务时，若源卡带 `domainRef`，附加 `short_drama: { projectId, stage, artifactId, outputMediaLabel }`。`stage` 由 `domainRef.kind` 映射（`character`/`location` → `assets`，`storyboard` → `storyboards`），映射表放在 `shortDramaCanvasRefBridge.ts`。
- 由此 A 路径（§4.1）激活，`jobs.rs:502` 会自动回挂。**防双写靠 §4.2 步骤 2 的幂等**：同一个 `mediaItemId` 只会记一条 revision，无论 A 先到还是 B 先到。
- 失败/取消的任务**不**带 `short_drama`（避免污染 attempts）——即只在成功回调路径上挂。若既有后端做不到只在成功时 attach，则**第三步整体延后**，先只做 §6.1 结论 3 的记录层（把归属写进任务元数据但不触发自动回挂），把回流仍然交给 B 路径的用户点击。这一点需要在第三步开工前实测确认。

---

## 7. 切片拆解

共 **12 片**，分 **4 组**。每片一个独立提交、可单独回滚、验收命令自带。

### D 组：契约（1 片，纸面）

**D0 — 契约修订**（无代码）

- 落点：`docs/design/infinite-canvas-*.md`（画布契约）新增 K3 章节；短剧契约文档新增"画布精修回流"一节。
- 内容：`domainRef` 开门规则表（§5.1）、`InfiniteCanvasSurfaceInput` 形状、revision 的两个 additive 字段、"不写 attempt"的有意差异、"一 workspace 一项目"的已知限制、`'focus' → 'update'` 的策略变更及其幂等要求。
- 验收：业主 review 通过。

### 第一步组：送出去（5 片）

**S1 — surface input 放开**

- 落点：新建 `app/components/panels/content-canvas/registry/infiniteCanvasCapabilityInput.ts`；改 `firstPartyCanvasSurfaces.ts:233,242-255,268`（策略 `'update'`、`validateInput`、`createPresentation` 透传）；改 `registry/InfiniteCanvasSurfaceRenderer.tsx:37-42,104-109`（`InfiniteCanvasPanelComponent` 类型 + 传参）；改 `InfiniteCanvasPanel.tsx:460-466`（props 加 `pendingDomainImport?`）。
- 面板本片**只接收不使用**，行为零变化。
- 验收：`pnpm --filter void-web-ui test -- firstPartyCanvasSurfaces` + `... InfiniteCanvasSurfaceRenderer`；新增用例覆盖 6 种 input 形状（空 / 合法 / 缺 requestId / 坏 moduleId / 坏 kind / 多余键）。

**S2 — `domainRef` 开门：解析器读回 + 三道 AI 门加固**

- 落点：`InfiniteCanvasDocumentService.ts:256` 改为读回 + 结构校验 + 白名单；`InfiniteCanvasAgentOps.ts:145,402` 只改注释；`canvas_tools.rs:532,835,2149` 只改注释；`infiniteCanvasClipboard.ts:21` 只改注释（行为不变）。
- 测试改写：既有"恒为 undefined"的断言 → "agent op / 剪贴板无法改变或携带既有值"。
- 验收：`pnpm --filter void-web-ui test -- InfiniteCanvasDocumentService InfiniteCanvasAgentOps infiniteCanvasClipboard`；`cargo test -p <assembly-core> canvas_tools`。

**S3 — 换算适配层**

- 落点：新建 `shared/services/canvas-short-drama/shortDramaCanvasRefBridge.ts` + 同名 `.test.ts`。纯函数，零依赖。
- 验收：`pnpm --filter void-web-ui test -- shortDramaCanvasRefBridge`；必须覆盖 `relativePath` 缺失 / 空串 / 含 `..` / 绝对路径 / workspace 不等价 五种拒绝路径。

**S4 — 短剧侧入口按钮**

- 落点：`ShortDramaCenterPanel.tsx` 新增 `onSendArtifactToCanvas?` prop + `ArtifactSendToCanvasButton` 展示组件（6 处渲染位）；新建 `app/components/panels/content-canvas/short-drama/shortDramaCanvasHandoff.ts`（判断 + 调 `canvasSurfaceCommandService.open`）；容器层接线；`locales/{zh-CN,zh-TW,en-US}/components.json` 三份文案。
- **红线自检**：面板文件净增不超过 ~40 行，不 import 画布服务，不发 DOM 事件，不触碰 `activeArtifactFocusByStage`。
- 验收：`pnpm --filter void-web-ui test -- ShortDramaCenterPanel`；`pnpm -w run check:i18n`（或仓库现行 i18n 校验命令）。

**S5 — 画布侧落卡 + 徽标 + 悬空降级**

- 落点：`InfiniteCanvasPanel.tsx`（消费 `pendingDomainImport`、`handledImportRequestIdRef` 幂等、建卡、落点算法）；`InfiniteCanvasNodes.tsx`（徽标渲染）；`InfiniteCanvasPanel.scss` + `.minimal.scss` 各一条样式（overlay 规则，不合并）；恢复路径剥离 pending import。
- 验收：`pnpm --filter void-web-ui test -- InfiniteCanvasPanel`；新增 `InfiniteCanvasPanel.domainref.test.tsx`，必须含"同一 requestId 重复送只建一张卡"与"恢复后不重复导入"两个用例。
- **第一步到此可交付给业主试手感。**

### 第二步组：回流（4 片）

**S6 — 短剧域写入纯函数**

- 落点：`ShortDramaProjectViewModel.ts` 新增 `applyShortDramaCanvasRefinement`（紧邻 `:2506`）；`ShortDramaTypes.ts` 给 revision 加两个可选字段。
- 验收：`pnpm --filter void-web-ui test -- ShortDramaProjectViewModel`；用例必须覆盖：正常落 revision+reviewing / 同 operationId 幂等 / 同 mediaItemId 幂等 / artifact 不存在原样返回 / **不产生 attempt** / `approveShortDramaArtifactReview` 之后旧 revision 仍在。

**S7 — 回流 typed service + 三道闸**

- 落点：新建 `shared/services/canvas-short-drama/shortDramaCanvasWriteBack.ts`（校验 → 调 ViewModel 纯函数 → `ShortDramaRuntimeBridge.saveProject`）+ 测试。
- 验收：`pnpm --filter void-web-ui test -- shortDramaCanvasWriteBack`；覆盖跨 workspace 拒绝 / 远程 workspace 拒绝 / 资产不存在拒绝 / 类型不匹配拒绝。

**S8 — 画布侧"送回短剧"按钮**

- 落点：`InfiniteCanvasNodes.tsx` / `InfiniteCanvasSelectionToolbar.tsx`（按钮）；`InfiniteCanvasPanel.tsx`（接线 + pending/失败态）；i18n 三份。
- 验收：`pnpm --filter void-web-ui test -- InfiniteCanvasPanel`（新增 writeback 用例）。

**S9 — 短剧侧来源说明 + 回归 + E2E**

- 落点：`ShortDramaCenterPanel.tsx` 一行来源说明（从最新 revision 推断）；扩一个 Playwright E2E：短剧送出 → 画布改 → 送回 → 短剧待审阅 → 确认。
- 验收：短剧全量 `pnpm --filter void-web-ui test -- short-drama`（~345 用例全绿）+ 两个既有 E2E 不回归 + 新 E2E 通过。
- **第二步到此可交付。**

### 第三步组：归属生成（2 片）

**S10 — 实测后端"只在成功时 attach"**（调研片，可能零代码）

- 落点：读 `jobs.rs:502` 上下文 + 媒体任务失败路径；结论写进 D0 契约。
- 若不满足 §6.2 的前提 → **S11 取消**，第三步仅保留记录层。

**S11 — 带归属的生成附 `short_drama` 坐标**

- 落点：画布生成提交处（`infiniteCanvasGenerationRuntime.ts` 一带）；`shortDramaCanvasRefBridge.ts` 加 kind→stage 映射。
- 验收：`pnpm --filter void-web-ui test -- infiniteCanvasGeneration`；手工验证 A/B 双路径落到同一条 revision（幂等生效）。

---

## 8. 风险与对策

| 风险 | 严重度 | 对策 |
| --- | --- | --- |
| **短剧回归成本**：~45 文件 / 13856 行 / ~345 用例 + 2 个 E2E。第二步动了 `ShortDramaProjectViewModel`（短剧的心脏） | 高 | S6 只**新增**一个导出纯函数，不改任何既有函数（尤其不碰 `:2448` 与 `:2506`）。每片提交前跑短剧全量。任何既有用例被迫修改 = 停下来重新设计 |
| **`ShortDramaCenterPanel.tsx` 是 orchestration hotspot** | 高 | 该文件本期只允许两次改动（S4 加 prop + 按钮、S9 加一行说明），逻辑一律外置。code review 必查净增行数 |
| **受保护能力**：revisions / attempts / change requests / fixed Skill policies / 媒体工具 | 高 | 只 append revision，**绝不**改 attempt 语义；不改任何 Skill policy、Team 定义、代理工具集（§6.1 已核实不需要） |
| **`'focus' → 'update'` 引入重复导入** | 中 | S1 与 S5 各自的幂等用例；恢复路径剥离 pending import 的专项用例 |
| **`domainRef` 开门后 AI 绕道写入** | 中 | 三道 AI 门一行不改，测试从"恒 undefined"加强为"agent op 改不动既有值" |
| **预览黑图**（误用 `thumbnailUrl`） | 中 | S5 code review 明确检查：画布内一切图源只走 `resolveInfiniteCanvasMediaPreviewUrl`（`forceDataUrl`）。加一个断言"不出现 `asset://` / `convertFileSrc` 产物"的用例 |
| **路径拼接**导致送错文件 | 中 | 换算只在 `shortDramaCanvasRefBridge.ts` 一处，禁用 join/resolve/replace，拿不到干净值就 `null`。S3 的五种拒绝路径用例 |
| **A/B 双写**造成重复 revision | 中 | 幂等键双保险：`operationId` + `mediaItemId`。S6 两个专项用例 |
| **`minimal` / `classic` 双presentation** | 低 | 新样式必须同时给 `.scss` 与 `.minimal.scss`（overlay，不合并、不删任一侧） |
| **手感不对，第一步就要推翻** | 低 | 这正是分两步的理由。S1–S5 全部可独立 revert，短剧域零改动 |

---

## 9. 审批点与需要业主拍板的选项

**开工前必须逐条确认：**

- **A0** 分两步走、第一步先交付试手感 —— 已拍板 ✅
- **A1** 回流用"修订 + 待审阅"，不新增候选数组 —— 已拍板 ✅
- **A2** `mediaCandidates[]` 本期不做 —— 已拍板 ✅（说明见 §10）

**需要拍板的三个选项：**

**选项 1 — 短剧侧入口的位置**
- ①（推荐）新增可见按钮，与既有 sr-only 焦点按钮并列。优：不污染阶段代理的焦点上下文。缺：卡片上多一个图标。
- ② 复用 `ArtifactFocusButton`。优：不加 UI。缺：一次"送去画布"会顺带改写发给阶段代理的焦点，副作用不可接受。

**选项 2 — 已经开着画布时，再送一个资产会怎样**
- ①（推荐）复用同一张画布标签，新卡加进去（策略改 `'update'`）。优：一个 workspace 一张画布，符合地基。缺：要写幂等，防重复导入。
- ② 保持现状 `'focus'`，只切标签不导入。优：零改动。缺：第二次送资产静默失效，等于功能残缺。

**选项 3 — "谁拥有数据谁负责生成"落地形态（第三步）**
- ①（推荐）画布点生成，走画布自己的管线，但**带上短剧归属坐标**，结果自动归档到该资产。优：合规、零新能力、手感在画布上。缺：严格说不是"AssetAI 亲手生成的"。
- ② 回短剧侧发起，AssetAI 用它现成的 `GenerateImage`，画布只展示与精修。优：字面上完全符合"谁拥有数据谁生成"。缺：用户要在两个面板之间来回跑。
- ③ 给 AssetAI/SplitAI 加画布工具。**不可选** —— 违反 `AGENTS.md:65` 受保护的 stage agents / fixed Skill policies，且与 MainAI 固定提示词"不得用工具去操作短剧画布"直接冲突。

---

## 10. 明确不做清单

| 不做 | 是什么 | 为什么本期不做 / 将来怎么办 |
| --- | --- | --- |
| **`mediaCandidates[]` 多候选画廊** | 给 `ShortDramaArtifact` 加一个候选图数组，一个资产同时挂 N 张待选图，用户在短剧里像画廊一样翻看挑选（画布 §7.6 的 `mediaVariants` 就是这个形态） | 它要动 manifest schema、动 Rust 侧的 `short_drama_project_tool.rs`、动短剧所有卡片的渲染，回归面覆盖那 ~345 个用例的大半。而"修订 + 待审阅"已经兑现了业主要的"不覆盖、旧图还在"。**将来真要多候选画廊时单独立项**，届时把本期的 revision 记录作为迁移来源 |
| 短剧侧嵌入画布 | 在短剧面板里直接开一块画布画 | 两个面板各自的文档生命周期会打架 |
| 双向实时同步 | 短剧改了图，画布上的卡自动跟着变 | 本期是"送一次"的快照语义，不是订阅。自动变会让用户正在精修的图凭空被换掉 |
| 视频 / 音频资产送画布 | | 画布有 video 卡但精修管线是图像管线，送过去无事可做 |
| 一个 workspace 多个短剧项目 | | 当前 `.void/short-drama/manifest.json` 就一份，§4.3 的项目校验因此可以省略 |
| 画布卡反向删除短剧资产 | | 画布永不写短剧的生命周期，只写内容 |
| `domainRef` 支持 `short-drama` 以外的模块 | | 白名单只放一个；别的模块以后自己开门 |
| 让 AI 读写 `domainRef` | | §5.1，三道门保持关闭 |

---

## 11. 验收总命令

```
pnpm -w run check:repo-hygiene
pnpm --filter void-web-ui typecheck
pnpm --filter void-web-ui lint
pnpm --filter void-web-ui test          # 全量，重点看 short-drama 与 infinite-canvas
cargo test -p <assembly-core>           # S2 涉及 canvas_tools 注释与测试
pnpm --filter void-web-ui build         # 真实构建，不能只靠 typecheck
pnpm exec playwright test               # 2 个既有短剧 E2E + 1 个新 E2E
```

**每一片提交前**至少跑该片验收命令 + 短剧全量测试；**每一组交付前**跑上面全量（含真实 build）。
