# 定制中心设计验收

## 对照范围

- 视觉与交互基准：
  - `.codex-artifacts/customization-center/references/reference-agent-catalog.png`（1813 × 1213，智能体目录）
  - `.codex-artifacts/customization-center/references/reference-team-detail.png`（2193 × 1180，团队详情）
  - `.codex-artifacts/customization-center/references/reference-composer-picker.png`（1405 × 508，输入框选择器）
  - `.codex-artifacts/customization-center/references/reference-composer-selected.png`（1254 × 213，已选专家）
- 实现截图：
  - `.codex-artifacts/customization-center/customization-agents-catalog.png`
  - `.codex-artifacts/customization-center/customization-teams-catalog.png`
  - `.codex-artifacts/customization-center/customization-team-detail.png`
  - `.codex-artifacts/customization-center/customization-composer-persona-picker.png`
  - `.codex-artifacts/customization-center/customization-composer-selected-persona.png`
- 聚焦截图：
  - `.codex-artifacts/customization-center/customization-team-detail-surface.png`
  - `.codex-artifacts/customization-center/customization-composer-persona-picker-surface.png`
- 同图对照证据：
  - `.codex-artifacts/customization-center/comparisons/agents-reference-vs-implementation.png`
  - `.codex-artifacts/customization-center/comparisons/team-detail-reference-vs-implementation.png`
  - `.codex-artifacts/customization-center/comparisons/composer-reference-vs-implementation.png`

实现截图为桌面端原生 E2E 最大化窗口，像素尺寸 2561 × 1368。对照图只为共同观察而统一缩放到最大宽度 1600 像素，保持各自宽高比，没有拉伸或改变界面状态。基准应用与 Void 的桌面框架、侧栏和视口不同，因此本次验收对齐的是信息架构、操作路径与界面清晰度，不做跨产品像素级复刻。

## 状态与交互

- 智能体目录：中文名称、智能体/团队切换、搜索、来源与类型筛选、新建入口。
- 团队目录：代码审查团队与 AI 短剧团队沿用现有运行能力；详情可查看主理人、真实成员、质检角色和运行状态。
- 输入框：在真实会话输入框中打开“智能体与团队”，按当前场景和精确执行模式过滤；可选择智能体并显示已选胶囊；固定团队提供“召唤”入口。
- 创建能力：智能体继续使用原有创建/编辑能力；团队定义支持创建、编辑、安装和删除，通用团队运行时仍明确标为后续能力。

## 必查表面

- 字体与排版：沿用 Void 现有字体、字号、字重和截断规则；层级清楚，无新增字体依赖或不可读小字。
- 间距与布局：目录、卡片、筛选和详情弹层使用现有 Gallery/Minimal 设计节奏；最大化桌面窗口无横向溢出，底部主操作可见。
- 颜色与令牌：复用现有主题令牌、边框、前景色和强调色；未引入固定浅色背景破坏主题。
- 图片与图标：复用现有图标库和运行时已有资产；未用 emoji、手绘 SVG 或占位图冒充产品资产。相较基准应用不复制头像商城风格，是为了保持 Void 现有设计系统和真实数据来源。
- 文案与内容：用户可见的内置模式、子智能体、团队、成员和输入框菜单均中文化；运行时 ID 保持英文且不展示为主要名称。

## 对比历史

1. 首轮发现目录仍显示 `Research Specialist`，输入框仍显示英文模式名，技能入口泄漏 `chatInput.boostSkills`。
   - 修复：补齐统一展示元数据、中文模式文案，并让技能子菜单使用正确的 `flow-chat` 命名空间。
   - 复验：原生 E2E 断言“方案规划 / 调试诊断 / 并行任务 / 深度研究 / 开发协作 / 技能”，截图中不再出现原始键。
2. 第二轮发现核心卡片仍显示 `Computer Use`。
   - 修复：补齐 `ComputerUse` 子智能体到“电脑操作”的展示映射，并增加“不出现英文名”的 E2E 断言。
   - 复验：目录截图显示“电脑操作”，原生 E2E 通过。
3. 输入框只展示选择面板不足以证明选择闭环。
   - 修复：E2E 真实点击首个可用智能体，并断言输入框出现同名已选胶囊，同时保存选择后的截图。

## 结论

未发现仍需处理的 P0、P1 或 P2 问题。实现没有逐像素复制基准应用，但已在 Void 自有设计系统中完整复现其关键产品逻辑：中文智能体/团队目录、团队成员详情、固定模式内按资格选择、输入框召唤与已选状态、以及创建和管理入口。

已覆盖的主交互：目录切换、团队详情、输入框选择器、精确模式筛选、智能体选择胶囊。浏览器控制台由桌面 E2E 运行链路观察，测试期间无导致交互失败的前端异常。

final result: passed
