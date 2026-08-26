# 无限画布与媒体工具契约规范（K0）

状态：当前契约规范；K0 已定稿，K1（风格资产数据搬入）据此实施；
2026-08-23 按业主批准的 K2 计划修订 §3/§4/§5/§6（图像工具第二期合法实现、
媒体 Provider 复用决策、画布文档加法字段与边语义）；
2026-08-24 按业主批准的 P3 计划修订 §3/§5/§6（AI 指挥画布工具面
CanvasRead/CanvasOp、ops 操作日志与 `agentOps.appliedSeq` 水位、视频卡
schema、GenerateVideo 绑定与 kind 交叉校验、防失控约束）；
2026-08-25 按业主批准的 P4 计划修订 §3/§5/§6（直连命令生成参数入参、
完成回执的 `outputMediaItems` 多结果数组与批量落位不变量、节点
`generationParams` 加法字段、撤销作用域与"停止等待"取舍）
建立：2026-08-22
上游规范：[Canvas 插件平台产品与架构规范](canvas-plugin-platform-prd.md)（最高规范，
见其 §2.2 画布定位与 §2.3 贡献点类型）
实施计划：[2026-08-22 无限画布第一期实施计划](../plans/2026-08-22-infinite-canvas-plugin-phase1.md)、
[2026-08-23 第二期实施计划（K2 图像创作闭环）](../plans/2026-08-23-infinite-canvas-k2-image-tools.md)、
[2026-08-24 第三期实施计划（P3 AI 指挥画布 + 视频卡）](../plans/2026-08-24-infinite-canvas-p3-agent-canvas.md)、
[2026-08-25 第四期实施计划（P4 工作台）](../plans/2026-08-25-infinite-canvas-p4-workbench.md)
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

- **缩略图（P5 修订；业主 2026-08-26 决定：方案 B'，取代第一期的方案 A）**：
  第一期"不搬入仓库、`thumbnailRef` 一律留空"的条款自 P5 起废止。
  `StylePreset` **schema 一字不改**，只填字段。实际做法：
  - **搬入张数**：kunpeng `aigc-memory/style-library/` 的全部 **161 张**
    （`cinematic` 67 + `animation-2d` 94）。
  - **再编码规格（硬性）**：长边 **320px**、**WebP**、质量约 72、去除 EXIF；
    单张 ≤ **48 KB**，161 张合计 ≤ **6 MB**。再编码脚本在仓库外一次性运行后
    丢弃（沿用第一期"转换脚本不入库"的做法），data 文件头保留来源注释。
  - **落点**：`src/web-ui/public/style-presets/<family>/<presetId>.webp`。
    文件名一律用 `presetId`，不保留来源的 CJK / 空格文件名。`public/` 由 Vite
    原样拷进 `dist/`，**不参与 JS/CSS 打包**，因此不计入
    `scripts/web-performance-budget.json` 的 JS / CSS 预算（安装包体积增加约
    4 MB 是真实代价，另行记在计划风险条目里）。
  - **`thumbnailRef` 填充规则**：`cinematic` 与 `animation-2d` 每一条都填
    `style-presets/<family>/<presetId>.webp`（相对引用）；`midjourney` 与
    `mg-motion` 两个 family 来源本就没有小样图，`thumbnailRef` **恒为空**。
  - **无缩略图 family 的降级呈现**：由 `presetId` 哈希**确定性**推导出一个柔和
    色块（同一 presetId 永远同一颜色），色块中央为风格名前两字、下方为完整
    名称；色值走 `--canvas-*` token，明暗两套主题各自可读。缩略图**加载失败
    也走同一降级**（`onError` → 色块），不得出现浏览器破图图标。
    禁止"有图显示图、无图显示空白框"的半残呈现——两种形态高度与圆角一致。
  - **体积上限护栏**：新增 `scripts/check-style-thumbnail-budget.mjs`
    并挂进 `check:repo-hygiene`，断言
    `src/web-ui/public/style-presets/` 总字节 ≤ 6 MB 且单文件 ≤ 48 KB。
  - **许可与归属**：见仓库根 `THIRD-PARTY-NOTICES.md`。业主在**知情**
    "这批缩略图的文件名与画面取材于原神 / 千与千寻 / JOJO / 权力的游戏 /
    LEGO / GTA 等第三方 IP，上游 kunpeng 自身的第三方声明对该资产只字未提，
    且 MIT 只覆盖代码与数据、覆盖不了图中的第三方权利"之后，于
    **2026-08-26 明确选择全搬 161 张**。该事实必须在
    `THIRD-PARTY-NOTICES.md` 如实记录，不得淡化。
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

/** K2 新增：画布图像操作全集 = 五件套 + 'generate'（第六种操作）。
 *  P5 新增：`'crop'`（本地派生，不提交媒体任务，见 §3.8）。 */
type CanvasImageOperationKind = ImageToolId | 'generate' | 'crop';

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

**P4 加法：直连命令的生成参数入参（2026-08-25）**——
`submit_infinite_canvas_media_job` 在既有 `model` / `size` / `n` 之外增加
三个可选入参，均为 `#[serde(default)]` 的加法字段，缺省时组装出的工具
输入与 P4 之前逐字段一致：

| 入参 | 类型 | 适用 kind | 透传到工具层的键 |
|---|---|---|---|
| `resolution` | `string?` | image、video | `resolution` |
| `duration` | `number?`（整数秒） | 仅 video | `duration` |
| `aspectRatio` | `string?` | 仅 video | `aspect_ratio` |

条款：

- **取值必须来自后端真实允许表**（`agentic/media/capabilities.rs` 的按模型
  允许表，唯一真相）；前端能力表只是它的镜像，漂移由 typed 失败兜底。
- 命令本身**不做取值校验**——校验责任仍在工具层；非法值返回
  `MediaValidationError`，经命令映射为 `invalid_input`，前端按
  `ImageToolErrorKind.'invalid-input'` 落成**卡片失败态**（可解释、可重试），
  不得静默、不得 toast 字符串协议。
- 命令按 kind 分支组装工具输入：image 分支带 `n`、不带
  `duration`/`aspect_ratio`；video 分支带 `duration`/`aspect_ratio`、不带
  `n`（视频工具层本就不读 `n`）。
- `GenerateImage` / `GenerateVideo` 的工具 schema、校验与短剧路径**零改动**。

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

**P4 加法：`outputMediaItems` 多结果数组（2026-08-25）**——
批次结果里本就有完整的多结果（`batch.items[]` / `batch.assets[]`），但完成
充实此前**只描述第 1 项**。自 P4 起 `attach_infinite_canvas_media_result()`
在**保留全部现有单数字段、语义一字不变**的前提下追加一个数组：

```jsonc
"outputMediaItems": [
  {
    "itemIndex": 1,                                   // 1 基，升序
    "mediaItemId": "{batch_id}-{item_index}",
    "mediaKind": "image",                             // 或 "video"
    "relativePath": "media/generated/<batch>/image-001.png",
    "previewUrl": "https://…",                        // 可选（供应商回报）
    "path": "<绝对本地路径>"                            // 可选
  }
]
```

条款：

- **单数字段不变**：`outputMediaItemId` / `outputMediaKind` /
  `outputPreviewUrl` / `outputMediaPath` / `outputMediaRelativePath` 仍按
  改动前的规则取**批次第 1 项**（含"第 1 项保存失败时不写路径"的既有
  行为）。老前端读不到新字段 → 行为与 P4 之前一字不差（前滚兼容）。
- **只收成功项**：数组只包含真实落盘、可换算出 workspace 相对路径的项；
  失败 / 未保存的项不进数组。全失败 → 空数组（不代表成功）。
- **相对路径由 Rust 生成**（复用该函数已有的换算），前端不得自己拼路径。
- `n=1`（默认）→ 数组恰好一项，与单数字段指向同一结果。
- `attach_short_drama_media_result()` 与短剧的任何行为**零触碰**（是另一个
  函数，不共享代码路径）。

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

**批量落位规则（P4，配合 §3.2 的 `outputMediaItems`）**：

1. 落位锚点仍是 `operationId`（K2 §3.4 不变）；`outputMediaItems` 按
   `itemIndex` 升序处理。
2. **第 1 项落到绑定的 `nodeId`**（self 模式 = 空卡自身；derived 模式 =
   派发时建的占位卡），走既有落位解析——其"已有 `mediaRef` 就跳过"的
   never-overwrite 判据原样生效。
3. 第 2..N 项各生成一张新卡：`kind` 同锚点卡，`mediaRef` = 该项，
   `derivedFrom = { sourceNodeId: 锚点卡, toolId, operationId }`，同时新增
   一条 `锚点卡 → 新卡` 的边（`role: 'derived'`，因此不进垫图参考收集，
   K2 §3.3 语义保持）；位置 = 锚点卡右侧按序偏移。
4. **派生 nodeId 必须确定性派生**：`node-<operationId>-i<itemIndex>`。
   回流事件可能重放、pending 对账可能二次应用，确定性 ID 让"已存在即
   no-op"天然幂等（与 P3 CanvasOp 的 ID 幂等纪律同源）。
5. **半成功（`status: "partial"`）**：只落数组里真实带 `relativePath` 的项；
   若第 1 项缺失但后面有成功项，把**第一个可用项落到锚点卡**（不让用户
   点的那张卡空着），其余仍派生；一项都没有 → 走既有失败分类（typed，
   卡上显示可重试）。
6. `n=1`（默认）时数组长度为 1 → 与 P4 之前的行为逐字节等价。
7. `mediaRef` 不可变与 never-overwrite 在批量路径下同样是硬不变量：批量
   落位只允许**新增节点 / 新增边 / 填充自己登记的 pending 节点**。

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

### 3.7 第五期加法（P5）：蒙版合成参考（`maskedReference`）

**上游事实（逐文件核实）**：本仓库的出图通道**没有 mask 参数**——
`GenerateImage` 的 schema 属性里既无 `mask` 也无 `strength`，参考实现
kunpeng 全仓库同样没有任何 mask 字段。因此"局部重绘 / 擦除"的**唯一合法
实现**是"把红色标记烧进原图，合成图当参考图提交"，不是蒙版接口。

```ts
/** P5：蒙版路径的合成参考。红标图是中间产物，不是媒体真相。 */
interface InfiniteCanvasMaskedReference {
  /** 工作区相对路径，恒在 .void/infinite-canvas/scratch/ 下 */
  scratchRelativePath: string;
  /** 与派生卡共用的幂等键；同 operationId 覆写同一文件 */
  operationId: string;
  sourceNodeId: string;
  toolId: 'inpaint' | 'erase';
}
```

条款：

- **落点与命名**：红标合成图恒写入
  `.void/infinite-canvas/scratch/<operationId>-mark.png`。该目录**不在**
  `WorkspaceMediaLibrary` 的四个扫描根（`media/generated`、`media/input`、
  `.void/media/generated`、`.void/media/uploads`）之内，因此素材库发现不了它；
  这是硬约束，**不得把 scratch 挪进 `media/`**（测试写死断言）。
  以 `operationId` 命名 ⇒ 同 operationId 重复提交覆写同一文件，幂等、不堆垃圾。
- **提交方式**：红标合成图**只经 `localReferencePaths` 提交**（K2 起就在跑的
  既验证车道），**不得**写进任何节点的 `mediaRef`、不得进上述四个扫描根、
  不得以 data URL 直塞 `imageUrls`。
- **指令拼装**：蒙版路径的最终指令 = P5 新增的 i18n 模板（语义为"只修改图中
  **红色半透明标记覆盖**的区域，其余像素保持与原图完全一致"；erase 的后半句
  为"用与周围环境一致的内容自然填补"）+ 用户补全语句，经与既有路径
  **同一个** `buildFinalInstruction` 拼装，两条路径不得各拼一套。
  文案口径一律用"标注区域"，**不得出现"精确蒙版 / 像素级"字样**——
  通用模型对红标的遵从度是概率性的，不是接口保证。
- **`resultMode` 恒为 `'derived'`**：源卡已有图，"已有图的卡 `mediaRef` 不可
  变更"这条不变量不受影响。
- **后端零改动**：`GenerateImage` 看到的仍是"prompt + 一张参考图"，
  它不知道有蒙版这回事。
- **清理**：面板挂载时触发一次异步清理，删除 scratch 下 mtime 超过 7 天的
  文件（桌面命令 `prune_canvas_scratch`，见 §3.9）；**失败静默**——清理不是
  关键路径，不得因此弹错或阻塞面板。不做引用计数、不做即时删除（生成失败后
  用户可能要重试同一张标记图）。
- **顺序纪律**：严格"先写盘、写盘成功才提交生成"。写盘失败 → typed 失败态，
  **不提交生成**（不能先扣钱再失败）。

### 3.8 第五期加法（P5）：本地派生（无媒体任务）——裁剪

`'crop'` 是 `CanvasImageOperationKind` 的 P5 新成员，也是**唯一一种
本地派生**操作。

条款：

- **不提交媒体任务、不消耗额度、不发任何网络请求、不产生 `batchId`、
  不经 `InfiniteCanvasMediaBridge`**。UI 上要说清楚它是纯本地操作。
- **它是唯一允许由前端直接写入派生卡 `mediaRef` 的操作**（其余一律由回流
  写入）。写入必须发生在与 `beginDerivedOperationContent` **同一次**
  `mutateDefaultDocument` 里，避免出现"永远 pending 的裁剪卡"这种中间态。
  后人读到这一条即知：这不是不变量被破坏，而是本条明文授权的例外。
- **落点**：`media/input/canvas-crops/<sourceName>-crop-<ts>.png`。
  `media/input` 是既有扫描根 ⇒ 下一次扫描即被素材库发现，不需要写任何索引。
  `source` 归 `input` 而不是 `generated`，这是**诚实的**：没有模型跑过、
  没有消耗额度、没有 `manifest.json`。
- **不伪造 `generatedIdentity`**：裁剪产物不匹配 `media/generated/<batch>/…`
  正则，`generatedIdentity` 为空，图库条目按既有降级规则回退到目录名
  （`canvas-crops`）+ 文件名。**禁止**塞进 `media/generated/` 以骗取批次身份。
- **源卡 `mediaRef` 零改动**（不变量不受影响；首要测试护栏）。
- **`CanvasOp` 的 AI 白名单不放开 `'crop'`**：AI 不能替用户裁图。
- **顺序纪律**：严格"先写盘、写盘成功才 mutate 文档"，避免出现指向不存在
  文件的卡。

### 3.9 第五期加法（P5）：两个画布专用桌面命令

两条命令都是**纯加法的新文件**
（`src/apps/desktop/src/api/infinite_canvas_asset_api.rs`），
不改 `commands.rs` / `path_target.rs` / `filesystem` /
`media_tools.rs` / `capabilities.rs` / `jobs.rs` /
`analyze_image_tool.rs` / `image_analysis/`，不碰短剧任何路径。

#### 3.9.1 `write_canvas_image_bytes` —— 把图片字节写成工作区文件

**为什么需要它**：网页端唯一的写文件通道
（`workspaceAPI.writeFile` → `write_file_content` → `write_text_file`）
**只吃 `&str`**，没有 base64 解码，全仓库无 `write_binary` / `write_bytes`。
裁剪产物与红标合成图都必须落成真实文件，故补此一条命令，两件事共用。

- 输入：`{ workspacePath: string, relativePath: string, base64Png: string }`
  （`base64Png` 是**裸 base64**，不带 `data:` 前缀）。
- 输出（typed，永不抛字符串协议）：

```jsonc
{
  "status": "written" | "invalid_input" | "path_denied" | "backend",
  "relativePath": "…",   // 仅 written
  "bytesWritten": 12345, // 仅 written
  "message": "…"         // 仅失败
}
```

- **安全纪律（本命令不被滥用成通用写盘口的唯一屏障，不得放宽）**：
  1. `workspacePath` 必须绝对且 `is_dir()`，否则 `invalid_input`。
  2. `relativePath` 必须工作区相对：不得绝对、不得以 `/` 或 `\` 开头、
     不得含 `:`、不得含 `..` 分量 —— 否则 `path_denied`。
  3. **必须以白名单前缀之一开头**：`.void/infinite-canvas/scratch/`
     或 `media/input/canvas-crops/` —— 否则 `path_denied`。
  4. 扩展名限 `.png`（大小写不敏感）—— 否则 `path_denied`。
  5. 解码后字节上限 **32 MB** —— 超出 `invalid_input`。
     base64 本身不可解码、或带了 `data:` 前缀，同样 `invalid_input`。
  6. **解码后的字节必须以 PNG magic 开头** —— 否则 `invalid_input`。
     第 4 条只约束文件**名**，这一条约束文件**内容**，两条缺一不可，
     否则这条命令能被用来以 `.png` 之名投放任意载荷。
  7. 父目录 `create_dir_all`；随后对父目录做一次 `canonicalize` 包含性复核
     （防软链落到工作区外），越界 `path_denied`；写入失败归 `backend`。
- **明确不做**：不把二进制写入能力泛化到通用文件面。任何"顺手做成通用
  `write_binary_file`"的改法一律拒收；**任何放宽白名单的改动等同新开攻击面，
  必须停手上报业主**。

#### 3.9.2 `prune_canvas_scratch` —— 清理过期红标图

- 输入：`{ workspacePath: string, maxAgeDays?: number }`（缺省 7 天）。
- 输出：`{ status: "pruned" | "invalid_input" | "backend",
  removedCount?: number, message? }`。
- 只在 `<workspace>/.void/infinite-canvas/scratch/` **内**删除 mtime 超期的
  **文件**，越界一律拒；目录不存在视为成功、`removedCount: 0`。
- 前端调用失败必须静默（不阻塞面板挂载）。

#### 3.9.3 `analyze_infinite_canvas_image` —— 图生提示词（不经主 AI）

画布按钮**不经主 AI**是已写进 `CONTEXT.md` 的既定纪律（走会话会白烧一轮
模型上下文，结果还落在会话里）。故本命令直连既有的读图能力：
复用 `image_analysis` 模块的
`resolve_vision_model_from_global_config()` +
`optimize_image_with_size_limit()` + `build_multimodal_message()`，
以及 `get_global_ai_client_factory()`，
与 `AnalyzeImage` 工具走的是**同一套底层原语与同一组 typed 状态名**。

- 输入：`{ workspacePath: string, relativePath: string,
  detail?: "summary" | "detailed" }`（缺省 `detailed`）。
- 路径纪律：`workspacePath` 绝对且 `is_dir()`；`relativePath` 为**工作区内
  任意相对路径**（读的是用户自己的媒体，因此无目录白名单），但同样
  不得绝对 / 以 `/` `\` 开头 / 含 `:` / 含 `..`，且解析后必须仍在工作区内。
- 输出（typed）：

```jsonc
{
  "status": "completed" | "unsupported_model" | "provider_not_configured"
          | "invalid_image" | "path_denied" | "backend",
  "prompt": "…",   // 仅 completed：倒推出的提示词
  "summary": "…",  // 仅 completed：首行摘要
  "modelId": "…",  // 仅 completed
  "message": "…"   // 仅失败
}
```

- **状态名沿用 `AnalyzeImage` 已有的 typed 集**，不发明新词、不返回字符串
  协议。用户没配视觉模型 → `unsupported_model` / `provider_not_configured`，
  **不得静默**；前端落成卡片上的一行可解释提示（指向设置里的视觉模型），
  不是 toast、不是白屏。
- **不新建 vision Provider、不改 `resolve_vision_model_from_global_config`
  的选型逻辑、不改 `analyze_image_tool.rs`、不改 `modes/media.rs`。**
- 前端行为条款：结果**只填进该卡的依附式输入器**，
  **不自动触发生成**（写死断言），且**不覆盖用户已输入的内容**——
  输入器非空时改为浮出一行"替换 / 追加"的紧凑确认。

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

  // —— P4 加法字段（schemaVersion 保持 '1'，解析器容错读取，旧文档无损）——
  /**
   * 这张生成卡上次选定的生成参数，下次生成沿用。取值必须来自后端真实
   * 允许表（`capabilities.rs`），换模型时由 `normalizeGenerationParams`
   * 夹紧到新模型支持的取值。
   */
  generationParams?: {
    model?: string;
    size?: string;
    resolution?: string;
    n?: number;          // 1..=4，且不得超过所选模型的 nMax
    duration?: number;   // 仅视频卡
    aspectRatio?: string;// 仅视频卡
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

P4 `generationParams` 语义（加法字段）：

- 与 `prompt` / `generation.mediaKind` 同款容错条款：损坏的
  `generationParams`（字符串、数组、非法 `n`、非数字 `duration` 等）按
  **字段缺失**处理，不判 `invalid-document`，且不影响同文档其它节点。
  旧解析器读到该字段直接忽略（节点内未知键本就被丢弃），旧文档无损，
  **不构成 P3 `kind:'video'` 那种整文档拒绝的风险**。
- **AI 不得改这些参数**：`CanvasOp` 的 `update_node` 白名单**不含**
  `generationParams`（保持 §3.6.4 白名单原样）——AI 改参数会放大花钱面，
  与"防失控"条款同源；如需放开另行立项。
- **复制卡片 = 复制引用**（P4）：复制/再制/粘贴带过去 `kind`、`position`
  （偏移后）、`size`、`text`、`prompt`、`stylePresetId`、`generationParams`
  与 `mediaRef`（**同一 workspacePath + relativePath，不复制媒体文件**，
  符合本节"节点内嵌媒体是引用"的既定条款）；**不带** `generation`
  （一个 operationId 只能有一个落点）、`derivedFrom`（血缘属于原卡）、
  `domainRef`（K3 保留字段，任何路径不得赋值）。删卡只删卡，不删媒体文件。

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

**P4（业主已批准，见 [P4 实施计划](../plans/2026-08-25-infinite-canvas-p4-workbench.md)）
覆盖**：全屏查看与另存本地、生成参数（模型/比例/清晰度/时长）、批量出图
`n>1` 落成多张卡、撤销重做、多选与复制粘贴与右键菜单、任务队列面板、
对齐辅助线与吸附。**不新增任何生成能力**，仍不引入新 Provider、渠道或
密钥；后端只有两处可选字段加法（§3.1 的生成参数入参、§3.2 的
`outputMediaItems`），短剧路径零触碰。

**P4 撤销作用域与不可撤销清单**（契约条款，测试断言）：

- **可撤销（用户手动编辑）**：加卡、删卡、拖动（拖动结束的那一次）、
  连线/断线、改文本、改提示词、改风格预设、改 `generationParams`、
  粘贴与再制。
- **不可撤销（typed 拒绝 + 明确说明，不静默）**：

| 操作 | 为什么不可撤销 |
|---|---|
| 生成成功落图（含批量派生卡） | 结果是花过钱的真实产物；撤销 = 悄悄扔掉已付费资产。要删请手动删（走删除确认）|
| AI 的 `CanvasOp` 批次落位 | 另一条写入线且有 `agentOps.appliedSeq` 水位；撤销会让水位与内容脱节，日志重放又补回来 |
| 发起生成 / 重试与失败标记 | 任务已发出，撤销不撤单；撤掉占位卡等于把回流落点删掉 |
| 视口平移缩放 | 不是内容编辑；计入历史会让 Ctrl+Z 变成"回到上一个视角" |

- **历史栈只在内存**：不进文档、不进磁盘，schema 零改动；深度上限 50，
  面板卸载 / 切工作区即清空，重开画布不保留（UI 明说"本次打开有效"）。
- **与 AI/回流并发**：不做整文档快照回滚；逐条反向补丁经
  `mutateDefaultDocument` 排进既有按路径串行队列，并在 mutator 内按最新
  文档前置校验——受影响节点若已获得 `mediaRef`、已挂上 `generation` 或
  已被他人删除，则该条目及更早条目整体作废并给 typed 提示。

**P4 已知取舍："停止等待" ≠ 取消**：后端媒体管线**没有任何中止入口**
（轮询任务是游离的 `tokio::spawn`，无 `JoinHandle`、无 CancellationToken、
无注册表；结果里出现的 `cancelled` 只是供应商回报的状态字符串）。因此
任务面板的按钮叫**"停止等待"**而不是"取消"：前端把该节点置
`generation.status='failed'` + `errorKind='cancelled'`（沿用七类枚举，
不扩枚举），**远端任务继续执行、额度照常消耗**；若结果稍后回流，因锚点
`operationId` 仍在且节点无 `mediaRef`，**图仍会落进这张卡**——这是刻意
保留的行为（钱已经花了，不该把结果扔掉），并有测试断言。真正的后端
取消需要新增中止令牌注册表与新桌面命令，需业主另行批准立项。

**画布跟随软件主题**（2026-08-26 业主定稿，推翻此前"画布是主题例外（恒暗）"
的取舍，该条已作废）。按
[无限画布视觉与交互语言](../design/infinite-canvas-visual-language.md) §1，
画布专属 `--canvas-*` token 仍定义在 `.infinite-canvas-panel` 上，但给出暗色与
浅色两套取值，由主题服务写在 `<html>` 上的 `data-theme-type` 切换，无需重开面板；
minimal 覆盖层只接管字体与间距、不重映射颜色。卡片、依附式输入器、悬浮工具条、
左栏、弹层、连线与手柄随之整体换色。唯一例外是视频卡的内联播放条：它画在视频
画面上而不是画布上，两套主题下都保持浅色图标 + 半透明遮罩。

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

> 其中"批量出图出视频（`n` 固定 1）"一项自 P4 起解除：用户在画布上手动
> 选择的 `n`（1..=4，且不超过所选模型 `nMax`）可批量出图并落成多张卡
> （§3.2/§3.4）。**CanvasOp 单批 ≤ 20 不放宽，`begin_generation` 也不放开
> `n`——AI 仍不得发起批量生成**。

P4 明确不做（详见 P4 计划 §5）：蒙版画笔、裁剪、分镜拆分、图生提示词、
机位预设库、风格缩略图、分组卡渲染、悬空连线建卡与节点缩放手柄、真正的
后端取消、系统剪贴板互通、复制卡片时复制媒体文件、撤销记录持久化、
让 AI 改 `generationParams` 或发起 `n>1` 批量、新 Provider/渠道/密钥、
远程 workspace（继续 fail-closed）、修改短剧任何运行时行为。
