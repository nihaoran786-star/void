# Web UI 性能第二阶段审计与实施边界

本文记录第二阶段的可复现基线、依赖闭包、运行时风险与实施边界。
本文是审计设计，不表示问题已经修复；第一阶段结果见 [阶段一结果](web-ui-performance-phase1-results.md)。

## 1. 目标与基线

- 目标：降低桌面端首次加载成本和隐藏页面后台开销，同时保持短剧、媒体、Flow Chat、终端、设置与浏览器行为。
- 底层 stream、store、资产生成和 task 绝不因 UI 隐藏而暂停；只停止展示投影、测量、播放与可重建轮询。
- 生产产物：`D:\codex\void-source\.void\perf-phase2-before`。
- 构建命令：`pnpm --dir src/web-ui exec vite build --outDir D:\codex\void-source\.void\perf-phase2-before --emptyOutDir --manifest`。
- 首屏 JavaScript 原始体积：`4,509,649 B`。
- 首屏 CSS 原始体积：`1,036,281 B`。
- 后续切片必须用相同 manifest 与原始字节口径对比；gzip 只用于报告，不能替代解析执行成本。

## 2. Bundle 审计优先级

### P0：xterm barrel，至少约 605 KB

- 终端展示卡片经组件 barrel 获取 lazy facade，但 barrel 同时静态导出完整终端实现。
- 这使 xterm 依赖闭包至少约 `605 KB`，仍可从首屏 entry 静态到达。
- 调用方应直接引用轻量 lazy facade；共享 barrel 不得让轻量导入连带加载完整 runtime。
- 静态依赖测试必须锁定 xterm 包不再从 entry 可达，终端实际打开后仍按需加载。

### P1：Settings 场景，约 0.35–0.60 MB

- 场景视口静态导入 Settings，Settings 又静态引入多个配置面板。
- 可延迟闭包估算约 `0.35–0.60 MB`；先把整个 Settings 场景移出启动 entry。
- 场景内保留默认面板直接依赖，其他标签页按首次访问加载，避免嵌套 lazy waterfall。
- 不改变设置语义、持久化接口和配置 adapter；fallback 必须稳定占位。

### P2：Markdown/KaTeX，约 600 KB

- 共享组件入口静态导出 Markdown 实现，连带 react-markdown、remark、rehype、KaTeX 与 CSS。
- 该闭包估算约 `600 KB`；公共 `Markdown` API 应改为只依赖 React 的轻量 lazy facade。
- 直接导入实现的消费者必须走 facade；类型保持 type-only，避免把实现重新拉回首屏。
- 加载 fallback 保留原文和换行，不能显示空白；静态图断言 KaTeX/Markdown 处理器离开 entry。

### P3：i18n，约 706 KB

- i18n 资源闭包估算约 `706 KB`，涉及语言回退和翻译键加载时序，风险高于前三项。
- 应先区分启动必需 locale 与可选 feature 命名空间，再按 feature 切分。
- 不删除词条、不只保留单一语言、不改变用户语言选择；待 P0–P2 稳定后实施。

## 3. 运行时五项风险

### R0：隐藏 Flow Chat

- 隐藏时可能继续运行 RAF 投影、Observer 回调和消息显示计时器，持续测量或刷新 React 状态。
- `presentationActive=false` 时停止这些展示工作，恢复后从 store 一次读取最新投影。
- 消息 stream、store 写入、工具执行和后端任务继续运行，不能回放隐藏期间的每一帧。

### R1：隐藏短剧与媒体区域

- 短剧/媒体区域可能继续工作区轮询、扫描、刷新或不可见播放。
- 隐藏时停止展示型轮询并暂停媒体，恢复时执行一次受控刷新后恢复正常节奏。
- 资产生成、任务进度、现有图片/视频调用和工作区权威状态不得取消或丢失。

### R2：隐藏 Generative Widget/MCP 脚本 iframe

- CSS 隐藏 iframe 不会自动停止其中的动画、脚本和消息投影。
- 所属 adapter 决定挂载、休眠或销毁，保留恢复所需最小状态并避免重复外部会话。
- UI 只消费明确状态，不直接推断 iframe、MCP 或外部系统来源。

### R3：Compact Chat 最小化

- 最小化可能只改变视觉尺寸，React 仍持续做消息格式化、测量、动画和投影。
- 最小化时停止非必要展示计算；恢复时读取最新 store，避免积压更新造成突发渲染。
- 必须以 React commit/profiler 或可重复计数验证，不能只看 DOM 是否隐藏。

### R4：隐藏 ContentCanvas

- 无可见标签页时可能每五秒探测媒体；场景隐藏后不应继续 IPC、扫描或 React 更新。
- 异步探测完成前若失活，迟到结果不得自动开页；恢复后可立即探测一次。
- 使用 token/generation 保证“最后一次请求生效”，与浏览器 WebView 生命周期原则一致。

## 4. `presentationActive` 状态模型

- 输入一：当前 scene 是否活动与当前 tab 是否可见。
- 输入二：`document.visibilityState` 与 window focus/visible 状态。
- document/window/Tauri 可见性先经 adapter，React hook 再合并 scene/tab 状态。
- UI 只消费稳定的 `presentationActive`，不直接调用窗口、文件、进程或远端 API。

```text
scene/tab + document/window visibility
  -> visibility adapter -> presentation hook
  -> presentationActive -> projection / measurement / polling / media
```

- `false` 只暂停展示投影、测量、不可见播放和可重建轮询。
- 底层 stream、store、资产生成、工具执行和其他 task 绝不暂停，业务状态不重置。
- 恢复时从权威 store 取最新快照，避免隐藏期逐帧更新在显示瞬间集中提交。

## 5. 自动性能 Gate

Gate 采用三个文件，不修改 `package.json` 或 CI：

```text
scripts/web-performance-budget.json
scripts/check-web-performance-budget.mjs
scripts/check-web-performance-budget.test.mjs
```

- JSON 保存 entry JS/CSS 原始上限、禁止标记和必须保持动态的入口。
- 检查脚本读取 Vite manifest、产物和静态图，检查体积、runtime 标记、动态入口与可达性。
- 测试脚本用 Node 内置 test 和临时 fixture 覆盖成功、超限、缺产物与未知警告。
- 初始预算冻结当前基线；每个优化切片实测后只向下收紧，gzip 仅报告。
- 先用显式 Node 命令运行，不新增依赖，不改 package script，不改 CI。

## 6. 阶段、范围与回滚

- 阶段 A：只处理 P0–P2 启动边界及静态图测试，不改业务状态、配置格式或远端接口。
- 阶段 B：引入 visibility adapter/presentation hook，逐个接入 R0–R4，每个 feature 独立回滚。
- 阶段 C：落地三文件 Gate，并以最新生产构建实测值收紧预算。
- 阶段 D：P3 i18n 仅在收益与语言回归证据充分后实施。
- 阶段 E：桌面关键交互、空闲 CPU、内存和接近 release 的验证。
- lazy 回归时仅恢复对应 feature 静态导入，不撤销其他已验证切片。
- presentation 回归时仅撤回该 feature 的 hook 接入，adapter 与纯状态测试可保留。
- Gate 误报应修正分类/fixture，不得放宽到失去约束力；不得通过删功能或语言资源换性能。

## 7. 测试与实测要求

- 每个依赖切片运行定向单测、import boundary 测试、type-check 与定向 ESLint。
- 生产构建生成 manifest，与 `.void/perf-phase2-before` 比较 entry JS/CSS 和静态闭包。
- 桌面手工覆盖会话、终端、Markdown、设置、短剧和媒体预览；隐藏恢复不得丢数据或选中状态。
- 隐藏期 RAF、Observer、计时器、媒体与轮询按设计停止，恢复无迟到开页、重复 iframe 或状态突发。
- 空闲 CPU 用固定采样窗并过滤 PID 复用，分别记录 Vite/esbuild 和 desktop/WebView2。
- 内存至少记录 working set 并注明 dev/release；只接受同机、同命令的前后对照。
- Gate 测试、生产构建、关键交互与独立审查全部通过后才能收口。

## 8. Architecture Gate

1. 目标：削减启动静态闭包并停止不可见展示工作，不改变业务执行语义。
2. 模块：启动依赖图、presentation adapter/hook、各 feature 接入点和构建检查脚本。
3. 边界：UI 渲染状态；hook 合并状态；adapter 转换外部可见性；stream/store/task 保持职责。
4. 允许文件：feature facade/装配、presentation 模块、对应测试、三份 Gate 文件和本文档。
5. 禁止位置：`main.tsx`、大页面与共享 barrel 不得加入业务判断或新外部调用。
6. 状态：唯一核心状态为明确的 `presentationActive`，不能用空数组或 DOM 猜测。
7. 测试：新增静态依赖、状态合并、迟到结果和 Gate fixture 测试。
8. 越界规则：若必须改变后端协议、task/stream 语义或持久化格式，停止该切片并重新设计。

## 9. Coupling Review Gate

1. 页面组件没有新增来源判断，UI 只渲染状态和触发展示动作。
2. adapter/hook 是可见性转换的唯一入口，外部状态与错误不靠字符串推断。
3. stream、store、资产生成和 task 在隐藏期间维持原执行语义。
4. 每个 diff 只含一个性能边界及其测试，可形成独立小提交和回滚点。
5. 不混入无关样式、短剧提示词、模型配置、后端或协议重构。
6. 测试覆盖模块接口、竞态与恢复行为，不绑定内部实现细节。
7. 构建证明可选 runtime 离开 entry 且预算下降，而非只移动或重复代码。
8. 独立审查没有未解决的 Critical/Important 后才能宣布完成。

## 10. 当前结论

- 首屏 `4,509,649 B` JavaScript 仍过大，P0–P2 是收益高且边界清晰的优先切片。
- 运行时优化核心是停止不可见展示层重复工作，而不是停止业务。
- P3 i18n 应在低风险切片验证后处理；三文件 Gate 防止收益回退。
- 截至本文生成时，以上第二阶段修复尚未宣称完成。
