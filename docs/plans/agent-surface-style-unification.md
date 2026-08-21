# AGENT 风格统一计划

状态:待执行。四轮 S1–S4,每轮结束都必须可编译、可打包、测试全绿。
全部完成后把结论并入 `docs/design/catalog-and-sidebar-design-system.md`,删除本文件。

## 1. 问题

AGENT 页收口完成后,一个入口底下挂着 **7 套互不相干的皮、约 4700 行 SCSS**:

| 界面 | 样式来源 | 行数 |
|---|---|---|
| 名册(参照物) | `AgentHubScene.scss` + `.minimal` | 394 |
| 装配面板 | `AgentEquipmentPanel.scss` + `.minimal` | 236 |
| 创建智能体 | `AgentsView.scss` + `CreateAgentPage.scss` + `.minimal` | 264+570+363 |
| 团队编辑 | `TeamAuthoringPage.scss` | 977 |
| 评审团队 | `AgentsView.scss` + `ReviewTeamPage.scss` + `.minimal` | 611+395 |
| 技能创作 | `SkillAuthoringPage.scss` | 330 |
| 连接器 | `McpToolsConfig.scss`(建在 `customization-market` 上) | 574 |

底下还压着两套**旧卡片设计系统** —— `component-library/styles/customization-market.scss`
与 `staff-hq.scss`。AGENT 方向当初就明确不用它们,但连接器和装配面板仍在引。

## 2. 目标

抽出**一份**共享排版基元 `component-library/styles/agent-surface.scss`,
让上面七个界面全部改用它。旧的两套卡片系统在无人引用后删除。

## 3. 视觉宪法(违反即返工)

1. **零卡片、零边框、零阴影。** 唯一允许的线是 `0.5px` 发丝线,且只用于分隔。
2. **只用令牌**:`--workspace-*` / `--status-*`,经典回退 `--color-*`。禁止任何字面色。
3. **状态永远双通道**:文字 + 颜色,颜色只用 `--workspace-status-*`。
4. **一套字阶**,不许各页自定义:
   - 页首标题 `26px / 500 / 0.08em`
   - 使命行、小节标签 `11–12px / muted`(小节标签 `0.1em` 字距)
   - 名称、表单值 `14px / 500`
   - 说明、正文 `13px / muted`
   - 状态词 `12px`
5. **两档measure**:常规 `720px` 窄栏;信息密集面板(连接器)`960px`。除此之外不许再开档。
6. 尊重 `prefers-reduced-motion`;每个 `.scss` 走 base + `.minimal.scss` overlay 惯例。

## 4. 共享基元(S1 产出)

`component-library/styles/agent-surface.scss`,只导出 mixin,不产出任何全局选择器:

```
@mixin surface                  // 整页容器:flex 列、滚动、base 背景与前景
@mixin measure($max: 720px)     // 居中窄栏 + 统一内边距
@mixin page-title               // 26px/500/0.08em
@mixin page-mission             // 12px muted
@mixin section-label            // 11px/0.1em muted 小节标签
@mixin hairline-tabs            // 文字页签容器 + 0.5px 底线
@mixin hairline-tab             // 单个页签;.is-active = 加粗 + 1.5px 下划线
@mixin row($height: 50px)       // 行:hover 浅底 8px 圆角、左右外扩 12px、focus-visible 环
@mixin field                    // 表单项:11px muted 标签 + 发丝线输入(不是填充框)
@mixin quiet-button             // 无边框安静按钮
@mixin actions                  // 底部动作区:右对齐
@mixin state-text               // 加载 / 空 / 错误的一行文字,带 .is-error
```

`AgentHubScene.scss` 是这套语言的既有实现,抽取时以它为准,**不许改变名册现在的呈现**。

## 5. 分轮

- **S1** 抽基元;名册与装配面板改用之。这两者最接近,先验证基元够不够用。
- **S2** 创建智能体 + 技能创作(两个表单页,结构相似)。
- **S3** 团队编辑 + 评审团队(体量最大)。顺带处理 `AgentsView.scss`。
- **S4** 连接器(`McpToolsConfig`,皮最厚),脱离 `customization-market`。
  之后 `customization-market.scss` 与 `staff-hq.scss` 若已无人引用,点名删除。

每轮都必须自跑:
```
pnpm run type-check:web
pnpm run lint:web
pnpm run i18n:audit
pnpm --dir src/web-ui run test:run
pnpm run build:web
```
已知失败项 `src/flow_chat/perf/flowChatStreamingProfile.test.tsx`(jsdom 缺 `scrollTo`,
基线即失败)与本计划无关,其余必须全绿。

## 6. 不在范围

- 任何行为、数据、接线改动。本计划**纯样式**,一行逻辑都不许动。
- 名册现有呈现不许变 —— 它是参照物,S1 之后应当像素级不变。
