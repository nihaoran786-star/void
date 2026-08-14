import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  AtSign,
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clipboard,
  Code2,
  Command,
  File,
  FileCode2,
  Gauge,
  GitBranch,
  Globe2,
  Lightbulb,
  Loader2,
  MessageSquare,
  Mic,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  RotateCcw,
  Search,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Square,
  WandSparkles,
  Wrench,
  X,
} from 'lucide-react';

interface LatestFlowChatPreviewProps {
  previewId: string;
}

interface PrimitiveShellProps {
  componentId: string;
  title: string;
  description: string;
  children: React.ReactNode;
}

type TaskState = 'complete' | 'running' | 'failed' | 'waiting';

const PrimitiveShell: React.FC<PrimitiveShellProps> = ({
  componentId,
  title,
  description,
  children,
}) => (
  <section className="bui-primitive" data-beautiful-component={componentId} aria-label={`${title} 新 UI 预览`}>
    <header className="bui-primitive__label">
      <span>{title}</span>
      <small>{description}</small>
    </header>
    <div className={`bui-primitive__stage bui-primitive__stage--${componentId}`}>{children}</div>
  </section>
);

const PixelLoader: React.FC = () => (
  <span className="bui-pixel-loader" aria-hidden="true">
    {Array.from({ length: 9 }, (_, index) => <i key={index} />)}
  </span>
);

const LoadingState: React.FC = () => {
  const [variant, setVariant] = useState<'drive' | 'dots' | 'orbit'>('drive');
  const [running, setRunning] = useState(true);
  const [elapsed, setElapsed] = useState(3);

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [running]);

  return (
    <PrimitiveShell componentId="loading-state" title="Loading State" description="运行与复现进度">
      <div className="bui-loading-demo">
        <div className={`bui-loading-visual is-${variant} ${running ? 'is-running' : ''}`}>
          {variant === 'drive' && <PixelLoader />}
          {variant === 'dots' && <span className="bui-loading-dots"><i /><i /><i /></span>}
          {variant === 'orbit' && <span className="bui-loading-orbit"><i /></span>}
        </div>
        <strong>{running ? '正在复现窄容器问题' : '复现已暂停'}</strong>
        <span>{elapsed} 秒 · 保留当前日志</span>
        <div className="bui-mini-tabs" role="group" aria-label="加载动画样式">
          {(['drive', 'dots', 'orbit'] as const).map((item) => (
            <button type="button" key={item} aria-pressed={variant === item} onClick={() => setVariant(item)}>
              {item === 'drive' ? '像素' : item === 'dots' ? '节拍' : '轨道'}
            </button>
          ))}
        </div>
        <button type="button" className="bui-quiet-action" onClick={() => setRunning((value) => !value)}>
          {running ? <Square size={11} /> : <Play size={11} />}{running ? '暂停' : '继续'}
        </button>
      </div>
    </PrimitiveShell>
  );
};

const ThinkingState: React.FC = () => {
  const [mode, setMode] = useState<'steps' | 'reasoning' | 'search' | 'coding'>('steps');
  const [expanded, setExpanded] = useState(false);
  const labels = {
    steps: ['读取组件边界', '比较交互状态', '整理迁移建议'],
    reasoning: ['核对用户目标', '约束视觉噪声', '选择最小表达'],
    search: ['搜索事件来源', '定位渲染入口', '验证空状态'],
    coding: ['建立状态映射', '连接键盘行为', '运行界面检查'],
  };

  return (
    <PrimitiveShell componentId="thinking-state" title="Thinking" description="可展开的模型摘要">
      <div className="bui-thinking-demo">
        <button type="button" className="bui-thinking-trigger" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>
          <span className="bui-thinking-pulse"><Sparkles size={14} /></span>
          <span><strong>正在分析组件状态</strong><small>模型摘要 · 8 秒</small></span>
          <ChevronDown size={14} />
        </button>
        <div className={`bui-expand-grid ${expanded ? 'is-open' : ''}`}>
          <div className="bui-thinking-timeline">
            {labels[mode].map((label, index) => (
              <p key={label} className={index === 2 ? 'is-current' : ''}>
                <span>{index < 2 ? <Check size={11} /> : <PixelLoader />}</span>{label}
              </p>
            ))}
            <details>
              <summary>查看模型提供的摘要</summary>
              <p>当前组件需要保留明确状态，同时降低非关键工具事件的视觉重量。</p>
            </details>
          </div>
        </div>
        <div className="bui-mini-tabs" role="tablist" aria-label="思考摘要类型">
          {(Object.keys(labels) as Array<keyof typeof labels>).map((item) => (
            <button type="button" role="tab" key={item} aria-selected={mode === item} onClick={() => setMode(item)}>{
              item === 'steps' ? '步骤' : item === 'reasoning' ? '分析' : item === 'search' ? '检索' : '编码'
            }</button>
          ))}
        </div>
      </div>
    </PrimitiveShell>
  );
};

const StreamingText: React.FC = () => {
  const answer = '已经完成组件清点，并把视觉状态与功能状态放进同一条对照轨道。';
  const [cursor, setCursor] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (cursor >= answer.length) return;
    const timer = window.setTimeout(() => setCursor((value) => value + 1), 34);
    return () => window.clearTimeout(timer);
  }, [answer.length, cursor]);

  return (
    <PrimitiveShell componentId="streaming-text" title="Streaming Text" description="流式正文、来源与追问">
      <article className="bui-streaming">
        <div className="bui-streaming__byline"><span>V</span><strong>Void</strong><small>正在回答</small></div>
        <p>{answer.slice(0, cursor)}<i className={cursor < answer.length ? 'is-visible' : ''} /></p>
        <div className="bui-source-row">
          <button type="button"><File size={11} />FlowItemRenderer.tsx</button>
          <button type="button"><Globe2 size={11} />Beautiful UI</button>
        </div>
        <div className="bui-streaming__actions">
          <button type="button" onClick={() => setCopied(true)}><Clipboard size={12} />{copied ? '已复制' : '复制'}</button>
          <button type="button" onClick={() => { setCursor(0); setCopied(false); }}><RotateCcw size={12} />重播</button>
          <button type="button">比较差异<ArrowRight size={12} /></button>
        </div>
      </article>
    </PrimitiveShell>
  );
};

const ApprovalCard: React.FC = () => {
  const [decision, setDecision] = useState<'idle' | 'approved' | 'rejected'>('idle');
  const [scope, setScope] = useState('once');
  return (
    <PrimitiveShell componentId="approval-card" title="Approval Card" description="人机协作的权限确认">
      <div className={`bui-approval-demo is-${decision}`}>
        <span className="bui-approval-demo__icon"><ShieldCheck size={16} /></span>
        <div><small>等待你的许可</small><h3>允许读取工作区文件？</h3><p>只用于生成这个独立预览，不会修改生产聊天页。</p></div>
        {decision === 'idle' ? (
          <>
            <fieldset>
              <legend>许可范围</legend>
              {['once', 'session'].map((item) => (
                <label key={item}><input type="radio" name="approval-scope" checked={scope === item} onChange={() => setScope(item)} />{item === 'once' ? '仅这一次' : '本次预览会话'}</label>
              ))}
            </fieldset>
            <div className="bui-approval-demo__actions">
              <button type="button" onClick={() => setDecision('rejected')}>拒绝</button>
              <button type="button" className="is-primary" onClick={() => setDecision('approved')}>允许读取</button>
            </div>
          </>
        ) : (
          <button type="button" className="bui-decision-result" onClick={() => setDecision('idle')}>
            {decision === 'approved' ? <CheckCircle2 size={14} /> : <X size={14} />}{decision === 'approved' ? '已允许，点击重置' : '已拒绝，点击重置'}
          </button>
        )}
      </div>
    </PrimitiveShell>
  );
};

const ToolChips: React.FC = () => {
  const [active, setActive] = useState(1);
  const tools = [
    { name: 'read_file', state: 'success', detail: 'FlowChat.tsx · 142 行' },
    { name: 'list_files', state: 'running', detail: 'src/flow_chat · 深度 2' },
    { name: 'run_test', state: 'waiting', detail: '等待前一个工具结束' },
  ];
  return (
    <PrimitiveShell componentId="tool-chips" title="Tool Chips" description="紧凑工具调用与详情">
      <div className="bui-tool-demo">
        <div className="bui-tool-chip-row" role="list" aria-label="工具调用">
          {tools.map((tool, index) => (
            <button type="button" role="listitem" key={tool.name} className={`is-${tool.state} ${active === index ? 'is-active' : ''}`} onClick={() => setActive(index)}>
              {tool.state === 'success' ? <Check size={11} /> : tool.state === 'running' ? <Loader2 className="bui-spin" size={11} /> : <Circle size={8} />}
              {tool.name}<small>{tool.state === 'success' ? '完成' : tool.state === 'running' ? '运行中' : '等待'}</small>
            </button>
          ))}
        </div>
        <div className="bui-tool-detail"><code>{tools[active].name}</code><span>{tools[active].detail}</span><button type="button"><MoreHorizontal size={13} aria-label="更多工具详情" /></button></div>
      </div>
    </PrimitiveShell>
  );
};

const TaskRows: React.FC = () => {
  const [states, setStates] = useState<TaskState[]>(['complete', 'running', 'failed']);
  const labels = ['梳理现有组件', '建立新 UI 对照', '验证窄容器'];
  const advance = (index: number) => {
    const order: TaskState[] = ['waiting', 'running', 'complete', 'failed'];
    setStates((current) => current.map((state, itemIndex) => itemIndex === index ? order[(order.indexOf(state) + 1) % order.length] : state));
  };
  return (
    <PrimitiveShell componentId="task-rows" title="Task Rows" description="团队任务状态与重试">
      <div className="bui-task-demo">
        <header><span><Bot size={13} />界面审查团队</span><small>2 个智能体在线</small></header>
        {labels.map((label, index) => (
          <button type="button" key={label} className={`is-${states[index]}`} onClick={() => advance(index)}>
            <span>{states[index] === 'complete' ? <Check size={12} /> : states[index] === 'running' ? <PixelLoader /> : states[index] === 'failed' ? <X size={12} /> : <Circle size={8} />}</span>
            <strong>{label}</strong><small>{states[index] === 'complete' ? '已完成' : states[index] === 'running' ? '设计智能体 · 运行中' : states[index] === 'failed' ? '失败 · 点击重试' : '等待'}</small>
            <ChevronRight size={13} />
          </button>
        ))}
      </div>
    </PrimitiveShell>
  );
};

const ChatPanel: React.FC = () => {
  const [tab, setTab] = useState<'chat' | 'activity'>('chat');
  const [draft, setDraft] = useState('继续完成剩余组件');
  const [messages, setMessages] = useState(['我会保持左侧基线不变。']);
  const submit = () => {
    if (!draft.trim()) return;
    setMessages((items) => [...items, draft.trim()]);
    setDraft('');
  };
  return (
    <PrimitiveShell componentId="chat-composer" title="Chat" description="对话、活动与输入组合">
      <div className="bui-chat-demo">
        <header><div className="bui-mini-tabs"><button type="button" aria-pressed={tab === 'chat'} onClick={() => setTab('chat')}>对话</button><button type="button" aria-pressed={tab === 'activity'} onClick={() => setTab('activity')}>活动</button></div><span>Flow Chat</span></header>
        <div className="bui-chat-demo__body" aria-live="polite">
          {tab === 'chat' ? messages.map((message, index) => <p key={`${message}-${index}`} className={index ? 'is-user' : ''}><span>{index ? '你' : 'V'}</span>{message}</p>) : <p><span><Wrench size={12} /></span>已完成 3 个工具调用</p>}
        </div>
        <div className="bui-chat-demo__composer">
          <input value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') submit(); }} aria-label="Chat 示例输入" placeholder="发送消息…" />
          <button type="button" onClick={submit} disabled={!draft.trim()} aria-label="发送 Chat 示例消息"><Send size={13} /></button>
        </div>
      </div>
    </PrimitiveShell>
  );
};

const PromptBar: React.FC = () => {
  const [draft, setDraft] = useState('对当前组件执行一次交互测试');
  const [running, setRunning] = useState(false);
  const [model, setModel] = useState('Auto');
  return (
    <PrimitiveShell componentId="prompt-bar" title="Prompt Bar" description="来源、命令、模型与听写">
      <div className="bui-prompt-demo">
        <textarea value={draft} onChange={(event) => setDraft(event.target.value)} aria-label="Prompt Bar 输入" />
        <div className="bui-prompt-demo__tokens"><button type="button"><AtSign size={11} />FlowChat.tsx</button><button type="button"><Command size={11} />测试</button></div>
        <footer>
          <span><button type="button" aria-label="添加上下文">+</button><button type="button" onClick={() => setModel((value) => value === 'Auto' ? 'GPT-5' : 'Auto')}>{model}<ChevronDown size={11} /></button><button type="button" aria-label="语音输入"><Mic size={12} /></button></span>
          <button type="button" className="is-send" disabled={!draft.trim()} onClick={() => setRunning((value) => !value)} aria-label={running ? '停止生成' : '发送提示'}>{running ? <Square size={11} /> : <ArrowRight size={12} />}</button>
        </footer>
        {running && <p><PixelLoader />正在执行，可继续准备下一条提示</p>}
      </div>
    </PrimitiveShell>
  );
};

const RecommendationCard: React.FC = () => {
  const [index, setIndex] = useState(0);
  const [accepted, setAccepted] = useState(false);
  const recommendations = [
    ['合并重复工具事件', '把 4 个连续读取动作折叠为一条活动轨道。', 92],
    ['突出权限等待', '使用低饱和琥珀色保持中断状态清晰。', 86],
  ] as const;
  const item = recommendations[index];
  return (
    <PrimitiveShell componentId="recommendation-card" title="Recommendation Card" description="建议、置信度与行动">
      <div className="bui-recommendation">
        <span className="bui-recommendation__icon"><Lightbulb size={15} /></span>
        <small>Void 建议 · {index + 1}/{recommendations.length}</small><h3>{item[0]}</h3><p>{item[1]}</p>
        <div className="bui-confidence"><span style={{ '--confidence': `${item[2]}%` } as React.CSSProperties} /><strong>{item[2]}%</strong><small>置信度</small></div>
        <footer><button type="button" onClick={() => { setIndex((value) => (value + 1) % recommendations.length); setAccepted(false); }}>下一条</button><button type="button" className="is-primary" onClick={() => setAccepted(true)}>{accepted ? <Check size={12} /> : <WandSparkles size={12} />}{accepted ? '已采纳' : '采纳建议'}</button></footer>
      </div>
    </PrimitiveShell>
  );
};

const ContextCards: React.FC = () => {
  const [selected, setSelected] = useState(0);
  const cards = [
    { icon: File, title: 'AGENTS.md', meta: '工作区规则 · 相关度 98%', text: '视觉改动保持独立，不进入会话生命周期。' },
    { icon: FileCode2, title: 'FlowChat.tsx', meta: '源码 · 相关度 91%', text: '当前正文列与工具事件的组合入口。' },
    { icon: Globe2, title: 'Beautiful UI', meta: '网页 · 相关度 88%', text: 'AI 原生界面的可复制组件原语。' },
  ];
  return (
    <PrimitiveShell componentId="context-cards" title="Context Cards" description="知识片段与来源">
      <div className="bui-context-demo">
        {cards.map((card, index) => {
          const Icon = card.icon;
          return <button type="button" key={card.title} className={selected === index ? 'is-selected' : ''} onClick={() => setSelected(index)}><span><Icon size={13} /></span><strong>{card.title}</strong><small>{card.meta}</small><p>{card.text}</p><Check size={12} /></button>;
        })}
      </div>
    </PrimitiveShell>
  );
};

const DiffTable: React.FC = () => {
  const [view, setView] = useState<'diff' | 'status'>('diff');
  const rows = [
    ['间距', '12px', '16px', '已调整'],
    ['圆角', '10px', '8px', '已调整'],
    ['活动轨道', '卡片', '细线', '待确认'],
  ];
  return (
    <PrimitiveShell componentId="diff-table" title="Diff Table" description="AI 提议的字段变更">
      <div className="bui-diff-demo">
        <header><span><GitBranch size={13} />提议的界面变更</span><div className="bui-mini-tabs"><button type="button" aria-pressed={view === 'diff'} onClick={() => setView('diff')}>差异</button><button type="button" aria-pressed={view === 'status'} onClick={() => setView('status')}>状态</button></div></header>
        {view === 'diff' ? <table><thead><tr><th>属性</th><th>当前</th><th>提议</th><th>状态</th></tr></thead><tbody>{rows.map((row) => <tr key={row[0]}>{row.map((cell, index) => <td key={cell} className={index === 2 ? 'is-proposed' : ''}>{cell}</td>)}</tr>)}</tbody></table> : <div className="bui-diff-summary"><CheckCircle2 size={16} /><span><strong>2 项可直接应用</strong><small>1 项需要视觉确认</small></span></div>}
      </div>
    </PrimitiveShell>
  );
};

const RecordsTable: React.FC = () => {
  const [sortAsc, setSortAsc] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const rows = useMemo(() => {
    const values = [
      { name: '当前基线', owner: 'Flow Chat', status: '冻结', updated: '12:08' },
      { name: 'Porcelain Air', owner: '设计系统', status: '通过', updated: '12:14' },
      { name: '新活动轨道', owner: '预览', status: '审查中', updated: '12:21' },
    ];
    return values.sort((a, b) => sortAsc ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name));
  }, [sortAsc]);
  const toggle = (name: string) => setSelected((items) => items.includes(name) ? items.filter((item) => item !== name) : [...items, name]);
  return (
    <PrimitiveShell componentId="records-table" title="Records Table" description="可排序、可选择的记录表">
      <div className="bui-records-demo">
        <div className="bui-table-toolbar"><span>{selected.length ? `已选择 ${selected.length} 项` : '迁移计划记录'}</span><button type="button" onClick={() => setSortAsc((value) => !value)}>名称 {sortAsc ? '↑' : '↓'}</button></div>
        <table><thead><tr><th aria-label="选择" /><th>名称</th><th>归属</th><th>状态</th><th>更新</th></tr></thead><tbody>{rows.map((row) => <tr key={row.name} className={selected.includes(row.name) ? 'is-selected' : ''}><td><input type="checkbox" checked={selected.includes(row.name)} onChange={() => toggle(row.name)} aria-label={`选择 ${row.name}`} /></td><td>{row.name}</td><td>{row.owner}</td><td><span>{row.status}</span></td><td>{row.updated}</td></tr>)}</tbody></table>
      </div>
    </PrimitiveShell>
  );
};

const FilterTable: React.FC = () => {
  const [filter, setFilter] = useState('全部');
  const rows = [
    ['天气面板', '运行中', '刚刚'],
    ['文件浏览器', '完成', '2 分钟前'],
    ['图像工具', '失败', '8 分钟前'],
    ['对话摘要', '完成', '12 分钟前'],
  ];
  const visible = filter === '全部' ? rows : rows.filter((row) => row[1] === filter);
  return (
    <PrimitiveShell componentId="filter-table" title="Filter Table" description="状态筛选与实时重排">
      <div className="bui-filter-demo">
        <div className="bui-filter-chips" role="group" aria-label="按状态筛选">
          {['全部', '运行中', '完成', '失败'].map((item) => <button type="button" key={item} aria-pressed={filter === item} onClick={() => setFilter(item)}>{item}<small>{item === '全部' ? rows.length : rows.filter((row) => row[1] === item).length}</small></button>)}
        </div>
        <table><tbody>{visible.map((row) => <tr key={row[0]}><td><span className={`is-${row[1]}`}>{row[1] === '运行中' && <Loader2 className="bui-spin" size={10} />}{row[0]}</span></td><td>{row[1]}</td><td>{row[2]}</td></tr>)}</tbody></table>
      </div>
    </PrimitiveShell>
  );
};

const SidebarNav: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [active, setActive] = useState('对话');
  const items = [{ icon: MessageSquare, label: '对话' }, { icon: Search, label: '搜索' }, { icon: File, label: '文件' }, { icon: Wrench, label: '工具' }];
  return (
    <PrimitiveShell componentId="sidebar-nav" title="Sidebar Nav" description="工作区导航与快捷搜索">
      <nav className={`bui-sidebar-demo ${collapsed ? 'is-collapsed' : ''}`} aria-label="Sidebar Nav 示例">
        <header><span><i>V</i><strong>Void Workspace</strong></span><button type="button" onClick={() => setCollapsed((value) => !value)} aria-label={collapsed ? '展开侧栏' : '收起侧栏'}>{collapsed ? <PanelLeftOpen size={13} /> : <PanelLeftClose size={13} />}</button></header>
        <button type="button" className="bui-sidebar-search"><Search size={12} /><span>快速搜索</span><kbd>⌘ K</kbd></button>
        <div>{items.map(({ icon: Icon, label }) => <button type="button" key={label} aria-current={active === label ? 'page' : undefined} onClick={() => setActive(label)} title={label}><Icon size={13} /><span>{label}</span>{label === '对话' && <small>3</small>}</button>)}</div>
      </nav>
    </PrimitiveShell>
  );
};

const SearchCommand: React.FC = () => {
  const [query, setQuery] = useState('Flow');
  const [active, setActive] = useState(0);
  const results = ['Flow Chat 当前组件', 'FlowItemRenderer.tsx', 'FlowChatStore.ts', 'Flow 活动轨道预览'].filter((item) => item.toLowerCase().includes(query.toLowerCase()));
  return (
    <PrimitiveShell componentId="search" title="Search" description="实时过滤与空状态">
      <div className="bui-search-demo">
        <label><Search size={14} /><input value={query} onChange={(event) => { setQuery(event.target.value); setActive(0); }} onKeyDown={(event) => { if (event.key === 'ArrowDown') { event.preventDefault(); setActive((value) => Math.min(value + 1, results.length - 1)); } if (event.key === 'ArrowUp') { event.preventDefault(); setActive((value) => Math.max(value - 1, 0)); } }} aria-label="搜索命令" placeholder="搜索文件、对话或命令" /><kbd>Esc</kbd></label>
        <div role="listbox" aria-label="搜索结果">{results.length ? results.map((result, index) => <button type="button" role="option" aria-selected={active === index} key={result} onMouseEnter={() => setActive(index)}><span>{result.endsWith('.ts') || result.endsWith('.tsx') ? <FileCode2 size={13} /> : <MessageSquare size={13} />}</span>{result}<small>{index < 2 ? '最近' : '工作区'}</small></button>) : <p><Search size={18} />没有找到“{query}”<small>试试更短的关键词</small></p>}</div>
      </div>
    </PrimitiveShell>
  );
};

const InsightCards: React.FC = () => {
  const [page, setPage] = useState(0);
  const insights = [
    { title: '上下文下降 67%', value: '42k', delta: '−86k Token', bars: [42, 66, 52, 80, 58, 35] },
    { title: '工具噪声下降 41%', value: '8 项', delta: '−6 条可见事件', bars: [78, 68, 60, 49, 44, 39] },
    { title: '操作完成率提升', value: '94%', delta: '+12 个百分点', bars: [36, 42, 48, 58, 72, 90] },
  ];
  const item = insights[page];
  return (
    <PrimitiveShell componentId="insight-cards" title="Insight Cards" description="可翻页的代理洞察">
      <article className="bui-insight-demo">
        <header><span><Gauge size={14} />运行洞察</span><div><button type="button" onClick={() => setPage((value) => (value + insights.length - 1) % insights.length)} aria-label="上一条洞察"><ChevronLeft size={13} /></button><small>{page + 1}/{insights.length}</small><button type="button" onClick={() => setPage((value) => (value + 1) % insights.length)} aria-label="下一条洞察"><ChevronRight size={13} /></button></div></header>
        <h3>{item.title}</h3><strong>{item.value}</strong><small>{item.delta}</small>
        <div className="bui-insight-chart" aria-label={item.title}>{item.bars.map((height, index) => <i key={`${page}-${index}`} style={{ '--bar-height': `${height}%` } as React.CSSProperties} />)}</div>
        <p>基于当前预览内的模拟运行数据，不写入真实会话。</p>
      </article>
    </PrimitiveShell>
  );
};

const CodeBlock: React.FC = () => {
  const [copied, setCopied] = useState(false);
  const [wrapped, setWrapped] = useState(false);
  const lines = [
    "const ActivityRail = ({ events }) => (",
    "  <ol aria-label=\"聊天活动\">",
    "    {events.map(renderEvent)}",
    "  </ol>",
    ");",
  ];
  return (
    <PrimitiveShell componentId="code-block" title="Code Block" description="逐行生成的代码输出">
      <div className={`bui-code-demo ${wrapped ? 'is-wrapped' : ''}`}>
        <header><span><Code2 size={12} />ActivityRail.tsx<small>TypeScript</small></span><div><button type="button" onClick={() => setWrapped((value) => !value)}>换行</button><button type="button" onClick={() => setCopied(true)}><Clipboard size={11} />{copied ? '已复制' : '复制'}</button></div></header>
        <pre>{lines.map((line, index) => <span key={line}><i>{index + 1}</i><code>{line}</code></span>)}</pre>
      </div>
    </PrimitiveShell>
  );
};

const FineTuneCard: React.FC = () => {
  const [layout, setLayout] = useState('Airy');
  const [radius, setRadius] = useState(8);
  const [applied, setApplied] = useState(false);
  return (
    <PrimitiveShell componentId="fine-tune-card" title="Fine-tune Card" description="代理辅助的视觉调参">
      <div className="bui-finetune-demo">
        <header><span><SlidersHorizontal size={13} />外观调节</span><small>仅当前预览</small></header>
        <label>布局密度<div className="bui-mini-tabs">{['Compact', 'Airy'].map((item) => <button type="button" key={item} aria-pressed={layout === item} onClick={() => setLayout(item)}>{item === 'Compact' ? '紧凑' : '舒展'}</button>)}</div></label>
        <label>圆角 <output>{radius}px</output><input type="range" min="4" max="16" value={radius} onChange={(event) => { setRadius(Number(event.target.value)); setApplied(false); }} /></label>
        <div className="bui-finetune-preview" style={{ borderRadius: radius }}><span /><strong>{layout === 'Airy' ? '舒展活动轨道' : '紧凑活动轨道'}</strong><small>Porcelain Air · Pulse Blue</small></div>
        <button type="button" className="is-primary" onClick={() => setApplied(true)}>{applied ? <Check size={12} /> : <WandSparkles size={12} />}{applied ? '已应用到预览' : '应用建议'}</button>
      </div>
    </PrimitiveShell>
  );
};

const SelectionActions: React.FC = () => {
  const [selected, setSelected] = useState(true);
  const [action, setAction] = useState('');
  return (
    <PrimitiveShell componentId="selection-actions" title="Selection Actions" description="选中内容并交给代理">
      <div className="bui-selection-demo">
        <p>默认收起成一条贴合 AI 正文列的安静活动轨道，只显示中文摘要与必要状态。</p>
        <button type="button" className={`bui-selection-highlight ${selected ? 'is-selected' : ''}`} onClick={() => setSelected((value) => !value)} aria-pressed={selected}>安静活动轨道</button>
        {selected && <div className="bui-selection-toolbar" role="toolbar" aria-label="选中文本操作"><span>已选择 8 个字</span>{['精简', '解释', '改写'].map((item) => <button type="button" key={item} className={action === item ? 'is-active' : ''} onClick={() => setAction(item)}>{item}</button>)}<button type="button" aria-label="更多选中操作"><MoreHorizontal size={12} /></button></div>}
        {action && <p className="bui-selection-result"><Sparkles size={12} />已准备“{action}”提示，尚未发送</p>}
      </div>
    </PrimitiveShell>
  );
};

const previewComponents: Record<string, React.FC> = {
  'assistant-stream-text': StreamingText,
  'user-message': ChatPanel,
  'conversation-navigation': SidebarNav,
  'composer-actions': PromptBar,
  'read-file-card': ContextCards,
  'file-operation-card': CodeBlock,
  'search-card': SearchCommand,
  'task-card': TaskRows,
  'todo-card': SelectionActions,
  'web-search-card': RecommendationCard,
  'mcp-tool-card': ToolChips,
  'context-compression-card': InsightCards,
  'skill-card': FineTuneCard,
  'ask-user-card': ApprovalCard,
  'reproduction-steps-card': LoadingState,
  'create-plan-card': RecordsTable,
  'git-tool-card': DiffTable,
  'init-miniapp-card': FilterTable,
  'model-thinking-card': ThinkingState,
};

export const BEAUTIFUL_UI_COMPONENT_COUNT = Object.keys(previewComponents).length;

export const LatestFlowChatPreview: React.FC<LatestFlowChatPreviewProps> = ({ previewId }) => {
  const Component = previewComponents[previewId];
  if (!Component) {
    return <div className="bui-empty-fallback"><Wrench size={14} /><span>新 UI 样例正在准备</span></div>;
  }
  return <Component />;
};
