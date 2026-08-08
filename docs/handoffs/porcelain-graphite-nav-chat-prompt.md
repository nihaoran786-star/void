# Porcelain Air Navigation And Chat Execution Prompt

Copy everything inside the following code block into a new AI conversation.

```text
你正在维护当前打开的 Void Windows 本地仓库。以下路径均相对于仓库根目录。

任务目标：把“Porcelain Air / 瓷白轻盈工作台”的轻盈、亲和、安静、低噪音
设计语言应用到三个范围：

1. 左侧导航栏的展开与 48px 极简折叠形态；
2. AI 回复、用户消息和工具调用的信息流；
3. 主会话输入框及其上下文控件。

只允许修改这三个范围及其必需的共享 Token/组件。暂不重做全局配色、Canvas、
Browser、Infinite Canvas、Team Workspace、欢迎页、智能体市场、技能、连接器、
设置、自动化、媒体和 AI 短剧页面。不要把未来设计范围顺手带入本轮。

请创建一个持续执行的 goal，把工作拆成小型、独立、可验证、可回滚的切片。
稳定性优先于视觉速度。只做本地提交，不推送 GitHub。

开始前完整阅读：

1. AGENTS.md
2. CONTEXT.md
3. docs\README.md
4. docs\features\interaction-theme-governance.md
5. docs\design\porcelain-graphite-design-system.md
6. docs\features\customization-center-prd.md
7. docs\features\team-workspace-prd.md
8. docs\architecture\frontend-minimal-workspace-migration.md

选定视觉参考：
%USERPROFILE%\.codex\generated_images\019fa901-0899-7370-865d-e999eb59bcd7\exec-4b53f3a0-dd4d-4165-a1a0-ff4c4f11f053.png

视觉参考对情绪、色彩关系、密度、层级、留白、边缘柔和度和交互安静程度具有
最高视觉优先级。不要复制图中的假数据，但最终结果必须具有相同的轻盈工作台
气质。保留现有 Token 架构、主题服务和 --workspace-* 语义颜色管道，不强制
保留当前具体颜色值。本轮允许通过既有 owner 调整上述三个范围真正使用的浅色
语义 Token；不得通过页面局部硬编码换色，也不得误伤未授权页面、Dark 或
Classic 回滚路径。

视觉反目标：严肃企业后台、财务/运维控制台、密集 IDE、黑白灰卡片墙、沉重
分区和大面积高对比按钮。若完整窗口截图呈现以上任一气质，即使代码和测试通过，
视觉验收仍然失败。

第一步必须只读审查并报告，不要立即写 CSS：

- 查看当前分支和 git status；
- 识别用户已有改动、生成版本文件、media、target 和 design-lab/flicker 等
  未跟踪产物，禁止覆盖、删除、回滚或混入提交；
- 阅读现有 Token、主题、Minimal 入口、组件库和治理测试；
- 定位左栏折叠/展开状态的真正 owner 和持久化路径；
- 定位 AI 消息、用户消息、工具调用、工具卡片和输入框的真正组件 owner；
- 列出重复气泡、重复卡片、局部字号、局部圆角、原始颜色、未定义变量和
  `transition: all`；
- 说明允许修改的文件、禁止承载业务逻辑的文件、状态模型和测试范围。

现有设计系统 owner：

- src/web-ui/src/component-library/styles/tokens.scss
- src/web-ui/src/app/presentation/minimalWorkspacePresentation.scss
- src/web-ui/src/infrastructure/theme/
- src/web-ui/src/component-library/components/
- src/web-ui/src/app/presentation/*Governance.test.ts

必须沿用现有 Token 管道和 Minimal feature-owned 样式。禁止：

- 新建第二套全局主题或巨大 CSS 覆盖层；
- 为每个页面重新声明相同颜色、字号、边框、间距和圆角；
- 新增网络字体、依赖或图标库；
- 使用渐变、玻璃、模糊、发光、悬停上浮、缩放、弹跳或卡片入场动画；
- 把所有内容做成卡片、嵌套卡片或滥用胶囊；
- 为视觉方便复制导航、聊天、工具调用或输入框逻辑。

设计规则：

- 现有 Token 所有权和语义保持不变；允许把触及范围内偏冷、偏重、偏严肃的
  具体映射校正为设计系统规定的暖瓷白、柔和石墨和少量功能色；
- 保留暗色和 Classic 兼容性，不在页面内复制一套浅色调色板；
- 大部分桌面 UI 使用现有 12–13px Token，AI 长正文保持 14px 和舒适行高；
- 正常分隔使用 1px 语义边框；控件约 6px 圆角，面板/输入框约 8px；
- 正常内容无阴影；菜单/弹层只用既有轻量语义阴影；
- 通过排版、间距、对齐和轻分隔建立层级，不通过更多容器建立层级；
- 专业感来自秩序和能力，不来自粗字、深灰、厚边框或管理后台式分区；
- 小面积蓝、薄荷、琥珀和淡紫可用于功能类型与状态识别，不得扩张成装饰色块；
- hover 只改变语义背景/边框/文字；focus-visible 必须清楚且不能只靠颜色；
- 动画只使用 opacity/transform，支持 prefers-reduced-motion。

左侧导航目标：

- 折叠宽度约 48px，展开宽度沿用当前合理范围；
- 折叠状态只有品牌、主要目的地图标、底部头像/设置；
- 图标约 16px，桌面目标 30–32px，粗指针目标至少 40px；
- 每个图标有 tooltip、可访问名称、键盘焦点和明确当前状态；
- 当前状态可使用语义背景、图标色和 2px 指示线，但不能只靠颜色；
- 展开/折叠状态继续使用现有 store/持久化 owner，不新建第二份状态；
- 收缩不卸载场景、不清空搜索、不改变会话、不影响正在运行的任务；
- 展开状态精简重复说明，但不隐藏当前页面、工作区和会话的必要识别信息。

聊天信息流目标：

- AI 回复取消普通大气泡，直接排版在会话背景上；
- AI 长正文保持可读宽度、14px 字号和 1.55–1.6 行高；
- 用户消息使用轻量、紧凑的引用块或弱表面，不使用巨大圆角气泡；
- 不重复显示可由位置判断的用户名、角色和说明；
- 思考、运行、完成和后台刷新不得导致消息列表跳动或组件重复挂载；
- 文件、媒体、Snapshot、审批、错误和可独立操作的产物继续保留卡片；
- 不改变 Markdown、代码块、引用、表格、流式文本、历史恢复和滚动语义。

工具调用目标：

- 普通工具过程使用单行、紧凑、可键盘展开的状态行；
- 默认显示状态图标、自然语言动作、对象/数量和耗时；
- 参数、原始 JSON、详细输出和调试信息按需展开；
- 成功、运行、等待、失败不能只靠颜色；
- BaseToolCard 等现有数据和行为 owner 必须保留；只能改 presentation 或增加
  清晰的显示变体，不能另造工具执行模型；
- 需要审批、可操作产物、错误恢复和复杂交互的工具卡片不得被错误压成一行。

输入框目标：

- 输入框视觉更低、更紧凑，保持现有自动增高和长文本能力；
- 发送是当前区域唯一强操作；
- 附件、引用、模式、智能体/团队、Skill、连接器、模型、权限、执行策略和
  工作区继续使用现有逻辑，只降低视觉噪音并渐进披露低频操作；
- 已绑定会话的智能体或团队身份必须表现为不可移除的房间身份；
- 新建会话草稿中的选择仍可移除；不得混淆两种状态；
- 不把新业务规则继续塞入 ChatInput.tsx；通过既有 selector/service 和
  presentation seam 完成样式调整；
- 发送、附件、@、/、语音、模型、权限、工作区和快捷键必须回归测试。

架构红线：

- 依赖方向保持 UI/Route -> Module Interface -> Adapter/Service -> External；
- 不把业务逻辑下沉到页面、ChatInput.tsx、FlowChatStore.ts、
  ContentCanvas.tsx 或 ShortDramaCenterPanel.tsx；
- 不修改 Agent/Team Prompt、KV Cache identity、工具权限、Skill authority、
  Team workflow、子代理限制、会话持久化、BTW、媒体路由或短剧运行时；
- UI 使用明确的 loading/ready/empty/error/unsupported/stale-refresh 状态，
  不能从空数组或字符串猜测；
- Nav 收缩和聊天重排不能卸载场景、取消任务、重建会话或造成右侧频闪。

建议切片：

Slice 0：只读盘点、真实全窗口基线、Token/组件迁移表和风险说明。
Slice 1：先写失败测试，再实现左栏折叠/展开视觉与无障碍，保留状态和行为。
Slice 2：先写失败测试，再实现 AI/用户消息的轻量连续信息流。
Slice 3：先写失败测试，再实现工具状态行与必须保留的复杂工具卡片分级。
Slice 4：先写失败测试，再紧凑化输入框和上下文控件，不改变发送逻辑。
Slice 5：跨场景回归、性能、主题/i18n、完整视觉证据、文档收口。

每个 Slice 必须：

1. 修改前说明目标、数据流、允许改动 owner、禁止承载业务逻辑的文件、状态和
   测试范围；
2. 先补行为/视觉契约测试，再进行最小实现；
3. 做独立差异审查，证明没有运行时、权限、缓存、会话和团队变化；
4. 使用 Per-Monitor-V2 DPI 感知与 DWM 物理窗口边界采集完整截图；必须包含
   左侧栏、完整顶部、最右侧、底部和窗口控制键，尺寸不匹配即无效；
5. 验证展开/折叠、最大化、1280×900、窄布局、125%/150% DPI、键盘、
   200% 缩放、中文/英文长文本、减少动画、空/加载/错误和流式输出；
6. 验证切换场景、连续输入、流式回复、工具运行、打开/关闭 Canvas 和 Team
   Workspace 时没有频闪、堵塞、输入丢失和无关重渲染；
7. 只有门禁通过后才做干净的本地提交，不混入版本生成文件和测试产物。

每个视觉 Slice 还必须按 100 分自评并留下依据：

- 轻盈、温暖、亲和的整体气质：30 分；
- 留白、层级和低容器化：25 分；
- AI/用户/工具信息流的自然程度：20 分；
- 48px 左栏的极简与可发现性：15 分；
- 状态、键盘、缩放和响应式完整性：10 分。

低于 85 分不得提交。只要仍明显像企业后台、IDE 或灰色管理系统，第一项不得
超过 10 分，必须继续调整。

适用门禁按风险逐步扩大：

pnpm run check:repo-hygiene
pnpm run check:core-boundaries
pnpm run check:theme-colors
pnpm run check:theme-visual-contract
pnpm run i18n:contract:test
pnpm run i18n:audit
pnpm run type-check:web
pnpm run lint:web
pnpm --dir src/web-ui run test:run
pnpm run build:web

不要把仓库已有 E2E、全仓 lint、Rust fmt、Clippy、打包或跨平台视觉基线问题
描述成本轮通过。某项无法完成时，明确说明原因、替代验证和剩余风险。

先完成 Slice 0 并报告真实盘点和切片计划，然后在架构边界清晰的情况下持续
执行其余 Slice。遇到需要改变运行时、产品逻辑、依赖、数据、未授权页面色调或
用户已有改动时必须暂停并请求确认。
```
