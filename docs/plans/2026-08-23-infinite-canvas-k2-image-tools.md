# 第二期实施计划：无限画布图像创作闭环真通电（K2）

> **修订注记（2026-08-24，业主决定，已实施）**：本计划 §2 的"路径 A（画布
> 按钮 → 结构化消息进会话 → 媒体 AI 调 GenerateImage）"选型已被推翻。画布
> 上的生成/再生成/五件套按钮改为**前端直连后端出图管线**：新桌面命令
> `submit_infinite_canvas_media_job`（复用 GenerateImage/GenerateVideo 的
> 共享提交编排与 UploadMediaImage 上传内核）→ 后台轮询 → 完成事件经
> `infinite-canvas://media-job-event` 转发到 `agent:tool-run-event`，由既有
> InfiniteCanvasMediaBridge 落卡，全程无 AI 参与。会话路径仅保留给"用户在
> 会话里让主 AI 生成"（GenerateImage 工具与 CanvasOp begin_generation 不
> 变）。前端 gateway 切换为 `DirectImageGenerationGateway`；§2.1 提示词/
> 风格拼装与 §3.1 绑定对象的规则原样保留。详见 PRD §3.1 对应修订。

状态：待业主批准的实施计划（本文档只做计划，不改任何源码）
日期：2026-08-23（同日修订：按业主要求由"五件套通电"扩为"完整创作闭环"）
上游依据：
- [无限画布与媒体工具契约规范（K0）](../features/infinite-canvas-and-media-tools-prd.md)（本期将修订其 §3/§4/§5）
- [Canvas 插件平台 PRD](../features/canvas-plugin-platform-prd.md)（最高规范）
- [第一期实施计划（K0+K1+M1-M4）](2026-08-22-infinite-canvas-plugin-phase1.md)（已交付：画布、风格库、五件套占位）
- `AGENTS.md`、`src/web-ui/AGENTS.md`、`CONTEXT.md`

**核心设计前提（业主已定）：K2 不引入任何新 Provider、渠道或密钥。**
画布图像能力全部复用 Void 现有媒体生产线——AI 短剧团队在用的
GenerateImage / UploadMediaImage 工具与其背后的 APIMart 客户端管线
（`src/crates/assembly/core/src/agentic/tools/implementations/media_tools.rs`、
`src/crates/assembly/core/src/agentic/media/`）。做法是照抄短剧已经验证过的
"绑定标签回流"模式：提交时挂一个绑定对象，媒体完成后按标签自动挂回原处。

---

## 1. 目标与做完能看到什么

**给业主的一段话：** 这一期把画布变成一条完整的创作流水线，对标 kunpeng
画布的用户流程。**本期覆盖的完整用户旅程是：文生图底图 → 挂风格 →
连线垫图参考 → 五件套派生编辑 → 每一步的成品都作为新版本回流画布。**
具体说：你可以在画布上新建一张空卡，直接在卡上写提示词、挑一个风格，
点"生成"，图就落进这张卡（这是起点，从零出图）；把几张图用线连到另一
张卡上，那些图就成了它的"垫图"参考，提示词里可以说"@图一的构图、
@图二的配色"；已经有图的卡，无论是再点生成还是用五件套（扩图/重绘/
擦除/抠图/放大），都会长出一张连着线的新卡，原图永远不动。所有出图走
的都是短剧团队每天在用的那条通道，不配任何新账号或密钥。
**本期不覆盖**：视频卡、蒙版画笔（圈选区域重绘）、AI 主动指挥画布，
这些在后期（见 §5）。

做完你能看到：
1. 画布工具栏多一个"新建生成卡"：空卡上有提示词输入框、风格选择、
   "生成"按钮；点生成 → 卡片转圈 → 完成后图直接落进这张卡。
2. 图片卡上挑过的**风格预设**真正参与出图：风格提示词自动拼进生成指令。
3. 把图片卡连线到另一张卡 = 给它垫图。参考顺序就是连线的先后顺序，
   卡上按顺序显示"图一/图二"角标，提示词里 @图一/@图二 按此指代。
4. 已有图的卡再次生成、或点五件套按钮（补完预填指令后确认）→ 旁边
   出现"生成中"的新卡并连线回原卡；完成变真图，失败显示明确原因、
   可重试或删除。原图与历史版本永不被覆盖。
5. 左侧会话里能看到每次出图的完整回执（和短剧出图一模一样的工具卡片），
   AI 有权拒绝不合理请求或提醒补充信息。
6. 短剧中心的一切出图行为保持原样，一个字节都不改它的现有语义。

### 细节（供执行 AI）

"真通电"的准确定义：三个入口（空卡文生图、有图卡再生成、五件套）
**共用同一条提交/回流/绑定链路**，全部经由 GenerateImage（文生图或
image-to-image + 编辑指令），不为任何单个工具引入专用 API，不做两套
管线。`engineHint` 仍是纯提示。放大/抠图等效果以指令化 prompt 实现，
效果上限由当前 APIMart 模型决定——这是复用管线的已知取舍，写进契约修订。

两种落图模式（贯穿全计划的核心区分）：
- **write-self（写回自身）**：仅限"此前从无图的空卡首次生成成功"——
  图落进卡本身。这不构成覆盖，因为无原图可覆盖。
- **derive（派生新卡）**：卡上已有 `mediaRef` 的一切再生成与五件套操作
  ——产出新节点 + 一条源卡→新卡的边。已有图的卡的 `mediaRef` 在任何
  路径下都不可变更（测试断言的不变量）。

---

## 2. 触发路径选型与理由

> **本节结论已作废（2026-08-24，见文首修订注记）。** 下面的路径 A 选型与
> 对比表仅保留为决策留痕：实际实现是**前端直连**
> `submit_infinite_canvas_media_job`，画布按钮不经会话与主 AI。当前唯一
> 有效的契约在
> [PRD §3.1](../features/infinite-canvas-and-media-tools-prd.md)。

**给业主的一段话：** 按钮按下之后，请求怎么走到出图通道，有两条候选路。
我们推荐 A 路：按钮把一条写好的任务消息发进当前会话，由 AI 调用出图工具
——这正是短剧中心每天在用的方式，权限、审批、回执、失败提示全都现成。
B 路是后台直连，快一点，但要新开一个后门并自建一套审批，得不偿失。
文生图、垫图、五件套三个入口共用这一条路，不搞特例。

### 细节（供执行 AI）

| | 路径 A（推荐）：画布按钮 → 结构化消息进会话 → 媒体 AI 调 GenerateImage | 路径 B：新增领域命令端口，后端直连 ApimartClient |
|---|---|---|
| PRD §2.3 合规 | ✅ Tool 仍只由模型调用，UI 只发消息 | ⚠️ 需论证"绕过模型直调工具管线"不违反贡献点分类，实质上要新立一类贡献点 |
| 权限/审批/回执 | ✅ 全复用既有工具审批与 tool-card 回执；AI 可拒绝、可补充追问 | ❌ 需自建审批 UI 与审计记录，新增 Tauri command 权限面 |
| 代码复用 | ✅ 零后端新端口；image 引用解析、UploadMediaImage、轮询、落盘、事件回流全部现成 | ❌ 需在命令端口里复刻 upload→submit→poll→save 编排 |
| 与短剧一致性 | ✅ 同款交互（`ShortDramaAgentTaskSessionSender` 先例），维护一套心智模型 | ❌ 两套触发模型并存 |
| 延迟/确定性 | ⚠️ 多一轮模型调用；模型可能改写请求 | ✅ 更快、参数完全确定 |
| 失败面 | 模型不调工具/改写绑定 → 用消息模板强约束 + 占位状态超时兜底（§6-R4） | 新端口自身的错误面 + 权限面 |

**决定：采用路径 A，三入口统一。** 路径 B 若未来确有低延迟批量需求
（如工坊批处理），作为 K3+ 议题另行立项，本期不做。

消息发送的具体先例：
`src/web-ui/src/app/components/panels/content-canvas/short-drama/ShortDramaAgentTaskSessionSender.ts`
—— `FlowChatManager.getInstance().sendMessage(message, targetSessionId,
inputSummary, undefined, undefined, { userMessageMetadata })`。K2 照此新建
画布自己的 sender（见 §4-W4），shared 服务层只定义 sender 接口，flow_chat
依赖留在 app 层注入，保持 `UI → Module Interface → Adapter` 方向。

**目标会话选择**：surface presentation metadata 已保存 `sourceSessionId`
（`firstPartyCanvasSurfaces.ts` 的 infinite-canvas `createPresentation`）。
优先发往 sourceSessionId；该会话不存在（如恢复的页签）时回落到当前活跃
会话；两者皆无 → 返回 typed `invalid-input`，UI 显式提示"请先在会话中
打开画布"，不静默失败。

#### 2.1 提示词拼装（前端 gateway 拼好随消息下发，不依赖模型自行查表）

```
finalInstruction =
  用户提示词（空卡文生图 = 卡上 prompt；再生成 = 卡上 prompt；
              五件套 = 补完【】后的 instructionTemplate）
  + （有连线参考时）'\n\n参考图对照表：@图一=第1张参考图, @图二=第2张…'
  + '\n\n风格要求：' + (preset.promptTemplate ?? preset.prompt)
  + (preset.promptSuffix ? '\n' + preset.promptSuffix : '')
  + (preset.guidance ? '\n注意：' + preset.guidance : '')
```

preset 经 `stylePresetCatalog.getById(node.stylePresetId)` 解析；无预设则
跳过风格块。`@图N` 占位符按 §3.2 的连线顺序解析，消息中给出对照表，
用户提示词里未写 @ 也不影响（参考图照常传入）。

#### 2.2 消息模板对 AI 的强约束

1. 对每张**本地**参考图/编辑对象，先用 `UploadMediaImage`（path =
   workspace 相对路径）取得公网 URL——因为 `resolve_media_image_urls`
   会过滤未注册的本地路径（media_tools.rs
   `is_unmatched_local_image_path_reference`）；已是 http(s) URL 的引用
   不重复上传（UploadMediaImage 有成本，模板明说"仅本地路径需上传"）。
2. 再调 `GenerateImage`：`image_urls` 的顺序 = 消息给出的清单顺序
   （五件套 = 编辑对象在前、参考图按连线顺序在后；生成 = 仅参考图按
   连线顺序；纯文生图 = 空数组），`n` 固定 1。
3. **将消息中给出的绑定 JSON 原样复制到 `infinite_canvas` 参数**，一字不改。

---

## 3. infinite_canvas 绑定契约（对照 short_drama）

**给业主的一段话：** 短剧出图为什么能自动挂回正确的分镜？因为提交任务时
贴了一张"回邮地址"标签，图做好后按标签寄回。这一节给画布定义同一张
标签：写清哪个画布文档、哪张卡、哪个操作，并且标明这次是"填进空卡
本身"还是"生成一张新卡"。图寄回来只会按标签落位，寄错地址（别的
工作区/别的文档）会被直接拒收；已经有图的卡永远不会被新图顶掉。

### 细节（供执行 AI）

#### 3.1 绑定对象（GenerateImage input 的可选 `infinite_canvas` 字段）

对照物：`media_tools.rs` 中 `short_drama` schema 字段与
`optional_short_drama_metadata()`；后端对绑定对象**不做强 schema 校验、
原样透传**（与 short_drama 相同的宽松策略，校验责任在前端桥接层）。

```jsonc
"infinite_canvas": {
  "workspaceId":  "…",       // 必填；与 InfiniteCanvasDocument.workspaceId 同源
  "documentId":   "…",       // 必填；目标画布文档
  "nodeId":       "…",       // 必填；结果落位节点——self 模式 = 空卡自身；
                             //        derived 模式 = 派发时已创建的占位新卡
  "resultMode":   "self",    // 必填；'self' | 'derived'
  "sourceNodeId": "…",       // derived 模式必填（派生边起点）；self 模式省略
  "toolId":       "generate",// 必填；'generate'（文生图/再生成）或五件套 ID
                             //        upscale|expand|inpaint|erase|matting
  "operationId":  "op-…",    // 必填；前端生成的幂等操作 ID
  "stylePresetId": "…",           // 可选；审计回显，prompt 已在前端拼装完毕
  "referenceNodeIds": ["…"]       // 可选；垫图参考卡按连线顺序，审计回显
}
```

操作种类的类型定义：`CanvasImageOperationKind = ImageToolId | 'generate'`
（`'generate'` 不属于 K0-2 五件套，是本期新增的第六种操作，收编进契约
修订）。

#### 3.2 垫图参考的收集纪律（借鉴 kunpeng collectRefs）

- **顺序唯一权威 = 指向该卡的连线的建立先后。** 文档 `edges` 数组即
  创建顺序（既有 `connectNodesContent` 追加语义已保证）；收集参考 =
  按数组顺序过滤 `targetNodeId === 本卡` 的边，取各源卡的 `mediaRef`。
  不提供任何第二排序来源（不按位置、不按选中态）；删线/重连即改顺序。
- **自身上一轮产物永不进参考。** 目标卡自己的 `mediaRef` 不进参考清单
  （五件套的"编辑对象首图"不是参考，单列，见 §2.2-2）。环状连线因此
  天然无害：自引用边在收集时被跳过。
- 参考卡无图（空卡或 pending 中）→ 派发前返回 typed `invalid-input`，
  UI 明示"参考卡还没有图"，不发任务、不落占位。
- `@图一/@图二…` 与参考清单按序一一对应，由 gateway 生成对照表写进消息。

#### 3.3 后端流转（完全镜像 short_drama，新增平行函数，不改既有函数）

绑定对后端是不透明 JSON，`resultMode`/`referenceNodeIds` 等新字段
**零后端逻辑**，随对象整体透传与回流。

| 环节 | short_drama 现状 | infinite_canvas 新增 |
|---|---|---|
| 提交时读取 | `optional_short_drama_metadata(input)` | `optional_infinite_canvas_metadata(input)`（兼容 `infinite_canvas`/`infiniteCanvas` 两种键） |
| 随任务保存 | `MediaJobHandle.short_drama: Option<Value>` | `MediaJobHandle.infinite_canvas: Option<Value>` 新字段 |
| 提交回执回显 | `result["shortDrama"] = metadata` | `result["infiniteCanvas"] = metadata` |
| 完成时充实 | `attach_short_drama_media_result()`（jobs.rs）写入 `outputMediaItemId`（`{batch_id}-{item_index}`）、`outputMediaKind`、`outputPreviewUrl`、`outputMediaPath`、`outputMediaRelativePath` | 平行函数 `attach_infinite_canvas_media_result()`，复用 `generated_media_relative_path()`，写入同一组 `output*` 字段 |
| 完成事件 | `start_media_job_polling` 尾部调用 attach 后 `emit_media_job_completed` | 在 short_drama attach 之后**追加**调用新 attach（两个绑定互不排斥、互不读写对方字段） |

生成媒体的落盘不变：`media/generated/<batch_id>/image-001.png`（workspace
内），批次清单不变：`.void/media-jobs/<batch_id>.json`。画布节点通过
`mediaRef = { workspacePath, relativePath: "media/generated/…" }` **引用**
它，与 Workspace Media 图库共用同一份真相，不复制。

#### 3.4 前端回流：谁监听、写到哪、怎么拒绝

事件链（与短剧同一条）：Rust `emit_media_job_completed` → ToolEvent
Completed → `EventHandlerModule.emitAgentToolRunEventForObservers` →
`globalEventBus` 的 `'agent:tool-run-event'`。

新增 `InfiniteCanvasMediaBridge`（shared/services/infinite-canvas/ 内，
对照 `ShortDramaRuntimeBridge.ts` + `connectShortDramaRuntimeBridgeToEventBus`）：

- 订阅 `'agent:tool-run-event'`；从 `payload.result.infiniteCanvas`
  （Completed）或 `payload.params.infinite_canvas`（Started）提取绑定。
- **回流写入的 Module Interface = `InfiniteCanvasDocumentService.mutateDefaultDocument`**
  （CAS + 防抖合并写盘的既有命令通道），桥接层不直接碰持久化端口。
- **落位解析以 `operationId` 为唯一锚点**：找到 `generation.operationId`
  匹配的节点（self 模式 = 空卡自身携带 generation；derived 模式 =
  派发时创建的占位新卡携带 generation）——两种模式对桥接层是同一条
  代码路径。绑定里的 `resultMode` 只作交叉校验：与落位节点的实际形态
  不符（如 resultMode='self' 但节点已有 mediaRef）→ typed ignored，
  不写入（防模型篡改绑定导致覆盖）。
- 事件 → 文档变更映射：
  - Started / 提交回执（含 batchId）→ `generation.status` 记为
    `'pending'` 并补 `batchId`；
  - Completed 且 `outputMediaRelativePath` 存在 → 落位节点填入
    `mediaRef`、清除 `generation`（空卡变真图 / 占位卡变真图）；
  - Completed 但结果是 `provider_not_configured` / `status:"error"` /
    `safety_rejected` → `generation.status = 'failed'`，`errorKind` 按
    K0-2 枚举分类（`auth`/`backend`/`invalid-input`…），沿用
    `classify_apimart_error` 已有的分类产物；
  - Failed/Cancelled 工具事件 → 同上，`cancelled`/`backend`。
- **幂等**：桥接层收到重复事件时发现该 operationId 已是终态则 no-op
  （对照 `ImageToolPlaceholderGateway` 已立的幂等不变量）。
- **跨 workspace / 跨文档拒绝**：绑定中的 `workspaceId` 或 `documentId`
  与当前加载文档不一致 → 返回 typed ignored 事件（对照
  `ShortDramaRuntimeIgnoredEvent` 的 `project_mismatch` 形态）并记日志，
  绝不写入。remote workspace 本就 fail-closed，无新面。
- **永不覆盖**：桥接层唯一合法写法是"新增节点/新增边/填充自己登记的
  pending 节点"；对任何**已有 `mediaRef`** 的节点的 `mediaRef` 修改都是
  缺陷（测试断言）。

#### 3.5 文档 schema 的加法式扩展（schemaVersion 保持 '1'）

`InfiniteCanvasTypes.ts` 的 `InfiniteCanvasNode` 新增三个**可选**字段，
解析器（`InfiniteCanvasDocumentService.parseNode`）容错读取，旧文档无损：

```ts
/** 图片卡的生成提示词（空卡文生图与再生成共用），持久化。 */
prompt?: string;
/** 版本树：本节点由哪次操作从哪个节点派生。写入后不可变；self 模式不写。 */
derivedFrom?: { sourceNodeId: string; toolId: CanvasImageOperationKind; operationId: string };
/** 进行中/失败的生成状态；成功后整个字段被移除。 */
generation?: {
  operationId: string;
  toolId: CanvasImageOperationKind;
  resultMode: 'self' | 'derived';
  status: 'pending' | 'failed';
  batchId?: string;
  errorKind?: ImageToolErrorKind;   // K0-2 七类枚举
};
```

空白生成卡 = `kind: 'image'`、无 `mediaRef`、有 `prompt`（可选
`stylePresetId`）。派生占位卡 = `kind: 'image'` + `derivedFrom` +
`generation`，暂无 `mediaRef`；位置取源卡右侧偏移；同时新增一条
`sourceNodeId → 新卡` 的边。`domainRef` 仍为 K3 保留字段，本期任何路径
不得赋值。

#### 3.6 契约文档修订（属于 K2 交付）

修订 `docs/features/infinite-canvas-and-media-tools-prd.md`：
- §3（K0-2）：删除"本期唯一合法实现是 unavailable 占位"条款，替换为
  "第二期合法实现 = 会话派发 + 媒体管线复用 + infinite_canvas 绑定回流"；
  新增 `'generate'` 操作种类与 `resultMode` 语义（self 仅限空卡首图）；
  收编 §3.1-3.5 的绑定契约、collectRefs 纪律、schema 加法字段；
  `ImageToolResult` 语义补充：`derivedNodeId` 在派发即返回（self 模式
  返回卡自身 ID）。
- §4（K0-3 媒体 Provider Adapter 占位）：**整节修订为"已被复用决策取代"**
  ——K2 起不再计划独立 Provider Adapter 贡献，媒体提交/轮询/取消/错误
  分类由 assembly-core 的 APIMart 管线统一承担；原接口草案降级为历史
  备忘（若未来出现第二渠道再另行立项）。
- §5（K0-4）：收编 `prompt`/`derivedFrom`/`generation` 加法字段与
  "连线即参考、顺序即权威"的边语义。
- §6 阶段边界同步更新。
（按 AGENTS.md 文档治理：更新现有规范，不新开平行契约文件。）

---

## 4. 分步任务拆解

**给业主的一段话：** 一共 11 个小片：1 片契约文件（纸面），2 片 Rust
（给出图通道加"画布回邮标签"，两个文件），8 片网页端（先把数据模型和
"发任务/收结果"两条管道做好并各自测试，最后两片才碰界面和收尾）。
每片独立提交、独立验收，界面片和收尾片必须真跑完整构建。

> 建议分支：`codex/infinite-canvas-k2-image-tools`。每片一个独立提交。
> 按业主既往教训（MEMORY）：**W6/W8 必须真跑 `pnpm run build:web`**，
> 不得以 type-check/lint 绿替代。

### D0：契约修订（纸面，无代码）

- 改动落点：`docs/features/infinite-canvas-and-media-tools-prd.md`（§3.6 所列
  四处修订）；本计划获批后链入 `docs/README.md`。
- 验收：文档评审通过 + `pnpm run check:repo-hygiene`。

### Rust 端

**R1：GenerateImage 接受并透传 infinite_canvas 绑定**

- 改动落点：`src/crates/assembly/core/src/agentic/tools/implementations/media_tools.rs`
  - input_schema 增加可选 `infinite_canvas` object 字段（描述文案对照
    `short_drama` 字段的写法）；
  - 新增 `optional_infinite_canvas_metadata()`（兼容蛇形/驼峰键）；
  - `call_impl` 读取后放入 `MediaJobHandle`，提交回执
    `result["infiniteCanvas"] = metadata` 回显。
  - 绑定内容（含 `resultMode`/`referenceNodeIds`）对 Rust 不透明，
    **零字段级逻辑**；**只加 GenerateImage**，GenerateVideo 不在 K2
    范围（见 §5）。
- 测试：schema 含新字段；带绑定提交时回执回显；不带绑定行为不变。
- 验收命令：`cargo test --locked -p void-core media`（定向）+
  `cargo check --workspace`。

**R2：完成事件充实 infinite_canvas 回流元数据**

- 改动落点：`src/crates/assembly/core/src/agentic/media/jobs.rs`
  - `MediaJobHandle` 增加 `infinite_canvas: Option<Value>` 字段
    （media_tools.rs 两处构造点同步补 `None`/实值——GenerateVideo 处传
    `None`，行为零变化）；
  - 新增 `attach_infinite_canvas_media_result(result, kind, metadata)`：
    复用 `generated_media_relative_path`，写 `outputMediaItemId`
    /`outputMediaKind`/`outputPreviewUrl`/`outputMediaPath`
    /`outputMediaRelativePath` 进 `result["infiniteCanvas"]`；
  - `start_media_job_polling` 尾部在 short_drama attach 之后追加调用。
  - **不改 `attach_short_drama_media_result` 的任何一行。**
- 测试：镜像 `attaches_short_drama_metadata_to_saved_media_batch` 写
  infinite_canvas 版；再加一条"双绑定并存互不污染"用例；既有 short_drama
  测试全绿是本片验收的一部分（回归保护）。
- 验收命令：`cargo test --locked -p void-core` + `cargo check --workspace`。

### Web 端

**W1：文档契约落地——类型与解析的加法扩展**

- 改动落点：`src/web-ui/src/shared/services/infinite-canvas/InfiniteCanvasTypes.ts`
  （§3.5 三个可选字段 + `CanvasImageOperationKind`）、
  `InfiniteCanvasDocumentService.ts`（parseNode 容错读取新字段；损坏值按
  "字段缺失"处理，不判 invalid-document）。
- 测试：旧文档（无新字段）load 无损；带新字段 round-trip 守恒；坏
  `generation`/`prompt` 值被丢弃不炸。
- 验收：目标 Vitest + `pnpm run type-check:web` + `pnpm run check:core-boundaries`。

**W2：panelModel 五件套派生助手**

- 改动落点：`app/components/panels/content-canvas/infinite-canvas/infiniteCanvasPanelModel.ts`
  - `beginDerivedOperationContent(document, sourceNodeId, toolId, operationId, derivedNodeId, edgeId)`：
    创建占位派生卡 + 连边（operationId 已存在则原样返回，幂等）；
  - `resolveOperationContent(document, operationId, mediaRef)`：按
    operationId 找到 pending 节点填 `mediaRef`、删 `generation`（self 与
    derived 同一条路径）；找不到 → 原样返回；
  - `failOperationContent(document, operationId, errorKind)`、
    `attachBatchToOperationContent(document, operationId, batchId)`、
    `removeFailedOperationContent(...)`（删除失败占位=普通删节点）。
  - 更新 `toFlowNodeViews` 投影 `generation`/`derivedFrom`/`prompt`。
- 测试：幂等（重复 resolve/begin 不产生第二节点）；**已有 `mediaRef` 的
  节点在所有助手下逐字段不变（永不覆盖不变量）**；边正确。
- 验收：目标 Vitest + `type-check:web`。

**W3（新增）：文生图底图与垫图模型助手**

- 改动落点：同上 `infiniteCanvasPanelModel.ts`（或平级新文件
  `infiniteCanvasGenerationModel.ts`，以文件体量为准）：
  - `addBlankGenerationCardContent(document, nodeId, position)`：新建空
    生成卡（`kind:'image'`、无 mediaRef、`prompt:''`）；
  - `setNodePromptContent(document, nodeId, prompt)`：写卡上提示词；
  - `beginSelfGenerationContent(document, nodeId, operationId)`：空卡
    自身登记 `generation`（resultMode:'self'）；**卡已有 mediaRef 时拒绝
    返回原文档**（self 只许空卡，derive 走 W2 助手）；
  - `collectReferenceNodes(document, nodeId)`：按 §3.2 纪律收集参考——
    edges 数组顺序过滤 `targetNodeId===nodeId`、跳过自引用、排除自身
    mediaRef；返回 `{ order, nodeId, mediaRef }[]` 或 typed
    `{ kind: 'reference-not-ready', nodeId }` 错误（参考卡无图/pending）。
- 测试：顺序 = 连线创建顺序（增删边后重算）；自身产物与自引用边被排除；
  参考未就绪 typed 错误；self 模式对有图卡拒绝；round-trip 持久化。
- 验收：目标 Vitest + `type-check:web`。

**W4：SessionImageGenerationGateway（发任务，三入口一条管线）**

- 改动落点：
  - `shared/services/infinite-canvas/` 新增 `InfiniteCanvasAgentTaskTypes.ts`
    （sender 端口接口：`sendImageGenerationTask(task) → Promise<typed result>`）
    与 `SessionImageGenerationGateway.ts`：统一入口
    `invoke({ operationId, kind: CanvasImageOperationKind, resultMode,
    nodeId, sourceNodeId?, prompt, stylePresetId?, references[] })` ——
    拼装 §2.1 提示词（含 @图N 对照表与风格块）+ §2.2 强约束 + §3.1 绑定
    JSON，经注入的 sender 发送；成功返回
    `{ operationId, status: 'succeeded', derivedNodeId }`（self 模式 =
    卡自身 ID）；无可用会话 / 参考未就绪 → typed `invalid-input`。
    五件套的 `ImageToolGateway.invoke` 收敛为对本 gateway 的薄封装，
    **不存在第二条提交链路**。
  - `app/components/panels/content-canvas/infinite-canvas/` 新增
    `InfiniteCanvasAgentTaskSessionSender.ts`（镜像
    `ShortDramaAgentTaskSessionSender.ts`：唯一允许 import FlowChatManager
    的位置；`userMessageMetadata.infiniteCanvasImageTask = {…}`）。
  - `ImageToolPlaceholderGateway.ts` 保留（测试与降级注入用），默认导出的
    面板 gateway 切换为 session 版。
- 测试：三入口生成的消息模板各含正确的绑定 JSON（resultMode/toolId）、
  风格块、参考对照表与 image_urls 顺序约定、UploadMediaImage 指引；无
  会话 typed 错误；sender 以假实现注入（不触 FlowChatManager 真身）。
- 验收：目标 Vitest + `type-check:web` + `check:core-boundaries`
  （确认 shared 层无 flow_chat import）。

**W5：InfiniteCanvasMediaBridge（收结果）**

- 改动落点：`shared/services/infinite-canvas/InfiniteCanvasMediaBridge.ts`
  （§3.4 全部行为）+ `connectInfiniteCanvasMediaBridgeToEventBus(bridge,
  eventBus = globalEventBus)`，结构对照 `ShortDramaRuntimeBridge.ts`。
- 测试（对照 ShortDramaRuntimeBridge.test.ts 的形态）：self 与 derived
  两种落位各自 resolve；resultMode 交叉校验不符 → ignored（含
  "self 但节点已有图"防覆盖用例）；provider_not_configured / 分类错误 →
  failed + errorKind；跨 workspace/文档 → typed ignored；重复事件幂等；
  事件不含绑定 → ignored（`missing_metadata`）。
- 验收：目标 Vitest + `type-check:web`。

**W6：面板 UI 闭环**

- 改动落点（均在 `content-canvas/infinite-canvas/`）：
  - `InfiniteCanvasPanel.tsx`：挂载时 `connectInfiniteCanvasMediaBridgeToEventBus`
    （对照 ShortDramaCenterPanel 第 497 行模式，卸载即断开）；工具栏新增
    "新建生成卡"；三入口派发编排：先落 pending（W2/W3 助手），再经
    gateway 发送，发送失败即回滚 pending 为 failed；
  - `InfiniteCanvasNodes.tsx`：图片卡渲染 `prompt` 输入区 + "生成"按钮
    （空卡）/"再生成"按钮（有图卡，派生语义在按钮文案里写明）、
    `generation` 状态（pending 转圈 / failed 显示 errorKind 对应文案 +
    重试/删除按钮）、`derivedFrom` 版本徽标、入边参考"图一/图二"顺序
    角标；
  - 新增 `InfiniteCanvasToolInstructionDialog.tsx`（五件套指令补全弹层，
    薄组件，无业务）；
  - surface 数据管线：`firstPartyCanvasSurfaces.ts` 的 infinite-canvas
    `createPresentation.data` 增加 `sourceSessionId`（metadata 已有，仅
    透传进 data）；`InfiniteCanvasSurfaceRenderer.tsx` → Panel props 增加
    可选 `sourceSessionId`。不碰 `PanelContentType`/`FlexiblePanel`/
    `ContentCanvas` 分支（P0 退出门条款复检）。
  - i18n：三语新增 `infiniteCanvas.generation.*` / `infiniteCanvas.tools.*`
    （生成卡、提示词占位文案、参考角标、指令弹层、pending/failed、重试、
    七类 errorKind 文案），走 `pnpm run i18n:generate` 契约流程。
- 测试：行为测试（空卡写词点生成 → 自身 pending + 派发调用；连线后派发
  消息含按序参考；点五件套 → 出现占位新卡；桥接事件 → 卡变真图；失败 →
  显示重试），不做样式文本断言。
- 验收命令：目标 Vitest + `type-check:web` + `lint:web`（定向）+
  `i18n:contract:test` + `i18n:audit` + **`pnpm run build:web`**（新增
  弹层与桥接必须留在 surface chunk 内，入口预算不动）。

**W7：残留 pending 的恢复处理（防"永远转圈"）**

- 改动落点：`InfiniteCanvasDocumentService.ts` 或面板 load 后钩子——
  文档加载时发现 `generation.status === 'pending'` 且带 `batchId` 的节点
  （self 与 derived 同一处理），经持久化端口读
  `.void/media-jobs/<batchId>.json`（Rust 侧 `persist_media_batch` 的既有
  产物）做一次对账：completed → resolve；failed → failed；文件缺失或仍
  polling → 标 `failed/timeout`，用户可重试。无 `batchId`（消息发出但 AI
  未提交）→ 直接标 `failed/timeout`。
- 测试：三种对账路径 + 文件损坏容错。
- 验收：目标 Vitest + `type-check:web`。

**W8（收尾）：全量门 + 手工验收**

- 手工验收清单（业主实机点检）：
  1. **文生图底图**：工具栏"新建生成卡" → 卡上写提示词、挑风格 →
     点生成 → 卡片转圈、会话出现媒体任务 → 完成后图落进**这张卡本身**；
  2. **垫图**：把两张有图的卡连线到一张目标卡，目标卡提示词写
     "@图一的构图、@图二的配色" → 派发消息里参考顺序与连线先后一致 →
     出图完成；删掉一条线换个顺序再生成 → 顺序随连线变化；
  3. 对一张**已有图**的卡再点生成 → 旁边出现连线的新卡，原卡的图未变；
  4. 图片卡 → "智能扩图"（五件套）→ 补完指令 → 占位新卡 + 连线 →
     完成变真图；原图未变；
  5. 风格预设参与出图：会话里的任务消息可见风格提示词；
  6. 参考卡还没有图时点生成 → 显式提示，不发任务；
  7. 断开 APIMart token（或用未配置环境）→ 点生成/工具 → 明确失败态
     （不是永远转圈），可重试或删除；
  8. 出图进行中关闭画布页签再打开 → 状态仍在；完成后重开 → 对账变真图；
  9. 在 workspace B 触发出图、切到 A → A 画布无任何变化（跨界拒收）；
  10. 短剧中心完整走一次角色图生成 → 行为与 K2 之前完全一致（回归）。
- 最终验收命令（全量门）：相关目标 Vitest 全绿 +
  `pnpm run type-check:web` + `pnpm run lint:web` +
  `pnpm run check:core-boundaries` + `pnpm run check:repo-hygiene` +
  `pnpm run i18n:contract:test` + `pnpm run i18n:audit` +
  `pnpm run build:web` + `cargo test --locked -p void-core` +
  `cargo check --workspace`；按仓库惯例跑一次
  `pnpm --dir src/web-ui run test:run` 确认无回归。
- 通过后更新 `CONTEXT.md` 与契约文档阶段状态。

---

## 5. 明确不做清单（K2 之外）

> **修订注记（2026-08-25）**：本清单的两条已被第三期（P3）取消——**视频卡
> 与 GenerateVideo 绑定**、**AI 指挥画布**均已在
> [P3 计划](2026-08-24-infinite-canvas-p3-agent-canvas.md)中立项并交付。
> 其余各条仍然成立；完整的现行差距与排期见
> [无限画布能力差距清单](../features/infinite-canvas-capability-gap.md)。

- ❌ 新 Provider / 渠道 / 密钥 / 独立 Provider Adapter（K0-3 原占位条款
  由本期修订为"复用管线"，不再排期实现）
- ❌ **视频卡**与 GenerateVideo 绑定（`infinite_canvas` 字段本期只进
  GenerateImage；视频卡留到后期立项时一并做）
- ❌ **蒙版画笔**（像素级圈选遮罩的 inpaint/erase；本期五件套用文字指令 +
  整图输入驱动，遮罩是后续增强）
- ❌ **AI 指挥画布**（AI 主动在画布上增删/排布/批量编排节点，即 kunpeng
  的 agent-drives-canvas 形态）——后期议题，本期 AI 只经绑定回流落图
- ❌ 画布 ↔ 短剧/工坊双向同步、`domainRef` 赋值（K3）
- ❌ 批量出图（`n` 固定 1）、多文档、协作分享、导演台 3D 预演（K5）
- ❌ 路径 B 领域命令端口
- ❌ 远程 workspace（继续 fail-closed）
- ❌ 修改短剧任何 runtime 行为、`attach_short_drama_media_result`、
  `ShortDramaCenterPanel.tsx`（AGENTS.md 热点保护）

---

## 6. 风险与对策

**给业主的一段话：** 六个主要风险都有兜底：图做好时你可能没开着画布
（做了对账机制）；AI 可能没听话发任务（卡片会转为可重试的失败态，不会
永远转圈）；没配 token 时会明确告诉你而不是装死；两个人同时改画布不会
互相覆盖；参考图没准备好会先拦住你而不是发一个废任务；短剧的通道我们
只"旁挂"不"改动"，并用它现有的测试全程护航。

### 细节（供执行 AI）

1. **R1 媒体完成事件时序**：`emit_media_job_completed` 在轮询结束才发；
   桥接只在画布面板挂载期间监听（与短剧同款取舍）。兜底 = W7 的
   `.void/media-jobs/<batchId>.json` 加载对账。残余缝隙（事件发出的瞬间
   面板恰好卸载且批次清单尚未落盘）由"pending 对账时 polling → timeout
   可重试"覆盖，不追求零缝隙。
2. **R2 节点并发 CAS**：桥接层写入与用户拖拽同走
   `mutateDefaultDocument`（服务内 CAS + 防抖合并）。mutator 是
   "读最新文档 → 产出内容"的纯函数，天然基于最新版重放；新增测试：
   桥接 resolve 与用户 move 交错提交后两者都不丢。
3. **R3 provider 未配置的 typed 降级**：GenerateImage 此时返回
   `provider_not_configured` 的**正常工具结果**（非异常）。桥接层把它与
   `classify_apimart_error` 家族一起映射进 K0-2 的七类 errorKind；UI 永远
   显示显式失败态。禁止把这条路径实现成静默或 toast 字符串协议。
4. **R4 模型不配合**（不调工具 / 改写绑定 / 拒绝 / 篡改 resultMode）：
   消息模板将绑定 JSON 标注为"必须原样复制"；桥接层的 resultMode 交叉
   校验保证即便被篡改也覆盖不了有图卡；仍可能失联——pending 节点因此
   必须存在 `timeout/失败可重试` 出口（W7），且 AI 的拒绝理由会以普通
   会话回复形式可见（路径 A 的固有优点）。
5. **R5 短剧管线回归**：全部 Rust 改动为加法（新字段默认 `None`、新平行
   函数、attach 追加调用）；`attach_short_drama_media_result` 与其测试
   一行不动；R2 验收强制全量 `cargo test -p void-core`；W8 手工清单含
   短剧全流程点检。任何需要改短剧现有行为的发现 = 立即停手上报业主。
6. **R6 参考解析与上传成本**：参考卡无图在派发前就 typed 拦截（§3.2）；
   本地参考图每张都要 UploadMediaImage（有 provider 成本），模板明确
   "仅本地路径上传、http(s) 引用直接使用"；参考数量本期不设硬上限但
   消息模板建议 ≤4（与 GenerateImage `n`≤4 的量级一致），超出由 AI
   自行取舍并在回复中说明。
7. **R7 入口体积**：新增代码全部位于 surface chunk（面板目录）与 shared
   服务；`build:web` 预算门在 W6/W8 双重把守。
8. **既有基线债**（Desktop lib-test Team fixture 等已记录阻断）不计入
   本期失败，也不顺手修。

---

## 7. 审批点

| # | 审批点 | 决策内容 |
|---|---|---|
| B1 | 动工前（本文档） | 批准整体计划 + 确认路径 A + 确认"self 仅限空卡首图 / 有图一律派生"的落图规则 + 确认 K0-2/K0-3/K0-4 契约修订方向（D0） |
| B2 | R1+R2 合入后 | 业主确认：短剧出图实测无任何变化（拿一次真实短剧生成对照）；批准继续 Web 端 |
| B3 | W8 验收 | 业主按 §4-W8 手工清单实机验收（含文生图底图与垫图各一次真实出图）；通过后更新 `CONTEXT.md`、契约文档状态并推送 |

每个审批点之间可独立回滚：D0 还原文档；R1/R2 为纯加法可整体 revert 且
不影响任何现有数据；W1-W7 各为独立提交，schema 变更是可选字段，回滚后
旧代码读新文档不炸（未知字段被解析器忽略）。
