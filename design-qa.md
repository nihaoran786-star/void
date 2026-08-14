# 智能体与团队员工市场设计 QA

## 对照证据

- 设计真值：用户提供的专家市场、专家团市场和专家团详情截图。
- 实现截图：
  - `.codex-artifacts/customization-center/pagination-teams/11-void-agents-four-columns.png`
  - `.codex-artifacts/customization-center/pagination-teams/14-void-agents-page-2.png`
  - `.codex-artifacts/customization-center/pagination-teams/12-void-teams-four-columns.png`
  - `.codex-artifacts/customization-center/pagination-teams/13-void-team-detail.png`
- 同图对照：
  - `.codex-artifacts/customization-center/pagination-teams/15-reference-vs-agents-four-columns.png`
  - `.codex-artifacts/customization-center/pagination-teams/16-reference-vs-teams-four-columns.png`
  - `.codex-artifacts/customization-center/pagination-teams/09-reference-vs-team-detail.png`
- 状态：Windows 桌面应用，浅色主题，最大化窗口，定制 > 专业智能体。
- 像素与密度：专家参考图为 1813 × 1213 px，团队参考图为 1788 ×
  1177 px；Void 原生窗口捕获均为 2582 × 1390 物理像素。Windows 使用
  150% 显示缩放，逻辑视口约为 1721 × 927；同图对照画布为 3200 ×
  1250 px，左右槽位只做等比例缩放，不拉伸、不裁剪。

## Findings

没有可执行的 P0、P1 或 P2 差异。

- 信息架构：保留 Void 自己的左侧定制导航，移除智能体和团队目录中的
  可见页面标题；页面从“推荐 / 全部 + 搜索”或团队管理动作直接开始。
- 字体与层级：页面页签、标题、角色、描述、标签和动作全部复用工作区
  字号、字重与行高令牌；中文长文案没有遮挡，页面不再显得大字、粗字
  或脱离全局界面。
- 间距与布局：推荐区保持四个固定工作模式单行四列且不参与分页；全部
  智能体每页固定八张，使用四列两行，分页控制固定在卡片区下方，不再
  无限拉高页面。团队目录复用同一四列卡片语言和每页八张规则；当前真实
  数据只有两个团队，因而保留后两列为空，不把卡片拉成全宽。
- 颜色与令牌：使用项目现有浅色表面、边框、文字和焦点令牌；没有新增
  未定义主题变量，也没有用团队色冒充状态色。
- 图片质量：24 个头像均为 256 × 256 WebP，圆形裁切清晰、风格统一、
  人物具有差异；团队卡片、团队详情、主理人和成员使用稳定身份映射，
  加载失败仍会回退到现有图标，不产生空白卡片。
- 文案：主界面只暴露中文用户概念，包括“智能体”“团队”“专业智能体”
  和专业角色；工具数量、Skill 数量、运行时 ID 等技术信息不再占据卡片。
- 信息密度：市场卡片只保留名称、岗位、两行内说明、少量标签和查看动作；
  技术细节留在详情。分页让单视口最多显示 4 张推荐卡与 8 张目录卡。
- 可用性：卡片支持鼠标、Enter 和 Space；分页按钮具备 aria-label、
  首末页禁用态和当前页播报；搜索、推荐/全部、智能体/团队切换、安装、
  创建和详情弹窗均保持原有入口。

## 对照历史

- 早期字体调整截图发现推荐区第四张卡片单独换行，造成明显留白：
  `.codex-artifacts/customization-center/typography-audit/04-agent-market-after-first-pass.png`。
- 上一轮去掉可见页面标题并加入目录分页；本轮进一步把智能体和团队目录
  统一为四列两行、每页八张。智能体第 1 页和第 2 页、团队页及团队详情
  均重新捕获，并与用户参考图置于同一张对照图中复核。

## 交互验证

- 智能体第一页显示 8 张目录卡，点击下一页后显示剩余 7 张，页码从
  `1 / 2` 变为 `2 / 2`，页面高度不变；推荐区四张卡保持不变。
- 自动化测试确认搜索、来源和类型变化会回到第一页；数据减少会把页码
  收敛到最后一个有效页，不会显示空白页。
- 从“智能体”切换到“团队”，确认“代码审查团队”和“AI 短剧团队”
  真实渲染，安装团队、创建团队和范围选择仍在。
- 打开“代码审查团队”详情，确认团队头像、主理人头像和全部成员头像
  可见，长成员列表使用弹窗内部滚动，不拉高目录页。
- 确认左侧“专业智能体 / 技能 / 连接器”导航保留且当前项可见。
- 确认四张最终桌面捕获中无布局溢出、卡片裁切或文字遮挡；最终目录截图
  已关闭启动提示，不让应用状态提示干扰页面对照。

## 聚焦区域说明

未额外制作局部裁剪。两个最新同图对照覆盖智能体目录和团队目录，历史
同图对照继续覆盖团队详情；同时逐张以原始物理像素打开实现截图，卡片
头像、标题、角色、描述、标签、分页、管理动作和左侧导航均可直接辨认，
额外裁剪不会增加新的判断信息。

## Follow-up Polish

- P3：当真实团队数量增加到九个以上时，目录会出现与智能体一致的分页；
  该状态已经由自动化测试覆盖，当前只有两个真实团队，因此截图无分页器。

## 上一轮定制中心验收证据（2026-07-30）

本轮员工市场验收没有覆盖或废弃上一轮已经通过的团队详情与输入框选择
闭环。以下证据继续保留：

- 参考图：
  `.codex-artifacts/customization-center/references/reference-agent-catalog.png`、
  `reference-team-detail.png`、`reference-composer-picker.png`、
  `reference-composer-selected.png`。
- 实现图：
  `.codex-artifacts/customization-center/customization-agents-catalog.png`、
  `customization-teams-catalog.png`、`customization-team-detail.png`、
  `customization-composer-persona-picker.png`、
  `customization-composer-selected-persona.png`。
- 同图对照：
  `.codex-artifacts/customization-center/comparisons/agents-reference-vs-implementation.png`、
  `team-detail-reference-vs-implementation.png`、
  `composer-reference-vs-implementation.png`。
- 已验证交互：中文智能体/团队目录、团队成员详情、固定模式内按资格选择、
  输入框选择与已选胶囊、固定团队召唤，以及智能体和团队创建管理入口。
- 已修复并复验的历史问题：目录中的英文 `Research Specialist`、核心卡片
  的 `Computer Use`、技能入口错误命名空间，以及仅展示选择器却没有验证
  真实选择闭环。
- 上一轮桌面原生 E2E 最大化窗口为 2561 × 1368 px，期间没有导致交互
  失败的前端异常；结论同样为无 P0/P1/P2 问题。

## 技能与连接器统一验收（2026-08-01）

### 真实来源与实现证据

- 对标应用来源：
  - `.codex-artifacts/workbuddy-skills-connectors-audit/01-current.png`
    （WorkBuddy 连接器目录）；
  - `.codex-artifacts/workbuddy-skills-connectors-audit/04-installed-skills.png`
    （WorkBuddy 已安装技能）。
- Void 原生桌面实现：
  - `.codex-artifacts/customization-skills-connectors/12-skills-final.png`
    （已安装技能，四列两行）；
  - `.codex-artifacts/customization-skills-connectors/13-skills-search-chinese.png`
    （中文“布局”搜索）；
  - `.codex-artifacts/customization-skills-connectors/14-connectors-final.png`
    （独立连接器页与真实空状态）；
  - `.codex-artifacts/customization-skills-connectors/15-connectors-json-add.png`
    （复用现有 MCP JSON 添加入口）。
- 同图对照：
  - `.codex-artifacts/customization-skills-connectors/16-skills-before-after.png`；
  - `.codex-artifacts/customization-skills-connectors/17-workbuddy-vs-void-skills.png`；
  - `.codex-artifacts/customization-skills-connectors/18-workbuddy-vs-void-connectors.png`；
  - `.codex-artifacts/customization-skills-connectors/19-connectors-list-vs-config.png`。
- Void 捕获窗口为 1822 × 1213 物理像素，Windows 显示缩放 150%，
  对应约 1215 × 809 逻辑像素；对照图只做等比例缩放和留白，没有裁剪
  或拉伸。

### 结论

没有可执行的 P0、P1 或 P2 差异。

- 左侧“专业智能体 / 技能 / 连接器”继续作为唯一入口；技能和连接器都在
  定制中心独立打开，不再重复渲染页面级定制导航，连接器也不再跳设置页。
- 技能页保持“已安装 / 技能市场”两个直接页签，来源筛选、搜索、创建和
  导入集中在同一工具区；每页固定八张，真实桌面为四列两行，容器宽度
  不足时再降为两列和单列。
- 45 个标准 `home.codex` 用户技能在简中显示可理解的中文名称与用途，
  英文和繁中资源同步完整；中文“布局”和原始 `arrange` 身份都能搜索，
  但 raw key、name、dirName、sourceSlot、path、市场安装 ID 和安装判断
  没有改变。项目技能、其他来源和用户自定义展示名不会被误覆盖。
- 连接器页面复用现有 MCP 列表、状态、鉴权、启停、重启、删除和 JSON
  保存接口；搜索、状态筛选和添加入口保持市场式工具栏。当前本机没有已
  配置 MCP，因此明确显示成功加载后的空状态，不把错误或不存在的在线
  市场伪装成“暂无连接器”。
- JSON 编辑器仍是当前可信的连接器添加方式；设置页的默认 MCP 呈现继续
  保留。目录模式增加同步操作锁，过渡期间禁用重复鉴权、生命周期和删除
  动作，避免快速重复点击造成状态竞争。
- WorkBuddy 审查期间误装的 `wechat-cover` 已从其真实技能目录移出，并
  保存在可恢复备份
  `.codex-artifacts/workbuddy-skills-connectors-audit/restored-state-backup/wechat-cover`；
  没有删除用户资料。

### 视觉复核

- 同图检查确认：工具栏、页签、卡片边框、字号、间距、焦点环和状态标签
  与 Void 现有工作区令牌一致，没有新增渐变、玻璃效果、硬编码主题色或
  装饰性资产。
- 技能优化前的三列加零散英文名已被四列中文目录替代；八张卡在同一视口
  完整显示，分页固定在页面底部，内容不会无限拉高。
- 连接器空状态和 JSON 添加状态在同一左侧导航中完成切换；没有出现设置
  页标题、侧栏跳转、文字遮挡、横向溢出或不可见的主要动作。

### 图标与全量中文增量验收（2026-08-01）

- 最新 Void 原生桌面证据：
  - `.codex-artifacts/customization-icon-pass/17-skills-four-columns.png`
    （74 个已安装技能的中文目录、圆形能力图标与固定两行视口）；
  - `.codex-artifacts/customization-icon-pass/21-english-search-clean.png`
    （输入英文 `arrange` 后只显示中文“布局优化”）；
  - `.codex-artifacts/customization-icon-pass/22-connectors.png`
    （连接器独立目录、搜索筛选与统一圆形空状态图标）；
  - `.codex-artifacts/customization-icon-pass/23-agent-skills-comparison.png`
    （同一窗口状态下的智能体参考与技能实现上下对照）。
- 当前桌面扫描到的 74 个技能均有中文展示：24 个 Void 内置技能、45 个
  `home.codex` 标准用户技能，以及 5 个 `home.claude` 外部技能
  （Office CLI、Paperclip、Paperclip 智能体创建、Paperclip 插件创建、
  PARA 记忆管理）。运行时英文名称、目录名、安装键和调用身份没有修改。
- 搜索同时覆盖中文名称、中文说明、原始英文名称、目录名、技能键、来源槽、
  路径和别名；搜索框明确提示“搜索技能或英文 ID”，降低用户发现成本。
- 技能与连接器复用同一个 `CatalogIconAvatar` 视觉组件，并按布局、架构、
  文档、浏览器、代码检查、数据库、邮件、日历、云服务等稳定语义选择
  Lucide 图标。没有使用 emoji、手绘 SVG 或无意义字母占位。
- 主窗口改为 Tauri 标准 `WebviewUrl::App`，开发环境由 `devUrl` 解析到
  Void 独立的 `127.0.0.1:1432`；因此既不会再命中 BitFun 的开发服务，
  也不需要把本地命令权限扩大给外部页面。技能读取、中文目录和英文搜索
  已在重新启动后的真实桌面进程中验证。

## 全页面视觉与切换性能审查（2026-08-02）

### 最终全窗口证据与可信度

- 最终截图均通过显式 HWND、Per-Monitor V2 DPI 感知、DWM 扩展窗口边界和
  `PrintWindow(PW_RENDERFULLCONTENT)` 获得；每张图都附带 JSON sidecar，记录
  捕获方法、窗口边界、DPI 和 `potentially_occluded=false`。截图为
  `1804 × 1204` 物理像素，完整包含左侧导航、顶部场景栏、内容边界、底部分页
  或输入区以及系统窗口控制。
- 权威证据位于 `.codex-artifacts/visual-performance-audit-20260802/`：
  `current-live-full-window.png`（欢迎页）、
  `07-skills-final-full-window-v2.png`（技能）、
  `08-connectors-final-full-window.png`（连接器）、
  `11-session-composer-workspace-full-window-v2.png`（会话输入区）、
  `12-agents-final-full-window.png`（智能体）和
  `13-teams-final-full-window.png`（团队）。早期 `01` 至 `05` 的
  `CopyFromScreen` 截图仅保留为过程证据，不作为最终视觉结论。

### 覆盖矩阵

- 场景清单覆盖 17 个固定场景、动态 `miniapp:*` 路由和设置中的 13 个子页；
  全部仍由既有场景注册、懒加载边界、主题/i18n 合同和 Web 回归测试保护。
- 本轮逐像素人工复核优先覆盖用户点名的技能、连接器和欢迎页，并扩展到智能体、
  团队及会话输入区。没有把未逐页截图的设置子页描述成已完成视觉重设计；它们
  通过全局合同和构建门禁验证无回归。

### 优先问题

- P1 技能已修复：加载失败与市场失败均可原地重试；卡片改成非交互容器，详情和
  安装/管理动作独立，避免嵌套点击语义；截图复核发现并修复了四列布局中操作区
  挤压名称的问题。
- P2 连接器已修复：空状态隐藏无意义的搜索和状态筛选，只保留一个“添加连接器”
  主入口；继续复用现有 MCP JSON、状态、鉴权和生命周期接口。
- P2 欢迎页已修复：工作区菜单具备完整 ARIA、方向键循环、Escape 和焦点恢复；
  最近工作区删除操作与打开操作分离；通知失败显式反馈。会话截图还发现并修复了
  “选择工作区”被截断成“选择工...”的问题。

### 技能与连接器市场化复核（同视口）

- 本轮重新采集 WorkBuddy 的技能市场与连接器目录作为对标证据：
  `.codex-artifacts/workbuddy-comparison-20260802/05-workbuddy-skills-market-clean-full-window.png`
  和 `07-workbuddy-connectors-market-full-window.png`。Void 最终证据为同目录的
  `15-void-skills-refined-full-window.png` 与
  `16-void-connectors-refined-full-window.png`；四张截图均为 `2560 × 1368`
  物理像素，并完整包含左侧栏、顶部、最右内容、底部与窗口控制键。
- 同屏对照图为 `17-skills-workbuddy-void-comparison.png` 和
  `18-connectors-workbuddy-void-comparison.png`。技能页保留用户指定的四列与
  八张分页，同时收敛到小图标、强标题、两行用途和轻量操作。连接器在有配置时
  使用两列宽横卡；当前真实空配置状态只解释本地命令与远程 URL 两条已支持路径，
  并保留唯一 JSON 添加入口，没有伪装成可安装的在线连接器市场。
- Void 两张最终截图的 sidecar 均记录 `PerMonitorV2`、DPI 144、DWM 物理边界
  `0,0–2560,1368`、`PrintWindow(PW_RENDERFULLCONTENT)` 和
  `potentially_occluded=false`。上一批次 `1804 × 1204` 证据继续保留为历史验收，
  不与本轮同视口复核互相替代。
- 本轮新增的技能/连接器呈现合同 29/29 通过；限制为 4 个 worker 的全量前端
  回归为 503 个测试文件、2801/2801 项通过，生产构建与性能预算通过。第一次
  默认高并发全量运行中两项既有智能体创建测试发生 5 秒超时，单文件重跑 4/4
  通过，随后限并发全量重跑全部通过；该并发抖动没有通过延长业务等待或弱化
  断言来掩盖。

### 技能目录密度复核（2026-08-02）

- 用户指出上一版四列但仅两行，首屏只有 8 张卡并留下大面积空白。重新在同一
  `2560 × 1368`、DPI 144 物理窗口捕获 WorkBuddy 与 Void，证据位于
  `.codex-artifacts/skills-density-audit-20260802/`：
  `03-workbuddy-skills-full-window.png`、
  `08-void-skills-density-final-clean-full-window.png`，最终并排对照为
  `09-workbuddy-void-skills-final-comparison.png`。两张原始窗口截图的 sidecar 均为
  `PerMonitorV2`、DWM `0,0–2560,1368`、
  `PrintWindow(PW_RENDERFULLCONTENT)` 和 `potentially_occluded=false`。
- 审查评分从 5.5/10 提升到 8.2/10：四列要求不变，每页由 8 张增至 20 张，
  首屏由两行增至五行；卡高从 140px 收到 116px，头像从 40px 收到 36px，
  默认用户级徽标不再在每张卡上重复。项目级、覆盖冲突、内置状态和全部操作仍
  明确保留；分页仍固定在底部，目录不会无限拉高页面。
- 技能场景定向回归 4 个测试文件、13/13 项通过，定向 ESLint、类型检查、生产
  构建和 Web 性能预算通过；翻到第 2/4 页的真实桌面交互证据为
  `07-void-skills-page-2-full-window.png`。

### 切换性能基线与验收门槛

- 页面层改为窄 Zustand selector；已挂载场景由 memoized slot 保留状态且仅激活
  当前页刷新；主导航在真实指针/键盘意图时预加载技能、连接器和智能体代码块。
  这些调整不卸载场景、不清空画布、不取消后台任务。
- Playwright 使用渲染器 performance mark、MutationObserver 与双 `requestAnimationFrame`
  计时，热切换取 20 个样本。最终结果：冷切换 `p95=197.1 ms`，热切换
  `p95=62.0 ms`，数据就绪 `p95=513.7 ms`。
- 稳定门槛为热切换 `p95 ≤ 150 ms`、冷切换 `p95 ≤ 600 ms`、数据就绪
  `p95 ≤ 1500 ms`。日志为
  `.codex-artifacts/visual-performance-audit-20260802/scene-switch-performance-final.log`。

### 稳定性与保护边界

- 新增窗口捕获合同、错误重试、键盘操作和场景切换计时回归。最终定向验证包括
  42 项技能/连接器/欢迎页测试、98 项场景与性能相关测试、4 项窗口捕获合同、
  2 项定制中心视觉 E2E，以及类型、Lint、主题、i18n、边界与构建门禁。
- 仓库卫生在只包含本轮 44 个内容文件的临时工作树中通过。主工作树直接运行时
  会被用户已有、未跟踪的 `media/generated/**/manifest.json` 本地绝对路径拦截；
  本轮未修改、删除或提交这些素材，也没有把该外部状态误报为源码失败。
- 视觉与性能优化只经现有场景、Module Interface 和适配器接入；不得在页面中新增
  Tauri、文件系统、进程、数据库或 provider 直连。
- 必须保护 Flow Chat 恢复、BTW 子会话、子代理/Review Team、Goal、多任务、自动化、
  AI 媒体、短剧五阶段、桌面窗口、WebDriver、权限和会话生命周期；不得用卸载隐藏
  场景、取消后台任务或清空画布的方式优化切换。

## FlowChat 动态 UI 原版组件库（2026-08-14）

### 对照证据

- 设计真值：`https://www.beautifului.dev/` 当前桌面页面，以及逐个点击 19 个
  `View code` 获得的原始 TSX。
- 原站捕获：
  `.codex-artifacts/flow-chat-comparison/beautiful-ui-source/source-desktop.png`
  和 `source-mobile.png`。
- 本地全窗口捕获：
  `.codex-artifacts/flow-chat-comparison/flowchat-dynamic-library-full-window.png`，
  使用 Per-Monitor-V2 DPI 感知并按 DWM 物理边界捕获，边界与输出均为
  `2560 × 1368`，完整包含左侧栏、顶部、最右内容、窗口底边和系统控制键。
- 同图组件对照：
  `.codex-artifacts/flow-chat-comparison/qa-approval-card-comparison.png`；左右两侧
  使用同一 Edge 渲染器、相同初始状态，卡片主体均为 320px 宽。
- 官网全部正式模式的桌面与移动端捕获位于
  `.codex-artifacts/flow-chat-comparison/beautiful-ui-modes/`；11 个 Variant 的
  官网/本地纵向同图对照为 `all-variant-source-vs-local.png`，模式尺寸与状态清单
  记录在 `variant-evidence.json`。

### 结论与修正

- 19 个组件直接使用原站公开源码；其中 Loading State 的 Drive / Dots / Orbit、
  Thinking State 的 Steps / Reasoning / Search / Coding、Task Rows 的 Capsules /
  List、Prompt Bar 的 Rounded / Pill 共 11 个正式 Variant 均已接入。其余 15 个
  案例没有额外 Variant 元数据，原源码中的展开、选择、搜索、输入、权限确认等
  内部交互状态完整保留，因此组件库合计覆盖 19 个案例、26 个正式展示模式。
- 原站编译 CSS、Inter / JetBrains Mono 字体和
  `glimm`、`liveline`、`iconoir-react` 依赖均已本地化，没有重新绘制或改写外观。
- 首轮同图检查发现 Shadow DOM 中 Tailwind `@property` 初值没有正确参与复合
  `box-shadow`，使 Approval Card 的单选圆环消失。承载层已在 `base` cascade
  layer 补齐原始初值；复验后圆环宽度、颜色与 1.5px 内阴影和原站一致，原组件
  TSX 未因此修改。
- 本地外层保留 Void 组件库的信息架构、中文标题、持续循环、暂停和重播控制；
  原版组件放在隔离的暗色舞台中，官网 CSS 不污染组件库或生产工作区。
- 统一容器切换实测为宽 `1120px`、中 `820px`、窄 `520px`；浏览器缩到
  `760px` 时无横向溢出。切换动画为 260ms，并在 reduced motion 下关闭。
- 19 个 Shadow root 和 19 个唯一原组件 ID 均成功挂载；4 组模式选择器的 11 个
  Variant 已逐一点击并确认 `aria-pressed`，选中的模式在外层自动循环与手动重播后
  保持不变。暂停、继续、重播、搜索/选择/展开等原组件交互可用，运行期
  console/page error 为 0。
- 用户于 2026-08-14 确认该视觉基线可迁入生产 Flow Chat。当前生产共享呈现层已接入
  原版 3×3 Drive / Orbit 运行指示、思考摘要折叠与计时、多个工具时间线；工具事件、
  模型摘要、权限、团队运行时、会话生命周期、路由、持久化、Canvas、左栏和生产
  工具卡注册路径均未修改。
- 后续确认要求全部迁入并删除其他实现造成的重复动画/隐藏逻辑：生产绑定现覆盖全部
  19 个原版组件 ID；运行提示、工具状态、任务状态和思考直接挂载 Beautiful UI 源
  组件。已删除自制 BeautifulPixelGrid / BeautifulLoadingState、thinking-orbs、正文
  二次打字机、任务完成环、思考自动收起、工具组隐藏和旧涟漪动画。思考与活动内容
  始终使用真实模型摘要和工具事件，不展示或伪造隐藏推理。
- 真实桌面项目全窗口证据为
  `.codex-artifacts/flow-chat-production-baseline/void-production-flowchat-baseline-full.png`；
  采用 Per-Monitor-V2 与 DWM 物理边界捕获，输出 `2560 × 1368`，包含完整顶部、
  左侧栏、最右侧 Team 面板、底部输入区和窗口控制键。
- 最终代码审查后的生产复验为
  `.codex-artifacts/code-review-final/void-flowchat-tools.png`：真实历史会话中模型摘要
  “思考过程”、终端工具摘要和正文输出同时可见，输入区没有第二层活动边框。sidecar
  记录 Per-Monitor-V2、DPI 144、DWM `0,0–2560,1368`、
  `PrintWindow(PW_RENDERFULLCONTENT)` 与 `potentially_occluded=false`。
- 独立预览最终自动交互覆盖 19 张案例、26 个模式、1120/820/520 三档容器、暂停、
  重播、键盘切换、全部 11 个 Variant 和 reduced motion；无横向溢出、console error
  或 page error。截图为 `.codex-artifacts/code-review-final/preview-flowchat-wide.png`、
  `preview-flowchat-narrow.png` 和 `preview-thinking-coding.png`。
- 最终回归：Web 536/536 个测试文件、3117/3117 项通过；Core 1394 项通过、5 项显式
  ignored，三个集成测试文件 13/13 项通过；WebDriver crate、Workspace cargo check、
  类型、Lint、i18n、主题、边界、仓库卫生、生产构建与性能预算全部通过。

### 可访问性与响应式

- 容器切换使用命名的 `role="group"` 和 `aria-pressed`；暂停/继续、重播按钮均
  使用语义 button，键盘可达并具备 `focus-visible`。
- 官网模式切换器按原站布局和样式接入，并补充命名 `role="group"` 与
  `aria-pressed`；键盘可逐项聚焦和切换，不依赖鼠标悬停才能辨认当前模式。
- 原站组件自身的 ARIA、键盘选择、焦点、disabled/expanded 状态和
  `prefers-reduced-motion` 规则随源码及 CSS 一并保留。
- 自动化覆盖桌面宽、中、窄容器及 760px 页面视口；没有文字遮挡、组件裁切、
  控件重叠或页面横向滚动。

final result: passed
