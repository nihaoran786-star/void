# 无限画布与媒体工具契约规范（K0）

状态：当前契约规范；K0 已定稿，K1（风格资产数据搬入）据此实施；
2026-08-23 按业主批准的 K2 计划修订 §3/§4/§5/§6（图像工具第二期合法实现、
媒体 Provider 复用决策、画布文档加法字段与边语义）
建立：2026-08-22
上游规范：[Canvas 插件平台产品与架构规范](canvas-plugin-platform-prd.md)（最高规范，
见其 §2.2 画布定位与 §2.3 贡献点类型）
实施计划：[2026-08-22 无限画布第一期实施计划](../plans/2026-08-22-infinite-canvas-plugin-phase1.md)、
[2026-08-23 第二期实施计划（K2 图像创作闭环）](../plans/2026-08-23-infinite-canvas-k2-image-tools.md)
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

### 3.1 第二期合法实现（取代第一期 unavailable 占位条款）

第一期"唯一合法实现是 `unavailable` 占位"的条款自 K2 起废止。K2 起的
**唯一合法实现**是：

- **会话派发（路径 A）**：画布按钮把结构化任务消息发进会话，由 AI 调用
  GenerateImage / UploadMediaImage；UI 不直连 Provider，不新增领域命令端口。
- **媒体管线复用**：全部出图经 assembly-core 既有 APIMart 管线（短剧同款），
  不引入新 Provider、渠道或密钥；放大/抠图等效果以指令化 prompt 实现，
  效果上限由当前 APIMart 模型决定（复用管线的已知取舍）。
- **infinite_canvas 绑定回流**：提交时挂绑定对象，媒体完成后按绑定自动
  落回画布（见 §3.2-§3.4）。

**resultMode 语义（两种落图模式）**：

- `'self'`（写回自身）：**仅限"此前从无图的空卡首次生成成功"**——图落进
  卡本身。这不构成覆盖，因为无原图可覆盖。
- `'derived'`（派生新卡）：卡上已有 `mediaRef` 的一切再生成与五件套操作
  ——产出新节点 + 一条源卡→新卡的边。已有图的卡的 `mediaRef` 在任何路径
  下都不可变更（测试断言的不变量）。

### 3.2 infinite_canvas 绑定对象（GenerateImage input 的可选字段）

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
  "referenceNodeIds": ["…"]       // 可选；垫图参考卡按连线顺序，审计回显
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
GenerateImage 接受该字段；GenerateVideo 不在 K2 范围。

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
- 桥接层唯一合法写法是"新增节点/新增边/填充自己登记的 pending 节点"；
  对任何已有 `mediaRef` 的节点的 `mediaRef` 修改都是缺陷（测试断言）。
- 重复事件幂等：operationId 已是终态则 no-op。
- 失败按 `ImageToolErrorKind` 七类枚举显式呈现（含
  `provider_not_configured` → 显式失败态），禁止静默或 toast 字符串协议。

### 3.5 保留不变量

- **派生新版本、永不覆盖**：除 self 模式的空卡首图外，每次图像操作产出
  一个新节点（版本树语义），原图节点与其 `mediaRef` 不被修改或删除。
- `autoRun` 本期仍恒 `false`：五件套经指令补全确认后才派发。

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
}

interface InfiniteCanvasNode {
  nodeId: string;
  kind: 'text' | 'image' | 'group';
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
  不判 invalid-document；旧代码读新文档时未知字段被忽略，不炸。

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

## 6. 阶段边界

**K2（业主已批准，见 [K2 实施计划](../plans/2026-08-23-infinite-canvas-k2-image-tools.md)）
覆盖**：空卡文生图、有图卡再生成、五件套派生编辑三个入口共用同一条
会话派发 + APIMart 管线复用 + `infinite_canvas` 绑定回流链路；不引入新
Provider、渠道或密钥。

K2 明确不做（详见 K2 计划 §5）：视频卡与 GenerateVideo 绑定、蒙版画笔
（像素级遮罩 inpaint/erase）、AI 主动指挥画布、画布与短剧/工坊双向同步与
`domainRef` 赋值（K3）、批量出图（`n` 固定 1）、多文档、协作分享、3D
预演（K5）、后台直连的领域命令端口（路径 B）、远程 workspace（继续
fail-closed）、修改短剧任何现有运行时行为。每一项都需要业主另行批准后
进入后续切片。
