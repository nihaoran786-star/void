# 智能体与团队员工市场设计 QA

## 对照证据

- 设计真值：用户提供的专家市场、专家团市场和专家团详情截图。
- 实现截图：
  - `.codex-artifacts/customization-center/pagination-teams/03-agents-page-1.png`
  - `.codex-artifacts/customization-center/pagination-teams/04-agents-page-2.png`
  - `.codex-artifacts/customization-center/pagination-teams/05-teams-page.png`
  - `.codex-artifacts/customization-center/pagination-teams/06-team-detail.png`
- 同图对照：
  - `.codex-artifacts/customization-center/pagination-teams/07-reference-vs-agents.png`
  - `.codex-artifacts/customization-center/pagination-teams/08-reference-vs-teams.png`
  - `.codex-artifacts/customization-center/pagination-teams/09-reference-vs-team-detail.png`
- 状态：Windows 桌面应用，浅色主题，最大化窗口，定制 > 专业智能体。
- 实现视口：2582 × 1390 px；同图对照画布均为 2400 × 860 px，左右按
  等大槽位等比例缩放，保留完整页面和弹窗，不做局部裁剪。

## Findings

没有可执行的 P0、P1 或 P2 差异。

- 信息架构：保留 Void 自己的左侧定制导航，移除智能体和团队目录中的
  可见页面标题；页面从“推荐 / 全部 + 搜索”或团队管理动作直接开始。
- 字体与层级：页面页签、标题、角色、描述、标签和动作全部复用工作区
  字号、字重与行高令牌；中文长文案没有遮挡，页面不再显得大字、粗字
  或脱离全局界面。
- 间距与布局：推荐区保持四个固定工作模式单行四列；全部智能体每页固定
  六张，使用三列两行，分页控制固定在卡片区下方，不再无限拉高页面。
  团队目录复用同一三列卡片语言和页长规则；当前真实数据只有两个团队，
  因而保留第三列为空，不把卡片拉成全宽。
- 颜色与令牌：使用项目现有浅色表面、边框、文字和焦点令牌；没有新增
  未定义主题变量，也没有用团队色冒充状态色。
- 图片质量：24 个头像均为 256 × 256 WebP，圆形裁切清晰、风格统一、
  人物具有差异；团队卡片、团队详情、主理人和成员使用稳定身份映射，
  加载失败仍会回退到现有图标，不产生空白卡片。
- 文案：主界面只暴露中文用户概念，包括“智能体”“团队”“专业智能体”
  和专业角色；工具数量、Skill 数量、运行时 ID 等技术信息不再占据卡片。
- 信息密度：市场卡片只保留名称、岗位、两行内说明、少量标签和查看动作；
  技术细节留在详情。分页让单视口最多显示 4 张推荐卡与 6 张目录卡。
- 可用性：卡片支持鼠标、Enter 和 Space；分页按钮具备 aria-label、
  首末页禁用态和当前页播报；搜索、推荐/全部、智能体/团队切换、安装、
  创建和详情弹窗均保持原有入口。

## 对照历史

- 早期字体调整截图发现推荐区第四张卡片单独换行，造成明显留白：
  `.codex-artifacts/customization-center/typography-audit/04-agent-market-after-first-pass.png`。
- 上一轮修复为四列推荐区和三列目录；本轮进一步去掉可见页面标题并将
  目录固定为每页六张。智能体第 1 页和第 2 页、团队页及团队详情均重新
  捕获，并与用户参考图置于同一张对照图中复核。

## 交互验证

- 智能体第一页显示 6 张目录卡，点击下一页后显示另一组 6 张，页码从
  `1 / 3` 变为 `2 / 3`，页面高度不变。
- 自动化测试确认搜索、来源和类型变化会回到第一页；数据减少会把页码
  收敛到最后一个有效页，不会显示空白页。
- 从“智能体”切换到“团队”，确认“代码审查团队”和“AI 短剧团队”
  真实渲染，安装团队、创建团队和范围选择仍在。
- 打开“代码审查团队”详情，确认团队头像、主理人头像和全部成员头像
  可见，长成员列表使用弹窗内部滚动，不拉高目录页。
- 确认左侧“专业智能体 / 技能 / 连接器”导航保留且当前项可见。
- 确认四张最终桌面捕获中无布局溢出、卡片裁切或文字遮挡。右下角的
  “上次没有正常关闭”提示来自应用既有启动状态，不属于本轮页面。

## 聚焦区域说明

未额外制作局部裁剪。三张同图对照分别覆盖智能体目录、团队目录和团队
详情，卡片头像、标题、角色、描述、标签、分页、管理动作和左侧导航均可
直接辨认；额外裁剪不会增加新的判断信息。

## Follow-up Polish

- P3：当真实团队数量增加到七个以上时，目录会出现与智能体一致的分页；
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

final result: passed
