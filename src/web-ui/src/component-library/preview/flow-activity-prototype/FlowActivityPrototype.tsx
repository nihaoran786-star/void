import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  CircleX,
  Clock3,
  FileCode2,
  FolderGit2,
  LayoutPanelLeft,
  LoaderCircle,
  MessageSquareText,
  MoreHorizontal,
  Paperclip,
  Plus,
  RotateCcw,
  Search,
  Send,
  Settings,
  ShieldAlert,
  Sparkles,
  Square,
  TerminalSquare,
  Users,
  Wrench,
  X,
} from 'lucide-react';

// PROTOTYPE — Three variants of Flow Chat activity, switchable via ?variant=.

type VariantKey = 'A' | 'B' | 'C';
type PreviewWidth = 'wide' | 'medium' | 'narrow';
type ActivityStatus = 'running' | 'success' | 'error' | 'permission' | 'cancelled' | 'waiting';

interface ActivityEvent {
  id: string;
  summary: string;
  meta: string;
  tool: string;
  status: ActivityStatus;
  params: string;
  output: string;
  group: 'thinking' | 'tools' | 'team';
  icon: React.ReactNode;
}

const variants: Array<{ key: VariantKey; name: string; note: string }> = [
  { key: 'A', name: '脉冲时间线', note: '因果最清楚，单线承载全部状态' },
  { key: 'B', name: '阶段编队', note: '并行工具与团队派遣更易扫读' },
  { key: 'C', name: '编辑注脚', note: '最贴正文，默认噪声最低' },
];

const widths: Array<{ key: PreviewWidth; label: string; value: string }> = [
  { key: 'wide', label: '桌面宽', value: '1120' },
  { key: 'medium', label: '桌面中', value: '820' },
  { key: 'narrow', label: '桌面窄', value: '520' },
];

const baseEvents: ActivityEvent[] = [
  {
    id: 'thought',
    summary: '已整理实现边界与现有组件关系',
    meta: '模型摘要 · 4 秒',
    tool: 'model_summary',
    status: 'success',
    params: '{ source: "assistant_summary" }',
    output: '先隔离预览，再复用现有语义 token；不触碰会话、工具注册与运行时。',
    group: 'thinking',
    icon: <Sparkles size={15} />,
  },
  {
    id: 'search',
    summary: '检索了聊天活动与主题 token',
    meta: '12 处匹配 · 0.8 秒',
    tool: 'search_files',
    status: 'success',
    params: '{ query: "tool activity|workspace-status", path: "src/web-ui/src" }',
    output: 'CompactToolCard.tsx\nToolCardShell.minimal.scss\ntokens.scss\nFlowChatPresentationActivity.tsx',
    group: 'tools',
    icon: <Search size={15} />,
  },
  {
    id: 'files',
    summary: '读取了 4 个相关组件',
    meta: '并行工具组 · 已完成',
    tool: 'read_file_group',
    status: 'success',
    params: '{ files: ["CompactToolCard.tsx", "BaseToolCard.tsx", "tokens.scss", "minimal.scss"] }',
    output: '4 files read · 1,284 lines\nNo runtime or persistence modules were opened.',
    group: 'tools',
    icon: <FileCode2 size={15} />,
  },
  {
    id: 'terminal',
    summary: '类型检查仍在运行',
    meta: '已运行 18 秒',
    tool: 'exec_command',
    status: 'running',
    params: '{ cmd: "pnpm run type-check:web", cwd: "D:\\\\codex\\\\void-source" }',
    output: 'src/web-ui: type-check\n> tsc --noEmit\nChecking project references…',
    group: 'tools',
    icon: <TerminalSquare size={15} />,
  },
  {
    id: 'permission',
    summary: '等待允许打开本地预览窗口',
    meta: '需要一次权限',
    tool: 'open_preview_window',
    status: 'permission',
    params: '{ url: "http://localhost:3000/flow-activity-prototype.html" }',
    output: 'Permission has not been granted. No window was opened.',
    group: 'tools',
    icon: <ShieldAlert size={15} />,
  },
  {
    id: 'failed',
    summary: '首次视觉采集失败，已保留诊断',
    meta: '窗口被遮挡',
    tool: 'capture_window',
    status: 'error',
    params: '{ method: "PrintWindow", boundary: "DWM_EXTENDED_FRAME_BOUNDS" }',
    output: 'Capture rejected: rightmost content was occluded by another window.\nAction: bring preview to foreground and retry.',
    group: 'tools',
    icon: <CircleX size={15} />,
  },
  {
    id: 'cancelled',
    summary: '旧的截图任务已取消',
    meta: '由用户取消',
    tool: 'cancel_capture',
    status: 'cancelled',
    params: '{ task_id: "capture-previous" }',
    output: 'Cancelled before capture. No file was written.',
    group: 'tools',
    icon: <X size={15} />,
  },
  {
    id: 'team',
    summary: '已派遣 3 位子智能体并行核对',
    meta: '团队 · 2 完成 / 1 等待',
    tool: 'dispatch_team',
    status: 'waiting',
    params: '{ tasks: ["accessibility", "responsive", "visual_contract"] }',
    output: 'accessibility: complete\nresponsive: complete\nvisual_contract: waiting for preview capture',
    group: 'team',
    icon: <Users size={15} />,
  },
];

const statusCopy: Record<ActivityStatus, string> = {
  running: '运行中',
  success: '成功',
  error: '失败',
  permission: '等待权限',
  cancelled: '已取消',
  waiting: '等待中',
};

const statusIcon = (status: ActivityStatus) => {
  if (status === 'running') return <LoaderCircle size={14} />;
  if (status === 'success') return <CircleCheck size={14} />;
  if (status === 'error') return <CircleX size={14} />;
  if (status === 'permission') return <ShieldAlert size={14} />;
  if (status === 'cancelled') return <Square size={12} />;
  return <Clock3 size={14} />;
};

function readParams() {
  const params = new URLSearchParams(window.location.search);
  const variant = variants.some((item) => item.key === params.get('variant'))
    ? (params.get('variant') as VariantKey)
    : 'A';
  const width = widths.some((item) => item.key === params.get('width'))
    ? (params.get('width') as PreviewWidth)
    : 'wide';
  return {
    variant,
    width,
    expanded: params.get('open') === '1',
    detailId: params.get('detail'),
  };
}

function updateUrl(next: { variant?: VariantKey; width?: PreviewWidth; expanded?: boolean; detailId?: string | null }) {
  const params = new URLSearchParams(window.location.search);
  if (next.variant) params.set('variant', next.variant);
  if (next.width) params.set('width', next.width);
  if (next.expanded !== undefined) params.set('open', next.expanded ? '1' : '0');
  if (next.detailId) params.set('detail', next.detailId);
  if (next.detailId === null) params.delete('detail');
  window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
}

const StatusMark: React.FC<{ status: ActivityStatus }> = ({ status }) => (
  <span className={`activity-status activity-status--${status}`} aria-label={statusCopy[status]}>
    {statusIcon(status)}
  </span>
);

interface ActivityItemProps {
  event: ActivityEvent;
  open: boolean;
  onToggle: () => void;
  onPermission: (choice: 'allow' | 'reject') => void;
  variant: VariantKey;
}

const ActivityItem: React.FC<ActivityItemProps> = ({ event, open, onToggle, onPermission, variant }) => {
  const detailId = `activity-detail-${variant}-${event.id}`;
  return (
    <div className={`activity-item activity-item--${event.status} ${open ? 'is-open' : ''}`}>
      <button
        type="button"
        className="activity-item__trigger"
        aria-expanded={open}
        aria-controls={detailId}
        onClick={onToggle}
      >
        <span className="activity-item__node" aria-hidden="true">{event.icon}</span>
        <span className="activity-item__copy">
          <span className="activity-item__summary">{event.summary}</span>
          <span className="activity-item__meta">{event.meta}</span>
        </span>
        <span className="activity-item__state">
          <StatusMark status={event.status} />
          <span>{statusCopy[event.status]}</span>
        </span>
        <ChevronRight className="activity-item__chevron" size={15} aria-hidden="true" />
      </button>

      <div className="activity-item__detail-grid" id={detailId} aria-hidden={!open}>
        <div className="activity-item__detail">
          <dl className="raw-facts">
            <div><dt>Tool</dt><dd>{event.tool}</dd></div>
            <div><dt>Arguments</dt><dd><code>{event.params}</code></dd></div>
            <div><dt>Raw output</dt><dd><pre>{event.output}</pre></dd></div>
          </dl>
          {event.status === 'permission' && (
            <div className="permission-actions" aria-label="权限操作">
              <button type="button" className="permission-actions__primary" onClick={() => onPermission('allow')}>允许一次</button>
              <button type="button" onClick={() => onPermission('reject')}>拒绝</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

interface TrackProps {
  events: ActivityEvent[];
  expanded: boolean;
  detailId: string | null;
  onExpanded: () => void;
  onDetail: (id: string) => void;
  onPermission: (choice: 'allow' | 'reject') => void;
  variant: VariantKey;
}

const TrackHeader: React.FC<Pick<TrackProps, 'expanded' | 'onExpanded'> & { summary: string }> = ({ expanded, onExpanded, summary }) => (
  <button
    type="button"
    className="activity-track__summary"
    aria-expanded={expanded}
    aria-controls="activity-track-content"
    onClick={onExpanded}
  >
    <span className="activity-track__pulse" aria-hidden="true"><span /></span>
    <span className="activity-track__summary-copy">{summary}</span>
    <span className="activity-track__summary-meta">8 项活动 · 1 项运行</span>
    <ChevronDown className="activity-track__summary-chevron" size={16} aria-hidden="true" />
  </button>
);

const TimelineVariant: React.FC<TrackProps> = (props) => (
  <section className={`activity-track activity-track--timeline ${props.expanded ? 'is-expanded' : ''}`} aria-label="AI 活动时间线">
    <TrackHeader expanded={props.expanded} onExpanded={props.onExpanded} summary="已完成界面梳理，正在验证预览" />
    <div className="activity-track__content-grid" id="activity-track-content">
      <div className="activity-track__content">
        <div className="timeline-caption"><span>过程</span><span>最新事件保留在末尾</span></div>
        {props.events.map((event) => (
          <ActivityItem
            key={event.id}
            event={event}
            open={props.detailId === event.id}
            onToggle={() => props.onDetail(event.id)}
            onPermission={props.onPermission}
            variant={props.variant}
          />
        ))}
      </div>
    </div>
  </section>
);

const groupedEvents = (events: ActivityEvent[]) => [
  { id: 'thinking', label: '理解', caption: '模型提供的摘要', events: events.filter((event) => event.group === 'thinking') },
  { id: 'tools', label: '执行', caption: '工具调用与权限', events: events.filter((event) => event.group === 'tools') },
  { id: 'team', label: '协作', caption: '子智能体与团队', events: events.filter((event) => event.group === 'team') },
];

const FormationVariant: React.FC<TrackProps> = (props) => (
  <section className={`activity-track activity-track--formation ${props.expanded ? 'is-expanded' : ''}`} aria-label="AI 活动阶段编队">
    <TrackHeader expanded={props.expanded} onExpanded={props.onExpanded} summary="理解已完成，执行与协作正在并行" />
    <div className="activity-track__content-grid" id="activity-track-content">
      <div className="activity-track__content formation-grid">
        {groupedEvents(props.events).map((group, index) => (
          <section className="formation-group" key={group.id} aria-labelledby={`formation-${group.id}`}>
            <header className="formation-group__header">
              <span className="formation-group__index">0{index + 1}</span>
              <span><strong id={`formation-${group.id}`}>{group.label}</strong><small>{group.caption}</small></span>
              <span className="formation-group__count">{group.events.length}</span>
            </header>
            <div className="formation-group__items">
              {group.events.map((event) => (
                <ActivityItem
                  key={event.id}
                  event={event}
                  open={props.detailId === event.id}
                  onToggle={() => props.onDetail(event.id)}
                  onPermission={props.onPermission}
                  variant={props.variant}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  </section>
);

const FootnoteVariant: React.FC<TrackProps> = (props) => (
  <section className={`activity-track activity-track--footnotes ${props.expanded ? 'is-expanded' : ''}`} aria-label="AI 活动编辑注脚">
    <TrackHeader expanded={props.expanded} onExpanded={props.onExpanded} summary="我已核对现有实现，预览验证还在继续" />
    <div className="activity-track__content-grid" id="activity-track-content">
      <div className="activity-track__content footnote-list">
        <p className="footnote-list__lead">仅记录可见摘要和工具事件；没有隐藏推理。</p>
        {props.events.map((event, index) => (
          <div className="footnote-row" key={event.id}>
            <span className="footnote-row__number">{String(index + 1).padStart(2, '0')}</span>
            <ActivityItem
              event={event}
              open={props.detailId === event.id}
              onToggle={() => props.onDetail(event.id)}
              onPermission={props.onPermission}
              variant={props.variant}
            />
          </div>
        ))}
      </div>
    </div>
  </section>
);

const PrototypeNav: React.FC = () => (
  <aside className="prototype-nav" aria-label="Void 主导航（预览上下文）">
    <div className="prototype-nav__brand"><span className="brand-mark">V</span><strong>VOID</strong><button type="button" aria-label="收起导航"><LayoutPanelLeft size={16} /></button></div>
    <button type="button" className="prototype-nav__new"><Plus size={15} /> 新建任务</button>
    <nav>
      <button type="button" className="is-active"><MessageSquareText size={16} />对话<span>12</span></button>
      <button type="button"><Bot size={16} />智能体与团队</button>
      <button type="button"><Wrench size={16} />技能</button>
      <button type="button"><FolderGit2 size={16} />连接器</button>
    </nav>
    <section className="prototype-nav__history">
      <p>最近</p>
      <button type="button" className="is-current">聊天活动 UI 样式库</button>
      <button type="button">Flow Chat 恢复测试</button>
      <button type="button">团队工作区状态梳理</button>
    </section>
    <div className="prototype-nav__footer">
      <button type="button"><Settings size={16} />设置</button>
      <span className="prototype-avatar">林</span><span>本地工作区</span>
    </div>
  </aside>
);

const ConversationChrome: React.FC<{ onReplay: () => void }> = ({ onReplay }) => (
  <header className="conversation-chrome">
    <div><span>Flow Chat</span><ChevronRight size={13} /><strong>聊天活动 UI 样式库</strong><span className="prototype-badge">原型</span></div>
    <div>
      <button type="button" onClick={onReplay}><RotateCcw size={15} /> 重置演示</button>
      <button type="button" aria-label="更多操作"><MoreHorizontal size={17} /></button>
    </div>
  </header>
);

const Composer: React.FC = () => (
  <div className="composer-wrap">
    <div className="prototype-composer">
      <label htmlFor="prototype-message" className="sr-only">发送消息</label>
      <textarea id="prototype-message" rows={1} placeholder="继续告诉 Void 你想调整什么…" />
      <div className="prototype-composer__tools">
        <div><button type="button" aria-label="添加附件"><Paperclip size={16} /></button><button type="button"><Bot size={15} /> 默认智能体</button></div>
        <button type="button" className="prototype-composer__send" aria-label="发送"><Send size={16} /></button>
      </div>
    </div>
    <p>Enter 发送 · Shift + Enter 换行</p>
  </div>
);

export const FlowActivityPrototype: React.FC = () => {
  const initial = useMemo(readParams, []);
  const [variant, setVariant] = useState<VariantKey>(initial.variant);
  const [width, setWidth] = useState<PreviewWidth>(initial.width);
  const [expanded, setExpanded] = useState(initial.expanded);
  const [detailId, setDetailId] = useState<string | null>(initial.detailId);
  const [permissionChoice, setPermissionChoice] = useState<'pending' | 'allow' | 'reject'>('pending');

  const events = useMemo(() => baseEvents.map((event) => event.id !== 'permission' || permissionChoice === 'pending'
    ? event
    : permissionChoice === 'allow'
      ? { ...event, summary: '已允许打开本地预览窗口', meta: '仅本次', status: 'success' as const, output: 'Permission granted for one preview window.' }
      : { ...event, summary: '已拒绝打开本地预览窗口', meta: '未执行', status: 'cancelled' as const, output: 'Permission denied. No window was opened.' }), [permissionChoice]);

  const currentVariant = variants.find((item) => item.key === variant)!;
  const widthSpec = widths.find((item) => item.key === width)!;

  useEffect(() => {
    document.title = `Flow Chat · 聊天活动 UI 样式库 · ${variant}`;
  }, [variant]);

  const selectVariant = useCallback((next: VariantKey) => {
    setVariant(next);
    setDetailId(null);
    updateUrl({ variant: next, detailId: null });
  }, []);

  const cycleVariant = useCallback((direction: -1 | 1) => {
    const currentIndex = variants.findIndex((item) => item.key === variant);
    const nextIndex = (currentIndex + direction + variants.length) % variants.length;
    selectVariant(variants[nextIndex].key);
  }, [selectVariant, variant]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, [contenteditable="true"]')) return;
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        cycleVariant(-1);
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        cycleVariant(1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cycleVariant]);

  const trackProps: TrackProps = {
    events,
    expanded,
    detailId,
    variant,
    onExpanded: () => {
      const next = !expanded;
      setExpanded(next);
      if (!next) setDetailId(null);
      updateUrl({ expanded: next, detailId: next ? detailId : null });
    },
    onDetail: (id) => {
      const next = detailId === id ? null : id;
      setDetailId(next);
      updateUrl({ detailId: next });
    },
    onPermission: setPermissionChoice,
  };

  return (
    <div className="flow-activity-prototype void-ui--minimal">
      <div className="prototype-shell">
        <PrototypeNav />
        <main className="prototype-scene">
          <ConversationChrome onReplay={() => { setExpanded(true); setDetailId('terminal'); setPermissionChoice('pending'); updateUrl({ expanded: true, detailId: 'terminal' }); }} />
          <div className={`conversation-stage conversation-stage--${width}`} style={{ '--prototype-chat-width': `${widthSpec.value}px` } as React.CSSProperties}>
            <div className="conversation-column">
              <div className="user-message">为 Flow Chat 设计一套更安静、可展开的聊天活动样式库。</div>
              <div className="assistant-message">
                <div className="assistant-message__author"><span><Sparkles size={14} /></span>Void</div>
                <p>我会先隔离现有运行时，只用仓库已有摘要与工具事件构建预览。下面这条活动轨道记录当前可见进度，不包含隐藏推理。</p>
                {variant === 'A' ? <TimelineVariant {...trackProps} /> : variant === 'B' ? <FormationVariant {...trackProps} /> : <FootnoteVariant {...trackProps} />}
                <p>预览完成后，我会把你选中的结构重写为生产组件，并单独补齐模块接口测试。</p>
              </div>
            </div>
          </div>
          <Composer />
        </main>
      </div>

      <div className="prototype-switcher" aria-label="原型方案与容器宽度">
        <button type="button" onClick={() => cycleVariant(-1)} aria-label="上一个方案"><ArrowLeft size={16} /></button>
        <div className="prototype-switcher__variant" aria-live="polite">
          <span>{currentVariant.key}</span><strong>{currentVariant.name}</strong><small>{currentVariant.note}</small>
        </div>
        <button type="button" onClick={() => cycleVariant(1)} aria-label="下一个方案"><ArrowRight size={16} /></button>
        <span className="prototype-switcher__divider" />
        <div className="width-switcher" role="group" aria-label="聊天容器宽度">
          {widths.map((item) => (
            <button
              type="button"
              key={item.key}
              className={width === item.key ? 'is-active' : ''}
              aria-pressed={width === item.key}
              onClick={() => { setWidth(item.key); updateUrl({ width: item.key }); }}
            >{item.label}</button>
          ))}
        </div>
      </div>
    </div>
  );
};
