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

final result: passed
