# AI 客服 POC · 运行说明

这是设计文档 `docs/superpowers/specs/2026-07-22-ai-customer-service-design.md` 的最小可运行原型：
AI 接管你的微信，自动回复好友消息。

## 准备

```powershell
pip install uiautomation
```

1. 登录 PC 微信，保持窗口存在（可以最小化）。
2. 复制 `customer_service/config.example.json` 为 `customer_service/config.json`，再编辑：
   - `llm.api_key`：填入模型 API Key（默认指向 Moonshot，可换任何 OpenAI 兼容端点）。
   - `own_name`：填入你的微信昵称（用来区分"我发的"和"对方发的"）。
   - 知识库写在 `knowledge/` 下的 markdown 里，重启守护进程后生效。

## 三步验证（强烈建议按顺序）

```powershell
# 第 1 步：干跑——只看它读到了什么、会回什么，不真正发送
python daemon.py --dry-run

# 第 2 步：只对文件传输助手真发——给自己发条消息，看它回得对不对
python daemon.py --target 文件传输助手

# 第 3 步：正式接管——自动回复所有好友（群聊默认关闭）
python daemon.py
```

## 行为说明

- 默认 `mode: all`：回复全部好友；群聊默认不回复（`group_reply: false`）。
- 静默时段默认 23:00–07:00 只收不回；每小时回复上限 60 条。
- 熔断：1 小时内 3 次故障自动停手，`status.json` 置 `tripped`，需人工重启。
- 已处理消息指纹持久化在 `state.json`，重启不会重复回复；`--dry-run` 不写入状态、上下文或限速记录。
- 每个好友的上下文独立存于 `customer_service/contexts/`，互不串话。

## 版本敏感区

微信改版可能改变 UI 结构。所有与界面结构相关的代码都集中在 `daemon.py` 的
"WeChatUI" 类和文件顶部常量，并标注了"版本敏感区"——微信升级后只需校准这一处。

## 收编路径

POC 验证通过后，按 `docs/superpowers/plans/2026-07-22-ai-customer-service-presentation-plan.md`
移植为 core 常驻服务 + Content Canvas 一级面板；config/status/contexts/knowledge
四类契约保持不变，移植是机械工作。
