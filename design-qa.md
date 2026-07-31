# 智能体员工市场设计 QA

## 对照证据

- 设计真值：用户提供的参考截图；本轮 QA 副本位于
  `.codex-artifacts/customization-center/reference-agent-market.png`。
- 实现截图：
  `.codex-artifacts/customization-center/agent-market-final-verified.png`
- 并排对照：
  `.codex-artifacts/customization-center/agent-market-comparison.png`
- 状态：Windows 桌面应用，浅色主题，定制 > 专业智能体 > 智能体。
- 视口：应用窗口 1822 × 1213 px；设计真值 1813 × 1213 px。
- 像素与密度：两侧均使用原始桌面截图像素，未缩放；并排画布为
  3647 × 1255 px。Windows 显示缩放属于两张真实产品截图的一部分，
  没有额外密度归一化。

## Findings

没有可执行的 P0、P1 或 P2 差异。

- 信息架构：实现保留 Void 自己的左侧定制导航，并按用户明确要求移除
  页面内重复的智能体/技能/连接器导航。智能体/团队仍是页面的首要选择。
- 字体与层级：标题、角色、描述、标签和动作形成清楚的五级层次；中文
  长文案没有遮挡，卡片标题与正文权重接近对标设计。
- 间距与布局：桌面窗口中采用两列卡片，以给现有左侧导航留出稳定宽度。
  相比无左栏的三列参考，这是有意的产品约束，不是布局缺陷。
- 颜色与令牌：使用项目现有浅色表面、边框、文字和焦点令牌；没有新增
  未定义主题变量，也没有用团队色冒充状态色。
- 图片质量：24 个头像均为 256 × 256 WebP，圆形裁切清晰、风格统一、
  人物具有差异；加载失败会回退到现有图标，不产生空白卡片。
- 文案：主界面只暴露中文用户概念，包括“智能体”“团队”“专业智能体”
  和专业角色；工具数量、Skill 数量、运行时 ID 等技术信息不再占据卡片。
- 可用性：卡片支持鼠标、Enter 和 Space；搜索、推荐/全部、智能体/团队
  切换、详情弹窗均保持原有入口。

## 对照历史

- 第 1 次实现对照已无 P0/P1/P2 问题，因此没有为视觉问题修改后再比较。
- 本轮后续仅收紧了文案与主题变量，最终截图重新捕获并用于上述并排对照。

## 交互验证

- 打开“代码执行”详情并成功关闭。
- 从“智能体”切换到“团队”，确认团队管理内容存在，再切回“智能体”。
- 确认左侧“专业智能体 / 技能 / 连接器”导航保留且当前项可见。
- 确认最终桌面捕获中无布局溢出、裁切或遮挡。

## 聚焦区域说明

未额外制作局部裁剪。原始并排图保持双方 1:1 像素，卡片头像、标题、
角色、描述、标签、动作和左侧导航均可直接辨认，已经覆盖本次需要判断的
关键细节；额外裁剪不会增加新的判断信息。

## Follow-up Polish

- P3：未来可在窄窗口进一步缩短能力描述，但当前响应式规则已保证卡片
  不遮挡核心动作，此项不阻塞交付。

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
