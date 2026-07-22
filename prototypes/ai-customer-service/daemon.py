# -*- coding: utf-8 -*-
"""
AI 客服守护进程 POC
闭环：轮询微信窗口 -> 读取新消息 -> 知识库 + LLM 生成 -> 自动回复
契约（与设计文档 2026-07-22-ai-customer-service-design.md 对齐）：
  customer_service/config.json   回复范围策略与规则
  customer_service/status.json   心跳与显式运行状态
  customer_service/state.json    已处理游标（重启不重复回复）
  customer_service/contexts/     每个好友独立的上下文
  knowledge/                     markdown 知识库（persona.md + 其他）

安全默认：
  --dry-run      只记录"会回复什么"，不真正发送（首次运行请先用它）
  --target 名字  只回复指定会话（建议先用 文件传输助手 验证）
依赖：pip install uiautomation（LLM 调用只用标准库 urllib）
"""

import argparse
import hashlib
import json
import random
import time
import traceback
import urllib.request
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CS_DIR = ROOT / "customer_service"
CONFIG_PATH = CS_DIR / "config.json"
STATUS_PATH = CS_DIR / "status.json"
STATE_PATH = CS_DIR / "state.json"
CONTEXTS_DIR = CS_DIR / "contexts"
KNOWLEDGE_DIR = ROOT / "knowledge"

# ---------------- 版本敏感区：微信 UI 结构（wxauto 同款思路） ----------------
# 微信改版可能改布局，这些选择器是唯一需要随版本校准的地方。
WECHAT_MAIN_CLASS = "WeChatMainWndForPC"
MSG_LIST_NAME_KEYWORDS = ("消息",)          # 聊天区消息列表控件名关键字
SYSTEM_MSG_PREFIXES = ("[图片]", "[语音]", "[视频]", "[文件]", "[转账]", "[位置]", "[名片]", "你已领取", "撤回了一条消息")
PLACEHOLDER_PREFIX = "在此填入"
MAX_SEEN_MESSAGES = 5000


def log(msg):
    print(f"[{datetime.now():%H:%M:%S}] {msg}", flush=True)


def load_json(path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def save_json(path, data):
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)  # 原子写


# ---------------- 配置与状态 ----------------

class Config:
    def __init__(self, raw):
        raw = raw or {}
        scope = raw.get("scope", {})
        self.mode = scope.get("mode", "all")                # all | whitelist | blacklist
        self.names = scope.get("names", [])
        self.group_reply = bool(scope.get("group_reply", False))
        self.quiet_hours = scope.get("quiet_hours", "")     # 例 "23:00-07:00"，空串=不启用
        rules = raw.get("rules", {})
        self.typing = bool(rules.get("typing", False))      # 拟人打字；默认粘贴
        raw_delay = rules.get("reply_delay_ms", [400, 1200])
        if not isinstance(raw_delay, list) or len(raw_delay) != 2:
            raw_delay = [400, 1200]
        delay_start, delay_end = sorted(max(0, int(value)) for value in raw_delay)
        self.reply_delay_ms = (delay_start, delay_end)
        self.max_replies_per_hour = max(1, int(rules.get("max_replies_per_hour", 60)))
        self.context_window = max(1, int(rules.get("context_window", 20)))
        llm = raw.get("llm", {})
        self.llm_base_url = llm.get("base_url", "").rstrip("/")
        self.llm_api_key = llm.get("api_key", "")
        self.llm_model = llm.get("model", "")
        self.own_name = raw.get("own_name", "")             # 你的微信昵称（区分自己发的消息）
        self.poll_interval = max(0.5, float(raw.get("poll_interval", 3.0)))

    def validation_errors(self):
        errors = []
        if not self.own_name or self.own_name.startswith(PLACEHOLDER_PREFIX):
            errors.append("own_name 必须填写真实微信昵称，否则无法识别自己发送的消息")
        if not self.llm_base_url.startswith(("http://", "https://")):
            errors.append("llm.base_url 必须是 http(s) 地址")
        if not self.llm_api_key or self.llm_api_key.startswith(PLACEHOLDER_PREFIX):
            errors.append("llm.api_key 尚未配置")
        if not self.llm_model:
            errors.append("llm.model 尚未配置")
        if self.mode not in {"all", "whitelist", "blacklist"}:
            errors.append("scope.mode 只能是 all、whitelist 或 blacklist")
        return errors

    def reply_delay_seconds(self):
        return random.uniform(*self.reply_delay_ms) / 1000.0

    def in_quiet_hours(self):
        if not self.quiet_hours or "-" not in self.quiet_hours:
            return False
        try:
            start, end = self.quiet_hours.split("-")
            now = datetime.now().strftime("%H:%M")
            if start <= end:
                return start <= now <= end
            return now >= start or now <= end  # 跨零点
        except Exception:
            return False

    def allows(self, chat_name, is_group):
        if is_group and not self.group_reply:
            return False
        hit = any(n and n in chat_name for n in self.names)
        if self.mode == "whitelist":
            return hit
        if self.mode == "blacklist":
            return not hit
        return True


class Status:
    """status.json：UI/巡检读取的显式状态契约。"""

    def __init__(self):
        self.mode = "auto"          # auto | paused | tripped
        self.counters = {"recv": 0, "sent": 0, "skip": 0, "error": 0}
        self.last_error = ""
        self.restart_fails = []

    def flush(self):
        now = time.time()
        self.restart_fails = [t for t in self.restart_fails if now - t < 3600]
        tripped = len(self.restart_fails) >= 3
        save_json(STATUS_PATH, {
            "heartbeat_at": datetime.now().isoformat(timespec="seconds"),
            "mode": "tripped" if tripped else self.mode,
            "counters": self.counters,
            "last_error": self.last_error,
            "circuit_breaker": {"restart_failures_1h": len(self.restart_fails), "tripped": tripped},
        })
        return tripped


# ---------------- 上下文（每个好友一份，物理隔离） ----------------

def context_path(chat_name):
    cid = hashlib.md5(chat_name.encode("utf-8")).hexdigest()[:12]
    return CONTEXTS_DIR / f"{cid}.md"


def load_context(chat_name, window):
    p = context_path(chat_name)
    if not p.exists():
        return []
    lines = [line for line in p.read_text(encoding="utf-8").splitlines() if line.startswith("- ")]
    return [line[2:] for line in lines][-window:]


def append_context(chat_name, who, text, window):
    CONTEXTS_DIR.mkdir(parents=True, exist_ok=True)
    p = context_path(chat_name)
    existing = load_context(chat_name, 10**9)
    existing.append(f"{who}: {text}")
    body = "\n".join("- " + line for line in existing[-window:])
    p.write_text(f"# 会话上下文：{chat_name}\n\n{body}\n", encoding="utf-8")


def normalize_seen(raw_seen):
    """保留持久化顺序并去重，确保截断的是最旧记录而不是随机记录。"""
    if not isinstance(raw_seen, list):
        return []
    ordered = []
    known = set()
    for value in raw_seen:
        if isinstance(value, str) and value not in known:
            ordered.append(value)
            known.add(value)
    return ordered[-MAX_SEEN_MESSAGES:]


def remember_seen(seen_order, seen, value):
    if value in seen:
        return
    seen_order.append(value)
    seen.add(value)
    overflow = len(seen_order) - MAX_SEEN_MESSAGES
    if overflow > 0:
        for expired in seen_order[:overflow]:
            seen.discard(expired)
        del seen_order[:overflow]


def classify_sender(own_name, text):
    """把版本敏感的昵称判断收敛成主循环使用的稳定角色标识。"""
    return "我" if own_name and text.startswith(own_name) else "对方"


# ---------------- 知识库 ----------------

def load_knowledge():
    if not KNOWLEDGE_DIR.exists():
        return ""
    parts = []
    for md in sorted(KNOWLEDGE_DIR.rglob("*.md")):
        try:
            parts.append(md.read_text(encoding="utf-8"))
        except Exception:
            pass
    return "\n\n".join(parts)


# ---------------- LLM ----------------

def generate_reply(cfg, knowledge, chat_name, history, incoming):
    if not (cfg.llm_base_url and cfg.llm_api_key and cfg.llm_model):
        return None, "LLM 未配置（config.json -> llm）"
    system = (
        "你是号主的微信分身，以号主口吻回复好友消息。"
        "要求：简短自然、像真人聊天，不要客服腔；不确定的事不要编造，先反问或说稍后确认。"
        "以下是号主提供的知识库，涉及事实时严格依据它：\n\n" + (knowledge or "（空）")
    )
    msgs = [{"role": "system", "content": system}]
    for line in history:
        if ": " in line:
            who, text = line.split(": ", 1)
            msgs.append({"role": "assistant" if who == "我" else "user", "content": text})
    msgs.append({"role": "user", "content": incoming})
    payload = json.dumps({"model": cfg.llm_model, "messages": msgs, "temperature": 0.7}).encode("utf-8")
    req = urllib.request.Request(
        cfg.llm_base_url + "/chat/completions", data=payload,
        headers={"Content-Type": "application/json", "Authorization": "Bearer " + cfg.llm_api_key})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        return data["choices"][0]["message"]["content"].strip(), None
    except Exception as e:
        return None, f"LLM 调用失败: {e}"


# ---------------- 微信 UIA 操作 ----------------

class WeChatUI:
    """wxauto 式 UIA 操作：读会话列表未读 -> 切会话 -> 读消息 -> 输入回复。"""

    def __init__(self):
        import uiautomation as uia  # 延迟导入，--help 不需要依赖
        self.uia = uia
        self.win = uia.WindowControl(ClassName=WECHAT_MAIN_CLASS, searchDepth=1)
        if not self.win.Exists(3):
            raise RuntimeError("找不到微信主窗口，请先登录 PC 微信")

    def unread_chats(self):
        """返回有未读消息的会话名列表（版本敏感区）。"""
        names = []
        # 会话列表：主窗口内第一个 ListControl 视为会话列表
        for lst in self.win.GetChildren():
            pass  # 结构遍历由下方 GetFirstChildControl 链完成，保持与 wxauto 一致
        session_box = None
        try:
            main1 = [c for c in self.win.GetChildren() if not c.ClassName][0]
            main2 = main1.GetFirstChildControl()
            _nav, session_box, _chat = main2.GetChildren()
        except Exception:
            return names
        if not session_box:
            return names
        for item in session_box.GetChildren():
            try:
                # 未读角标在 wxauto 中体现为会话项内带数字的文本/红色标记
                has_unread = any(
                    (t.Name or "").strip().isdigit()
                    for t in item.GetChildren()
                    for t in ([t] + t.GetChildren())
                )
                if has_unread and item.Name:
                    names.append(item.Name)
            except Exception:
                continue
        return names

    def open_chat(self, name):
        """切换到指定会话（版本敏感区）。"""
        search = self.win.EditControl(Name="搜索")
        if not search.Exists(1):
            return False
        search.Click(simulateMove=False)
        time.sleep(0.2)
        self.uia.SendKeys(name + "{Enter}", interval=0.02)
        time.sleep(0.6)
        return True

    def read_recent_messages(self, own_name, limit=10):
        """读当前聊天窗口最近消息，返回 [(who, text)]，who 为 '我' 或对方昵称。"""
        msgs = []
        for lst in self.win.GetControlDescendants(lambda c: c.ControlTypeName == "ListControl"):
            nm = lst.Name or ""
            if not any(k in nm for k in MSG_LIST_NAME_KEYWORDS):
                continue
            for item in lst.GetChildren()[-limit:]:
                try:
                    text = (item.Name or "").strip()
                    if not text:
                        continue
                    # 主循环只消费稳定的角色标识；昵称只用于判断，不向下游泄漏。
                    who = classify_sender(own_name, text)
                    msgs.append((who, text))
                except Exception:
                    continue
            break
        return msgs

    def send_text(self, text, typing=False):
        """发送文本：默认剪贴板粘贴；typing=True 逐字输入（拟人）。"""
        edit = self.win.EditControl(Name="输入")
        if not edit.Exists(1):
            # 退而求其次：当前焦点编辑框
            edit = self.win.EditControl(searchDepth=8)
        if not edit.Exists(1):
            raise RuntimeError("找不到消息输入框")
        edit.Click(simulateMove=False)
        time.sleep(0.15)
        if typing:
            import random
            for ch in text:
                self.uia.SendKeys(ch, interval=0.01)
                time.sleep(random.uniform(0.08, 0.18))
        else:
            self.uia.SetClipboardText(text)
            self.uia.SendKeys("{Ctrl}v", interval=0.02)
            time.sleep(0.2)
        self.uia.SendKeys("{Enter}")


# ---------------- 主循环 ----------------

def fingerprint(chat, who, text):
    return hashlib.md5(f"{chat}|{who}|{text}".encode("utf-8")).hexdigest()


def main():
    ap = argparse.ArgumentParser(description="AI 客服守护进程 POC")
    ap.add_argument("--dry-run", action="store_true", help="只记录将回复的内容，不真正发送")
    ap.add_argument("--target", default="", help="只回复指定会话名（如 文件传输助手）")
    args = ap.parse_args()

    CS_DIR.mkdir(parents=True, exist_ok=True)
    cfg = Config(load_json(CONFIG_PATH, {}))
    config_errors = cfg.validation_errors()
    if config_errors:
        ap.error("配置无效：\n- " + "\n- ".join(config_errors))
    status = Status()
    state = load_json(STATE_PATH, {"seen": [], "replied_this_hour": [], "cursor": {}})
    seen_order = normalize_seen(state.get("seen", []))
    seen = set(seen_order)
    replied_this_hour = state.get("replied_this_hour", [])
    state["replied_this_hour"] = replied_this_hour if isinstance(replied_this_hour, list) else []
    knowledge = load_knowledge()

    log(f"启动：mode={cfg.mode} group_reply={cfg.group_reply} dry_run={args.dry_run} target={args.target or '全部'}")
    if cfg.in_quiet_hours():
        log("当前处于静默时段，只收不回。")

    ui = None
    while True:
        try:
            if ui is None:
                ui = WeChatUI()
                log("已连接微信窗口。")

            if status.flush():
                status.mode = "tripped"
                log("熔断：1 小时内 3 次故障，停止自动行为。请人工检查。")
                time.sleep(30)
                continue

            if cfg.in_quiet_hours():
                time.sleep(cfg.poll_interval)
                continue

            chats = [args.target] if args.target else ui.unread_chats()
            for chat in chats:
                is_group = "群" in chat
                if not args.target and not cfg.allows(chat, is_group):
                    status.counters["skip"] += 1
                    continue
                if not ui.open_chat(chat):
                    continue
                msgs = ui.read_recent_messages(cfg.own_name)
                for who, text in msgs:
                    fp = fingerprint(chat, who, text)
                    if fp in seen:
                        continue
                    if who == "我" or any(text.startswith(p) for p in SYSTEM_MSG_PREFIXES):
                        remember_seen(seen_order, seen, fp)
                        if not args.dry_run:
                            state["seen"] = seen_order
                            save_json(STATE_PATH, state)
                        continue
                    status.counters["recv"] += 1
                    log(f"[{chat}] 新消息: {text[:40]}")

                    # 限速
                    now = time.time()
                    state["replied_this_hour"] = [t for t in state["replied_this_hour"] if now - t < 3600]
                    if len(state["replied_this_hour"]) >= cfg.max_replies_per_hour:
                        log("达到每小时回复上限，跳过。")
                        remember_seen(seen_order, seen, fp)
                        if not args.dry_run:
                            state["seen"] = seen_order
                            save_json(STATE_PATH, state)
                        continue

                    history = load_context(chat, cfg.context_window)
                    reply, err = generate_reply(cfg, knowledge, chat, history, text)
                    if err:
                        status.last_error = err
                        status.counters["error"] += 1
                        log(f"  生成失败: {err}")
                        continue
                    if args.dry_run:
                        log(f"  [dry-run] 将回复: {reply[:60]}")
                        # 干跑只在当前进程内去重，不污染正式运行的游标、上下文或限速状态。
                        remember_seen(seen_order, seen, fp)
                        continue
                    time.sleep(cfg.reply_delay_seconds())
                    ui.send_text(reply, typing=cfg.typing)
                    # 发送成功后先提交去重状态，避免上下文落盘失败触发重复发送。
                    remember_seen(seen_order, seen, fp)
                    state["seen"] = seen_order
                    state["replied_this_hour"].append(now)
                    save_json(STATE_PATH, state)
                    status.counters["sent"] += 1
                    log(f"  已回复: {reply[:60]}")
                    try:
                        append_context(chat, "对方", text, cfg.context_window)
                        append_context(chat, "我", reply, cfg.context_window)
                    except Exception as context_error:
                        status.counters["error"] += 1
                        status.last_error = f"上下文写入失败: {context_error}"
                        log(f"  {status.last_error}")

            status.flush()
            time.sleep(cfg.poll_interval)

        except KeyboardInterrupt:
            log("手动停止。")
            status.mode = "paused"
            status.flush()
            return
        except Exception as e:
            status.restart_fails.append(time.time())
            status.counters["error"] += 1
            status.last_error = f"{e}"
            log(f"故障: {e}\n{traceback.format_exc(limit=2)}")
            ui = None  # 下个周期重连
            status.flush()
            time.sleep(5)


if __name__ == "__main__":
    main()
