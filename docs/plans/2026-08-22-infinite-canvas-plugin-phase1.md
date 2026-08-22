# 第一期实施计划：无限画布 Canvas 插件 + kunpeng 资产/契约切片（K0+K1）

状态：待业主批准的实施计划（本文档只做计划，不改任何源码）
日期：2026-08-22
上游依据：
- [Canvas 插件平台 PRD](../features/canvas-plugin-platform-prd.md)（最高规范）
- [kunpeng 移植评估报告](file:///D:/codex/kunpeng-plugin-evaluation.md)（`D:\codex\kunpeng-plugin-evaluation.md`）
- `CONTEXT.md`、`AGENTS.md`、`src/web-ui/AGENTS.md`

---

## 1. 目标与范围

**给业主的一段话：** 这一期做三件事。第一，把"图像工具、风格资产、无限画布"
的接口规矩先在纸面上定死（K0），以后每一期都照这套规矩装零件。第二，把
kunpeng 里最值钱的纯数据——161 套真人/2D 风格库、约 84 套 MJ 风格、72 套 MG
动画预设、提示词模板——原样搬进 Void（K1），这一步零风险，因为只是数据。
第三，做一个最小可用的"无限画布"：右侧 Canvas 里多一个页签，你可以在一张
无限大的桌面上摆图片卡片、文字卡片、连线、拖动、缩放，关掉再打开东西还在。
图像编辑五件套（扩图/重绘/擦除/抠图/放大）这一期**只出现按钮和接口占位，
点了会明确告诉你"第二期开通"**，不会真的调用任何图像 API。

做完你能看到的：
1. 在 Media/Cowork 会话的能力栏里多一个"无限画布"入口，点开右侧出现画布页签。
2. 画布上能加文字节点、图片节点（从工作区媒体图库选图）、拉连线、平移缩放。
3. 图片节点上能挑一个 kunpeng 风格预设（挑了只是把风格提示词挂到节点上）。
4. 关闭页签、切换工作区、重启应用后画布内容都能恢复，且**恢复不会自动展开右栏**。
5. 仓库里多一份第三方归属记录（THIRD-PARTY-NOTICES），写清这些资产来自
   MIT 协议的 kunpeng 项目。

**明确不在第一期**：真的调用扩图/重绘等图像 API、画布和短剧工坊的双向同步、
导演台 3D 预演、AI 剪辑、远程 workspace 支持。

### 细节（供执行 AI）

范围 = 评估报告的 K0 + K1，外加"Infinite Canvas Surface 最小可用版"。
Infinite Canvas 在 PRD §4.4 已列为旗舰业务包、§10 P2-A 列为接口压力测试对象；
本期把它**提前为第一方 builtin surface 的最小实现**，理由：P0-A/P0-B 的
registry/service/host/renderer 链路已就绪，新增一个第一方表面按 PRD 退出门
"不需要修改 `PanelContentType`、`FlexiblePanel` switch、`ContentCanvas` 业务
分支或中心配置表"即可完成，正好用真实第三个（第四个）表面再次验证平台契约。

图像五件套只交付类型契约与 `unavailable` 占位实现（见 §4 步骤 K0-2 与 M4），
不引入任何 provider 客户端、不新增密钥配置。

---

## 2. 与 Void 规范的对齐（锁定判断逐条落位)

**给业主的一段话：** Void 有一套已经写死的规矩：右侧画布只是"展示窗口"，
不许当数据库用；后台恢复内容不许自动把右栏弹开；新表面不许去改平台中心
文件。这一期的无限画布完全照这套规矩做：画布文档的真身放在一个新的领域
模块里，画布页签只是它的投影；kunpeng 的东西只借思路和数据，不整树复制。

### 细节（供执行 AI）

| 规范条款 | 本期落位 |
|---|---|
| 贡献点类型（PRD §2.3） | 无限画布 = 一个 **Canvas Surface** 贡献 + 一个新的 **Domain Module**（Infinite Canvas Module，持有空间文档真相）；风格预设 = 领域纯数据（独立 StylePreset 目录服务）；图像五件套 = 未来 **Tool/Capability** 贡献，本期只有契约 |
| 注册进哪些现有 registry | `CanvasSurfaceRegistry`（`src/web-ui/src/shared/services/canvas/CanvasSurfaceRegistry.ts`）+ `CanvasSurfaceRendererRegistry` + `CanvasCapabilityContributionRegistry`，全部经 `registerFirstPartyCanvasSurfaces` / `registerFirstPartyCanvasCapabilities` 同批原子注册（`src/web-ui/src/app/components/panels/content-canvas/registry/firstPartyCanvasSurfaces.ts`、`firstPartyCanvasCapabilities.tsx`），冲突时整批回滚，dispose 对称 |
| 数据真相源（"Canvas 不是真相源"，PRD §2.2/§5.4） | 新增 `src/web-ui/src/shared/services/infinite-canvas/` Domain Module 持有画布文档（节点/边/视口）；Canvas 页签快照只存 `documentId` 等合法引用，不存节点数据。嵌入的媒体图片是对 Workspace Media 的**引用**（路径/资产 ID），不复制媒体真相 |
| 恢复不得擅自展开画布（PRD §2.2/§9.2） | 复用 P0-A 既有机制：`autoExpandOnTabOpen: false` 行为不动；surface 打开走 `CanvasSurfaceCommandService`，只有用户显式点能力入口/Canvas 控制才改变右栏可见性 |
| 不动稳定内核 | 不改 Session/Team/Workflow/权限/恢复日志；不改 `FlowChatStore.ts`、`ChatInput.tsx`、`ContentCanvas.tsx` 业务分支、`ShortDramaCenterPanel.tsx`（AGENTS.md 热点保护） |
| 不整树复制 kunpeng | 只吸收：纯数据资产（MIT，记归属）、`imageTools.ts` 的工具定义与"派生新节点不覆盖"语义、`canvasSync.ts` 的 `workshopRef` 引用协议思路、reactflow 节点/边数据模型。kunpeng 的 zustand store 直写、胖组件、credentials 体系一概不进来 |
| 外部数据只经适配转换 | kunpeng 资产经一次性转换脚本/手工转换成 Void 自己的 typed schema（K0 定义），不透传 kunpeng 文件格式到运行时 |
| 与 AI Short Drama 的关系 | **并存、互不写入**。短剧真相在 `src/web-ui/src/shared/services/short-drama/`（约 60+ 文件）与其专属 Canvas（`content-canvas/short-drama/`）；无限画布不读写短剧项目数据，本期也不建立互引。未来互引走 K3（`domainRef` 类型化引用，思路来自 kunpeng `workshopRef`），另行批准 |
| 新表面不改中心文件 | 仅在 `CanvasSurfaceIds.ts` 增加一个 ID 常量、在两个 first-party 注册函数里追加注册块 —— 这正是 P0-B 退出门认可的扩展方式，不碰 `PanelContentType`/`FlexiblePanel` |

---

## 3. 从 kunpeng 借什么、怎么借

**给业主的一段话：** kunpeng 是 MIT 协议，允许我们改造使用，条件是保留出处
声明。我们分两类：一类"直接吸收"——纯数据和数据结构，改个格式就能用；
一类"只当参考答案"——它的代码思路我们看懂后按 Void 规矩重写，不抄代码。

### 细节（供执行 AI）

**直接吸收（数据/结构，需在 THIRD-PARTY-NOTICES 记 MIT 归属）：**

| 来源（kunpeng 真实路径） | 内容 | 进 Void 的形态 |
|---|---|---|
| `D:\codex\kunpeng\aigc-memory\style-library\index.json` + `live-action\`(67 图) + `2d-animation\`(94 图) | 161 套影像风格（promptTemplate/visualDNA/cameraLanguage/promptSuffix + 缩略图） | 转换为 Void `StylePreset` schema 的数据文件；缩略图**不进入主 bundle**（见 §6 风险） |
| `D:\codex\kunpeng\src\lib\midjourney\styles.ts` + `testedStyles.json` | 约 84 套 MJ 风格参数 | 同上，标 `engineHint: 'midjourney'` |
| `D:\codex\kunpeng\src\lib\omni\styles.ts` | 72 套 MG 动画预设（id/name/category/prompt/guidance/tags/bestFor）+ 8 个分类 + MotionRecipe 结构 | 转换为 `MgStylePreset` 数据；MotionRecipe 五维枚举结构照抄进 K0 契约 |
| `D:\codex\kunpeng\aigc-memory\prompt-templates\`（gpt-image-2/kling/seedance）、`shot-patterns\`、`checklists\`、`reference\` | 提示词模板与操作清单（Markdown 纯文本） | 作为 Skill/领域参考数据搬入（K1 范围内先入库为数据，是否包装成 Void Skill 由业主在 K1 验收时决定） |

**思路吸收、代码重写：**

| 来源 | 借的思路 | 重写原因 |
|---|---|---|
| `D:\codex\kunpeng\src\lib\canvas\imageTools.ts` | `IMAGE_TOOLS` 五工具定义（id/label/instruction/engineId/autoRun）；**每次操作派生新节点、永不覆盖原图**的版本树语义；派生节点带预填充指令待用户补【】占位 | 它直接 `useCanvasStore.getState()` 写 UI store，违反 Void `UI → Module Interface → Adapter` 方向；进 Void 时工具定义成为 K0 契约里的类型化 Tool 描述，执行路径走未来的 Media Provider seam |
| `D:\codex\kunpeng\src\lib\workshop\canvasSync.ts` | `workshopRef = {projectId, kind, id, role}` 引用协议：画布节点只挂类型化领域引用标签；回流只追加候选不覆盖 | 本期只把该协议吸收为 K0 契约中的 `InfiniteCanvasDomainRef` 保留字段（不实现同步）；kunpeng 实现直接 import Tauri fs 与三个 store，不能进来 |
| `D:\codex\kunpeng\src\stores\canvasStore.ts` + reactflow 用法 | 节点/边数据模型（`type: 'image'|'video'|'group'`、`data.generatedImageUrl/referenceImages/description`）；localStorage 只是二级缓存、canvas.json 才是真相的分层；coalesced idle 防抖写盘 | Void 的真相源在 Domain Module 文件持久化，UI store 只做投影；防抖原子写思想保留 |

**归属记录方式：** 新建仓库根 `THIRD-PARTY-NOTICES.md`（当前不存在），条目格式：
项目名（kunpeng）、来源路径、许可证（MIT）、原版权声明全文、我们使用的内容
清单（风格库数据、MG 预设数据、提示词模板、工具定义结构参考）。转换后的每个
数据文件头部加一行来源注释。若仓库治理更倾向放
`src/web-ui/THIRD-PARTY-NOTICES.md`，以业主/仓库惯例为准，二选一，不双写。

---

## 4. 分步任务拆解

**给业主的一段话：** 一共 3 个大步骤、7 个小切片，每片都能独立验收、独立
回滚。顺序是：先写规矩（K0，纯文档），再搬数据（K1，零风险），最后做画布
（M1-M4，动代码但只加新文件、几乎不改旧文件）。

> 仓库规则：每片跑**最小覆盖检查**，按风险扩大；每片一个独立提交。
> 建议分支：`codex/infinite-canvas-k0k1-phase1`（从当时最新 main 基线创建）。

### K0：契约设计（纸面，无代码）

做什么：写一份新的 feature 规范文档，把四套契约定死。
做完你能看到：`docs/features/` 下多一份规范，`docs/README.md` 有链接。

细节：
- 新增 `docs/features/infinite-canvas-and-media-tools-prd.md`，并链入
  `docs/README.md`（AGENTS.md 规定：未链入即视为可删除）。
- **K0-1 风格资产契约**：
  ```ts
  interface StylePreset {
    presetId: string;            // 稳定 ID，转换时由来源 id 派生
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
- **K0-2 图像工具契约（占位，不实现）**：五个工具
  `upscale | expand | inpaint | erase | matting`，字段照抄 kunpeng
  `ImageToolDef` 的语义（label/instruction/engineHint/autoRun），外加 Void
  要求：类型化错误分类（`unavailable|auth|rate-limit|timeout|invalid-input|
  backend|cancelled`）、幂等 operation ID、"派生新版本不覆盖"作为不变量条款。
  声明本期唯一合法实现是返回 `{ status: 'unavailable', reason: 'phase-2' }`。
- **K0-3 媒体 Provider Adapter 契约（占位）**：统一提交/轮询/取消/错误分类
  接口草案，密钥走 Void 设置体系，明确 kunpeng credentials 体系不进入。
- **K0-4 无限画布文档契约**：
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
  interface InfiniteCanvasDomainRef {   // 思路来自 kunpeng workshopRef
    moduleId: string; kind: string; id: string; role: string;
  }
  ```
  持久化条款：文档以 JSON 原子写入 workspace 下
  `.void/infinite-canvas/<documentId>.json`（写临时文件后 rename）；本期每
  workspace 一个默认文档；remote workspace fail-closed（与 Workspace Media、
  Agent Studio 同款 `checkWorkspace` 拒绝）；恢复时 schemaVersion 不认识则
  显式 `incompatible`，不猜。
- 验收：文档评审通过 + `pnpm run check:repo-hygiene`。无代码改动。

### K1：kunpeng 纯数据资产搬入（两个小片）

**K1-a 风格目录 Domain 数据与服务**

做什么：把四类风格数据转换成 K0 schema，放进一个新的只读目录服务。
做完你能看到：测试能列出全部预设并按 family/category 筛选（界面在 M4 出现）。

细节：
- 新增目录 `src/web-ui/src/shared/services/style-preset/`：
  - `StylePresetTypes.ts`（K0-1 契约的 TS 落地）
  - `StylePresetCatalog.ts`（纯逻辑只读服务：list/getById/byFamily/byCategory，
    无 React/Zustand/Tauri 依赖，与 `shared/services/canvas/` 同风格）
  - `data/cinematicStyles.ts`、`data/animation2dStyles.ts`、
    `data/midjourneyStyles.ts`、`data/mgStyles.ts`（转换产物，文件头注明来源）
  - `data/promptTemplates.ts`（gpt-image-2/kling/seedance 模板 + shot-patterns
    + checklists 文本）
  - `StylePresetCatalog.test.ts`（条目数守恒：161/84±实际数/72；ID 唯一；
    schema 字段完备性；不测常量复述，测目录服务行为：筛选、未知 ID 返回
    undefined 而非抛错）
  - `index.ts`
- 缩略图（161 张 jpg，数 MB）：本期**不进 src、不进 bundle**。方案 A（默认）：
  完全不搬缩略图，`thumbnailRef` 留空，选择器用文字卡片；方案 B：放
  `src/web-ui/public/style-presets/`（或 Tauri 资源目录）按需 `<img>` 加载。
  在 K1 动工前由业主二选一（见 §8 审批点）。
- 转换方式：写一次性 Node 脚本在**仓库外**运行生成 data 文件后丢弃，或执行 AI
  手工转换；不把转换脚本或 kunpeng 原始文件提交进 Void。
- 新增仓库根 `THIRD-PARTY-NOTICES.md`（见 §3）。
- 验收命令：
  `pnpm --dir src/web-ui run test:run src/shared/services/style-preset` +
  `pnpm run type-check:web` + `pnpm run check:core-boundaries` +
  `pnpm run check:repo-hygiene`。

**K1-b 数据可见性快验（可并入 K1-a 验收）**

做什么：不做新 UI；用测试与一个临时 Storybook 式预览（如仓库无此机制则跳过）
证明数据完整。真正的用户可见入口在 M4 的风格选择器。
细节：若业主要求"K1 就要看得见"，最小方案是在 Workspace Media 图库详情里加
只读"风格灵感"抽屉——**不推荐**，因为会提前触碰 Media 表面；建议接受
"K1 验收 = 测试数字 + M4 见真容"。

### M1：Infinite Canvas Domain Module（真相源，纯逻辑）

做什么：建画布文档的领域模块：内存模型、校验、原子持久化、恢复。
做完你能看到：测试证明"存进去、读出来、坏文件不炸、并发写不丢"。

细节：
- 新增 `src/web-ui/src/shared/services/infinite-canvas/`：
  - `InfiniteCanvasTypes.ts`（K0-4 契约落地）
  - `InfiniteCanvasDocumentService.ts`：load/save/mutate 命令；save 带
    revision CAS（陈旧 revision 拒绝并返回 typed `conflict`）；防抖合并写盘
    （借 kunpeng coalesced idle 思想，但真相在文件不在 localStorage）
  - `InfiniteCanvasPersistencePort.ts`：持久化端口接口（readFile/writeFileAtomic
    /ensureDir），**服务本身不 import Tauri**；Desktop 适配器实现放
    `src/web-ui/src/infrastructure/`（复用现有文件适配器模式，路径以实施时
    infrastructure 现状为准）
  - `*.test.ts`：schema 校验（未知 schemaVersion → `incompatible`）、CAS 冲突、
    原子写失败回滚、remote workspace fail-closed、损坏 JSON → typed error 不抛
- 不改 canvasStore、不改任何现有 store。
- 验收命令：目标 Vitest + `type-check:web` + `check:core-boundaries`。

### M2：Canvas Surface 贡献注册

做什么：把无限画布注册成第四个第一方表面 + 能力入口。
做完你能看到：能力栏出现"无限画布"，点开右侧出现页签（此时内容还是骨架）。

细节：
- `src/web-ui/src/app/components/panels/content-canvas/registry/CanvasSurfaceIds.ts`
  增加 `INFINITE_CANVAS_SURFACE_ID = 'infinite-canvas'`。
- `firstPartyCanvasSurfaces.ts` 追加 definition：
  - **不声明 `legacyContentType`**（新表面，不劫持既有页签，与 agent-studio 同）
  - `existingInstanceStrategy: 'focus'`
  - `checkWorkspace`：remote → `unavailable`（文案与 Media 一致的口径）
  - `validateInput`：本期 input 为空对象即可（每 workspace 单文档）
  - `createInstanceKey`: `` `${INFINITE_CANVAS_SURFACE_ID}:${workspaceId}` ``
  - 注册块加入现有原子注册链（冲突整批回滚 + dispose 逆序），照抄 agent-studio
    的模板
- `firstPartyCanvasCapabilities.tsx` 追加 capability：
  `capabilityId: 'infinite-canvas'`、labelKey
  `layout.sessionCapabilities.infiniteCanvas`、Lucide 图标（如 `LayoutGrid`/
  `Workflow`，静态、不加新动画——遵守 agent-surface 静态风格）、
  `legacyContentTypes: []`、availability：媒体与 cowork 主会话可用、
  `sessionKind !== 'subagent'`（照 `isAvailableForMediaParentSession` 模式扩展；
  最终会话范围在实施评审确认，缺省从窄：仅 media）。
- `src/web-ui/src/flow_chat/services/sessionCapabilities.ts`：若该能力走
  `deriveSessionCapabilities` 门控（参照 agent-studio 的 4c-1 先例），按同款
  模式增加 `'infinite-canvas'`；保持能力轨对具体表面无知。
- i18n：三语新增 `layout.sessionCapabilities.infiniteCanvas`
  （`src/web-ui/src/locales/`，必要时走 `pnpm run i18n:generate` 契约流程）。
- 验收命令：目标 Vitest（registry 注册/冲突/dispose、能力可用性）+
  `type-check:web` + `check:core-boundaries` + `i18n:contract:test` +
  `i18n:audit`。

### M3：渲染器与 reactflow 懒加载分包

做什么：真正的画布界面：平移缩放、节点、连线。
做完你能看到：页签里是可拖拽的无限画布。

细节：
- 依赖：引入 `@xyflow/react`（reactflow v11 的后继版；kunpeng 用 v11，我们上
  维护中的 v12，节点/边模型兼容）。**必须**只在 surface chunk 内
  `React.lazy`/动态 import，进不了主入口（性能预算红线，见 §6）。
- 新增 `content-canvas/registry/InfiniteCanvasSurfaceRenderer.tsx`：薄壳，
  懒加载实际面板；动态导入失败返回 typed error（照 P0-A 既有模式），有实例级
  错误边界（复用 `CanvasSurfaceErrorBoundary`）。
- 新增面板目录 `content-canvas/infinite-canvas/`（与 `short-drama/`、
  `workspace-media/` 平级）：
  - `InfiniteCanvasPanel.tsx`：ReactFlow 实例 + 节点组件（text/image）；
    所有变更经 M1 的 DocumentService 命令，**组件不直接持久化**
  - `InfiniteCanvasPanel.presentation.test.tsx` 等行为测试（不做样式文本断言，
    遵守测试政策）
- 样式：仅用现有主题 token；提供 classic 基础 + 必要时 `.minimal.scss` overlay。
- 验收命令：目标 Vitest + `type-check:web` + `lint`（定向）+
  `pnpm run build:web`（**必跑**：验证懒加载分包与性能预算，entry JS 余量当前
  约 12.9 万 raw 字节）。

### M4：MVP 交互闭环 + 契约占位

做什么：图片节点接图库、风格选择器、五件套占位按钮、持久化闭环。
做完你能看到：§1 列出的全部五条可见成果。

细节：
- 图片节点选图：读取 `src/web-ui/src/shared/services/workspace-media/`
  的 `WorkspaceMediaLibrary`（只读引用，存 `mediaRef` 相对路径；不复制文件、
  不写 Media 领域）。
- 风格选择器：读 K1 的 `StylePresetCatalog`，选中只写 `stylePresetId` 到节点。
- 五件套按钮：图片节点悬浮菜单渲染 K0-2 契约的五个工具，点击统一弹出显式
  "第二期开通"不可用态（走 typed `unavailable`，不是隐藏、不是 toast 字符串
  协议）。
- 持久化闭环：打开表面 → load 文档；编辑 → 防抖 save（CAS）；关页签/收起
  Canvas 不清状态（不变量 §9.2-3）；重启后 restore 走既有 restore 通道且
  不自动展开右栏。
- 手工验收清单（业主可自己点）：
  1. Media 会话能力栏点"无限画布"→ 右栏展开出现页签
  2. 加文字节点、从图库加图片节点、连线、拖动、滚轮缩放
  3. 图片节点挑一个风格，节点上出现风格标签
  4. 点"智能扩图"→ 显示"第二期开通"，无任何网络请求
  5. 收起 Canvas → 重新展开，内容还在
  6. 重启应用 → 页签可恢复且右栏保持上次可见性，不自动弹开
  7. 切到 workspace B 再回 A，两边画布互不串线
  8. 短剧、图库页签一切照旧（回归）
- 最终验收命令（全量门）：相关目标 Vitest 全绿 +
  `pnpm run type-check:web` + `pnpm run lint:web` +
  `pnpm run check:core-boundaries` + `pnpm run check:repo-hygiene` +
  `pnpm run i18n:contract:test` + `pnpm run i18n:audit` +
  `pnpm run build:web`（含性能预算）；按仓库惯例跑一次
  `pnpm --dir src/web-ui run test:run` 全量确认无回归。

---

## 5. 明确不做清单（第一期外）

- ❌ 任何图像 API 调用（gpt-image-2、RunningHub/topaz、快子、方舟等）——K2
- ❌ 渠道 Provider Adapter 实现与密钥配置——K2
- ❌ 画布 ↔ 短剧/工坊双向同步（`domainRef` 只留字段不实现）——K3
- ❌ 分镜提示词表、资产候选版本树、导演约束卡并入短剧——K3（随 P1-B）
- ❌ 导演台 3D 预演（three.js）、配音——K5
- ❌ AI 剪辑——评估结论为不建议移植
- ❌ 远程 workspace 支持（fail-closed，与 Media/Agent Studio 同口径）
- ❌ kunpeng DSH/ACP 桥代码——仅作 Void P2-B 的参考读物
- ❌ 视频节点、分组节点、多文档管理、协作/分享——后续按需另批
- ❌ 修改 Short Drama、Workspace Media、Flow Chat、Team 任何 runtime

---

## 6. 风险与依赖

**给业主的一段话：** 三个主要风险：一是和正在排队的 Agent Studio 收尾工作
（P1-A2-4）撞车——规范说它没批完之前"不得扩展到更多业务表面"，所以本期
的画布表面部分要么排在它后面，要么由你明确豁免；二是画布库是个不小的新
依赖，必须保证不拖慢应用启动；三是 161 张风格缩略图有几兆大，不能塞进安装
包主体。三个都有现成对策。

### 细节（供执行 AI）

1. **与 P1-A2-4 的顺序**：PRD §15 明文"在 A2-4 获批前不得扩展到更多业务表面"。
   - K0（纯文档）与 K1（纯数据 + 无 UI 服务）**不触碰任何表面**，可与 A2-4
     并行推进，互不阻塞——两者文件集合零交集（A2-4 在 agent-studio/
     customization，本期 K0/K1 在 docs、style-preset、根 NOTICES）。
   - M2-M4（新表面）与该锁定直接冲突。两个合法路径：**(a)** 默认：等 A2-4
     通过 P1-A 退出门后再动工 M2；**(b)** 业主在批准本计划时明确书面豁免
     "无限画布最小表面先行"。冲突文件仅 `CanvasSurfaceIds.ts`、
     `firstPartyCanvasSurfaces.ts`、`firstPartyCanvasCapabilities.tsx`、
     `sessionCapabilities.ts` 四处追加块，与 A2-4 的接线改动同文件不同块，
     若并行须在 A2-4 合入后 rebase，由后动工方承担合并。
2. **reactflow 依赖审查**：选 `@xyflow/react`（MIT，v12，活跃维护；kunpeng 的
   `reactflow@11` 已停更为兼容包）。审查项：MIT 许可 ✅；无原生依赖 ✅；
   包体积约 45-55 KB gzip——**强制懒加载**在 infinite-canvas surface chunk，
   `build:web` 的入口预算门是硬验收（当前 entry 余量约 129 KB raw / 预算内
   gzip 余量约 31 KB，reactflow 一旦进入口立刻打爆，必须用动态 import 验证
   chunk 归属）。若 v12 API 与团队评审不合，退回 `reactflow@11.11.4`
   （kunpeng 同款）亦可，同样懒加载。
3. **缩略图体积**：不进 src bundle；K1 审批时二选一（不搬 / public 目录按需
   加载）。
4. **数据转换保真**：161+84+72 条目数在测试里守恒断言；转换丢字段属验收失败。
5. **持久化新面**：`.void/infinite-canvas/` 是新的 workspace 内写入路径，须
   确认不触发 workspace 文件监控风暴（Media discovery 等）；实施时验证该目录
   被媒体发现器忽略或加忽略规则（改动若涉及 Media 模块须单独说明并最小化）。
6. **i18n 契约**：新增 key 走契约流程，漏一门 `i18n:audit` 会红——纳入 M2 验收。
7. **既有基线债**：Desktop lib-test 的 Team fixture 缺 `delegation_policy` 是
   已记录基线阻断，与本期无关，不得计入本期失败，也不得顺手去修。
8. **执行 AI 交付验证**：按业主既往教训（MEMORY），每片验收必须真跑
   `build:web`，不能只看 type-check/lint 绿。

---

## 7. 审批点（哪几步开工前需要业主批准）

| # | 审批点 | 决策内容 |
|---|---|---|
| A1 | K0 动工前 | 批准本计划整体 + 新 feature 规范文档立项 |
| A2 | K1 动工前 | 确认 K0 契约评审通过；**二选一**：缩略图不搬 / 放 public 按需加载；确认 THIRD-PARTY-NOTICES 放仓库根 |
| A3 | M2 动工前（关键） | 二选一：等 P1-A2-4 完成后动工 / 明确豁免"无限画布表面先行"；同时批准引入 `@xyflow/react` 新依赖 |
| A4 | M4 验收后 | 业主按 §4-M4 手工清单实机验收；通过后才更新 `CONTEXT.md` 与 PRD 阶段状态、推送 |

每个审批点之间的工作可独立回滚（K0 删文档、K1 删 style-preset 目录 + NOTICES、
M1-M4 各为独立提交且不改持久化格式之外的既有数据）。

---

## 8. 完成定义（第一期退出门）

- K0 契约文档已链入 `docs/README.md` 并通过评审。
- `StylePresetCatalog` 数据条目守恒、测试绿、归属记录在案。
- 新增 infinite-canvas 表面**没有**修改 `PanelContentType`、`FlexiblePanel`
  switch、`ContentCanvas` 业务分支、`SessionCapabilityRail` 中心映射（P0 退出门
  条款复检）。
- §4-M4 的 8 条手工验收全部通过，全部验收命令绿（含 `build:web` 性能预算）。
- 五件套按钮存在且全部显式 `unavailable`，零网络调用。
- `CONTEXT.md`、PRD 阶段状态、`docs/README.md` 已更新并链接证据。
