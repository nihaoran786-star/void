# 轻量化与稳定性纲领 (Lightweighting & Stability Program)

Status: Current — 这是一份长期纲领文档，不是 dated plan。执行进度直接改本文，不新建文件。
Baseline measured: 2026-08-16, branch `codex/agent-revision-core-p1a1` @ f421aab0e

---

## 0. 结论先行

三件事按此顺序做，其余都是噪音：

| # | 批次 | 删除/压缩量 | 风险 | 依赖 |
|---|---|---|---|---|
| **B1** | ✅ 已完成 — 删除孤儿文档目录 + 压缩三大流水账 | **-23,044 行 md（148→57 文件）** | 低 | — |
| **B2** | ✅ 已完成 — 删除读 SCSS 文本做断言的测试 | **-11,198 行测试（557→461 文件）** | 低 | — |
| **B3** | ⚠️ 原设想被推翻 — 那不是重复代码，是主题覆盖层 | 实得 -77 行；余下是产品决策 | — | 见 §4 B3 |
| B4 | 把 `core/src/agentic/` 按上游分层拆成 `execution/` 层 | 不减行，但根治稳定性 | 高 | 长期 |

执行记录：`171e0ff2d`（B1-a/B1-d）、`3dc7c55a4`（B2 主批）、`991b81e2e`（B1-c + B2 收尾）。
每批提交后 `pnpm --dir src/web-ui run test:run` 全绿。

**一个反直觉的负面结论**：Rust 侧的「过度防御」不是真问题，见 §3.3。不要在那上面花时间。

---

## 1. 现状实测（全部为本次实际测量，非估算）

### 1.1 代码体量

| 区域 | LOC | 说明 |
|---|---|---|
| `src/crates` Rust | 315,244 | 17 个 crate |
| `src/web-ui` 生产 TS/TSX | 308,401 | |
| `src/web-ui` SCSS | **110,625** | 异常偏高 |
| `src/web-ui` 测试 | 106,443 | 557 个文件，占生产代码 34.5% |
| `docs/` markdown | 45,689 | 148 个文件 |

### 1.2 Rust 集中度

```
src/crates/core/                     225,644  ← 占全部 Rust 的 72%
  └─ core/src/agentic/               143,015
       ├─ tools/                      60,269
       ├─ session/                    11,094
       ├─ coordination/               10,064
       ├─ agents/                      9,599
       ├─ persistence/                 8,020
       ├─ execution/                   7,863
       └─ deep_review/                 6,319
  └─ core/src/service/                66,547
其余 16 个 crate 合计                 ~90,000
```

单文件超 4000 行的「上帝文件」：

| 文件 | 行数 |
|---|---|
| `src/crates/core/src/agentic/coordination/coordinator.rs` | 8,668 |
| `src/crates/core/src/agentic/tools/implementations/short_drama_project_tool.rs` | 7,939 |
| `src/crates/core/src/agentic/session/session_manager.rs` | 7,898 |
| `src/crates/core/src/agentic/persistence/manager.rs` | 5,542 |
| `src/crates/core/src/agentic/team_runtime_service.rs` | 4,914 |
| `src/crates/core/src/service/review_platform/mod.rs` | 4,866 |
| `src/crates/core/src/agentic/execution/execution_engine.rs` | 4,028 |

---

## 2. 与上游 BitFun 的结构对比（稳定性的真正答案）

### 2.1 上游是按「依赖层」分目录的，我们把它拍平了

`D:\codex\BitFun-upstream\src\crates` 有 6 个层目录，每层一个 `AGENTS.md`：

| 层 | LOC | 包含的 crate |
|---|---|---|
| `contracts/` | 34,884 | core-types, events, product-domains, runtime-ports |
| `interfaces/` | 16,100 | acp, sdk-host |
| `adapters/` | 59,498 | agent-runtime-ipc, ai-adapters, claude-code-adapter, codex-adapter, opencode-adapter, static-hook-support, transport, webdriver |
| `execution/` | 69,207 | **agent-runtime, agent-stream, harness, plugin-runtime-client, runtime-services, tool-call-jsonrepair, tool-contracts, tool-execution, tool-provider-groups** |
| `services/` | 152,280 | miniapp-market-service, page-function-runtime, relay-service, services-core, services-integrations, terminal |
| `assembly/` | 238,673 | core, external-sources, product-capabilities |

我们的 `src/crates/` 是一个**扁平的 17 项列表**，没有层目录：
`acp, agent-stream, agent-tools, ai-adapters, api-layer, core, core-types, events, product-domains, runtime-ports, services-core, services-integrations, terminal, tool-packs, tool-runtime, transport, webdriver`

### 2.2 关键差异：我们缺了整个 `execution/` 层

上游用 9 个 crate（69,207 行）承载 agent 运行时。我们把这些职责全部塞进了
`core/src/agentic/`（143,015 行）——**一个 crate 内部的模块，没有任何编译期边界**。

上游 `assembly/core` 也很大（238k），但那是全部 718k 的 33%；
我们的 `core` 是全部 315k 的 **72%**。差别就在这里。

我们缺失的上游 crate（19 个）：
`sdk-host, agent-runtime-ipc, claude-code-adapter, codex-adapter, opencode-adapter,
static-hook-support, agent-runtime, harness, plugin-runtime-client, runtime-services,
tool-call-jsonrepair, tool-contracts, tool-execution, tool-provider-groups,
miniapp-market-service, page-function-runtime, relay-service, external-sources,
product-capabilities`

### 2.3 我们的「分层 crate」其实是空壳

我们保留了上游 `contracts/` 层的 crate 名字，但里面几乎没东西：

| crate | LOC | 判定 |
|---|---|---|
| `api-layer` | 234 | 空壳 |
| `tool-packs` | 393 | 空壳 |
| `events` | 982 | 近乎空壳 |
| `runtime-ports` | 1,802 | 近乎空壳 |
| `core-types` | 2,120 | 近乎空壳 |

**边界只存在于命名，不存在于依赖图。** `AGENTS.md` 里写的
`UI / route -> Module Interface -> Adapter / service -> external system`
在 Rust 侧没有任何东西在强制执行——因为四层全在同一个 `core` crate 里。

这就是「不稳定」的结构性根因：任何改动都可能穿透四层，编译器不会拦你。

---

## 3. 三类「GPT 式冗余」的实测判定

### 3.1 ✅ 确认存在且极严重：CSS 文本正则测试

**101 个测试文件、14,001 行**，做的事是 `readFileSync` 读入一个 `.scss` 源文件，
然后对 CSS **文本内容**做正则/子串断言。

证据：
```
readFileSync/readSource/readSibling + .scss 的测试文件：101 个 / 14,001 行
其中引用 *.minimal.scss 的：99 处在测试里，仅 30 处在真实代码里（3:1）
```

分布最密集的目录：
`app/presentation`(25) · `infrastructure/config/components`(13) · `app/components/panels`(10) ·
`app/scenes/agents`(5) · `app/components/NavPanel`(5) · `app/scenes/session`(4)

命名模式：`*.visual-contract.test.ts`(10) · `*.presentation.test.ts`(28) ·
`*.minimal.test.ts`(16) · `*.layout.test.ts`(4) · `*-contract.test.ts`(11)

**为什么必须删**：
- 不渲染任何组件，不验证任何行为；只验证「某个字符串出现在某个 CSS 文件里」
- 任何 CSS 重构（改类名、拆文件、合并选择器）都会红，但没有任何真实回归被捕获
- 它们**反向锁死了 B3（SCSS 去重）**：想删一份重复样式，先得改 100 个测试
- 占全部测试代码的 13%，是「过度测试」最纯粹的形态

**处理**：整批删除。不替换、不改写。真正需要视觉回归的，用少量 Playwright 截图测试覆盖，
数量控制在个位数。

### 3.2 ✅ 确认存在：SCSS 双轨制

51 个 `*.minimal.scss`（15,283 行），其中 **43 个存在同名非 minimal 兄弟文件**。

运行时入口只有一个：`app/presentation/minimalWorkspacePresentation.scss`（57 行 barrel），
由 `app/presentation/workspacePresentationStyles.ts:13` 动态 import。

也就是说 minimal 那一套是「新」的、被加载的；但旧的 `.scss` 也仍在各组件里被 import，
两套样式同时进包。110,625 行 SCSS 里有相当一部分是重复表达同一视觉。

单文件体量失控的样例：
`NurseryView.scss` 3,458 · `NavPanel.scss` 2,369 · `AIModelConfig.scss` 2,150 ·
`AutomationScene.scss` 1,956 · `ChatInput.scss` 1,871 ·
`SkillsScene.scss` 1,611 **+** `SkillsScene.minimal.scss` 1,493（同一个场景两份）

**处理**：见 §4 B3。先删测试（B2），再逐屏收敛到单一样式来源。

### 3.3 ❌ 证伪：Rust 侧的「过度防御」不是问题

对比上游同类模式密度（每千行）：

| 模式 | 本仓库 | 上游 BitFun | 判定 |
|---|---|---|---|
| `let _ = ` | 508 / 315k = **1.61** | 1,212 / 718k = **1.69** | 比上游更干净 |
| `unwrap_or_default()` | 510 / 315k = **1.62** | 832 / 718k = **1.16** | 略高 40%，非重点 |
| `.unwrap()` | 1,409 / 315k = **4.47** | 4,113 / 718k = **5.73** | 比上游更干净 |
| `#[allow(dead_code)]` | 55 | — | 可接受 |
| `TODO/FIXME` | 9 | — | 非常低 |

**结论：不要去做 Rust 防御代码的大扫除。** 密度与上游同量级，收益极低而回归风险高。
Rust 侧唯一值得投入的是 §2 的分层拆分。

### 3.4 ⚠️ 待定：TS 侧防御密度

生产 TS/TSX（308,401 行）实测：
`?? [] / ?? {}` 321 处 · `catch` 1,973 处 · `?.` 4,687 处 · `as any` 241 处 ·
`@ts-ignore` **0 处**（这点很好）

`catch` 1,973 处 / 308k = 6.4 每千行，偏高但不离谱。
真正的问题是有多少 catch 是**吞掉错误后继续**——`console.warn/error` 只有 10 处，
说明绝大多数 catch 要么静默，要么走了统一 error 通道。需要单独确认，暂不列入前三批。

---

## 4. 执行批次

### B1 — 文档瘦身（-24,000 行 / -92 文件，风险：低）

现状：147 个唯一 md / 45,689 行；实测入链集合仅 46 个 basename，
**106 个文件没有任何入链**（孤儿）。

**B1-a 整目录删除 —— ✅ 已逐文件复核，成立**

孤儿率是我自己按 basename 逐个 `grep -rl` 复核出来的，不是引用他人报告：

| 路径 | 文件数 | 行数 | 孤儿率（实测） | 理由 |
|---|---|---|---|---|
| `docs/superpowers/` | 43 | 4,478 | **39/43 无入链** | 全部是 agent 工作脚手架 prompt（"REQUIRED SUB-SKILL"），非契约 |
| `docs/issues/` | 44 | 3,151 | **36/44 无入链** | 已完工的 issue 契约 + 2026-06 迁移规格 |
| `docs/obsidian/` | 5 | 149 | **4/5 无入链** | 自述为「2026-06 历史快照」 |

合计 92 个文件 / 7,778 行，其中 79 个完全无入链。
剩余 13 个有入链的，先把入链方一并处理（入链方本身也在删除范围内），再删。

**B1-b 单文件删除 —— ⚠️ 暂缓，原始证据已被推翻**

本节最初来自一份 opencode/deepseek 审计报告，列了 14 个「孤儿 + 失效」的单文件。
**逐条复核后全部不成立**，记录在此以免重犯：

| 原始论断 | 复核结果 |
|---|---|
| `session-runtime-usage-report-design.md`(1,668) 的符号 `sessionRuntime*`/`usageReport`/`RuntimeUsage*` 在 `src/` 命中 0，是错误认知文档 | **假**。该功能已完整交付，横跨 TS 与 Rust：`flow_chat/services/usageReportService.ts`、`flow_chat/services/openSessionUsageReport.ts`、`flow_chat/components/usage/{SessionUsagePanel,SessionUsageReportCard}.tsx`、`flow_chat/components/usage/usageReportUtils.ts`、`crates/core/src/service/session_usage/{mod,service}.rs`、`crates/services-core/tests/session_usage_contracts.rs`。这是一份**已实现功能的设计文档**，不是错误认知 |
| 上述 14 个文件均为「孤儿」 | **假**。逐个统计入链数，14 个**全部有 1–4 处入链**（详见下表） |
| 多个文件标 `Status: Draft` | **半假**。只有 `ui-system-foundation-prd.md`（确为 `Status: Superseded as a current queue on 2026-08-08`）和 `workspace-media-gallery-prd.md`（确为 `Status: Draft`）属实；`media-result-interactions-prd.md`、`automation-phase-a-behavior.md`、`void-brand-replacement-prd.md`、`apimart-media-tools-prd.md` **根本没有 status 行** |

实测入链数（`grep -rl <basename> docs/ CONTEXT.md AGENTS.md README.md`，排除自身）：

```
1  session-runtime-usage-report-design.md      4  windows-computer-use-smoke-matrix.md
1  frontend-minimal-workspace-audit-2026-07-18 2  web-ui-performance-phase1-results.md
2  web-ui-performance-phase2-results.md        2  web-ui-performance-phase2-audit.md
1  ui-system-foundation-prd.md                 1  apimart-media-tools-prd.md
2  void-brand-replacement-prd.md               4  workspace-media-gallery-prd.md
1  media-workspace-assets-prd.md               1  media-result-interactions-prd.md
3  agent-companion-shaped-compact-chat-…       2  automation-phase-a-behavior.md
```

**处理方式**：这些文件的删除必须在 B1-a + B1-c + B1-d 完成后重做一次判定——
因为它们的入链大多来自 `docs/issues/` 和三大流水账，那些一旦删掉，入链会自然归零，
届时再按 §4 B1-d 的新规则（未被 `docs/README.md` 链接 = 可删）机器化判定。

**教训（对整个项目有效）**：子代理给出的「已验证」逐文件证据必须复核后才能执行。
目录级/统计级结论可信度高，单文件级论断可信度低。

**B1-c 三大流水账压缩（16,279 → ~500 行）**

`docs/TEST_PLAN.md`(7,201) + `docs/PROGRESS.md`(5,610) + `docs/ISSUES.md`(3,468)
= 16,279 行，内容是已完成的勾选框和逐 issue 验证日志，引用的 `ISSUE-XXXX` 编号
在 `src/` 中一个都找不到。

合并为单一 `docs/ledger-archive.md`，只保留三样：
① 受保护能力清单 ② 「永久否决」的决策 ③ 仍被测试断言的验收条件。

**B1-d 改掉造成膨胀的规则（最重要的一步）**

`AGENTS.md` 现有条款：
> "Never delete a dated plan, audit, result, decision, or migration ledger merely because it is old.
> First prove it has no unique contract or evidence…"

**这条规则把「删除」设为需要举证的禁区，「保留」设为默认。** 每个 AI 任务都会新产出一个
dated plan，于是 148 个文件里 113 个是孤儿。这是文档膨胀的唯一根因。

替换为：

```markdown
- 一份文档是「当前有效」的，当且仅当它被 docs/README.md 链接。未被链接的文档默认可删。
- 每个领域只有一个 append-only 台账，不为每次计划/审计/结果新建 dated 文件。
- 证据类文档在合并进当前规格后默认删除；举证责任在「保留」一方，不在「删除」一方。
```

**保留清单（约 28 个文件）**：
`CONTEXT.md` · `AGENTS.md` · `README.md` · `docs/README.md` · `design-qa.md` ·
`docs/ARCHITECTURE.md` · `docs/DECISIONS.md` ·
`docs/architecture/{frontend-minimal-workspace-migration, core-decomposition, i18n, web-ui-performance-boundaries}.md` ·
`docs/design/{porcelain-graphite-design-system, quiet-directory-design-system}.md` ·
`docs/development/i18n.md` ·
`docs/features/{canvas-plugin-platform-prd, customization-center-prd, team-workspace-prd, interaction-theme-governance}.md` ·
`docs/plans/{core-decomposition-plan, desktop-window-fullscreen-plan, lightweighting-program}.md` ·
`docs/qa/{repository-stability-audit-2026-07-28, frontend-minimal-workspace-parity, theme-normalization-audit-2026-07-25, new-session-media-stability-2026-07-27}.md` ·
`docs/remote-connect/feishu-bot-setup{,.zh-CN}.md`（孤儿但**不过时**：`service/remote_connect/bot/feishu.rs` 确实存在，且是面向用户的配置指南）

> 注：`docs/qa/repository-stability-audit-2026-07-28.md` 被 `AGENTS.md` 当作「当前基线失败清单」引用，
> 但它比 `CONTEXT.md`(2026-08-15) 旧 18 天。保留其角色，但需要刷新。

---

### B2 — 删除 CSS 文本测试（-14,001 行 / -101 文件，风险：低）

删除条件（机器可判定）：测试文件同时满足
① 用 `readFileSync` / `readSource` / `readSibling` 读取 `.scss`
② 断言目标是 CSS 文本内容而非渲染结果

一次性删除全部 101 个。**不要**逐个评估「这个是不是还有点用」——那正是 GPT 当初
写出它们的思路，也是这套东西存在的原因。

删完跑：
```bash
pnpm --dir src/web-ui run test:run
```
预期：测试数量大降，但 0 个真实用例失败。若有失败，说明该文件混入了真实断言，
把那部分单独提取为组件测试后再删。

**同时删除**这些测试所依赖的 helper（`readSource` / `readSibling` 工具函数）。

---

### B3 — SCSS ⚠️ 原设想已被推翻，这里不是重复代码

**最初的判断「43 组重复样式，删掉死掉的一半」是错的。** 实测后的真实架构：

`minimal` 不是一次未完成的迁移，而是一个**主题覆盖层**。
`workspacePresentation.ts:4` 定义 `type WorkspacePresentation = 'classic' | 'minimal'`，
两种模式都受支持，可通过 `?void-ui=classic`、`VITE_VOID_WORKSPACE_PRESENTATION`
或 localStorage 切换；`minimal` 只是默认值。

`*.minimal.scss` 的内容全部作用域在 `.void-ui--minimal` 之下，例如
`AppLayout.minimal.scss:2` 是 `.void-app-layout.void-ui--minimal { … }`。
经典 `.scss` 提供基础样式，minimal 在其之上覆盖。

51 个 `*.minimal.scss` 的真实归属（逐文件 grep 实测）：

| 类别 | 数量 | 说明 |
|---|---|---|
| 由 `minimalWorkspacePresentation.scss` barrel 加载 | 28 | minimal 模式下的覆盖层 |
| 被同名经典 `.scss` 用 `@use` 引入 | 21 | 经典文件把 minimal 当 partial 用，**已经是单一来源** |
| 真正无引用 | **1** | `ExploreRegion.minimal.scss`（77 行，已删） |
| 其他 | 1 | `BrowserChrome.minimal.scss` — 被 `BrowserPanel.scss` 和 `BrowserScene.scss` `@use`，不是死文件 |

**因此不存在「6,494 行死 minimal 样式」，只有 77 行。**
子代理报告里的那张 19 文件清单是错的：它漏掉了经典 `.scss` 通过 `@use` 引入 minimal 这一层，
按它执行会直接构建失败（例如 `SkillsScene.scss:3` 就是 `@use './SkillsScene.minimal'`）。

同样，「删掉 21 个重复的经典 `.scss`（11,538 行）」也不能做：
- 会彻底删掉 `classic` 模式
- minimal 覆盖层远小于基础层（`ChatInput` 是 455 行覆盖 1,871 行基础），
  它不是完整替代品，删掉基础层会让 minimal 模式本身也塌掉

**真正的问题不是重复，而是「是否还需要双模式」——这是产品决策，不是重构决策。**

两条路，需要所有者选择：

- **保留双模式**：SCSS 体量就是合理成本，B3 到此为止（净收益 77 行）。
- **放弃 `classic` 模式**：把 28 个 barrel 覆盖层的规则合并回各自基础文件，
  删除 `workspacePresentation.ts` 的模式机制、`minimalWorkspacePresentation.scss` barrel、
  `void-ui--classic` 分支和全部 `.void-ui--minimal` 作用域选择器。
  这是一次真实的简化（约 15k 行 SCSS + presentation 机制），但它是逐屏的视觉重构，
  不是删除操作，且现在没有样式测试兜底，每屏都需要人工验收。

在所有者明确选择之前不要推进 B3。

---

### B4 — Rust 分层（长期，风险：高）

**目标不是减少行数，而是让编译器重新承担边界检查。**

第一步（唯一建议现在做的）：把 `src/crates/` 改成上游的层目录结构，crate 内容一行不动：

```
src/crates/
  contracts/   ← core-types, events, product-domains, runtime-ports
  interfaces/  ← acp
  adapters/    ← ai-adapters, transport, webdriver
  execution/   ← agent-stream, agent-tools, tool-runtime, tool-packs
  services/    ← services-core, services-integrations, terminal
  assembly/    ← core, api-layer
```
只改路径 + `Cargo.toml` 的 `members`，零逻辑变更。收益：立刻能看出 `core` 里
哪些代码放错了层。

第二步（后续）：从 `core/src/agentic/` 中按上游 crate 边界向外抽取，优先级：

| 抽出目标 | 对应上游 crate | 当前位置 | 行数 |
|---|---|---|---|
| tool 执行 | `execution/tool-execution` | `agentic/tools/` | 60,269 |
| agent 运行时 | `execution/agent-runtime` | `agentic/execution/` + `coordination/` | 17,927 |
| 会话生命周期 | `execution/runtime-services` | `agentic/session/` | 11,094 |
| 持久化 | （上游在 services 层） | `agentic/persistence/` | 8,020 |

先读 `docs/plans/core-decomposition-plan.md`（2,147 行）核对：哪些已实施、哪些没有。
若该计划与本节冲突，以上游实际结构为准 —— 上游是跑通的，计划只是设想。

**在 B1–B3 完成前不要动 B4。** 它风险最高、收益最慢。

---

## 5. 不要做的事

- ❌ 不要清理 Rust 的 `unwrap_or_default` / `let _ =`（§3.3 已证伪，密度低于上游）
- ❌ 不要为删掉的 CSS 文本测试「补写等价测试」
- ❌ 不要新建 dated plan 记录本次工作 —— 直接改本文件的状态
- ❌ 不要在 B1 之前动代码：文档里的错误认知会污染每一次 agent 会话的上下文，先清干净

---

## 6. 待补

以下两项审计仍在 opencode 后台运行，结果落地后并入本文对应章节，不新建文件：

- 前端死代码 / 重复抽象清单 → 补入 §3.4，可能产生 B5
- Rust 上帝文件的具体抽取接缝（行号级）→ 补入 §4 B4 第二步

「dsh（deepseek harness）」的本地源码在 `D:\` 全盘未找到（已搜 `*deepseek*` / `dsh` / `*harness*`）。
上游 BitFun 有 `execution/harness` crate，若 dsh 指的是它，本文 §2 已覆盖；
否则需要提供路径后单独补一节。
