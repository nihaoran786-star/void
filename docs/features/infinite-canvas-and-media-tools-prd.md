# 无限画布与媒体工具契约规范（K0）

状态：当前契约规范；K0 已定稿，K1（风格资产数据搬入）据此实施
建立：2026-08-22
上游规范：[Canvas 插件平台产品与架构规范](canvas-plugin-platform-prd.md)（最高规范，
见其 §2.2 画布定位与 §2.3 贡献点类型）
实施计划：[2026-08-22 无限画布第一期实施计划](../plans/2026-08-22-infinite-canvas-plugin-phase1.md)
外部来源：kunpeng 项目（MIT 许可，归属见仓库根 [THIRD-PARTY-NOTICES.md](../../THIRD-PARTY-NOTICES.md)）

> 本文固化第一期（K0+K1+M1-M4）的四套接口契约。契约先于实现：图像工具与
> 媒体 Provider 在本期只有类型与占位实现，任何真实调用都属于第二期，需另行批准。

## 1. 范围与定位

按上游 PRD §2.3 的贡献点分类，本期涉及四类贡献：

| 契约 | 贡献点类型 | 本期交付形态 |
|---|---|---|
| K0-1 风格资产 | 领域纯数据（独立 StylePreset 目录服务） | K1 实现：只读目录服务 + 转换数据 |
| K0-2 图像工具 | 未来 Tool/Capability 贡献 | 仅契约与 `unavailable` 占位 |
| K0-3 媒体 Provider | 未来 Provider Adapter 贡献 | 仅接口草案，零实现 |
| K0-4 无限画布文档 | Canvas Surface + Domain Module | M1-M4 实现；Canvas 页签只是投影 |

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

## 3. K0-2 图像工具契约（占位，不实现）

五个工具，语义承接 kunpeng `imageTools.ts` 的 `ImageToolDef`（思路吸收、
代码重写）：

```ts
type ImageToolId = 'upscale' | 'expand' | 'inpaint' | 'erase' | 'matting';

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
  derivedNodeId?: string;      // 成功时新派生节点的 ID
}
```

不变量条款：

- **派生新版本、永不覆盖**：每次图像操作产出一个新节点（版本树语义），原图
  节点与其 `mediaRef` 不被修改或删除。
- **本期唯一合法实现**是显式占位：任何工具调用返回
  `{ status: 'failed', error: { kind: 'unavailable', message: 'phase-2' } }`，
  UI 呈现"第二期开通"的显式不可用态——不是隐藏按钮、不是 toast 字符串协议。
- 零网络调用、零 Provider 客户端、零密钥配置进入本期代码。

## 4. K0-3 媒体 Provider Adapter 契约（占位）

统一的提交 / 轮询 / 取消接口草案，错误分类与 K0-2 同一套枚举：

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

条款：

- 密钥与账号走 Void 既有设置体系；**kunpeng 的 credentials 体系不进入 Void**。
- 本期不落任何 Provider 实现文件；上述接口在第二期随首个 Provider 实装时
  允许在评审内做非破坏性补充（新增可选字段），不允许改变已定字段语义。

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
}

interface InfiniteCanvasEdge {
  edgeId: string;
  sourceNodeId: string;
  targetNodeId: string;
}

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

本期明确不做（详见实施计划 §5）：任何图像 API 调用、Provider 实现与密钥
配置、画布与短剧/工坊双向同步、3D 预演、AI 剪辑、远程 workspace 支持、
视频/分组节点的完整交互、多文档管理。每一项都需要业主另行批准后进入
后续 K2/K3/K5 切片。
