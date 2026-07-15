# Web UI 性能第二阶段结果

本文记录 `codex/performance-phase2` 的最终实现边界、生产 bundle、Release 桌面空闲实测和回归证据。实施前问题与设计边界见 [第二阶段审计](web-ui-performance-phase2-audit.md)，长期约束见 [Web UI 性能边界](web-ui-performance-boundaries.md)。

## 1. 结论

- 第二阶段已经完成：首屏 JavaScript 相对阶段二基线下降 `47.39%`，首屏 CSS 下降 `35.08%`。
- 从第一阶段最初基线累计计算，首屏 JavaScript 下降 `72.70%`，首屏 CSS 下降 `51.17%`。
- Release 桌面端整棵进程树连续 18 次空闲采样，平均仅占 `0.20%` 单核，峰值 `0.601%` 单核；工作集从 `567.8 MB` 降至 `540.2 MB`，没有观察到持续 CPU 或内存增长。
- 隐藏状态只暂停展示、测量、播放、iframe 和可重建轮询；消息 stream、store、资产生成、工具执行与后台 task 的业务语义不变。
- 自动性能 Gate、全量 Web 测试、TypeScript、Rust 专项测试、Release 构建与独立审查共同作为收口条件。

## 2. 完成范围

### 2.1 启动依赖图

- Settings、Markdown/KaTeX、终端/xterm、Flow Chat 工具卡实现等可选 runtime 离开启动静态闭包。
- Traditional Chinese 资源保留完整词条，但从默认 `zh-CN` / `en-US` bootstrap 中移出，选择 `zh-TW` 时再加载。
- 桌面宠物组件及其样式只在独立 companion window 入口加载，普通主窗口不再解析该 runtime。
- 三文件性能 Gate 固化 entry 原始字节上限、禁止 runtime/CSS 标记、必须动态入口和静态不可达断言。

### 2.2 隐藏展示生命周期

- Content Canvas、短剧/媒体预览、Compact Chat、场景容器、可执行 iframe、会话投影、浏览器原生 WebView、任务详情、BTW、终端与 Deep Review 展示都接入明确的活动状态。
- 隐藏时停止 RAF、observer、展示型计时器、不可见媒体、iframe/WebView 和可重建轮询；恢复时读取最新权威状态，不回放隐藏期每一帧。
- 迟到异步结果使用 token、generation 或既有控制状态拦截，避免失活后自动开页、重挂 iframe 或更新已卸载 UI。
- Nav 会话列表在首次真实展示时才加载实现，之后保留本地编辑/展开状态；折叠、场景切换或 document hidden 时，Flow Chat 与状态机展示订阅均归零。
- Sessions、Automation 与 Review Platform 的展示投影使用稳定快照；恢复提交会同步读取最新 store/state machine，因此不会丢业务更新，也不会出现 running 状态错误首帧。
- Profile 和 Assistant 两条复用链都显式传播 `isActive`，避免保留挂载的助手会话列表绕过展示门控。

### 2.3 后端空闲唤醒

- 微信 iLink 重试改为 `5/10/20/40/60s` 封顶退避，认证暂停只保留一个可取消 deadline，并复用 HTTP client。
- Deep Review reviewer 容量队列从固定轮询改为 `watch` 通知加业务 deadline；容量、控制或动态并发状态变化时才唤醒，原子 admission 和供应商重试语义保持不变。

## 3. 生产 bundle 结果

最终 manifest 由本分支当前源码以相同 desktop production 配置生成。

| 指标 | 对照基线 | 最终值 | 变化 |
| --- | ---: | ---: | ---: |
| 阶段二首屏 JS raw | 4,509,649 B | 2,372,359 B | -2,137,290 B（-47.39%） |
| 阶段二首屏 CSS raw | 1,036,281 B | 672,720 B | -363,561 B（-35.08%） |
| 第一阶段最初首屏 JS raw | 8,688,411 B | 2,372,359 B | -6,316,052 B（-72.70%） |
| 第一阶段最初首屏 CSS raw | 1,377,704 B | 672,720 B | -704,984 B（-51.17%） |
| 最终首屏 JS gzip 参考值 | — | 690,642 B | 仅报告，不替代 raw Gate |
| 最终首屏 CSS gzip 参考值 | — | 95,403 B | 仅报告，不替代 raw Gate |

最终 Gate 还确认：

- `requiredDynamicEntries` 共 47 项，全部存在且可从 entry 动态到达。
- 这些入口均不在启动静态闭包；静态图 unresolved import 为 0。
- `zh-TW` 启动 locale 警告由 27 项降为 0。
- 仍有 24 项已分类的静态/动态混合导入警告；它们没有绕过 Gate，但列入剩余架构债务。

## 4. Release 桌面空闲实测

构建命令：

```powershell
pnpm run desktop:build:exe
```

产物：`D:\codex\void-source\target\release\void-desktop.exe`。完整 Release 构建成功；唯一 Rust 警告是既有的未使用函数 `parse_clipboard_path_segments`。

2026-07-16 启动可见 Release 主窗口，确认标题为 `void` 且 Windows `Responding=True`。充分预热后，对 `void-desktop` 与全部直属/递归 WebView2 子进程按 PID 和创建时间采样：

- 逻辑处理器：32。
- 进程数：7。
- 采样：18 次，每次间隔 5 秒，名义窗口 90 秒。
- CPU 口径：相邻样本进程树累计 CPU time 增量；新进程先建立基线，避免误计；同时报告单核与整机归一化值。

| 指标 | 结果 |
| --- | ---: |
| 平均 CPU（单核口径） | 0.20% |
| 平均 CPU（32 逻辑处理器整机口径） | 0.0062% |
| 最高 5 秒窗口（单核口径） | 0.601% |
| 最高 5 秒窗口（整机口径） | 0.0188% |
| Working set：首个 / 峰值 / 末个 | 567.8 / 567.8 / 540.2 MB |
| Private memory：首个 / 峰值 / 末个 | 320.6 / 320.6 / 283.0 MB |
| Threads：首个 / 末个 | 198 / 190 |
| Handles：首个 / 末个 | 3,468 / 3,474 |

最近一次运行的 `ai.log` 与 `flashgrep.log` 为 0 字节。`app.log` 和 `webview.log` 没有 `FATAL` / `PANIC`，也没有当前启动崩溃证据。现存日志均为既有配置或兼容债：首次使用时不存在的可选 `app.keybindings` 被底层记录为 error、`Codex CLI · ChatGPT Login` 被旧初始化器误判为缺少 API key、历史会话的 `VideoAI` / `AssetAI` 类型回退，以及发行配置没有 updater endpoint。微信连接日志按 `5/10/20/40/60s` 退避，验证了空闲重试不会恢复为热循环。

窗口关闭命令按产品现有行为最小化到托盘，因此 20 秒后仍保留进程不代表泄漏；采样脚本随后只终止本次捕获的 7 个专属 PID。再次检查确认没有残留 `void-desktop`，也没有终止 Node、Codex 或不属于本次运行的 WebView2 进程。

这组数据证明先前现场观察到的约 `150%–339% CPU` 不会在当前 Release 空闲态复现。开发模式仍可能在首次依赖预构建、源码变化或 HMR 时短时占用 CPU，因此直播/演示应继续优先使用 Release 产物。

## 5. 最终回归

| 验证 | 结果 |
| --- | --- |
| Web 全量 Vitest | 306/306 文件，1732/1732 测试通过 |
| Web TypeScript | `tsc --noEmit` 通过 |
| 本轮生产文件 ESLint | 0 error |
| 性能 Gate 测试 | 34/34 通过 |
| Deep Review Rust 专项 | 152/152 通过 |
| Retry Rust 专项 | 31/31 通过 |
| Release 桌面构建 | 通过 |
| 独立终审 | Critical 0 / Important 0 / Minor 1（非阻塞）；第二审定向 56/56 通过 |

全量回归曾发现一个旧的源码断言仍要求 loading class 字面量，而生产代码已在 `5799f78d4` 提取为常量。测试已改为同时锁定常量映射与全局 Suspense 边界；运行时代码没有因此变化。

i18n contract 为 14/15：唯一失败是本轮开始前已存在的 `generated_locale_contract.rs` 不同步；生成器、输入与输出相对基线未变化，因此不归因于本轮性能修改。

仓库全量 ESLint 仍报告 5 个本轮之前就存在的 error：4 个位于 `ShortDramaCenterPanel.tsx`，1 个位于 `ChatInput.tsx`。`git blame` 均指向本性能分支之前的提交；本轮涉及的全部生产文件 scoped ESLint 为 0 error，因此没有跨边界修改短剧或输入框业务代码来掩盖基线问题。

## 6. 剩余风险与继续优化边界

- 24 项已分类的混合导入警告主要集中在共享 Agent API、Tauri API 与少数 feature barrel。继续拆分需要先收敛接口所有权，不能用简单移动 import 冒充收益。
- Sessions 的高频 token 更新与状态机事件已分别抑制并按 workspace 隔离；但低频 active session / title 变化仍通过全局导航投影通知所有可见 workspace 列表。若将来同时展开大量 workspace，可再引入按 section key 的 selector；当前不构成热循环。
- `BrowserScene` 与 `BrowserPanel` 仍重复编排部分 Tauri WebView 生命周期。下一阶段应先补 controller/adapter 行为合同，再做跨模块收敛。
- 本次 Release 空闲采样为 90 秒，足以排除热循环和明显泄漏，但不能替代数小时 soak test、冷启动时延与真实大型会话交互 profiling。
- WebView2 整棵进程树约 `540–568 MB` working set 是当前 Release 空闲基线；它稳定但仍有下降空间，后续应通过标签页数量、缓存与大型媒体场景分别测量，不应以强制 GC 或卸载业务状态换取表面数字。
- Release 日志仍会把可选 keybindings 缺失记录成 error、把 Codex CLI 登录误判为缺少 API key，并报告 updater endpoint 缺失和两类历史 agentType 回退；它们不是本轮性能回归，但应分别由日志分级、认证兼容、发行配置和短剧会话类型迁移处理，避免掩盖未来真正的错误。
- 用户工作区中的媒体工具卡和版本生成文件保持原样，未纳入本轮提交；性能结论不依赖覆盖这些改动。

当前高收益、低耦合的性能切片已经落地。剩余项属于架构治理或更长时基准，不应在没有行为合同和独立数据时继续激进修改。

## 7. Coupling Review Gate

1. 页面与入口只组合和渲染，没有新增底层来源判断或远端调用。
2. 隐藏状态通过 presentation/activity 接口进入 feature；UI 不以空数组、DOM 或错误字符串猜业务状态。
3. stream、store、资产生成、工具执行、短剧分镜和后台 task 在隐藏期保持原语义。
4. 各性能提交均是可独立理解和回滚的小切片，并包含模块接口或边界测试。
5. 性能 Gate 验证 runtime 真正离开启动静态闭包，而不是只改 chunk 名称。
6. 未混入 UI 主题、短剧提示词、模型配置或用户媒体工具卡改动。
7. 两轮独立审查均为 Critical 0、Important 0；第二轮仅保留 1 个非阻塞规模化优化项，满足性能 Goal 收口条件。
