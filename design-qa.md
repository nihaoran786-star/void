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

final result: passed
