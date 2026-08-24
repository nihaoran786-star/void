# 第三期实施计划：AI 指挥画布 + 视频卡（K2.5/P3）

> **修订注记（2026-08-25）**：下方"上游依据"里对 K2 的描述"会话派发"已过时
> ——同日业主决定把画布按钮改为**前端直连**
> `submit_infinite_canvas_media_job`，不经会话与主 AI（见
> [K2 文首修订注记](2026-08-23-infinite-canvas-k2-image-tools.md)与
> [PRD §3.1](../features/infinite-canvas-and-media-tools-prd.md)）。本期的
> `CanvasOp begin_generation`（AI 主动出图）走的仍是会话工具路径，不受影响。
> 本期之后的现状与排期见
> [无限画布能力差距清单](../features/infinite-canvas-capability-gap.md)。

状态：待业主批准的实施计划（本文档只做计划，不改任何源码）
日期：2026-08-24
业主已定方向：**AI 指挥画布的指挥者 = 媒体会话的主 AI**。
上游依据：
- [无限画布与媒体工具契约规范（K0，K2 修订版）](../features/infinite-canvas-and-media-tools-prd.md)（本期将再修订 §3/§5/§6）
- [Canvas 插件平台 PRD](../features/canvas-plugin-platform-prd.md)（最高规范；§2.3 Tool = 模型可调用的类型化动作、§2.4 稳定内核条款）
- [第二期实施计划（K2 图像创作闭环）](2026-08-23-infinite-canvas-k2-image-tools.md)（已交付：会话派发 + APIMart 管线复用 + infinite_canvas 绑定回流全链路）
- `AGENTS.md`、`src/web-ui/AGENTS.md`、`CONTEXT.md`

**核心设计前提（延续 K2，业主已定）：不引入任何新 Provider、渠道或密钥。**
视频出图复用 GenerateVideo 与 K2 已验证的绑定回流模式（R2 已在
`jobs.rs` 的 `MediaJobHandle` 给 GenerateVideo 构造点留了
`infinite_canvas: None` 位，`attach_infinite_canvas_media_result` 本身已按
kind 通用，天然支持 video）。AI 指挥画布借鉴 kunpeng agent 画布工具的
**工具面设计思路**（`canvasTools.ts` 的 add/update/delete/connect +
`canvasGenerateTool.ts` 的生成入口 + `canvas_get_state` 的分级读取与
结果消毒纪律），代码按 Void 规矩全部重写，不抄实现。

---

## 1. 目标与做完能看到什么

**给业主的一段话：** 这一期让你可以直接对 AI 说话来操作画布。你在媒体
会话里说"把这三张图排成分镜""给这张图配一个赛博朋克风的变体""把
这张图做成 5 秒视频"，AI 就能自己在画布上加卡、改提示词、挑风格、
连线、排位置、发起出图出视频——你看着右边画布实时变化，出图完成后
自动落卡，和你手点按钮的效果完全一样。另外画布新增**视频卡**：把
图片卡连线到视频卡就是"图生视频"，视频做好后直接落进卡里可以播放。
所有出图出视频仍走短剧团队在用的那条通道，花钱的操作照旧需要你确认。

做完你能看到：
1. 在媒体会话里说"帮我把画布上这几张图排成分镜"，AI 读取画布现状、
   移动卡片位置、按顺序连线，画布随即更新。
2. 说"给 XX 卡生成一个赛博朋克风变体"，AI 自己建占位新卡、连线、
   发起生成（出图确认流程不变），完成后新卡变真图，原图永不被动。
3. 画布上新建"视频卡"：写提示词、把图片卡连线过来当参考，点生成 →
   卡片转圈 → 完成后视频落卡、可直接播放；已有视频的卡再生成 = 派生
   连线新卡，原视频不动（与图片卡同一套规则）。
4. AI 同样能发起图生视频：建视频占位卡 + 绑定 + 调 GenerateVideo。
5. AI 不能乱来：单次操作数量有上限；**带图/带视频的卡 AI 不能删**
   （只能删空卡和失败占位卡），要删真卡必须你自己在画布上动手；
   已有媒体的卡的内容在任何路径下都改不掉（K2 不变量延续）。
6. K2 的手动三入口（空卡文生图、再生成、五件套）与短剧中心行为
   一字不变。

**本期不覆盖**：分组卡渲染（明确排除，见 §5 与 §2.4）、蒙版画笔、
工坊同步（K3）、导演台、多文档、批量 n>1。

### 细节（供执行 AI）

三条能力线，全部长在 K2 已验证的骨架上：

- **AI 读画布**：新增 Rust 工具 `CanvasRead`——读取 workspace 内持久化
  的默认画布文档投影，AI 由此获得 workspaceId/documentId/节点/连线现状。
- **AI 改画布**：新增 Rust 工具 `CanvasOp`——typed 批量操作
  （add_node/update_node/connect/disconnect/delete_node/begin_generation），
  工具只做校验 + 生成 ID + 落操作日志 + 回显；前端新增
  `InfiniteCanvasOpsBridge` 监听 tool-run-event，把操作经
  `mutateDefaultDocument` 应用——**完全复制 K2 MediaBridge 的
  "后端回执、前端落位"模式**。
- **AI/用户发起生成**：图片沿用 GenerateImage + `infinite_canvas` 绑定
  （零改动）；视频为 GenerateVideo 补上对等的 `infinite_canvas` 绑定
  （R1 镜像），回流走同一个 MediaBridge。

---

## 2. 核心架构选型与理由

### 2.1 AI 的画布操作指令如何落到前端画布文档

**给业主的一段话：** 画布的真身是前端管的一个文件，AI 住在后端，它的
指令要"寄"到前端才能生效。我们推荐 A 路：给 AI 一个专门的"画布
操作工具"，它像 K2 出图的"回邮标签"一样只负责把指令登记好、寄出去，
前端收到后按既有的安全通道落进画布。这条路和 K2 已经跑通的回流机制
是同一个模子，所有防覆盖、防串线的闸门直接复用。B 路（AI 直接改
画布文件）看似省事，但绕开了安全通道，两边同时写同一个文件必然
互相覆盖，直接否决。

### 细节（供执行 AI）

画布真相在前端 Domain Module（`.void/infinite-canvas/<documentId>.json`，
经 `InfiniteCanvasDocumentService` CAS + 防抖合并写入）。候选路径：

| | 路径 A（推荐）：CanvasOp 工具回执 + 前端 OpsBridge 落位 | 路径 B：AI 用 Write/Edit 直改文档 JSON | 路径 C：Rust 直写文档文件 |
|---|---|---|---|
| PRD §2.3 合规 | ✅ Tool 是模型可调用的类型化动作；应用仍走 Module Interface | ❌ 绕过 Module Interface，无 typed 契约 | ❌ 两个 writer 抢同一文件 |
| CAS/防抖/revision | ✅ 与用户拖拽同走 `mutateDefaultDocument`，天然并发安全 | ❌ 与前端防抖写盘竞态，必然互相覆盖 | ❌ 同左，且 revision 语义被破坏 |
| 不变量复用 | ✅ mediaRef 不可变、跨 workspace 拒收、幂等——MediaBridge 同款闸门 | ❌ 全部靠模型自觉 | ❌ 需在 Rust 复刻全部校验 |
| 已验证先例 | ✅ K2 MediaBridge"后端回执、前端落位"整套测试形态可镜像 | 无 | 无 |
| 弱点 | 工具回执是同步的、前端应用是异步的（§2.2 定义语义与兜底） | — | — |

**决定：路径 A。** 工具本身零文件写入画布文档；唯一合法写入通道仍是
`mutateDefaultDocument`。稳定内核（Session 事件、workspace 身份、权限、
Module Interface 写入边界）零触碰。

### 2.2 "已受理"语义与操作日志（防面板未挂载时指令丢失）

CanvasOp 是同步回显、前端异步应用，因此工具结果对 AI 的语义**只是
"指令已受理并登记"，不是"已生效"**——工具描述必须写明。两个配套设计：

1. **ID 前置生成**：新节点/新边/操作的 ID 由 CanvasOp 在回执中即时生成
   （`node-…`/`edge-…`/`op-…`），AI 无需等待前端应用即可在后续调用
   （如 GenerateImage 绑定）中引用这些 ID。所有操作按 ID 幂等：
   add 已存在 = no-op、delete 不存在 = no-op、update 同值 = no-op，
   重复事件/重放天然无害。
2. **操作日志（journal）兜底**：桥接只在画布面板挂载期间监听（与
   MediaBridge 同款取舍）。CanvasOp 在校验通过后把规范化操作批次原子
   追加到 `.void/infinite-canvas/<documentId>.ops.json`（Rust 侧持有
   进程内互斥，批次带单调递增 `seq`；日志有界，只保留最近 200 批次，
   Rust 追加时裁剪）。画布文档新增加法字段
   `agentOps?: { appliedSeq: number }`；OpsBridge 应用时（无论来自
   实时事件还是加载对账）严格按 seq 升序、只应用 `seq > appliedSeq`
   的批次，并在同一次 mutate 里推进水位。**前端永不写日志文件**
   （只读，复用 `InfiniteCanvasMediaJobReader` 的端口形态），Rust 永不
   写画布文档——两个文件各有唯一 writer，无竞态。
   面板加载时的日志对账与 K2 W7 的 pending 对账在同一个挂载钩子里
   依次执行（先 ops 对账，再 pending 对账）。

### 2.3 AI 发起生成的编排顺序（复用 K2 全链路，一步不改回流）

AI 直接调 GenerateImage/GenerateVideo + 绑定即可；`SessionImageGenerationGateway`
的消息派发线（用户按钮入口）保持不变，两条入口在
"GenerateImage/GenerateVideo + infinite_canvas 绑定 + MediaBridge 回流"
处汇合，仍然只有一条提交/回流管线。AI 侧的标准编排（写进工具描述）：

1. `CanvasRead` → 获得 `workspaceId`、`documentId`、节点/连线现状。
2. `CanvasOp` 带一个 `begin_generation` 操作 → 工具生成
   `operationId`（+ derived 模式的占位 `nodeId` 与派生 `edgeId`），
   在画布文档里登记 `generation`（经 OpsBridge 落位），并且**回执中
   直接给出拼装完毕的绑定 JSON**，AI 原样复制——比 K2 的消息模板
   约束更强，绑定从此是机器生成的。
3. 本地参考图先 `UploadMediaImage`（K2 §2.2 规则原样适用）。
4. 调 `GenerateImage`（或视频卡 → `GenerateVideo`），`infinite_canvas`
   参数 = 第 2 步回执的绑定 JSON。
5. 回流、落卡、失败分类、pending 对账——K2 现有代码路径，零改动。

时序缝隙说明：GenerateImage 的 Started 事件可能先于 CanvasOp 落位被
MediaBridge 处理——其 pending 意图本就是 no-op 确认，落不到节点时返回
typed `operation_not_found` ignored，无害；Completed 在轮询结束后到达，
远晚于 ops 应用。面板关闭期间完成 → K2 W7 对账已覆盖（generation 已
随 ops 日志对账落进文档）。

`CanvasRead` 的新鲜度语义：读取的是**最后持久化**的文档（防抖写盘 +
异步应用，可能滞后一两秒）；工具描述明示"刚提交的 CanvasOp 可能尚未
体现，规划依赖最新状态时应稍后重读"。

### 2.4 防失控设计（业主关切项逐条落）

- **单轮操作上限**：单次 CanvasOp ≤ 20 个操作，超出 typed
  `invalid-input` 整批拒绝（不部分执行）；其中 `begin_generation` ≤ 3。
- **删除保护**：`delete_node` 只允许删除**无 `mediaRef`** 的节点
  （空卡、失败占位卡）；对带图/带视频的卡返回 typed 拒绝并附理由
  ——按业主既定规矩，真卡删除必须由用户在 UI 亲手执行。前端 OpsBridge
  对此**双重把关**（即使回执被篡改也拒绝），与 resultMode 交叉校验
  同款纵深。
- **mediaRef 不可变不变量延续**：`update_node` 的可写字段白名单 =
  `prompt`/`text`/`stylePresetId`/`position`/`size`；`mediaRef`、
  `derivedFrom`、`generation`、`domainRef` 不在白名单，后端校验拒绝 +
  前端应用层忽略，测试断言。
- **跨 workspace/文档校验沿用 K2**：CanvasOp/CanvasRead 在 Rust 侧校验
  文档文件存在于当前会话 workspace root 且内容 workspaceId/documentId
  与入参一致；OpsBridge 再做与 MediaBridge 同款的
  workspace_mismatch/document_mismatch 拒收。remote workspace 继续
  fail-closed。
- **花钱闸门不变**：CanvasOp/CanvasRead 本身不花钱、无审批诉求；
  GenerateImage/GenerateVideo 的既有工具审批与回执卡片照旧。
- **group 卡防线**：schema 虽有 `kind:'group'`（W1 遗留、无渲染器），
  CanvasOp 的 add_node 只接受 `text`/`image`/`video`——不允许 AI 创建
  当前渲染不出来的节点（见 §5 的排除决定）。

---

## 3. 契约设计

**给业主的一段话：** 这一节把三样新东西的"格式"定死：AI 的两个画布
工具长什么样、视频卡在文件里怎么存、视频任务的"回邮标签"和图片有
什么区别。都是在 K2 契约上做加法，老文档、老功能读起来完全无感。

### 细节（供执行 AI）

#### 3.1 CanvasRead 工具（Rust，只读）

- 定位：`media_tools.rs` 同级新文件
  `implementations/canvas_tools.rs`（工具注册与曝光对照 GenerateImage 在
  `registry.rs` / `implementations/mod.rs` / `agents/definitions/modes/media.rs`
  `default_tools` 的接线方式；`default_exposure = Collapsed`）。
- input：`{ "detail": "summary" | "full" }`（默认 summary）。无 documentId
  参数——每 workspace 一个默认文档（K2 条款），工具扫描
  `<workspace>/.void/infinite-canvas/` 下唯一文档文件。
- 输出（借鉴 kunpeng `canvas_get_state` 的分级 + 消毒纪律，重写实现）：
  `workspaceId`、`documentId`、`revision`、节点摘要
  （nodeId/kind/position/size/hasMedia/prompt 截断 240 字/stylePresetId/
  generation 状态/derivedFrom）、edges 全量（顺序即垫图参考顺序）、
  `agentOps.appliedSeq`。full 级附完整 text 字段（每字段截断 4000 字）。
  **绝不回显 base64 或媒体内容**（mediaRef 本就是路径引用）。
- typed 失败：文档不存在（提示先在会话中打开画布让首个文档创建）、
  JSON 损坏、schemaVersion 不识别——均为正常工具结果，不 panic。

#### 3.2 CanvasOp 工具（Rust，typed 批量操作 + 日志 + 回执）

input（typed schema，宽松字段与别名一律拒绝——与 kunpeng 的别名容错
相反，Void 走严格 schema 路线，错误信息里给纠正建议）：

```jsonc
{
  "workspaceId": "…",          // 必填；须与文档内容一致
  "documentId":  "…",          // 必填；同上
  "ops": [                     // 必填；1..=20，原子批次：任一非法整批拒绝
    { "op": "add_node", "kind": "text|image|video",
      "position": { "x": 0, "y": 0 }, "size": { "width": 0, "height": 0 },   // size 可选
      "text": "…", "prompt": "…", "stylePresetId": "…" },                     // 均可选
    { "op": "update_node", "nodeId": "…",
      "set": { "prompt": "…", "text": "…", "stylePresetId": "…",
               "position": {…}, "size": {…} } },   // 白名单外字段 → invalid-input
    { "op": "connect",    "sourceNodeId": "…", "targetNodeId": "…" },
    { "op": "disconnect", "edgeId": "…" },
    { "op": "delete_node", "nodeId": "…" },        // 仅无 mediaRef 节点
    { "op": "begin_generation",
      "mode": "self" | "derived",
      "nodeId": "…",            // self 模式必填 = 目标空卡
      "sourceNodeId": "…",      // derived 模式必填 = 派生源卡
      "toolId": "generate|upscale|expand|inpaint|erase|matting",
      "mediaKind": "image" | "video",   // 默认 image；video 仅 toolId=generate
      "prompt": "…", "stylePresetId": "…" }
  ]
}
```

- 工具行为：校验（含对文档文件的一次只读快照校验：引用的 nodeId 存在、
  delete 目标无 mediaRef、self 目标无 mediaRef——**快照校验是尽力而为，
  前端应用层按最新文档重验，以前端为准**）→ 为 add_node/connect/
  begin_generation 生成 `nodeId`/`edgeId`/`operationId` → 规范化批次
  `{ seq, batchId, ops }` 原子追加到
  `.void/infinite-canvas/<documentId>.ops.json` → 回执。
- 回执：`{ status: "accepted", seq, batchId, createdNodeIds, createdEdgeIds,
  generations: [{ operationId, nodeId, binding: {…完整 §3.4 绑定 JSON…} }] }`
  + 明文说明"操作已受理，画布打开时即刻生效；binding 请原样用于
  GenerateImage/GenerateVideo 的 infinite_canvas 参数"。
- 事件面：工具结果随既有 ToolEvent Completed →
  `EventHandlerModule.emitAgentToolRunEventForObservers` →
  `globalEventBus 'agent:tool-run-event'`（`AgentToolRunObserverEvent`
  已含 `toolName`/`params`/`result`，OpsBridge 按 `toolName === 'CanvasOp'`
  过滤）。零新事件通道。
- `begin_generation` 生成的操作在前端应用时精确复用既有纯函数：
  self → `beginSelfGenerationContent`；derived →
  `beginDerivedOperationContent`（W2 已交付、含幂等与 mediaRef 保护）。

#### 3.3 视频卡 schema（加法，schemaVersion 仍 '1'）

- `InfiniteCanvasNodeKind` 增加 `'video'`；`InfiniteCanvasNode.mediaRef`
  语义不变（引用 `media/generated/<batch>/video-001.mp4` 等）。
- `generation` 增加可选 `mediaKind?: 'image' | 'video'`（缺省 image）；
  `InfiniteCanvasDocument` 增加可选 `agentOps?: { appliedSeq: number }`。
- 解析器容错条款照旧：损坏值按字段缺失处理。**已知取舍**：K2 的旧
  解析器遇到 `kind:'video'` 节点会整节点丢弃（unknown kind 跳过），
  即"旧代码读新文档"对视频卡不是无损——写进契约修订并列入 §6 风险
  （同仓库前滚式发布可接受；W1 解析切片必须最先合入）。
- 空白视频卡 = `kind:'video'`、无 mediaRef、有 prompt；派生视频占位卡 =
  `kind:'video'` + `derivedFrom` + `generation{mediaKind:'video'}`。
  resultMode 规则与图片完全一致：self 仅限空视频卡首次生成。

#### 3.4 GenerateVideo 的 infinite_canvas 绑定（R1 对等扩展）

绑定对象 = K2 §3.1 原样 + 可选 `"mediaKind": "video"`（GenerateImage
绑定不带或为 image）。后端流转与 GenerateImage 完全对齐：

- input_schema 增加可选 `infinite_canvas`（描述文案镜像 GenerateImage）；
- `call_impl` 开头提取 → `client_or_not_configured` 与分类提交错误路径
  补 `attach_infinite_canvas_receipt_to_results`（GenerateImage R1 同款）；
- `MediaJobHandle.infinite_canvas` 由 `None` 改传实值；
- 提交回执与 `submitted_but_task_id_missing` 路径补
  `attach_infinite_canvas_submission_receipt`；
- 完成充实**零新代码**：`attach_infinite_canvas_media_result` 已按 kind
  通用（`outputMediaKind:"video"` 自动写入）。
- **不改 short_drama 任何函数**；GenerateVideo 的 short_drama 行为不变。

#### 3.5 前端回流的 kind 交叉校验（MediaBridge 唯一改动点）

MediaBridge resolve 前新增一条闸门：绑定/回执的 `outputMediaKind`（或
绑定 mediaKind）与落位节点的 `kind` 不匹配（video 结果 → image 卡，或
反之）→ typed ignored（新 reason `media_kind_mismatch`），不写入。其余
K2 回流行为一行不改。

#### 3.6 契约文档修订（属于本期交付）

修订 `docs/features/infinite-canvas-and-media-tools-prd.md`：
- §3：新增"第三期合法实现 = AI 直调 + CanvasOp 回执/OpsBridge 落位"
  条款与 CanvasRead/CanvasOp 契约（§3.1/§3.2）；绑定对象增补
  `mediaKind`；GenerateVideo 纳入绑定适用范围；kind 交叉校验条款。
- §5：`'video'` 节点 kind、`generation.mediaKind`、`agentOps` 水位字段、
  ops 日志文件与"两文件各一 writer"条款；记录旧解析器丢弃 video
  节点的已知取舍。
- §6 阶段边界同步更新（AI 指挥画布与视频卡自 P3 起为已覆盖项）。

---

## 4. 分步任务拆解

**给业主的一段话：** 一共 10 片：1 片契约文件，3 片 Rust（视频通道
接标签、AI 的"读画布"工具、AI 的"改画布"工具），5 片网页端（先
数据格式，再落位管道和对账，再视频界面，最后收尾全检），外加收尾。
每片独立提交、独立回滚，界面片和收尾片必须真跑完整构建。

> 建议分支：`codex/infinite-canvas-p3-agent-canvas`。每片一个独立提交。
> 按业主既往教训（MEMORY）：**W5/W6 必须真跑 `pnpm run build:web`**，
> 不得以 type-check/lint 绿替代；i18n 新 key 必须走完整契约流程。

### D0：契约修订（纸面，无代码）

- 改动落点：`docs/features/infinite-canvas-and-media-tools-prd.md`
  （§3.6 所列三处）；本计划获批后链入 `docs/README.md`。
- 验收：文档评审通过 + `pnpm run check:repo-hygiene`。

### Rust 端

**R1：GenerateVideo 接受并透传 infinite_canvas 绑定**

- 改动落点：`src/crates/assembly/core/src/agentic/tools/implementations/media_tools.rs`
  （§3.4 全部行为；镜像 GenerateImage 的 K2-R1 改法，含同步失败回执）。
- 测试：镜像既有 `generate_image_schema_declares_optional_infinite_canvas_binding`
  等用例写 video 版；带绑定提交回执回显；不带绑定行为不变；
  `jobs.rs` 既有 `attaches_infinite_canvas_metadata_to_saved_media_batch`
  补一条 kind="video" 断言（`outputMediaKind:"video"`）。
- 验收：`cargo test --locked -p void-core media` + `cargo check --workspace`。

**R2：CanvasRead 工具**

- 改动落点：新文件 `implementations/canvas_tools.rs`（§3.1）+
  `implementations/mod.rs`、`registry.rs`（含两处清单断言测试更新）、
  `product_runtime.rs` 清单、`agents/definitions/modes/media.rs`
  `default_tools` 追加。
- 测试：summary/full 投影字段；文本截断；文档缺失/损坏/版本不识别的
  typed 结果；不回显媒体内容。
- 验收：`cargo test --locked -p void-core` + `cargo check --workspace`。

**R3：CanvasOp 工具 + 操作日志**

- 改动落点：同 `canvas_tools.rs`（§3.2 校验、ID 生成、seq 互斥分配、
  日志原子追加与 200 批次裁剪、绑定回执拼装）+ 注册接线同 R2。
- 测试：ops 上限与原子拒绝；delete 带 mediaRef 拒绝；update 白名单；
  begin_generation self/derived 的 ID 与绑定回执形态；日志 seq 单调 +
  裁剪；workspaceId/documentId 不匹配拒绝；group kind 拒绝。
- 验收：`cargo test --locked -p void-core` + `cargo check --workspace`。
  R1-R3 合并跑一次全量 `cargo test --locked -p void-core`（短剧 + K2
  图像用例全绿是回归门）。

### Web 端

**W1：schema 加法——video kind、mediaKind、agentOps 水位**

- 改动落点：`shared/services/infinite-canvas/InfiniteCanvasTypes.ts`、
  `InfiniteCanvasDocumentService.ts`（parseNode 接受 'video'；
  parseGeneration 容错读 mediaKind；文档级 agentOps 容错解析）。
- 测试：video 节点 round-trip；坏 mediaKind/agentOps 丢弃不炸；旧文档
  无损；**新文档含 video 节点时其余节点解析不受影响**。
- 验收：目标 Vitest + `pnpm run type-check:web` + `check:core-boundaries`。

**W2：ops 应用纯函数（applyCanvasAgentOps）**

- 改动落点：`shared/services/infinite-canvas/` 新文件
  `InfiniteCanvasAgentOps.ts`——批次/操作的 typed 解析 +
  `applyAgentOpsContent(document, batch)` 纯函数：seq ≤ appliedSeq 整批
  no-op；逐 op 应用（幂等语义见 §2.2-1；delete 带 mediaRef 忽略并记
  拒绝原因；update 白名单过滤；begin_generation 委托
  panelModel/generationModel 既有 content 助手——若 import 方向不允许
  app→shared 反转，则把 `beginDerivedOperationContent`/
  `beginSelfGenerationContent` 下沉到 shared（纯函数无依赖，属合法
  搬移，app 层保留 re-export，测试同步搬移）；本片内定夺并记录）；
  末尾推进 appliedSeq。
- 测试：幂等重放；**已有 mediaRef 节点在一切 op 下逐字段不变**；
  白名单外字段被忽略；seq 乱序拒绝；批内 add→connect 前后依赖成立。
- 验收：目标 Vitest + `type-check:web`。

**W3：InfiniteCanvasOpsBridge + 日志对账**

- 改动落点：`shared/services/infinite-canvas/InfiniteCanvasOpsBridge.ts`
  （订阅 'agent:tool-run-event'，`toolName === 'CanvasOp'` 且
  eventType Completed、result.status === 'accepted' → 从 result 提取批次
  → workspace/document 交叉校验 → `mutateDefaultDocument` +
  `applyAgentOpsContent`；结构对照 `InfiniteCanvasMediaBridge`）+
  `InfiniteCanvasOpsReconciliation.ts`（面板加载后读
  `<documentId>.ops.json`，按 seq 应用 > appliedSeq 的批次；文件缺失/
  损坏 = typed no-op；复用 `InfiniteCanvasMediaJobReader` 端口形态）。
- 同片顺带 §3.5：MediaBridge 增加 `media_kind_mismatch` 交叉校验
  （改动 ≤ 20 行 + 用例）。
- 测试（镜像 MediaBridge.test 形态）：落位成功；跨 workspace/文档
  ignored；重复事件幂等；日志对账三路径（全新批次/半应用/全应用）；
  media bridge 的 video-on-image、image-on-video ignored 用例。
- 验收：目标 Vitest + `type-check:web`。

**W4：视频生成派发线（用户按钮入口）**

- 改动落点：`SessionImageGenerationGateway.ts` 泛化出视频路径（或平级
  `SessionVideoGenerationGateway.ts`，以文件体量定）：视频任务消息模板
  （GenerateVideo + image_urls 按连线顺序 + 绑定 JSON 带
  `mediaKind:'video'` + n=1 + 时长/分辨率留给 AI 判断的措辞）；
  `infiniteCanvasGenerationModel.ts` 增加
  `addBlankVideoCardContent`/视频版 begin-self 校验（self 仅限空视频卡）；
  `collectReferenceNodes` 复用（参考仍须是有图的图片卡；视频卡作参考
  本期拒绝，typed `invalid-input`）。
- 测试：消息模板含 GenerateVideo 指令与 mediaKind 绑定；空视频卡
  self / 有视频卡 derived 规则；图片参考顺序；视频卡作参考被拒。
- 验收：目标 Vitest + `type-check:web` + `check:core-boundaries`。

**W5：面板 UI 闭环**

- 改动落点（均在 `content-canvas/infinite-canvas/`）：
  - `InfiniteCanvasPanel.tsx`：挂载时连接 OpsBridge（与 MediaBridge
    同一处，卸载即断开）；加载后执行 ops 对账 → 既有 pending 对账；
    工具栏新增"新建视频卡"；视频卡派发编排复用图片卡三步
    （先落 pending 再发送，失败回滚 failed）。
  - `InfiniteCanvasNodes.tsx`：`kind:'video'` 渲染——`<video controls
    preload="metadata">`（媒体 URL 解析复用图片卡现有 mediaRef →
    可显示 URL 的同一条助手路径；不自动播放；卡不在视口时不加载
    数据——preload=metadata 即满足，不额外做 IntersectionObserver）；
    prompt 输入区/生成按钮/pending/failed/重试与图片卡同套组件复用。
  - i18n：三语 `infiniteCanvas.video.*`（视频卡、生成中、失败、重试、
    参考限制提示）走 `pnpm run i18n:generate` 契约流程。
  - 不碰 `PanelContentType`/`FlexiblePanel`/`ContentCanvas` 分支（P0
    退出门条款复检）。
- 测试：行为测试（建视频卡→连图→生成→占位→桥接事件→视频落卡；
  CanvasOp 事件到达→画布投影更新；AI 删真卡被拒的投影不变）。
- 验收：目标 Vitest + `type-check:web` + `lint:web`（定向）+
  `i18n:contract:test` + `i18n:audit` + **`pnpm run build:web`**
  （新增代码全部留在 surface chunk，入口预算不动）。

**W6（收尾）：全量门 + 手工验收**

- 手工验收清单（业主实机点检）：
  1. 媒体会话里说"在画布上加三张空图卡并排成一行"→ AI 调
     CanvasRead/CanvasOp → 画布出现三张卡、位置整齐；
  2. 说"把这三张卡连到一张新卡上当参考"→ 连线出现、顺序正确；
  3. 说"给 XX 卡生成赛博朋克风变体"→ 占位新卡 + 连线 → 审批出图 →
     新卡变真图，原卡未动；
  4. 让 AI 删一张**有图的卡** → AI 回复被拒绝的理由，画布无变化；
     让 AI 删一张空卡 → 删除成功；
  5. 画布关闭时让 AI 加卡 → 重新打开画布 → 卡片经日志对账出现；
  6. 手动：新建视频卡、连两张图、写提示词、点生成 → 转圈 → 视频落卡
     可播放；对已有视频的卡再生成 → 派生新卡，原视频未动；
  7. AI 图生视频全流程（begin_generation mediaKind=video +
     GenerateVideo 绑定）→ 视频落进 AI 建的占位卡；
  8. 断开 APIMart token → 视频生成显式失败态可重试（不是永远转圈）；
  9. K2 回归：空卡文生图、垫图、五件套各走一次，行为与 P3 之前一致；
  10. 短剧中心完整走一次图/视频生成 → 行为一字不变（回归）。
- 最终验收命令（全量门）：相关目标 Vitest 全绿 +
  `pnpm run type-check:web` + `pnpm run lint:web` +
  `pnpm run check:core-boundaries` + `pnpm run check:repo-hygiene` +
  `pnpm run i18n:contract:test` + `pnpm run i18n:audit` +
  `pnpm run build:web` + `cargo test --locked -p void-core` +
  `cargo check --workspace`；按仓库惯例跑一次
  `pnpm --dir src/web-ui run test:run` 确认无回归。
- 通过后更新 `CONTEXT.md` 与契约文档阶段状态。

---

## 5. 明确不做清单（P3 之外）

- ❌ **分组卡（kind:'group'）渲染**——明确排除。理由：AI 排布分镜用
  位置坐标即可达成产品目标；group 渲染是一块独立的 UI 工程（嵌套
  拖拽、父子坐标系、折叠），与本期两条主线无耦合；为防 AI 创建渲染
  不出的节点，CanvasOp 拒绝 group（§2.4）。列为 K4 候选，届时连同
  用户手动建组一起立项。
- ❌ 蒙版画笔（像素级遮罩 inpaint/erase）
- ❌ 画布 ↔ 短剧/工坊双向同步、`domainRef` 赋值（K3）
- ❌ 导演台 3D 预演、多文档、协作分享（K5）
- ❌ 批量出图/出视频（`n` 固定 1）；CanvasOp 单批 ≤ 20 也不放宽
- ❌ 自动布局算法工具（kunpeng canvas_auto_layout 形态）——AI 自行
  计算坐标经 update_node 落位即可，算法工具另议
- ❌ 音频卡、全景卡等其他 kunpeng 节点类型
- ❌ 视频卡作为垫图参考输入（视频参考的模型语义未定，本期拒绝）
- ❌ AI 删除带媒体的卡（含"AI 请求-用户确认"流程——若业主后续想要，
  另行小片立项）
- ❌ 新 Provider / 渠道 / 密钥；路径 B/C 直写画布
- ❌ 远程 workspace（继续 fail-closed）
- ❌ 修改短剧任何 runtime 行为、`attach_short_drama_media_result`、
  `ShortDramaCenterPanel.tsx`（AGENTS.md 热点保护）

---

## 6. 风险与对策

**给业主的一段话：** 主要风险都有兜底：AI 说"改好了"但画布没开着
——指令会存进一个待办日志，画布一打开就补做；AI 想删不该删的、改
不该改的——后端前端两道闸门都会拦；视频文件比图片大——播放器只在
你点播放时才加载数据；老版本程序打开带视频卡的画布会看不见视频卡
——我们把解析升级放在第一片，并写明这个已知取舍；短剧和 K2 的老
功能全程用它们现有的测试护航，一行不改它们的逻辑。

### 细节（供执行 AI）

1. **回执与应用的异步缝隙**：AI 的"成功"= 已受理（§2.2 语义）。
   兜底 = ops 日志 + appliedSeq 水位对账；CanvasRead 新鲜度语义写进
   工具描述。不追求同步确认通道（那需要新的前端→后端 ACK 端口，
   违背本期"零新端口"边界）。
2. **两文件双 writer 竞态**：设计上排除——画布文档唯一 writer 是前端
   DocumentService（CAS），ops 日志唯一 writer 是 Rust CanvasOp
   （进程内互斥 + 原子写）。测试断言前端代码不 import 任何日志写路径。
3. **模型乱构绑定/乱发操作**：绑定由 CanvasOp 回执机器生成并要求
   原样复制；即便被篡改，MediaBridge 的 operationId 锚点 + resultMode +
   media_kind 交叉校验 + mediaRef 不可变四道闸兜底。CanvasOp 的批次
   在前端按白名单/删除保护重验，后端校验只是第一道。
4. **旧解析器丢弃 video 节点**（§3.3 已知取舍）：W1 最先合入；回滚
   策略 = 回滚整期而非只回滚 W1；契约修订记录该取舍。不做 schema
   版本升级（加法字段 + 新 kind 不值得触发 incompatible 全拒绝——
   那会让旧版本连整个文档都打不开，代价更大）。
5. **ops 日志膨胀/损坏**：200 批次环形裁剪；损坏 JSON 对账时按空日志
   处理（typed no-op，不炸面板）；日志只影响"面板关闭期间的补做"，
   丢失的最坏后果 = AI 指令未生效，AI/用户可重发，无数据破坏面。
6. **视频体积与渲染性能**：`preload="metadata"`、不自动播放、复用
   asset URL 解析；surface chunk 预算由 W5/W6 的 `build:web` 双重把守。
7. **短剧/K2 回归**：Rust 改动全部加法（GenerateVideo 补绑定 = 镜像
   GenerateImage 已验证改法；新工具是新文件）；R3 验收强制全量
   `cargo test -p void-core`；W6 手工清单含短剧与 K2 三入口点检。
   任何需要改既有行为的发现 = 立即停手上报业主。
8. **registry 清单断言**：新工具会改动 `registry.rs`/`product_runtime.rs`
   的稳定清单测试——按测试注释语义同步更新断言即视为契约变更的
   显式记录，不绕过。
9. **既有基线债**（Desktop lib-test fixture 等已记录阻断）不计入本期
   失败，也不顺手修。

---

## 7. 审批点

| # | 审批点 | 决策内容 |
|---|---|---|
| B1 | 动工前（本文档） | 批准整体计划 + 确认路径 A（CanvasOp 回执/OpsBridge 落位）+ 确认删除保护规则（AI 只能删无媒体卡）+ 确认 group 卡明确排除 + 确认契约修订方向（D0） |
| B2 | R1-R3 合入后 | 业主确认：短剧出图出视频与 K2 画布出图实测无任何变化；AI 在会话里调 CanvasRead/CanvasOp 有合法回执（画布侧尚未落位属预期）；批准继续 Web 端 |
| B3 | W6 验收 | 业主按 §4-W6 手工清单实机验收（含 AI 指挥排分镜、AI 变体出图、视频卡图生视频各一次真实运行）；通过后更新 `CONTEXT.md`、契约文档状态并推送 |

每个审批点之间可独立回滚：D0 还原文档；R1-R3 为纯加法（新工具 +
GenerateVideo 可选字段）可整体 revert 且不影响现有数据；W1-W5 各为
独立提交；schema 变更均为可选字段/新 kind，回滚代码后新文档中的
video 节点与 agentOps 字段被旧解析器按已知取舍处理（§6-4），画布
其余内容与所有媒体文件不受影响。
