# 无限画布与媒体工具契约规范（K0）

状态：当前契约规范；K0 已定稿，K1（风格资产数据搬入）据此实施；
2026-08-23 按业主批准的 K2 计划修订 §3/§4/§5/§6（图像工具第二期合法实现、
媒体 Provider 复用决策、画布文档加法字段与边语义）；
2026-08-24 按业主批准的 P3 计划修订 §3/§5/§6（AI 指挥画布工具面
CanvasRead/CanvasOp、ops 操作日志与 `agentOps.appliedSeq` 水位、视频卡
schema、GenerateVideo 绑定与 kind 交叉校验、防失控约束）
建立：2026-08-22
上游规范：[Canvas 插件平台产品与架构规范](canvas-plugin-platform-prd.md)（最高规范，
见其 §2.2 画布定位与 §2.3 贡献点类型）
实施计划：[2026-08-22 无限画布第一期实施计划](../plans/2026-08-22-infinite-canvas-plugin-phase1.md)、
[2026-08-23 第二期实施计划（K2 图像创作闭环）](../plans/2026-08-23-infinite-canvas-k2-image-tools.md)、
[2026-08-24 第三期实施计划（P3 AI 指挥画布 + 视频卡）](../plans/2026-08-24-infinite-canvas-p3-agent-canvas.md)
外部来源：kunpeng 项目（MIT 许可，归属见仓库根 [THIRD-PARTY-NOTICES.md](../../THIRD-PARTY-NOTICES.md)）

> 本文固化第一期（K0+K1+M1-M4）的四套接口契约，并在第二期（K2，业主已批准）
> 修订图像工具与媒体 Provider 两节：图像工具自 K2 起有合法真实实现（§3），
> 媒体 Provider 独立 Adapter 计划被"复用既有 APIMart 管线"决策取代（§4）。

## 1. 范围与定位

按上游 PRD §2.3 的贡献点分类，本期涉及四类贡献：

| 契约 | 贡献点类型 | 本期交付形态 |
|---|---|---|
| K0-1 风格资产 | 领域纯数据（独立 StylePreset 目录服务） | K1 实现：只读目录服务 + 转换数据 |
| K0-2 图像工具 | 未来 Tool/Capability 贡献 | 第一期仅契约与 `unavailable` 占位；K2 起为会话派发 + 媒体管线复用（§3） |
| K0-3 媒体 Provider | 未来 Provider Adapter 贡献 | 已被 K2 复用决策取代，原接口草案降级为历史备忘（§4） |
| K0-4 无限画布文档 | Canvas Surface + Domain Module | M1-M4 实现；Canvas 页签只是投影；K2 增补加法字段（§5） |

不变量（继承上游 PRD §2.2/§5.4/§9.2）：

- Canvas 不是真相源。无限画布文档的真身在 Domain Module 的文件持久化里，
  Canvas 页签快照只存 `documentId` 等合法引用，不存节点数据。
- 后台恢复不得自动展开右栏；右栏可见性只由用户显式操作改变。
- 新表面不修改 `PanelContentType`、`FlexiblePanel` switch、`ContentCanvas`
  业务分支或任何中心配置表。
- kunpeng 资产只经一次性转换脚本进入 Void 自己的 typed schema，不透传
  kunpeng 文件格式到运行时；代码思路按 Void 规矩重写，不抄实现。

## 2. K0-1 风格资产契约（StylePreset）

四个 family：`cinematic`（真人影像 67 套）、`animation-2d`（2D 动画 94 套）、
`midjourney`（MJ 风格 84 套）、`mg-motion`（MG 动画预设 72 套），共 317 套。
数据落地在 `src/web-ui/src/shared/services/style-preset/`（K1），由只读
`StylePresetCatalog` 提供 list / getById / byFamily / byCategory 查询，服务
无 React、Zustand、Tauri 依赖。

```ts
interface StylePreset {
  presetId: string;            // 稳定 ID，转换时由来源 id 派生（family:sourceId，全局唯一）
  schemaVersion: '1';
  family: 'cinematic' | 'animation-2d' | 'midjourney' | 'mg-motion';
  name: string;                // 中文名
  category: string;
  promptTemplate?: string;     // 完整模板（style-library 类）
  prompt?: string;             // 短提示词（omni/MJ 类）
  guidance?: string;
  visualDNA?: string;
  cameraLanguage?: string;
  promptSuffix?: string;
  tags?: string[];
  bestFor?: string;
  engineHint?: string;         // 如 'midjourney'，仅提示不绑定
  thumbnailRef?: string;       // 相对资源引用，运行时按需加载
  origin: { project: 'kunpeng'; license: 'MIT'; sourcePath: string };
}
```

补充条款：

- **缩略图（业主决定：方案 A）**：kunpeng 的 161 张风格缩略图不搬入仓库、
  不进 bundle，`thumbnailRef` 本期一律留空；风格选择器用文字卡片。未来若改
  方案 B（public 目录按需加载）需另行批准，schema 不变。
- **MotionRecipe**：kunpeng MG 动画的五维枚举结构照抄进契约，本期无运行时
  消费者，仅作为 `mg-motion` family 的未来扩展锚点：

```ts
interface MgMotionRecipe {
  density: 'balanced' | 'rich' | 'maximal';
  spatial: '2d' | '2.5d' | '3d';
  rhythm: 'steady' | 'narrative' | 'punchy';
  relationship: 'around-subject' | 'full-stage' | 'replace-background';
  material: 'follow-style' | 'glass' | 'paper' | 'soft-3d' | 'graphic';
}
```

- **提示词参考文档**：kunpeng 的 prompt-templates（gpt-image-2 / kling /
  seedance）、shot-patterns、checklists 共 13 篇 Markdown 以
  `StylePromptTemplateDoc { docId; group; title; content; origin }` 形态随目录
  服务入库；是否包装成 Void Skill 由业主在 K1 之后另行决定。
- **保真条款**：转换后每 family 条目数与来源守恒（67/94/84/72），测试写死
  断言；引擎专属数值参数（如 MJ stylize/chaos）不进入本 schema——它们属于
  K0-3 Provider 层的提交参数，第二期随 Provider 契约实装。

## 3. K0-2 图像工具契约（K2 起为合法真实实现）

五个工具，语义承接 kunpeng `imageTools.ts` 的 `ImageToolDef`（思路吸收、
代码重写）；K2 新增第六种操作 `'generate'`（文生图 / 再生成），不属于
五件套但共用同一条提交与回流链路：

```ts
type ImageToolId = 'upscale' | 'expand' | 'inpaint' | 'erase' | 'matting';

/** K2 新增：画布图像操作全集 = 五件套 + 'generate'（第六种操作）。 */
type CanvasImageOperationKind = ImageToolId | 'generate';

interface ImageToolDefinition {
  toolId: ImageToolId;
  labelKey: string;            // i18n key，UI 不写死文案
  instructionTemplate: string; // 预填充指令，含【】占位待用户补全
  engineHint?: string;         // 仅提示，不绑定 Provider
  autoRun: boolean;            // 是否免确认自动执行（本期恒 false）
}

type ImageToolErrorKind =
  | 'unavailable' | 'auth' | 'rate-limit' | 'timeout'
  | 'invalid-input' | 'backend' | 'cancelled';

interface ImageToolResult {
  operationId: string;         // 幂等操作 ID，同 ID 重复提交不得产生第二次执行
  status: 'succeeded' | 'failed';
  error?: { kind: ImageToolErrorKind; message: string };
  derivedNodeId?: string;      // 派发即返回：derived 模式 = 占位新卡 ID；
                               // self 模式 = 卡自身 ID（见 resultMode 语义）
}
```

### 3.1 第二期合法实现（取代第一期 unavailable 占位条款；2026-08-24 修订触发路径）

第一期"唯一合法实现是 `unavailable` 占位"的条款自 K2 起废止。

**2026-08-24 业主决定（推翻 K2 §2 的路径 A 选型）**：画布按钮的出图触发
路径改为**前端直连后端出图管线**，不再把任务消息发进会话让主 AI 转调工具
（那条路白白消耗模型上下文）。自此的**唯一合法实现**是：

- **直连命令（画布按钮）**：画布上的生成/再生成/五件套按钮经
  `DirectImageGenerationGateway` 调桌面命令
  `submit_infinite_canvas_media_job`（输入：workspace 上下文、kind
  image|video、prompt、本地参考路径/公网 URL、n、size、infinite_canvas
  绑定）。命令内校验 workspace 为本地、绑定 `workspaceId` 与请求一致、
  参考路径不越界；本地参考先走 UploadMediaImage 上传内核换公网 URL；随后
  复用 GenerateImage/GenerateVideo 的共享提交编排（校验→提交→
  MediaJobHandle→后台轮询）。完成事件经 `infinite-canvas://media-job-event`
  转发到 `agent:tool-run-event`，由 InfiniteCanvasMediaBridge 按既有规则
  落卡；提交回执同样经该总线回流（attach-batch），W7 对账安全网不变。
  全程无 AI 参与，无会话审批面——命令只花业主自己配置的媒体渠道额度，
  与画布点击一一对应。
- **会话路径仅保留给 AI 主动出图**：用户在会话里让主 AI 生成时，走
  GenerateImage / GenerateVideo 工具与 CanvasOp `begin_generation`，行为
  不变；`SessionImageGenerationGateway` 保留为该契约面的拼装参考实现，
  但面板不再使用它。§2.1 提示词/风格拼装与 §3.1 绑定对象规则两条路径
  完全一致（共享同一拼装函数）。
- **媒体管线复用**：全部出图经 assembly-core 既有 APIMart 管线（短剧同款），
  不引入新 Provider、渠道或密钥；放大/抠图等效果以指令化 prompt 实现，
  效果上限由当前 APIMart 模型决定（复用管线的已知取舍）。
- **infinite_canvas 绑定回流**：提交时挂绑定对象，媒体完成后按绑定自动
  落回画布（见 §3.2-§3.4）；两条路径共用同一回流车道与绑定形状。

**resultMode 语义（两种落图模式）**：

- `'self'`（写回自身）：**仅限"此前从无图的空卡首次生成成功"**——图落进
  卡本身。这不构成覆盖，因为无原图可覆盖。
- `'derived'`（派生新卡）：卡上已有 `mediaRef` 的一切再生成与五件套操作
  ——产出新节点 + 一条源卡→新卡的边。已有图的卡的 `mediaRef` 在任何路径
  下都不可变更（测试断言的不变量）。

### 3.2 infinite_canvas 绑定对象（GenerateImage / GenerateVideo input 的可选字段）

对照 `short_drama` 绑定：后端对绑定对象不做强 schema 校验、原样透传
（宽松策略，校验责任在前端桥接层）；绑定内容对 Rust 不透明，零字段级逻辑。

```jsonc
"infinite_canvas": {
  "workspaceId":  "…",       // 必填；与 InfiniteCanvasDocument.workspaceId 同源
  "documentId":   "…",       // 必填；目标画布文档
  "nodeId":       "…",       // 必填；结果落位节点——self 模式 = 空卡自身；
                             //        derived 模式 = 派发时已创建的占位新卡
  "resultMode":   "self",    // 必填；'self' | 'derived'
  "sourceNodeId": "…",       // derived 模式必填（派生边起点）；self 模式省略
  "toolId":       "generate",// 必填；CanvasImageOperationKind
  "operationId":  "op-…",    // 必填；前端生成的幂等操作 ID
  "stylePresetId": "…",           // 可选；审计回显，prompt 已在前端拼装完毕
  "referenceNodeIds": ["…"],      // 可选；垫图参考卡按连线顺序，审计回显
  "mediaKind": "video"            // 可选（P3）；GenerateVideo 绑定 = 'video'，
                                  // GenerateImage 绑定不带或为 'image'
}
```

后端流转完全镜像 short_drama（新增平行函数，不改既有函数）：提交时
`optional_infinite_canvas_metadata()` 读取（兼容 `infinite_canvas` /
`infiniteCanvas` 两种键），随任务保存在
`MediaJobHandle.infinite_canvas: Option<Value>`，提交回执回显
`result["infiniteCanvas"]`；完成时平行函数
`attach_infinite_canvas_media_result()` 写入 `outputMediaItemId`
（`{batch_id}-{item_index}`）、`outputMediaKind`、`outputPreviewUrl`、
`outputMediaPath`、`outputMediaRelativePath`。short_drama 与
infinite_canvas 两个绑定互不排斥、互不读写对方字段。K2 只有
GenerateImage 接受该字段；**自 P3 起 GenerateVideo 同样接受该字段**
（对等镜像 GenerateImage 的提取、透传与回执路径；完成充实复用
`attach_infinite_canvas_media_result`，其 `outputMediaKind` 按媒体 kind
自动写入 `"video"`；short_drama 的任何函数与行为不变）。

### 3.3 垫图参考的收集纪律（collectRefs）

- **顺序唯一权威 = 指向该卡的连线的建立先后。** 文档 `edges` 数组即创建
  顺序；收集参考 = 按数组顺序过滤 `targetNodeId === 本卡` 的边，取各源卡
  的 `mediaRef`。不提供任何第二排序来源（不按位置、不按选中态）；删线/
  重连即改顺序。
- **自身上一轮产物永不进参考。** 目标卡自己的 `mediaRef` 不进参考清单
  （五件套的"编辑对象首图"不是参考，单列）。环状连线因此天然无害：
  自引用边在收集时被跳过。
- 参考卡无图（空卡或 pending 中）→ 派发前返回 typed `invalid-input`，
  UI 明示"参考卡还没有图"，不发任务、不落占位。
- `@图一/@图二…` 与参考清单按序一一对应，由前端 gateway 生成对照表写进
  任务消息。

### 3.4 前端回流不变量

- 落位解析以 `operationId` 为唯一锚点；绑定里的 `resultMode` 只作交叉
  校验，与落位节点实际形态不符（如 `resultMode='self'` 但节点已有
  `mediaRef`）→ typed ignored，不写入（防绑定被篡改导致覆盖）。
- 绑定中的 `workspaceId` 或 `documentId` 与当前加载文档不一致 → typed
  ignored，绝不写入；remote workspace 继续 fail-closed。
- **kind 交叉校验（P3）**：回执/绑定的 `outputMediaKind`（或绑定
  `mediaKind`）与落位节点的 `kind` 不匹配（video 结果 → image 卡，或
  反之）→ typed ignored（reason `media_kind_mismatch`），不写入。
- 桥接层唯一合法写法是"新增节点/新增边/填充自己登记的 pending 节点"；
  对任何已有 `mediaRef` 的节点的 `mediaRef` 修改都是缺陷（测试断言）。
- 重复事件幂等：operationId 已是终态则 no-op。
- 失败按 `ImageToolErrorKind` 七类枚举显式呈现（含
  `provider_not_configured` → 显式失败态），禁止静默或 toast 字符串协议。

### 3.5 保留不变量

- **派生新版本、永不覆盖**：除 self 模式的空卡首图外，每次图像操作产出
  一个新节点（版本树语义），原图节点与其 `mediaRef` 不被修改或删除。
- `autoRun` 本期仍恒 `false`：五件套经指令补全确认后才派发。

### 3.6 第三期合法实现（P3）：AI 指挥画布工具面

自 P3 起，AI 操纵画布的**唯一合法实现**是"AI 直调工具 + CanvasOp
回执 / OpsBridge 落位"：后端工具只做校验、生成 ID、落操作日志、回执；
画布文档的唯一合法写入通道仍是前端 `mutateDefaultDocument`。AI 直改
文档 JSON（Write/Edit）与 Rust 直写文档文件均为非法路径（双 writer
竞态，永久否决）。

#### 3.6.1 CanvasRead（Rust 工具，只读）

- input：`{ "detail": "summary" | "full" }`（默认 summary）。无 documentId
  参数——每 workspace 一个默认文档，工具扫描
  `<workspace>/.void/infinite-canvas/` 下唯一文档文件。
- 输出：`workspaceId`、`documentId`、`revision`、节点摘要
  （nodeId/kind/position/size/hasMedia/prompt 截断 240 字/stylePresetId/
  generation 状态/derivedFrom）、edges 全量（顺序即垫图参考顺序）、
  `agentOps.appliedSeq` 水位。full 级附完整 text 字段（每字段截断
  4000 字）。**绝不回显 base64 或媒体内容**（mediaRef 本就是路径引用）。
- 新鲜度语义：读取的是**最后持久化**的文档（前端防抖写盘 + 异步应用，
  可能滞后）；刚提交的 CanvasOp 可能尚未体现，工具描述必须写明。
- typed 失败（正常工具结果，不 panic）：文档不存在、JSON 损坏、
  schemaVersion 不识别。

#### 3.6.2 CanvasOp（Rust 工具，typed 批量操作 + 日志 + 回执）

- input：`{ workspaceId, documentId, ops: [1..=20] }`，操作种类 =
  `add_node`（kind 仅 `text`/`image`/`video`）、`update_node`（`set` 白名单 =
  `prompt`/`text`/`stylePresetId`/`position`/`size`）、`connect`、
  `disconnect`、`delete_node`、`begin_generation`（`mode: self|derived`、
  `toolId`、`mediaKind: image|video` 缺省 image 且 video 仅
  `toolId=generate`、`prompt`、`stylePresetId`）。严格 schema：未知字段、
  别名、白名单外的 `set` 字段一律 typed `invalid-input` 拒绝。
- 原子批次：任一操作非法则**整批拒绝**，不部分执行；单批 ≤ 20 个
  操作，其中 `begin_generation` ≤ 3。
- 工具行为：校验（含对文档文件的一次只读快照校验，尽力而为，前端
  应用层按最新文档重验、以前端为准）→ 为 add_node/connect/
  begin_generation 生成 `nodeId`/`edgeId`/`operationId` → 规范化批次
  `{ seq, batchId, ops }` 原子追加到操作日志（§3.6.3）→ 回执
  `{ status: "accepted", seq, batchId, createdNodeIds, createdEdgeIds,
  generations: [{ operationId, nodeId, binding }] }`。
- **回执语义 = "指令已受理并登记"，不是"已生效"**：前端 OpsBridge
  监听既有 `agent:tool-run-event` 异步应用；工具描述必须写明该语义。
- `begin_generation` 的回执直接给出拼装完毕的 §3.2 绑定 JSON，AI 原样
  用于 GenerateImage / GenerateVideo 的 `infinite_canvas` 参数——绑定
  自 P3 起是机器生成的，不再靠消息模板约束。
- 所有操作按 ID 幂等：add 已存在 = no-op、delete 不存在 = no-op、
  update 同值 = no-op；重复事件 / 日志重放天然无害。

#### 3.6.3 操作日志（ops journal）与 appliedSeq 水位

- 日志文件：`.void/infinite-canvas/<documentId>.ops.json`。CanvasOp 在
  校验通过后把批次原子追加（Rust 进程内互斥，`seq` 单调递增）；日志
  有界，只保留最近 200 批次，Rust 追加时裁剪。
- 画布文档加法字段 `agentOps?: { appliedSeq: number }`（§5）：OpsBridge
  应用批次时（实时事件与加载对账同一路径）严格按 seq 升序、只应用
  `seq > appliedSeq` 的批次，并在同一次 mutate 里推进水位。
- **两文件各有唯一 writer**：画布文档唯一 writer = 前端
  DocumentService（CAS）；ops 日志唯一 writer = Rust CanvasOp。前端对
  日志只读，Rust 永不写画布文档。任何交叉写入都是缺陷（测试断言）。
- 日志损坏 → 对账按空日志处理（typed no-op，不炸面板）；日志只承担
  "面板关闭期间的补做"，丢失的最坏后果是指令未生效、可重发。

#### 3.6.4 防失控约束（P3 不变量）

- **删除保护**：`delete_node` 只允许删除**无 `mediaRef`** 的节点（空卡、
  失败占位卡）；带图/带视频的卡 → typed 拒绝并附理由，真卡删除必须
  由用户在 UI 亲手执行。前端 OpsBridge 双重把关（回执被篡改也拒绝）。
- **mediaRef 不可变延续**：`update_node` 白名单不含 `mediaRef`、
  `derivedFrom`、`generation`、`domainRef`；后端校验拒绝 + 前端应用层
  忽略，测试断言。
- **group 卡防线**：schema 虽保留 `kind:'group'`（无渲染器），CanvasOp
  的 add_node 拒绝 group——不允许 AI 创建当前渲染不出来的节点。
- **花钱闸门不变**：CanvasRead/CanvasOp 本身不花钱、无审批诉求；
  GenerateImage/GenerateVideo 的既有工具审批与回执卡片照旧。
- 跨 workspace/文档校验沿用 K2：Rust 侧校验文档文件属于当前会话
  workspace 且内容 workspaceId/documentId 与入参一致；OpsBridge 再做
  workspace/document 不匹配拒收；remote workspace 继续 fail-closed。

## 4. K0-3 媒体 Provider Adapter（已被复用决策取代）

**本节自 K2 起整体降级为历史备忘。** 业主在 K2 计划（B1 审批）中确定：
画布图像能力全部复用 Void 既有媒体生产线——AI 短剧团队在用的
GenerateImage / UploadMediaImage 工具与其背后的 APIMart 客户端管线
（`src/crates/assembly/core/src/agentic/tools/implementations/media_tools.rs`、
`src/crates/assembly/core/src/agentic/media/`）。因此：

- **不再计划独立的媒体 Provider Adapter 贡献点。** 媒体提交、轮询、取消、
  错误分类由 assembly-core 的 APIMart 管线统一承担；画布侧只经 §3.2 的
  绑定对象与之对接。
- 若未来出现第二媒体渠道的真实需求，再另行立项评审；届时可参考下方的
  历史接口草案，但该草案不再对任何当期实现构成约束。
- 仍然有效的条款：密钥与账号走 Void 既有设置体系；**kunpeng 的
  credentials 体系不进入 Void**。

### 4.1 历史备忘：原接口草案（不再排期实现）

```ts
interface MediaProviderAdapter {
  providerId: string;
  submit(request: MediaJobRequest): Promise<MediaJobTicket>;
  poll(ticket: MediaJobTicket): Promise<MediaJobStatus>;
  cancel(ticket: MediaJobTicket): Promise<void>;
}

interface MediaJobRequest {
  operationId: string;         // 与 K0-2 同源的幂等 ID
  toolId: ImageToolId;
  inputRef: { workspacePath: string; relativePath: string };
  params: Record<string, string | number | boolean>;
}

interface MediaJobTicket { operationId: string; providerJobId: string }

type MediaJobStatus =
  | { state: 'pending' | 'running' }
  | { state: 'succeeded'; outputRef: { relativePath: string } }
  | { state: 'failed'; error: { kind: ImageToolErrorKind; message: string } };
```

## 5. K0-4 无限画布文档契约（InfiniteCanvasDocument）

```ts
interface InfiniteCanvasDocument {
  documentId: string;          // 生成的 opaque ID
  schemaVersion: '1';
  workspaceId: string;         // 与 CanvasWorkspaceFacts.workspaceId 同源
  revision: number;            // 单调递增，CAS 写入
  nodes: InfiniteCanvasNode[];
  edges: InfiniteCanvasEdge[];
  viewport: { x: number; y: number; zoom: number };
  updatedAt: string;

  // —— P3 加法字段（schemaVersion 保持 '1'，解析器容错读取，旧文档无损）——
  /** AI 操作日志水位：已应用的最大批次 seq（§3.6.3）。 */
  agentOps?: { appliedSeq: number };
}

interface InfiniteCanvasNode {
  nodeId: string;
  kind: 'text' | 'image' | 'group' | 'video';  // 'video' 自 P3 起（见下方取舍）
  position: { x: number; y: number };
  size?: { width: number; height: number };
  text?: string;
  mediaRef?: { workspacePath: string; relativePath: string }; // 引用不复制
  stylePresetId?: string;      // 只挂 ID，渲染时经目录服务解析
  domainRef?: InfiniteCanvasDomainRef; // K3 保留字段，本期恒为 undefined

  // —— K2 加法字段（schemaVersion 保持 '1'，解析器容错读取，旧文档无损）——
  /** 图片卡的生成提示词（空卡文生图与再生成共用），持久化。 */
  prompt?: string;
  /** 版本树：本节点由哪次操作从哪个节点派生。写入后不可变；self 模式不写。 */
  derivedFrom?: {
    sourceNodeId: string;
    toolId: CanvasImageOperationKind;
    operationId: string;
  };
  /** 进行中/失败的生成状态；成功后整个字段被移除。 */
  generation?: {
    operationId: string;
    toolId: CanvasImageOperationKind;
    resultMode: 'self' | 'derived';
    status: 'pending' | 'failed';
    batchId?: string;
    errorKind?: ImageToolErrorKind;   // K0-2 七类枚举
    /** P3 加法：本次生成的媒体种类；缺省 = 'image'。 */
    mediaKind?: 'image' | 'video';
  };
}

interface InfiniteCanvasEdge {
  edgeId: string;
  sourceNodeId: string;
  targetNodeId: string;
}
```

K2 边语义（连线即参考、顺序即权威）：

- 指向一张图片卡的边即是它的**垫图参考**；参考顺序的唯一权威 = `edges`
  数组中这些边的先后（即连线建立顺序），不提供第二排序来源。
- 派生占位卡 = `kind: 'image'` + `derivedFrom` + `generation`、暂无
  `mediaRef`；创建时同步新增一条 `sourceNodeId → 新卡` 的边。空白生成卡 =
  `kind: 'image'`、无 `mediaRef`、有 `prompt`（可选 `stylePresetId`）。
- 解析器对损坏的 `prompt`/`derivedFrom`/`generation` 值按"字段缺失"处理，
  不判 invalid-document；旧代码读新文档时未知字段被忽略，不炸。损坏的
  `generation.mediaKind` 与文档级 `agentOps` 同样按字段缺失处理（P3）。

P3 视频卡语义（与图片卡同一套规则）：

- 空白视频卡 = `kind:'video'`、无 `mediaRef`、有 `prompt`；派生视频
  占位卡 = `kind:'video'` + `derivedFrom` + `generation{mediaKind:'video'}`。
- `mediaRef` 语义不变（引用 `media/generated/<batch>/video-001.mp4` 等）。
- resultMode 规则与图片完全一致：`'self'` 仅限空视频卡首次生成；已有
  视频的卡再生成一律 `'derived'`（派生连线新卡，原视频不动）。
- 视频卡本期不得作为垫图参考输入（typed `invalid-input` 拒绝）。

**已知取舍（P3，记录在案）**：P3 之前的旧解析器
（`InfiniteCanvasDocumentService.parseInfiniteCanvasDocument`）把
`kind:'video'` 当作非法节点，并因此把**整个文档**判为
`invalid-document` 拒绝加载——"旧代码读新文档"对含视频卡的文档不是
无损（比"丢弃单节点"更严）。因此 P3 的解析升级切片（W1）必须最先
合入；回滚策略 = 回滚整期而非只回滚 W1。不做 schemaVersion 升级：
加法字段 + 新 kind 不值得触发 `incompatible` 全拒绝。

```ts
interface InfiniteCanvasDomainRef {   // 思路来自 kunpeng workshopRef
  moduleId: string; kind: string; id: string; role: string;
}
```

持久化条款：

- 文档以 JSON 原子写入 workspace 下 `.void/infinite-canvas/<documentId>.json`
  （写临时文件后 rename）；本期每 workspace 一个默认文档。
- 保存走 revision CAS：陈旧 revision 被拒绝并返回 typed `conflict`，不静默
  覆盖；写盘用防抖合并（coalesced idle），真相在文件、UI store 只做投影。
- remote workspace fail-closed：与 Workspace Media、Agent Studio 同款
  `checkWorkspace` 拒绝口径。
- 恢复时遇到不认识的 `schemaVersion` 显式返回 `incompatible`，不猜、不迁移；
  损坏 JSON 返回 typed error，不抛异常。
- 节点内嵌媒体是对 Workspace Media 的**引用**（`mediaRef` 相对路径），不复制
  媒体真相，也不写 Media 领域数据。
- `domainRef` 是 K3（画布 ↔ 领域互引）的保留字段，本期任何写入路径不得赋值。
- **P3 操作日志文件**：`.void/infinite-canvas/<documentId>.ops.json`——
  Rust CanvasOp 原子追加、200 批次环形裁剪、前端只读对账（§3.6.3）。
  **两文件各有唯一 writer**：画布文档 = 前端 DocumentService（CAS），
  ops 日志 = Rust CanvasOp；任何交叉写入都是缺陷。

## 6. 阶段边界

**K2（业主已批准，见 [K2 实施计划](../plans/2026-08-23-infinite-canvas-k2-image-tools.md)）
覆盖**：空卡文生图、有图卡再生成、五件套派生编辑三个入口共用同一条
会话派发 + APIMart 管线复用 + `infinite_canvas` 绑定回流链路；不引入新
Provider、渠道或密钥。

**P3（业主已批准，见 [P3 实施计划](../plans/2026-08-24-infinite-canvas-p3-agent-canvas.md)）
覆盖**：AI 指挥画布（CanvasRead/CanvasOp 工具面 + ops 日志 +
OpsBridge 落位，§3.6）与视频卡（`kind:'video'`、GenerateVideo 的
`infinite_canvas` 绑定、图生视频、kind 交叉校验）；仍不引入新
Provider、渠道或密钥。

P3 明确不做（详见 P3 计划 §5）：分组卡（`kind:'group'`）渲染（K4
候选）、蒙版画笔（像素级遮罩 inpaint/erase）、画布与**现有 AI 短剧
中心**（Short Drama center，即对标产品所说的"流水线工坊"在 Void 中的
对应物，复用现有 short-drama 领域模块，不新建工坊）双向
同步与 `domainRef` 赋值（K3）、批量出图出视频（`n` 固定 1；CanvasOp
单批 ≤ 20 不放宽）、多文档、协作分享、3D 预演（K5）、自动布局算法
工具、音频卡等其他节点类型、视频卡作垫图参考、AI 删除带媒体的卡、
后台直连的领域命令端口（路径 B/C 直写画布）、远程 workspace（继续
fail-closed）、修改短剧任何现有运行时行为。每一项都需要业主另行批准
后进入后续切片。
