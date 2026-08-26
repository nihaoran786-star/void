# 第五期实施计划：创作能力增强（P5）

状态：待业主批准的实施计划（本文档只做计划，不改任何源码）
日期：2026-08-26
业主已批准范围：[无限画布能力差距清单](../features/infinite-canvas-capability-gap.md)
的 **P2 档四项**：P2-1 蒙版画笔（圈选重绘 / 擦除）、P2-7 风格缩略图、
P2-3 裁剪、P2-5 图生提示词。

上游依据：

- [无限画布视觉与交互语言](../design/infinite-canvas-visual-language.md)（**本期新增的一切 UI 以它为准**）
- [无限画布与媒体工具契约规范](../features/infinite-canvas-and-media-tools-prd.md)（契约；本期修订 §2/§3）
- [Canvas 插件平台 PRD](../features/canvas-plugin-platform-prd.md)（最高规范）
- [第一期](2026-08-22-infinite-canvas-plugin-phase1.md)、[K2](2026-08-23-infinite-canvas-k2-image-tools.md)、
  [P3](2026-08-24-infinite-canvas-p3-agent-canvas.md)、[P4](2026-08-25-infinite-canvas-p4-workbench.md)
- `AGENTS.md`、`src/web-ui/AGENTS.md`、`CONTEXT.md` 无限画布条目
- 参考实现：kunpeng（MIT，见 `THIRD-PARTY-NOTICES.md`）——本期对它做了**逐文件核实**，
  结论见 §2.1，与差距清单当初的转述**有出入**，以本文为准

**核心前提（延续 K2/P3/P4，业主已定）：不引入任何新 Provider、渠道或密钥。**
本期确实新增"会画什么"（蒙版定位），但走的仍是现有 APIMart 管线与现有
`GenerateImage`，没有新模型、没有新接口密钥。

---

## 1. 目标与做完能看到什么

**给业主的一段话：** 这一期给画布补四件创作上的手感。做完之后：

1. **圈出来重画 / 擦掉。** 选中一张图，点工具条的"局部重绘"或"擦除"，
   图会铺满屏幕，你拿一支红笔把要改的地方涂上（可以涂、可以拉框、可以擦掉涂错的、
   可以撤销），写一句"这里换成一顶帽子"，点生成 —— 旁边长出一张新卡。
   原图一个像素都不动。这比现在"用文字描述位置"靠谱得多。
2. **风格能看见了。** 317 套风格里的 161 套会带上小样图，选风格时是一片缩略图墙
   而不是一列名字。剩下的 156 套（MJ 与 MG 预设）本来就没有小样图，
   会显示一个稳定的色块加名字，不会一半有图一半空着显得坏掉。
3. **裁剪。** 工具条上多一个裁剪按钮，在图上拉一个框，确认后旁边长出一张裁好的新卡，
   原图照旧不动。裁出来的文件会正常出现在素材库里。
4. **图生提示词。** 点一下，AI 看一眼这张图，把倒推出来的提示词直接填进这张卡的
   输入器里，你可以接着改。

**本期不覆盖**：分镜拆分器、多图标注融合、机位预设库、分组卡、真正的无损放大、
画布↔短剧中心同步 —— 见 §6。

### 细节（供执行 AI）

四条能力线，全部长在 P4 已验证的骨架上：

- **画布文档的唯一写入通道仍是 `InfiniteCanvasDocumentService.mutateDefaultDocument`**，
  本期不新增第二个 writer。
- **派生一律走 `beginDerivedOperationContent`**（`InfiniteCanvasGenerationContent.ts:122`），
  有图的卡的 `mediaRef` 在任何路径下都不可变更（测试断言的不变量）。
- **生成一律走 `DirectImageGenerationGateway`**（`submit_infinite_canvas_media_job`），
  不经主 AI、不烧模型上下文。
- 后端只有两处新增命令（§4-R1、§4-R2），**不改 `media_tools.rs`、不改
  `capabilities.rs`、不改 `jobs.rs`、不碰短剧任何路径**。

---

## 2. 核心架构选型与理由

### 2.1 蒙版画笔：对标产品到底怎么做的（逐文件核实结论）

**给业主的一段话：** 差距清单里那句"对标产品在原图上画红标当参考图"
**方向是对的，但细节记错了一半**。我们真去读了它的代码：

- 它确实是**把你涂的红色直接烧进原图**，做成一张"带红标的新图"。
- 但它**做完就停了**——只把这张带红标的图存成一个新节点，**不自动发给 AI**，
  要你自己再从这个新节点点生成。
- 它**从头到尾没有"蒙版"这个参数**。整个仓库里跟图像生成有关的请求里，
  没有 mask / mask_image 这种字段，一个都没有。
- 它文件开头的注释写着"合成后交给 gpt-image-2、提示词里说红色标记区域"，
  **但代码里根本没有这段**——注释在吹牛。

**结论：没有"蒙版参数"这条路可搬，只有"红标合成图"这条路。**
而这条路我们的通道完全支持，并且我们可以比它做得更完整：
**涂完直接连着提示词一起发出去**，不用用户手动再点一次。

### 细节（供执行 AI）

**核实证据（kunpeng，只读核对）：**

| 事实 | 证据 |
|---|---|
| `MaskPaintEditor.tsx` 确认时**不调用任何生成** | `MaskPaintEditor.tsx:220-221` 注释 `// 涂红后直接新建一个成品图节点（内容=原图+红色标记），不触发 AI。`；文件内无 `generateForNode` 引用 |
| 合成方式 = 原图 + 涂层两次 `drawImage`，导出 PNG | `MaskPaintEditor.tsx:208-218`：`oc.drawImage(imgBitmap,0,0); oc.drawImage(mask,0,0); out.toDataURL('image/png')` |
| 标记颜色 | `MARK_COLOR = 'rgba(255,46,46,0.55)'`（填充）、`MARK_STROKE = 'rgba(255,46,46,0.95)'`（矩形描边，lineWidth 4）；笔刷 8–120，默认 36；橡皮 = `globalCompositeOperation='destination-out'`；撤销栈存 `ImageData`，上限 30 |
| 涂层 canvas 用**原图自然像素尺寸**，屏幕坐标按 `canvas.width/rect.width` 换算 | `MaskPaintEditor.tsx:53-60` |
| 落盘位置 | `saveCanvasImage`（`assetPersist.ts:31-50`）→ `<workspace>/images/<prefix>_<ts>_<n>.png`，前缀 `inpaint-mark` / `erase-mark`；节点只存路径，不存 data URL（localStorage 配额原因，文件头有说明） |
| 真正会发请求的是 `imageTools.ts`，它传的是**未加工的原图**当参考 + 一段文字指令 | `imageTools.ts:57-68`：`generationMode:'image-to-image'`, `referenceImages:[{url: srcUrl}]`，无 mask |
| 全仓库无 mask 参数 | `client.ts` 三条请求路径（`/v1/videos` 的 `images[]`、`/v1/images/edits` 的重复 `image=@file`、`/v1/images/generations`）**均无 mask 字段** |
| 指令模板（含【】占位，用户补全后才生成） | `imageTools.ts:23-41`，如 inpaint：`将画面中的【描述要改的部分】替换为【描述新内容】，其余区域保持与原图完全一致。` |
| 无 i18n | 仓库无 i18n 框架，全是硬编码中文 —— 我们不能照抄字符串，必须走三语 key |

**我们的通道能不能承接（核实结论）：**

| 通道 | 事实 | 结论 |
|---|---|---|
| `GenerateImage`（`media_tools.rs:1244`，schema 在 1271） | 属性只有 `prompt / model / image_urls / size / resolution / n / official_fallback / google_search / google_image_search / short_drama / infinite_canvas`。**没有 `mask`、没有 `strength`** | 只能走"合成图当参考" |
| `image_urls` 描述（`MEDIA_IMAGE_URLS_DESCRIPTION`，`media_tools.rs:22`） | "Accepts public URLs, data:image data_url values, or uploaded image references" | data URL 理论可行，但见下条 |
| `submit_infinite_canvas_media_job`（`infinite_canvas_media_api.rs:274`） | `local_reference_paths` 里的每一项都先经 `upload_media_image_for_public_url` 换成公网 URL 再提交；`image_urls` 原样透传 | **推荐走 `localReferencePaths`**：这是 K2 起就在跑的既验证车道，data URL 直传属于未验证分支，不在本期冒险 |
| `UploadMediaImage`（`media_tools.rs:1513`） | schema 只有 `{ path: string }`，**只吃路径，不吃字节、不吃 data URL** | 合成图**必须先落成真实文件** |
| `validate_request`（`infinite_canvas_media_api.rs`） | `localReferencePaths` 必须是**工作区相对路径**、不得绝对、不得含 `:`、不得含 `..` | scratch 目录必须在工作区内 |

**选型（P5-A，推荐）：前端合成红标图 → 写进工作区 scratch 目录 →
以 `localReferencePaths` 提交 → 派生新卡。**

理由：
1. 唯一与后端事实相容的方案（没有 mask 参数可传）。
2. 复用 K2 起就在生产上跑的上传→提交→回流链路，零新增提交路径。
3. 比 kunpeng 更完整：它涂完要用户再点一次，我们一次点完。

**被否掉的方案：**

- **P5-B：合成图转 data URL 塞 `imageUrls`。** 不落盘，看似更干净。否掉的理由：
  这条分支从未被本仓库任何生产路径走过（画布一直走 `localReferencePaths`），
  且一张 1024² PNG 的 base64 约 1.5–2MB，要穿过 Tauri IPC 与 APIMart 提交体，
  失败模式不可控。**留作 R1 若被业主砍掉时的降级选项，需先做一次真实连通性验证。**
- **P5-C：把红标图存进素材库当正式素材。** 否掉：这是一张中间产物，
  不是业主的媒体真相，进素材库会污染图库（见 §2.2 的落盘纪律）。

**合成实现要点（照抄 kunpeng 的几何与颜色，代码全部重写）：**

- 涂层 canvas 尺寸 = 原图自然像素；屏幕→自然坐标换算与笔宽缩放同 kunpeng。
- 标记色沿用 `rgba(255,46,46,0.55)` / 描边 `rgba(255,46,46,0.95)`——
  红色在自然图像里最不容易与内容混淆，这是它能被模型定位的前提。
  **这个颜色是功能常量，不是主题色，不进 `--canvas-*` token，也不随明暗主题变。**
- 工具：笔刷（大小 8–120，默认 36）、矩形、橡皮（`destination-out`）、
  清空、撤销/重做（`ImageData` 栈，上限 30 —— 与画布自己的撤销栈**完全隔离**，
  不进 `infiniteCanvasHistory.ts`）。
- 导出前**必须**用 `createImageBitmap` 从 data URL 解码，**不得**直接
  `drawImage(<img>)`：kunpeng 在 `MaskPaintEditor.tsx:204-207` 与
  `ImageCropEditor.tsx:58-61` 两处都记了 canvas 被 `asset://` 污染导致
  `toDataURL` 抛 "The operation is insecure" 的教训。我们的源本来就是
  `resolveInfiniteCanvasMediaPreviewUrl` 产出的 **data URL**（`forceDataUrl:true`），
  同源不会污染——但仍统一走 `createImageBitmap`，**不给后人留退回 `convertFileSrc` 的口子**。

**指令拼装（本期新增，写进契约）：** 不沿用现有 `IMAGE_TOOL_DEFINITIONS`
的原文，为蒙版路径新增两条模板 key（三语），语义为
"只修改图中**红色半透明标记覆盖**的区域，其余像素保持与原图完全一致" +
用户补全的一句话；erase 的后半句改为"用与周围环境一致的内容自然填补"。
**源码零新增 CJK，全部走 i18n。**

### 2.2 中间产物落盘纪律：scratch 目录在哪，谁清理

**给业主的一段话：** 涂红后合成的那张图是"给 AI 看的草稿"，不是你的作品。
它会写进工作区里一个隐藏的临时文件夹，**素材库看不到它**，
下次打开画布时超过 7 天的会被自动清掉。

### 细节（供执行 AI）

**核实：素材库的发现方式是目录扫描，没有索引、没有注册表。**
`WorkspaceMediaLibrary.ts:37` 的 `MANAGED_MEDIA_SOURCES` 只扫四个根：
`media/generated`、`media/input`、`.void/media/generated`、`.void/media/uploads`。
`scanLibrary`（:766）BFS 遍历这四个根。**只要不落在这四个根下，素材库就发现不了。**

- **scratch 路径**：`.void/infinite-canvas/scratch/<operationId>-mark.png`
  —— 不在四个扫描根内 ✅，是工作区相对路径且无 `..`、无 `:`
  ✅（满足 `validate_request` 的 `localReferencePaths` 约束）。
- **命名以 `operationId` 为准**，与派生卡的 `operationId` 一一对应：
  重复提交同一 `operationId` 覆写同一文件，不产生垃圾堆积（幂等）。
- **清理**：面板挂载时触发一次异步清理（删除 mtime > 7 天的文件），
  失败静默（清理不是关键路径，不得因此弹错或阻塞面板）。
  不做引用计数、不做即时删除——生成失败后用户可能要重试同一张标记图。
- **裁剪产物则相反**，它是业主的作品，必须进素材库：见 §2.3。

### 2.3 裁剪：本地图像写出能力核实，落盘路径与 mediaRef 登记

**给业主的一段话：** 核实下来有一个必须补的洞：**网页端目前没有办法把
图片字节写成文件**——现有的写文件接口只吃文本。所以裁剪（和上面那张红标图）
都需要后端补一个很小的命令："把这段图片数据存成这个文件"。这是本期唯一
实质性的后端新增，两件事共用同一个命令。

### 细节（供执行 AI）

**核实结论（这是本期最关键的一条）：**

| 事实 | 证据 |
|---|---|
| 网页端唯一的写文件通道是 `workspaceAPI.writeFile / writeFileContent` | `WorkspaceAPI.ts:231/242` → Tauri `write_file_content`（`commands.rs:2523`）→ `write_text_file`（`path_target.rs:243`）→ `write_file_with_options(path, content: &str, …)` |
| **它只吃 `&str`，原样写入，没有 base64 解码** | 同上；全仓库搜 `write_binary` / `write_bytes` / `save_base64` **零命中** |
| 读是不对称的——**读二进制是可以的** | `read_file_content` → `FileSystemService::read_file`（`operations.rs:154-163`）检测二进制后返回**裸 base64** + `encoding:"base64"` |
| 只有 Rust 侧会写媒体字节 | `save_generated_media_assets_with_downloader`（`jobs.rs:788`，`tokio::fs::write` 在 864） |
| `mediaRef.relativePath` 是**工作区相对路径**（含 `media/generated/` 前缀），不是批次内相对 | `generated_media_relative_path`（`jobs.rs:703`）`normalized[index+1..]` 保留 `media/generated/…`；`infiniteCanvasMediaFilePath`（`infiniteCanvasPreviewResolver.ts:30`）用 `joinWorkspaceMediaPath` 直接拼接，**不插入任何目录** |

**所以：mediaRef 可以指向工作区内任意相对路径**，不限于 `media/generated`。
这让裁剪产物有了干净的落点。

**裁剪落盘选型（推荐）：`media/input/canvas-crops/<sourceName>-crop-<ts>.png`**

- `media/input` 是 `MANAGED_MEDIA_SOURCES` 里 `createIfMissing:true` 的扫描根
  → **下一次扫描即被素材库发现**，不需要写任何索引 ✅
- `source` 归为 `input` 而不是 `generated`，这是**诚实的**：没有模型跑过、
  没有消耗额度、没有 `manifest.json`。
- **不伪造 `generatedIdentity`**：`WorkspaceMediaLibrary.ts:108` 的正则
  `^(?:media/generated|\.void/media/generated)/([^/]+)/[^/]+-(\d+)\.[^/.]+$`
  只认 `media/generated`；裁剪产物不匹配，`generatedIdentity` 为空。
  图库条目按视觉语言 §"图库条目的显示名"规则回退到**所在目录名**
  （`canvas-crops`）+ 文件名，这条降级路径已经存在，不需新写。
- **被否掉**：塞进 `media/generated/canvas-crop-<ts>/image-001.png` 以骗取
  批次身份。否掉理由：`media/generated` 的每个目录在 Rust 侧都有配套
  `manifest.json`，伪造批次会让"生成产物"这个概念失真，也会让未来的对账逻辑
  看到无主批次。

**裁剪的 mediaRef 登记：** 新卡走 `beginDerivedOperationContent`
（`toolId` 用本期新增的 `'crop'` 语义，见 §3），随即在同一次 mutate 里
把 `mediaRef = { workspacePath, relativePath: 'media/input/canvas-crops/…' }`
写进这张**新卡**。原卡零改动。
**注意：这是本期唯一一处"派生卡的 mediaRef 由前端直接写入"**（其余都由
`InfiniteCanvasMediaBridge` 回流写入），因为没有媒体任务、没有 batch。
契约里必须为此加一条明确条款（§3），否则后人会以为不变量被破坏了。

**裁剪不消耗任何额度、不发任何网络请求**，是纯本地操作——UI 上要说清楚。

### 2.4 风格缩略图：体积核实、搬运方案、降级

**给业主的一段话：** 核实结果有两个坏消息和一个好消息。

坏消息一：**原图非常大。161 张一共 296 MB**，平均一张 1.8 MB，
都是 1024×1024 的完整样图，压缩得极差。**原样搬是绝对不行的。**
好消息：把它们重新压成 320 像素的小图，一共大概 4 MB，够用了。

坏消息二（**这条需要你拍板**）：这 161 张图**在对标产品自己的第三方声明文件里
一个字都没提**——它的 `THIRD-PARTY-NOTICES.md` 里根本没有风格库这一条。
而这些图的文件名直接就是《原神》《千与千寻》《双城之战》《JOJO的奇妙冒险》
《名侦探柯南》LEGO、Minecraft、GTA、Wes Anderson 电影、《权力的游戏》……
图的内容也是照着这些作品画的。搬进来等于把一批**没有出处说明、且明显取材于
他人作品**的图放进我们的安装包。这不是技术问题，是你要不要担的风险。
三个选项写在 §7。

### 细节（供执行 AI）

**核实数据（kunpeng `aigc-memory/style-library/`）：**

| 项 | 数值 |
|---|---|
| 文件数 | **161 张 .jpg**（`live-action/` 67 + `2d-animation/` 94），无 png/webp |
| 总体积 | **296.4 MB**（`2d-animation` 190 MB + `live-action` 108 MB） |
| 单张 | 平均 1.84 MB；最小 554 KB（`Q版草图.jpg`）；最大 4.37 MB（`复杂线条.jpg`） |
| 像素 | **1024×1024 ×143 张，1254×1254 ×18 张**，全部正方形。是全尺寸样图，不是缩略图 |
| 清单 | `index.json`（1625 行）：`styles[].thumbnail` = 分类相对路径，**basename 就是人类风格名，含空格与中日文**（如 `live-action/Wes Anderson 布达佩斯大饭店.jpg`） |
| id ↔ 文件名 | **没有推导规则**，只能靠 `thumbnail` 字段显式映射；`id` 是 `<category>-<slug>`，`name` 是另一个描述性中文名（如 `对称粉彩童话`），三者互不相等 |
| 归属声明 | kunpeng 的 `THIRD-PARTY-NOTICES.md`（60 行）**完全没有风格库条目**；grep `style-library|aigc-memory` 零命中 |

**我们侧的现状：** `StylePreset.thumbnailRef?: string` **字段已经存在**
（`StylePresetTypes.ts:43`，注释写着"phase 1 留空"），四个 data 文件
（`cinematicStyles.ts` 67 / `animation2dStyles.ts` 94 / `midjourneyStyles.ts` 84 /
`mgStyles.ts` 72 = 317）无一填充。所以**本期不动 schema，只填字段**。

**搬运方案（推荐，方案 B'）：离线再编码 + `public/` 按需加载。**

- **再编码规格（硬性）**：长边 **320px**、**WebP**、质量 ~72、去除 EXIF。
  目标：单张 ≤ **48 KB**，161 张合计 ≤ **6 MB**（预期约 4 MB）。
  转换脚本**在仓库外**一次性运行后丢弃（沿用第一期"转换脚本不入库"的做法）。
- **落点**：`src/web-ui/public/style-presets/<family>/<presetId>.webp`。
  - **文件名一律用 `presetId`**，不保留原始 CJK/空格文件名：既拿到确定的
    id↔文件映射，也顺手避开 IP 作品名直接出现在我们的文件树里。
  - `thumbnailRef` 填 `style-presets/<family>/<presetId>.webp`（相对引用，
    与 schema 注释一致）。
- **为什么不进 `src/`**：`public/` 由 Vite 原样拷进 `dist/`
  （`vite.config.ts:96` `outDir:'../../dist'`，未覆盖 `publicDir`），
  **不参与 JS/CSS 打包**。
- **体积预算核实**：`scripts/check-web-performance-budget.mjs` +
  `scripts/web-performance-budget.json` 只度量 **JS**（`maxRawBytes 2,399,568`）
  与 **CSS**（`maxRawBytes 650,806`）两类资产，并检查
  `requiredDynamicEntries` / `staticGraph.localUnreachable` 里的
  `InfiniteCanvasPanel.tsx`。**`public/` 里的图片既不计入 JS 也不计入 CSS，
  因此 `build:web` 的预算不受影响** —— 这一点必须在 W5 片用一次真实
  `build:web` 证明，不得只靠推理。
- **但安装包会变大约 4 MB**，这是真实代价，写进风险 §6。
- **新增护栏**：`scripts/check-repo-hygiene`（或 W5 新增的一个 node 脚本）
  加一条断言：`src/web-ui/public/style-presets/` 总字节 ≤ 6 MB 且单文件 ≤ 48 KB。
  没有这条，后人补图时会悄悄把安装包撑大。
- **加载方式**：`<img loading="lazy" decoding="async" src={thumbnailRef}>`，
  浏览器按需拉取；**不预加载、不打进任何 chunk**。缩略图是本地静态资源，
  **不经过 `resolveWorkspaceMediaPreviewUrl`、不经过 `convertFileSrc`**
  —— 那两条是给工作区文件用的，与本条无关（但选择器里同屏出现的**媒体**
  缩略图仍必须走 `forceDataUrl`，别搞混）。

**降级呈现（MJ 84 + MG 72 = 156 套无缩略图）：**

- 视觉语言 §7 已定调："暂无缩略图时用纯色块 + 名称"。具体化为：
  一个**由 `presetId` 哈希确定性推导**的柔和色块（同一风格永远同一颜色，
  不随渲染变化），色块中央是风格名的**前两个字**，下方是完整名称。
  色块取值必须在**明暗两套主题下都可读**（用 `--canvas-*` token 的
  中性层 + 低饱和度 accent 变体，不写死颜色）。
- **禁止**"有图的显示图、没图的显示空白框"这种半残呈现——
  两种形态都要是完成态，网格里高度与圆角完全一致。
- 缩略图**加载失败也走同一个降级**（`onError` → 色块），
  不允许出现浏览器破图图标。

**许可归属：** 沿用 `THIRD-PARTY-NOTICES.md` 既有的 kunpeng（MIT）条目，
并在"What we use"下**改写现有那句 `Thumbnails were not copied (owner decision:
option A)`**，替换为本期实际做法：搬入的张数、再编码规格、落点目录、
`thumbnailRef` 已填充，并**如实记录**上游 kunpeng 自身对该资产未作任何
第三方声明这一事实（见 §7 选项 2）。

### 2.5 图生提示词：读图能力核实与路径选型

**给业主的一段话：** 好消息：**我们已经有能读图的能力，而且是真的能跑，
不是空壳**。有一个叫 `AnalyzeImage` 的工具，会去拿你在设置里配的那个
"视觉模型"，把图发过去，让它描述内容。所以这一项**可以做**。

只有一个岔路要你选：画布上的按钮按我们的规矩**不该经过左边的主 AI**
（那样白烧上下文）。要做到"点一下直接出结果"，后端要补一个小命令。
如果你想把后端改动压到零，也可以让它走主 AI，代价是每次都吃一轮对话。
选项写在 §7。

### 细节（供执行 AI）

**核实结论：**

| 事实 | 证据 |
|---|---|
| `image_analysis` 模块真实存在且非桩 | `src/crates/assembly/core/src/agentic/image_analysis/`（`processor.rs` 255 行、`image_processing.rs` 679 行等），`agentic/mod.rs:74` 导出 `ImageAnalyzer, MessageEnhancer` |
| 它的提示词**就是反推描述** | `processor.rs:170` 要求返回 JSON `{summary, detailed_description, detected_elements[]}` |
| **但 `ImageAnalyzer` 没有被暴露成任何 Tauri 命令** | 模块外无引用（除 re-export）；`src/apps/desktop/src/api/` 下无对应文件 |
| 暴露出来的是 `AnalyzeImage` 工具 | `analyze_image_tool.rs`，schema 在 :514：`oneOf` 三选一 `image_id`/`image_path`（工作区相对）/`data_url`，外加自由 `prompt` 与 `detail: "summary"|"detailed"`；`ToolExposure::Collapsed` |
| 它的运行时是真实执行 | `DefaultAnalyzeImageRuntime`（:129）调 `resolve_vision_model_from_global_config()` → `get_client_by_id(&vision_model.id)`；typed 状态含 `unsupported_model / unsupported_provider / missing_workspace / path_denied / invalid_image` |
| **它不在 Media 模式的工具表里** | `agents/definitions/modes/media.rs:20-40` 只有 `GenerateImage, GenerateVideo, GetMediaTaskStatus, UploadMediaImage, GenerateSpeech, TranscribeAudio, CanvasRead, CanvasOp`；它在产品工具包 `tool-packs/src/lib.rs:165` |
| 会话主 AI 确实能读图 | `execution_engine.rs:1102` `process_image_contexts_for_provider` + `build_multimodal_message_with_images`；但 `MAX_IMAGE_BEARING_MESSAGE_ROUNDS = 2`（:1033），只有最近两轮带图消息会真的发出去 |
| 还有 `ViewImage` 工具 | `view_image_tool.rs`，`{image_path}`，把图作为只读附件挂到工具结果上，不自己调模型 |

**路径选型（推荐 P5-D1）：新增桌面命令
`analyze_infinite_canvas_image`，内部复用 `DefaultAnalyzeImageRuntime`
（或 `ImageAnalyzer`）+ `resolve_vision_model_from_global_config()`。**

- 输入 `{ workspacePath, relativePath, detail }`；命令内校验：workspace 为本地、
  路径工作区相对且不越界（照抄 `infinite_canvas_media_api.rs` 的
  `validate_request` 路径纪律）。
- 输出**typed**：`{ status: 'completed' | 'unsupported_model' |
  'unsupported_provider' | 'invalid_image' | 'path_denied' | 'backend',
  prompt?: string, message?: string }` —— 直接沿用 `AnalyzeImage` 已有的
  typed 状态名，不发明新词、不返回字符串协议。
- 前端把 `prompt` 填进该卡的**依附式输入器**（视觉语言 §6），
  **不覆盖用户已输入的内容**：若输入器非空，改为在其下浮出一行
  "用倒推的提示词替换 / 追加"的紧凑确认（走 `useInfiniteCanvasDismiss`）。
- 与画布"按钮不经主 AI"的既定纪律一致（CONTEXT.md 已记）。

**备选 P5-D2（零后端）：** 把 `AnalyzeImage` 加进 `media.rs:20` 的工具表
（一行），画布按钮往会话里发一条消息让主 AI 调它。
代价：烧一轮模型上下文、结果落在会话里而不是卡上、需要额外桥接把结果搬回卡，
且**违反"画布按钮不经主 AI"这条已经写进 CONTEXT.md 的纪律**。
**不推荐**，仅在业主要求"本期后端零新增"时启用。

**不做**：不新建 vision Provider、不改 `resolve_vision_model_from_global_config`
的选型逻辑。若用户没配视觉模型，命令返回 `unsupported_model`，
前端落成卡片上的一行可解释提示（"请先在设置里配置视觉模型"），
**不是 toast、不是白屏、不是静默**。

### 2.6 新 UI 一律服从视觉语言

**给业主的一段话：** 本期新增的每一块界面都按你 8-26 定的那份视觉规范来。

### 细节（供执行 AI）

强制约束（违反即返工）：

1. **裁剪按钮进悬浮药丸工具条**（`InfiniteCanvasNodes.tsx:459` 的
   `.infinite-canvas-node__toolbar`）。视觉语言 §4 列出的动作映射里
   **"裁剪"排在第一位**，本期把它补上；工具条总数控制在 10 个左右，
   超出的收进已有的 `more`（`data-node-action="more"`，:565）。
   建议排布：`裁剪 | 五件套 | 风格 · 图生提示词 | 参数 · 派生视频 | 再生成 · 另存 · 全屏 · 更多`
   —— 具体分组以实测宽度为准，**分组竖线必须保留**。
2. **蒙版编辑器与裁剪编辑器是"占满面板的编辑态"，不是弹层**：
   挂在**面板根容器的 portal**（不是 `document.body`——否则丢掉
   `.infinite-canvas-panel` 上的 CSS 变量作用域与面板级测试选择器，
   P4 §2.1 已踩过这个决策）。背景用视觉语言 §5.1 的
   `backdrop-filter: blur(18px)` + **画布自身背景 token**（不得写死黑色遮罩）。
3. **关闭一律复用 `useInfiniteCanvasDismiss`**（`useInfiniteCanvasDismiss.ts`）：
   点外面关闭 + Esc。**但编辑器有未保存的涂抹/裁剪框时，Esc 与点外面要先问一句**
   （复用 `InfiniteCanvasConfirmDialog.tsx`），否则一秒手滑白涂。
   **不做"关闭"按钮**（业主明确不喜欢）。
4. **风格选择器仍是紧凑锚定浮层**（视觉语言 §7.1：宽 320、高上限 380、
   内部滚动）。**加了缩略图不许把它撑大** —— 网格改为每行 3 列的小方图
   （约 88px），分类筛选行横向滚动，不换行。
5. **明暗双主题**：编辑器工具条、裁剪框手柄、风格网格全部走
   `--canvas-*` token，两套主题各自可读。**唯一例外是蒙版的红色**（功能常量）。
6. **坐标系两条已记教训必须遵守**（CONTEXT.md）：
   画布祖先元素被 transform 过，`position: fixed` 是相对面板解析的 ——
   任何浮层定位算式都要换算到面板坐标（复用
   `infiniteCanvasPopoverPlacement.ts`）；**任何靠测量卡片框来定位的表面，
   在测量到达之前必须保持不可见**，否则会从猜测值闪到真值。
   裁剪框的初始位置就是靠测量的，**这条直接命中本期**。
7. **CSS 必须留在懒加载 chunk**：`web-performance-budget.json` 的 CSS
   `forbiddenMarkers` 明确含 `.infinite-canvas-panel`——新样式一律写进
   `InfiniteCanvasPanel.scss` / `.minimal.scss`，
   新组件只能从懒加载的面板可达，不得被静态入口图引用。
8. **源码零新增 CJK**，全部走 `locales/*/components.json` 三语。

---

## 3. 契约设计（本期对 PRD 的加法）

**给业主的一段话：** 三处纸面修订，都是把本期新做法写清楚，不推翻旧约定。

### 细节（供执行 AI）

改动落点：`docs/features/infinite-canvas-and-media-tools-prd.md`

**C1 — §2 风格资产契约：推翻"方案 A"条款。**
现文"缩略图（业主决定：方案 A）…本期一律留空"改写为方案 B' 的实际做法：
搬入张数、再编码规格（长边 320 / WebP / ≤48KB）、落点
`src/web-ui/public/style-presets/<family>/<presetId>.webp`、
`thumbnailRef` 填充规则、无缩略图 family 的确定性色块降级、体积上限护栏。
`StylePreset` **schema 一字不改**。

**C2 — §3 新增"蒙版合成参考"条款（`maskedReference`）。**

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

- 红标合成图**只经 `localReferencePaths` 提交**，不得写进任何节点的
  `mediaRef`、不得进 `MANAGED_MEDIA_SOURCES` 的四个扫描根。
- 蒙版路径的最终指令 = 本期新增的 i18n 模板（"只修改红色半透明标记覆盖的区域…"）
  + 用户补全语句，经与既有路径**同一个** `buildFinalInstruction` 拼装
  （`SessionImageGenerationGateway.ts` 导出），两条路径不得各拼一套。
- `resultMode` 恒为 `'derived'`：源卡已有图，`mediaRef` 不可变更的不变量不受影响。
- 后端**零改动**：`GenerateImage` 看到的仍是"prompt + 一张参考图"，
  它不知道有蒙版这回事。

**C3 — §3 新增"本地派生（无媒体任务）"条款（裁剪）。**

```ts
type CanvasImageOperationKind = ImageToolId | 'generate' | 'crop';
```

条款：

- `'crop'` 是**本地派生**：不提交媒体任务、不消耗额度、不产生 `batchId`、
  不经 `InfiniteCanvasMediaBridge`。
- 它是**唯一允许由前端直接写入派生卡 `mediaRef`** 的操作
  （其余一律由回流写入）。写入发生在与
  `beginDerivedOperationContent` **同一次** `mutateDefaultDocument` 里，
  避免出现"永远 pending 的裁剪卡"这种中间态。
- 产物落 `media/input/canvas-crops/`，`source` 归 `input`，
  **不伪造 `generatedIdentity`**。
- **源卡 `mediaRef` 零改动**（不变量不受影响）。
- `CanvasOp` 的 AI 白名单**不放开 `'crop'`**：AI 不能替用户裁图。

**C4 — §3 新增"图生提示词"条款（若 §7 选项 3 选 A）。**
命令名、typed 状态集、"结果只填进输入器、不自动生成、不覆盖用户输入"三条。

**C5 — `THIRD-PARTY-NOTICES.md`**：按 §2.4 末段改写缩略图那句。

---

## 4. 分步任务拆解

**给业主的一段话：** 一共 **11 片**：1 片改文档（不写代码），
2 片后端（一个存图片的小命令、一个读图的小命令），7 片网页端，最后 1 片收尾。
每片单独提交、单独可回滚，**凡改界面的片必须真跑完整构建**。

> 建议分支：`codex/infinite-canvas-p5-creation`。每片一个独立提交。
> 按既往教训（MEMORY）：**改界面的片必须真跑 `pnpm run build:web`**，
> 不得以 type-check / lint 绿替代；新增 i18n key 三语齐全并跑 `i18n:audit`。

### D0：契约修订（纸面，无代码）

- 改动落点：`docs/features/infinite-canvas-and-media-tools-prd.md`（§3 的 C1–C4）、
  仓库根 `THIRD-PARTY-NOTICES.md`（C5）。
  **本计划获批后由业主自行链入 `docs/README.md`**，本期任何切片都不改它。
- 验收：文档评审通过 + `pnpm run check:repo-hygiene`。

### 后端（两片）

**R1：`write_canvas_image_bytes` —— 把图片字节写成工作区文件**

- 改动落点：新文件
  `src/apps/desktop/src/api/infinite_canvas_asset_api.rs`；
  在 `src/apps/desktop/src/api/mod.rs` 与 `main.rs` 的 `invoke_handler` 注册。
  **不动 `commands.rs`、不动 `path_target.rs`、不动 `filesystem`**——
  避免把二进制写入能力泛化到通用文件面（那是另一个立项）。
- 命令签名：
  `write_canvas_image_bytes(workspace_path: String, relative_path: String, base64_png: String) -> Result<WriteCanvasImageResponse, String>`，
  返回 typed `{ status: 'written' | 'invalid_input' | 'path_denied' | 'backend', relativePath?, bytesWritten?, message? }`。
- **安全纪律（照抄 `infinite_canvas_media_api.rs::validate_request`）**：
  `workspace_path` 必须绝对且 `is_dir()`；`relative_path` 必须工作区相对、
  不得绝对 / 以 `/` `\` 开头 / 含 `:` / 含 `..`；**并且必须以白名单前缀之一开头**：
  `.void/infinite-canvas/scratch/` 或 `media/input/canvas-crops/`。
  扩展名限 `.png`。上限 **32 MB** 解码后字节。父目录 `create_dir_all`。
  这条白名单是本命令不被滥用成通用写盘口的唯一屏障，**不得放宽**。
- 附带清理命令 `prune_canvas_scratch(workspace_path, max_age_days)` → 删
  `.void/infinite-canvas/scratch/` 下过期文件，返回删除条数；越界一律拒。
- 测试（Rust）：白名单外路径拒（`media/generated/x.png`、`../x.png`、
  `C:\x.png`、`/etc/x`）；非 png 拒；超限拒；合法路径真实写出且字节与输入一致；
  父目录自动创建；`prune` 只删过期且只在 scratch 内。
- 验收：`cargo test --locked -p void-desktop`（或该 crate 的实际名）+
  `cargo check --workspace`。

**R2：`analyze_infinite_canvas_image` —— 读图反推提示词**（依赖 §7 选项 3 = A）

- 改动落点：同上新文件里追加；复用
  `agentic::tools::implementations::analyze_image_tool::DefaultAnalyzeImageRuntime`
  与 `resolve_vision_model_from_global_config()`。
  **不改 `analyze_image_tool.rs`、不改 `modes/media.rs`、不改
  `image_analysis/` 任何文件。**
- 输入 `{ workspacePath, relativePath, detail: "summary"|"detailed" }`；
  路径纪律同 R1（但白名单是"工作区内任意相对路径、无 `..`"，因为要读的是
  用户自己的媒体）。输出 typed 见 §2.5。
- 测试：路径越界拒；未配置视觉模型 → `unsupported_model`（不 panic、不 500）；
  正常路径经桩 runtime 返回 `completed` + 非空 prompt。
- 验收：`cargo test --locked -p void-desktop` + `cargo check --workspace`；
  R1+R2 合并后跑一次全量 `cargo test --locked -p void-core`
  （短剧与 K2 用例全绿是回归门）。

### 网页端

**W1：图像栅格化基座（无 UI）**

- 改动落点：新文件
  `content-canvas/infinite-canvas/infiniteCanvasImageRaster.ts`
  —— 纯函数 + 端口：
  `loadCanvasImageBitmap(dataUrl): Promise<ImageBitmap>`（统一走
  `createImageBitmap`，**禁止 `drawImage(<img>)`**）、
  `exportCanvasPng(canvas): string`（裸 base64，不带 `data:` 前缀，
  与 R1 的入参形状一致）、
  `compositeMarkLayer(bitmap, maskCanvas): HTMLCanvasElement`、
  `cropBitmap(bitmap, rect): HTMLCanvasElement`。
- `infiniteCanvasDocumentGateway.ts` 增两个端口：
  `getInfiniteCanvasAssetWriter()`（默认绑 R1 命令）、
  `getInfiniteCanvasScratchPruner()`；沿用既有
  `getInfiniteCanvasMediaSaver()` 的注入风格，**面板本体不直接 import Tauri**。
- 测试：合成结果尺寸 = 原图自然尺寸；裁剪矩形的自然坐标换算（含缩放与夹紧）；
  导出为裸 base64；端口抛错时返回 typed 失败而非抛穿。
- 验收：目标 Vitest + `type-check:web` + `lint:web` + **`build:web`**。

**W2：裁剪编辑器 + 工具条按钮（P2-3）**

- 改动落点：新文件 `InfiniteCanvasCropEditor.tsx`；
  `InfiniteCanvasNodes.tsx`（工具条第一位加 `data-node-action="crop"`）；
  `InfiniteCanvasPanel.tsx`（编辑器状态 + `onCrop` 处理器 + 落盘 + 派生）；
  `InfiniteCanvasGenerationContent.ts`（`'crop'` 语义 + 同一次 mutate 里写
  新卡 `mediaRef` 的纯函数 `applyLocalDerivedMedia`）；
  `InfiniteCanvasPanel.scss` / `.minimal.scss`；三语
  `locales/*/components.json` 的 `infiniteCanvas.crop.*`。
- 行为：拉框（四角手柄、三分线参考、最小 30×30、边界夹紧）；
  **测量到达前编辑器不可见**（坐标系教训 6）；确认 → 裁 → 写
  `media/input/canvas-crops/` → 派生新卡并连回原卡；Esc / 点外面 → 有框先确认。
- 测试：派生新卡带正确 `mediaRef` 且**源卡 `mediaRef` 逐字段不变**（首要护栏）；
  边界夹紧与最小尺寸；写盘端口收到白名单内路径与裸 base64；
  端口失败 → 卡片 typed 失败态、不产生半截卡；无图的卡不渲染裁剪按钮。
- 验收：目标 Vitest + `type-check:web` + `lint:web` + `i18n:audit` +
  `i18n:contract:test` + **`build:web`**。

**W3：蒙版画笔编辑器（纯绘图，不接生成）**

- 改动落点：新文件 `InfiniteCanvasMaskEditor.tsx`（笔刷 / 矩形 / 橡皮 /
  清空 / 撤销重做 / 笔刷大小滑杆）；样式与三语 `infiniteCanvas.mask.*`。
- 约束：涂层 canvas = 原图自然像素；`ImageData` 撤销栈上限 30，
  **与 `infiniteCanvasHistory.ts` 完全隔离**（Ctrl+Z 在编辑器内只撤涂抹，
  不撤画布编辑 —— 必须有测试）；红色为功能常量不进 token。
- 测试：屏幕→自然坐标与笔宽换算；橡皮走 `destination-out`；
  撤销栈上限与清空；未涂抹时确认按钮禁用；Esc 有涂抹先确认。
  （用 `vitest` + canvas 桩断言调用序列，不做像素比对。）
- 验收：同 W2。

**W4：蒙版 → 局部重绘 / 擦除接线（P2-1 收口）**

- 改动落点：`InfiniteCanvasNodes.tsx`（`inpaint`/`erase` 两个按钮改为打开
  W3 编辑器，不再直接开 `InfiniteCanvasToolInstructionDialog`）；
  `InfiniteCanvasPanel.tsx`（合成 → 写 scratch → 组装
  `localReferencePaths` → `DirectImageGenerationGateway` → 派生）；
  `ImageToolTypes.ts`（两条蒙版专用 `instructionTemplate` 的 labelKey）；
  三语文案。
- 行为：编辑器底部内嵌一行指令输入（沿用 `【】` 补全惯例），
  确认即合成 + 提交，一次点完；`operationId` 同时用于 scratch 文件名与派生卡 id。
- 测试：提交入参含**且仅含**一条 scratch 相对路径；
  scratch 路径落在 `.void/infinite-canvas/scratch/` 内（不在四个扫描根内 —— 
  写死断言）；最终指令由 `buildFinalInstruction` 产出且含蒙版模板；
  `resultMode === 'derived'`；**源卡 `mediaRef` 逐字段不变**；
  同 `operationId` 重复提交不产生第二张卡也不产生第二个文件；
  写盘失败 → typed 失败、**不提交生成**（不能先扣钱再失败）。
- 验收：同 W2。

**W5：风格缩略图资产管线（P2-7 前半）**

- 改动落点：`src/web-ui/public/style-presets/cinematic/*.webp`（67）与
  `.../animation-2d/*.webp`（94）；
  `shared/services/style-preset/data/cinematicStyles.ts` 与
  `animation2dStyles.ts` 填 `thumbnailRef`；
  新护栏脚本 `scripts/check-style-thumbnail-budget.mjs` 并挂进
  `check:repo-hygiene`（或 package.json 的 verify 链）；
  `THIRD-PARTY-NOTICES.md`（C5，若 D0 未一并落）。
- 再编码脚本**在仓库外**一次性运行后丢弃（第一期同款做法），
  data 文件头部保留来源与本通知的注释。
- 测试：`StylePresetCatalog` 现有条目数守恒断言（67/94/84/72）继续全绿；
  新增：cinematic 与 animation-2d **每一条**都有非空 `thumbnailRef`，
  且指向的文件真实存在（用 `fs` 在测试里核对，不测常量复述）；
  midjourney 与 mg-motion 的 `thumbnailRef` **恒为空**。
- 验收：目标 Vitest + `type-check:web` + `node scripts/check-style-thumbnail-budget.mjs`
  + `pnpm run check:repo-hygiene` + **`build:web`**
  （这一片的 `build:web` 是**证明体积预算未被撑破**的关键证据，
  跑完把 JS/CSS 的实际字节数贴进提交说明）。

**W6：风格选择器缩略图网格 + 降级（P2-7 后半）**

- 改动落点：`InfiniteCanvasStylePicker.tsx`（3 列小方图网格、
  `loading="lazy" decoding="async"`、`onError` → 色块降级、
  分类筛选行横向滚动）；新文件
  `infiniteCanvasStyleSwatch.ts`（`presetId` → 确定性柔和色 + 首二字）；
  `InfiniteCanvasPanel.scss` / `.minimal.scss`。
- **浮层尺寸不得变化**：宽 320、高上限 380、内部滚动（视觉语言 §7.1）。
- 测试：有 `thumbnailRef` 渲染 `<img>` 且 src 正确；无 `thumbnailRef` 渲染色块；
  `onError` 后从 `<img>` 切到色块；同一 `presetId` 两次渲染色值相同；
  网格项数与筛选行为；**不做样式断言**。
- 验收：同 W2（含 `build:web`）。

**W7：图生提示词（P2-5）**（依赖 R2；若 §7 选项 3 选 B 则本片改为会话路径并降级）

- 改动落点：`InfiniteCanvasNodes.tsx`（工具条加
  `data-node-action="reverse-prompt"`）；`InfiniteCanvasPanel.tsx`
  （调端口 → 结果填输入器）；`infiniteCanvasDocumentGateway.ts`
  （新端口 `getInfiniteCanvasImageAnalyzer()`，默认绑 R2 命令）；
  `InfiniteCanvasGenerator.tsx`（接收外部填入的提示词）；三语
  `infiniteCanvas.reversePrompt.*`。
- 行为：运行中按钮显示克制的 pending（不遮罩整卡）；
  输入器已有内容 → 紧凑确认"替换 / 追加"；
  `unsupported_model` → 卡上一行可解释提示，指向设置里的视觉模型。
- 测试：端口收到 `infiniteCanvasMediaFilePath` 对应的相对路径；
  空输入器直接填入；非空输入器先确认；各 typed 状态各一条渲染断言；
  **不自动触发生成**（写死断言）；无图的卡不渲染该按钮。
- 验收：同 W2。

**Z1：全量收尾与文档**

- 跑全量：`pnpm run type-check:web` + `lint:web` + `i18n:audit` +
  `i18n:contract:test` + `pnpm --dir src/web-ui run test:run` +
  `pnpm run build:web` + `cargo test --locked -p void-core` + `cargo check --workspace`
  + `pnpm run check:repo-hygiene` + `check:core-boundaries`。
- 更新 `CONTEXT.md` 无限画布条目（新增 P5 段：蒙版走合成参考而非 mask 参数、
  scratch 目录纪律、裁剪是唯一前端直写 mediaRef 的操作、缩略图在 public 不进预算、
  `AnalyzeImage` 有专用命令不经主 AI）。
- 业主手工验收清单（见 §8-B4）。

---

## 5. 四项可行性核实结论（一览）

| 项 | 结论 | 依据 |
|---|---|---|
| **1. 蒙版画笔** | ✅ **可行，但对标产品的做法与差距清单转述有出入**：不存在 mask 参数，只有"红标合成图当参考"，且它合成后不自动生成。我们走合成图 + `localReferencePaths`，并且一次点完 | §2.1 |
| **2. 风格缩略图** | ✅ **技术可行**（161 张再编码后约 4MB，进 `public/` 不计入 JS/CSS 预算）；⚠️ **许可有真实疑点**，需业主拍板 —— 上游对这批资产零声明，且文件名与内容取材于第三方 IP | §2.4、§7 选项 2 |
| **3. 裁剪** | ✅ **可行，但必须补一个后端小命令** —— 网页端现有写文件接口只吃文本，无法写图片字节。产物落 `media/input/canvas-crops/`，素材库靠目录扫描即可发现，不需要登记 | §2.3、§4-R1 |
| **4. 图生提示词** | ✅ **可行**，`AnalyzeImage` 是真实可跑的读图工具（走设置里的视觉模型）。要做到"不经主 AI"需再补一个后端小命令；否则降级走会话（不推荐） | §2.5、§7 选项 3 |

**没有一项需要降级或不做。** 唯一可能被砍的是"不经主 AI"这个质量要求
（选项 3），以及缩略图的许可范围（选项 2）。

---

## 6. 明确不做清单（P5 之外）

- ❌ 分镜拆分器（P2-4）、多图标注融合（P3-5）、机位预设库（P2-6）——
  与本期同源但会撑破验收面，留作 K6。
- ❌ 真正的 mask 参数 / 专用 inpaint 通道 —— 后端与渠道都不存在，
  加它等于换 Provider（与既定前提冲突）。
- ❌ 专用无损放大（Topaz，P3-6）—— 需新渠道新密钥，业主未松口。
- ❌ 分组卡（P3-1）、多文档（P3-2）、项目导出（P3-3）、音频卡（P3-4）。
- ❌ 画布 ↔ AI 短剧中心同步（P2-8）与资产库面板（P2-9）—— 跨受保护域，单独立项。
- ❌ **把二进制写入能力泛化到通用文件面** —— R1 的白名单是硬约束，
  任何"顺手做成通用 write_binary_file"的改法一律拒收。
- ❌ 让 AI 裁剪 / 涂蒙版 / 反推提示词 —— `CanvasOp` 白名单不放开 `'crop'`，
  `begin_generation` 不接受蒙版参考。
- ❌ 红标图进素材库、进 `mediaRef`、进四个扫描根中的任何一个。
- ❌ 改 `analyze_image_tool.rs` / `image_analysis/` / `media_tools.rs` /
  `capabilities.rs` / `jobs.rs` 的任何既有逻辑。
- ❌ 修改短剧任何 runtime 行为、`attach_short_drama_media_result`、
  `ShortDramaCenterPanel.tsx`（AGENTS.md 热点保护）。
- ❌ 新 Provider / 渠道 / 密钥。
- ❌ 远程 workspace（继续 fail-closed）。
- ❌ 改 `docs/README.md`（业主自行链入）。

---

## 7. 需要业主拍板的选项

### 业主决议（2026-08-26，已拍板）

下表四项均已由业主拍板，本节自此为**已决**状态，执行以此为准：

| # | 决议 | 备注 |
|---|---|---|
| 1 | **A —— 批准新增"保存图片字节"的后端命令（R1）** | 裁剪与红标合成图共用同一条命令；白名单两个目录不得放宽 |
| 2 | **B —— 全搬 161 张风格缩略图** | 业主在**知情**"文件名与画面取材于原神 / 千与千寻 / JOJO / 权力的游戏 / LEGO / GTA 等第三方 IP；上游 kunpeng 自身的第三方声明对该资产只字未提；MIT 只覆盖代码与数据，覆盖不了图中的第三方权利"之后，明确选择全搬。该事实已如实补记进仓库根 `THIRD-PARTY-NOTICES.md` 的 "Style thumbnails: licence status (recorded 2026-08-26)" 一节，**不得淡化** |
| 3 | **A —— 图生提示词走专用后端命令（R2）** | 不经主 AI，符合 `CONTEXT.md` 已记的"画布按钮不经主 AI"纪律 |
| 4 | **A —— 裁剪产物落 `media/input/canvas-crops/`** | 诚实归为"输入"，不伪造生成批次、不伪造 `generatedIdentity` |

契约侧对应改动已落入
`docs/features/infinite-canvas-and-media-tools-prd.md` §2（C1）与
§3.7 / §3.8 / §3.9（C2–C4），以及 `THIRD-PARTY-NOTICES.md`（C5）。

| 选项 | A | B | C |
|---|---|---|---|
| **1. 后端补一个"存图片"的小命令（R1）** | **批准（推荐）**：裁剪与蒙版都要落文件，网页端目前只能写文本。带死白名单目录，只有画布能用。优点：两件事一次解决，路径干净。缺点：本期不是纯前端 | 不批：蒙版改走"图片数据直接塞进请求"（未验证分支，1.5–2MB 穿 IPC，失败模式不可控），**裁剪则整块做不了**（没有任何落盘手段）。优点：零后端。缺点：砍掉一项已批准范围 | — |
| **2. 风格缩略图的许可范围** | **只搬"非 IP 命名"的那部分（推荐）**：先人工过一遍 161 个文件名，剔除直接以他人作品命名的（原神 / 千与千寻 / JOJO / GTA / LEGO / 权力的游戏 等），其余照搬。优点：风险最小，且大部分风格仍有图。缺点：一部分风格仍是色块，且要人工过一遍名单 | 全搬 161 张：上游是 MIT，我们照 MIT 归属并在通知里如实写明上游未作声明。优点：一次到位。缺点：MIT 覆盖的是代码与数据，覆盖不了图里取材的第三方 IP；这份风险落在我们的安装包上 | 一张不搬，全用色块（维持第一期方案 A）。优点：零风险零体积。缺点：本期这一项等于没做 |
| **3. 图生提示词走哪条路** | **补一个"读图"小命令（推荐，R2）**：点一下直接出结果，不烧对话上下文，符合"画布按钮不经主 AI"的既定纪律。优点：手感与其余按钮一致。缺点：多一片很小的后端 | 走主 AI 会话：把 `AnalyzeImage` 加进 Media 模式工具表（改一行），画布往会话发消息。优点：后端几乎零改动。缺点：每次烧一轮上下文、结果落在会话里要额外搬回卡、**违反已写进 CONTEXT.md 的纪律** | — |
| **4. 裁剪产物的归属目录** | **`media/input/canvas-crops/`（推荐）**：素材库能扫到，来源标为"输入"，诚实。优点：不伪造生成批次。缺点：图库里不显示批次号，只显示目录名 | `media/generated/canvas-crop-<ts>/`：能拿到批次身份。优点：图库呈现与生成图一致。缺点：伪造了一个没有模型跑过、没有 manifest 的假批次，会误导未来的对账逻辑 | — |

---

## 8. 风险与对策 · 审批点

**给业主的一段话：** 四个真风险。一是红标这招**不保证一定灵**——通用模型
只是"大概率"会认红圈，效果不如专用蒙版接口，我们会在界面上把它说成
"标出要改的位置"而不是"精确蒙版"。二是那个存图片的命令要是写宽了，
就等于给网页端开了一个随便写盘的口子，所以它只认两个固定目录。
三是缩略图那批图的出处问题（上面选项 2）。四是安装包会大约 4 MB。

### 细节（供执行 AI）

1. **红标定位的效果上限**。通用 `GenerateImage` 对红色标记的遵从度是
   概率性的，不是接口保证。对策：(a) 指令模板显式描述"红色半透明标记覆盖的区域"；
   (b) 文案与 i18n key 一律用"标注区域"口径，**不得出现"精确蒙版 / 像素级"字样**；
   (c) 派生语义保证失败不毁原图，重涂重试成本极低。
   **不为提升遵从度去引入新模型或新渠道。**
2. **R1 白名单是唯一屏障**。两个前缀 + `.png` + 32MB + 无 `..` + 非绝对 +
   无 `:`。测试里对每一条越界形态各写一例。评审时**任何放宽白名单的改动
   等同新开攻击面，必须停手上报业主**。
3. **scratch 目录污染素材库**：`.void/infinite-canvas/scratch/` 不在
   `MANAGED_MEDIA_SOURCES`（`WorkspaceMediaLibrary.ts:37`）的四个根内 —— 
   W4 必须有一条**写死这个事实**的断言，防止后人把 scratch 挪进 `media/`。
4. **缩略图体积与预算**：`check-web-performance-budget.mjs` 只量 JS/CSS，
   `public/` 不在其中 —— 这是推理，**W5 必须用一次真实 `build:web` 证明**，
   并把实际字节贴进提交说明。另加 `check-style-thumbnail-budget.mjs`
   （总 ≤6MB、单张 ≤48KB）防止后人补图撑大安装包。
5. **许可**：见 §7 选项 2。无论选哪个，`THIRD-PARTY-NOTICES.md` 都要**如实**
   写明上游 kunpeng 自身对该资产未作第三方声明这一事实，不得含糊带过。
6. **`convertFileSrc` 复发风险**：本期新增三处图像表面（裁剪编辑器、
   蒙版编辑器、风格网格）。前两处**必须**走
   `resolveInfiniteCanvasMediaPreviewUrl`（`forceDataUrl:true`）；
   第三处是 `public/` 静态资源，**与工作区文件无关，不得混用两套解析**。
   CONTEXT.md 已记两次教训，第三次不可接受。
7. **`CallDeferredTool` 事件名坑**：本期不新增任何事件订阅（蒙版走既有
   `DirectImageGenerationGateway` 回流、裁剪与反推提示词是同步命令）。
   **若后续有人给本期能力加事件订阅**，必须按回执形状匹配
   （`result.source === 'infinite_canvas'`），把 `toolName` 只当弱过滤器
   —— 照抄 `InfiniteCanvasOpsBridge.ts:147-162`。这条已踩中两次。
8. **坐标系与测量闪烁**：裁剪框初始位置来自测量，**测量到达前编辑器整体
   不可见**；浮层定位一律经 `infiniteCanvasPopoverPlacement.ts` 换算到面板坐标
   （祖先被 transform，`position: fixed` 不是相对视口）。
9. **编辑器撤销栈与画布撤销栈串台**：编辑器打开期间 Ctrl+Z 必须只作用于涂抹 /
   裁剪框，绝不能撤掉画布上的卡。W3 必须有这条测试。
10. **写盘成功但生成失败 / 生成成功但写盘失败的顺序**：W4 严格
    "先写盘、写盘成功才提交"；写盘失败**不得提交**（不能先扣钱再失败）。
    W2（裁剪）严格"先写盘、写盘成功才 mutate 文档"，避免出现指向不存在文件的卡。
11. **既有基线债**（Desktop lib-test fixture 等已记录阻断）不计入本期失败，
    也不顺手修。

### 审批点

| # | 审批点 | 决策内容 |
|---|---|---|
| B1 | 动工前（本文档） | 批准整体计划与 11 片拆分；**确认 §7 的四个选项**；确认 §3 的四条契约加法（尤其 C3"裁剪是唯一前端直写 mediaRef 的操作"） |
| B2 | R1 合入后 | 业主确认白名单只覆盖两个目录、越界用例全绿；批准继续网页端 |
| B3 | W4 合入后 | 业主实机跑一次真实的圈选重绘（会花钱），确认红标定位达到可接受的效果；**若效果明显不可用，此处是唯一的止损点**，W5–W7 与它无依赖可照常推进 |
| B4 | Z1 验收 | 业主按手工清单实机验收：裁剪出新卡且素材库能看到、蒙版重绘与擦除各一次、风格网格明暗两套主题各看一次、无缩略图的 MJ/MG 降级形态、图生提示词填入输入器且不自动生成、原图在以上全部操作后一字未改。通过后更新 `CONTEXT.md` 与契约状态并推送 |

---

## 9. 实施结果与业主实机验收清单（2026-08-27 补记）

**状态：11 片全部实施合入，等待业主实机验收（审批点 B3 与 B4）。**

### 9.1 与计划的偏离

| # | 计划原文 | 实际做法 | 原因 |
|---|---|---|---|
| 1 | 缩略图文件名用 `presetId` | 用 `sha256(presetId)` 前 16 位十六进制 | `presetId` 本身就含来源的 CJK 作品名（如 `cinematic:live-action-权力的游戏史诗`），做不了文件名。哈希同时满足"确定映射"与"作品名不进文件树"两个原意 |
| 2 | 预期再编码后约 4 MB | 实际 **2.03 MiB**（2,126,328 字节） | 320px WebP 压得比估计更好；单张最大仍远低于 48 KB 上限 |
| 3 | 缩略图网格 `auto-fill` 密排 | 固定 3 列正方形 | 浮层宽度由视觉语言钉死为 320，列数不应随宽度漂移；正方形让"有图"与"色块"两种瓦片形状完全一致，加载时网格不重排 |
| 4 | 色块色值走 `--canvas-*` 现有 token | 新增 `--canvas-swatch-saturation / -lightness / -label` 三个 token | 色相由 `presetId` 推导，只有饱和度/明度/字色该由主题决定；明暗两套各给一组值 |
| 5 | 色相用累加式哈希 | 改 FNV-1a | 原累加器每步取 `%360`，相邻 id 会塌到少数几个色相上，相邻风格看起来同色 |

### 9.2 已知的既有基线债（不计入本期，未顺手修）

- `pnpm run i18n:audit`：`web-ui-source has 1212 CJK source candidate line(s)`
  ——在本期第一行代码之前就是 1212（已在 `8704d7a97` 上复核，数字一字不差），
  本期新增源码零 CJK。
- `pnpm run lint:web`：唯一 1 个 error 在
  `src/web-ui/src/flow_chat/tool-cards/useWorkspaceMediaToolRefreshBridge.ts`
  ——他人未提交的文件，按红线不触碰。本期文件 0 error 0 warning。
- `pnpm run check:repo-hygiene`：`docs/design/_incoming/` 下他人未提交的草稿
  含本机绝对路径。同样按红线不触碰。

### 9.3 业主实机验收清单（B4）

请在真实工作区里逐条走一遍。**每一条最后都要确认原图一个像素没变。**

1. **涂抹重绘**：选一张图 → 工具条"局部重绘" → 图铺满屏幕 → 用红笔涂一小块
   （试试笔刷、拉框、橡皮、撤销）→ 底部写一句"这里换成一顶帽子" → 确认。
   期望：旁边长出一张新卡并连回原卡；**这一步会真花钱**。
   若红标定位效果明显不可用，这里就是止损点（审批点 B3）。
2. **擦除**：同上，换"擦除"，涂掉一个东西。期望：新卡里那块被环境自然填补。
3. **裁剪**：工具条第一个按钮 → 拉框 → 确认。期望：旁边长出裁好的新卡；
   **不花任何钱、不发任何请求**；到素材库里能看到这张图，来源标为"输入"，
   目录名是 `canvas-crops`。
4. **缩略图挑风格（暗色主题）**：点调色板 → 期望看到一片三列的小图墙，
   浮层没有变大、内部可滚动；切到 MJ 或 MG 两个分类 → 期望看到整齐的色块 +
   风格名，**不是空白框、不是破图图标**，高度圆角与有图的一模一样。
5. **缩略图挑风格（亮色主题）**：把 App 切成亮色主题，重复第 4 条。
   期望：图和色块都清楚可读，色块里的两个字看得清。
6. **同一风格颜色稳定**：关掉浮层再打开，同一个 MJ 风格的色块颜色不变。
7. **图生提示词（输入器为空）**：选一张有图的卡 → 工具条的"倒推提示词" →
   按钮变暗一下 → 期望提示词直接出现在这张卡下面的输入器里，**不会自动发送**。
8. **图生提示词（输入器已有内容）**：先在输入器里写点东西 → 再点倒推 →
   期望浮出"替换 / 接在下面"两个选项；点外面或按 Esc 则两样都不做。
9. **没配视觉模型时**：到设置里把视觉模型清掉 → 再点倒推 →
   期望卡上出现一行"还没有设置视觉模型，请先到设置里选一个"，
   **不是转圈转到没、不是白屏、不是什么都不发生**。
10. **原图不变的总检查**：以上全部做完后，回头看最初那几张原图 ——
    图片本身、连线、提示词都应与开始时一致，新东西一律长在新卡上。
