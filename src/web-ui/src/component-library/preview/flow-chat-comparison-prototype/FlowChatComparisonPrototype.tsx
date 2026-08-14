import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Circle,
  FlaskConical,
  Pause,
  Play,
  RotateCcw,
  Search,
  X,
} from 'lucide-react';
import { StreamText } from '@/component-library';
import { componentRegistry } from '../../components/registry';
import type { ComponentPreview } from '../../types';
import { UserMessage } from '@/flow_chat/components/UserMessage';
import { ScrollToBottomButton } from '@/flow_chat/components/ScrollToBottomButton';
import { ScrollToLatestBar } from '@/flow_chat/components/ScrollToLatestBar';
import { TokenUsageIndicator } from '@/flow_chat/components/TokenUsageIndicator';
import { ComposerActionButton } from '@/flow_chat/components/ComposerActionButton';
import { LatestFlowChatPreview } from './LatestFlowChatPreviews';

type WidthMode = 'wide' | 'medium' | 'narrow';
type TestResult = 'untested' | 'pass' | 'fail';

interface ComparisonEntry extends ComponentPreview {
  source: 'conversation' | 'registry';
}

const AssistantTextPreview: React.FC = () => (
  <div className="current-chat-message" aria-label="AI 文本流式响应示例">
    <div className="current-chat-message__author">Void</div>
    <StreamText
      text="我已经读取组件清单。这里展示当前 Flow Chat 的流式正文、光标和完成过程。"
      effect="smooth"
      speed={24}
      cursorStyle="line"
    />
  </div>
);

const UserMessagePreview: React.FC = () => (
  <div className="current-user-message-wrap">
    <UserMessage
      message="请检查 #file:FlowChat.tsx 和 #dir:components，然后运行 #cmd:pnpm_test。"
      timestamp={Date.now()}
      showTimestamp
    />
  </div>
);

const NavigationPreview: React.FC = () => {
  const [unreadCount, setUnreadCount] = useState(3);
  const [showLatest, setShowLatest] = useState(true);

  return (
    <div className="current-navigation-preview">
      <div className="current-navigation-preview__stage">
        <p>历史消息与最新回复之间的定位控件</p>
        <ScrollToLatestBar
          visible={showLatest}
          onClick={() => setShowLatest(false)}
          isInputActive
        />
      </div>
      <div className="current-navigation-preview__controls">
        <ScrollToBottomButton
          visible
          unreadCount={unreadCount}
          onClick={() => setUnreadCount(0)}
        />
        <TokenUsageIndicator currentTokens={72_480} maxTokens={100_000} />
        <button type="button" onClick={() => { setUnreadCount(3); setShowLatest(true); }}>
          恢复示例
        </button>
      </div>
    </div>
  );
};

const ComposerPreview: React.FC = () => {
  const modes = ['send', 'cancel', 'retry', 'split'] as const;
  const [modeIndex, setModeIndex] = useState(0);
  const [draft, setDraft] = useState('对当前组件执行一次交互测试');
  const mode = modes[modeIndex];

  return (
    <div className="current-composer-preview">
      <textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        aria-label="当前输入框示例"
      />
      <div className="current-composer-preview__toolbar">
        <button
          type="button"
          onClick={() => setModeIndex((value) => (value + 1) % modes.length)}
        >
          状态：{mode}
        </button>
        <ComposerActionButton
          available
          mode={mode}
          hasDraft={draft.trim().length > 0}
          hasQueuedInput={mode === 'cancel'}
          customizationPersistencePending={false}
          sendLabel="发送"
          retryLabel="重试"
          cancelLabel="取消"
          onPrimaryAction={() => setModeIndex((value) => (value + 1) % modes.length)}
          onCancel={() => setModeIndex(0)}
        />
      </div>
    </div>
  );
};

const conversationEntries: ComparisonEntry[] = [
  {
    id: 'assistant-stream-text',
    name: 'Assistant Stream Text · AI 流式正文',
    description: '当前流式文本、光标与完成过程；可用“重播”重新触发。',
    category: 'flowchat-conversation',
    component: AssistantTextPreview,
    source: 'conversation',
  },
  {
    id: 'user-message',
    name: 'UserMessage · 用户消息',
    description: '当前消息气泡、时间与文件/目录/命令上下文标签。',
    category: 'flowchat-conversation',
    component: UserMessagePreview,
    source: 'conversation',
  },
  {
    id: 'conversation-navigation',
    name: 'Navigation · 消息定位与用量',
    description: '回到底部、跳到最新以及 Token 用量指示器。',
    category: 'flowchat-conversation',
    component: NavigationPreview,
    source: 'conversation',
  },
  {
    id: 'composer-actions',
    name: 'Composer Actions · 输入与发送状态',
    description: '安全预览输入、发送、取消、重试与分离操作；不挂载生产编排器。',
    category: 'flowchat-conversation',
    component: ComposerPreview,
    source: 'conversation',
  },
];

const registeredEntries: ComparisonEntry[] = (
  componentRegistry.find((category) => category.id === 'flowchat-cards')?.components ?? []
).map((entry) => ({ ...entry, source: 'registry' as const }));

const allEntries = [...conversationEntries, ...registeredEntries];

const widthLabels: Record<WidthMode, string> = {
  wide: '桌面宽',
  medium: '中容器',
  narrow: '窄容器',
};

export const FlowChatComparisonPrototype: React.FC = () => {
  const [query, setQuery] = useState('');
  const [widthMode, setWidthMode] = useState<WidthMode>('wide');
  const [activeId, setActiveId] = useState(allEntries[0]?.id ?? '');
  const [isTouring, setIsTouring] = useState(false);
  const [replayEpochs, setReplayEpochs] = useState<Record<string, number>>({});
  const [results, setResults] = useState<Record<string, TestResult>>({});
  const rowRefs = useRef<Record<string, HTMLElement | null>>({});

  const visibleEntries = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) return allEntries;
    return allEntries.filter((entry) =>
      `${entry.id} ${entry.name} ${entry.description}`.toLocaleLowerCase().includes(normalizedQuery),
    );
  }, [query]);

  const activeIndex = Math.max(0, visibleEntries.findIndex((entry) => entry.id === activeId));
  const passCount = Object.values(results).filter((result) => result === 'pass').length;
  const failCount = Object.values(results).filter((result) => result === 'fail').length;

  const activateAt = useCallback((nextIndex: number) => {
    if (visibleEntries.length === 0) return;
    const normalizedIndex = (nextIndex + visibleEntries.length) % visibleEntries.length;
    const entry = visibleEntries[normalizedIndex];
    setActiveId(entry.id);
    setReplayEpochs((current) => ({
      ...current,
      [entry.id]: (current[entry.id] ?? 0) + 1,
    }));
  }, [visibleEntries]);

  useEffect(() => {
    if (visibleEntries.length === 0) return;
    if (!visibleEntries.some((entry) => entry.id === activeId)) {
      setActiveId(visibleEntries[0].id);
    }
  }, [activeId, visibleEntries]);

  useEffect(() => {
    if (!isTouring || visibleEntries.length === 0) return;
    const timer = window.setInterval(() => activateAt(activeIndex + 1), 3200);
    return () => window.clearInterval(timer);
  }, [activateAt, activeIndex, isTouring, visibleEntries.length]);

  useEffect(() => {
    if (!activeId) return;
    rowRefs.current[activeId]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [activeId]);

  const replay = (id: string) => {
    setActiveId(id);
    setReplayEpochs((current) => ({ ...current, [id]: (current[id] ?? 0) + 1 }));
  };

  const setResult = (id: string, result: TestResult) => {
    setResults((current) => ({ ...current, [id]: result }));
  };

  return (
    <div className="comparison-lab" data-width-mode={widthMode}>
      <aside className="comparison-sidebar" aria-label="组件巡检目录">
        <div className="comparison-brand">
          <span><FlaskConical size={15} /></span>
          <div>
            <strong>Flow Chat</strong>
            <small>对照实验台</small>
          </div>
        </div>

        <div className="comparison-sidebar__summary">
          <span>{allEntries.length}</span>
          <p>现有组件样例</p>
        </div>

        <nav aria-label="组件列表">
          {visibleEntries.map((entry, index) => {
            const result = results[entry.id] ?? 'untested';
            return (
              <button
                type="button"
                key={entry.id}
                className={entry.id === activeId ? 'is-active' : ''}
                onClick={() => replay(entry.id)}
                aria-current={entry.id === activeId ? 'true' : undefined}
              >
                <span>{String(index + 1).padStart(2, '0')}</span>
                <strong>{entry.name.split('·')[0].trim()}</strong>
                {result === 'pass' ? <Check size={12} /> : result === 'fail' ? <X size={12} /> : <Circle size={8} />}
              </button>
            );
          })}
        </nav>

        <div className="comparison-sidebar__legend">
          <p><span className="legend-dot legend-dot--current" />现有生产基线</p>
          <p><span className="legend-dot legend-dot--latest" />最新 UI 待接入</p>
        </div>
      </aside>

      <main className="comparison-main">
        <header className="comparison-header">
          <div>
            <span className="comparison-eyebrow">独立预览 · 不连接会话与持久化</span>
            <h1>聊天组件对照实验台</h1>
            <p>左轨是当前真实组件，右轨是 Beautiful UI 方向的新原型；逐项比较视觉与功能。</p>
          </div>
          <div className="comparison-score" aria-label={`通过 ${passCount} 项，待复核 ${failCount} 项`}>
            <span><Check size={14} /> {passCount} 通过</span>
            <span><X size={14} /> {failCount} 待复核</span>
          </div>
        </header>

        <section className="comparison-toolbar" aria-label="预览控制">
          <label className="comparison-search">
            <Search size={14} aria-hidden />
            <span className="sr-only">筛选组件</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="筛选组件或状态…"
            />
          </label>

          <div className="comparison-tour-controls">
            <button type="button" onClick={() => activateAt(activeIndex - 1)} aria-label="上一个组件">
              <ChevronLeft size={14} />
            </button>
            <button
              type="button"
              className="comparison-tour-toggle"
              onClick={() => setIsTouring((value) => !value)}
              aria-pressed={isTouring}
            >
              {isTouring ? <Pause size={13} /> : <Play size={13} />}
              {isTouring ? '暂停巡检' : '自动巡检'}
            </button>
            <button type="button" onClick={() => activateAt(activeIndex + 1)} aria-label="下一个组件">
              <ChevronRight size={14} />
            </button>
          </div>

          <div className="comparison-width-controls" aria-label="容器宽度">
            {(Object.keys(widthLabels) as WidthMode[]).map((mode) => (
              <button
                type="button"
                key={mode}
                className={widthMode === mode ? 'is-active' : ''}
                onClick={() => setWidthMode(mode)}
                aria-pressed={widthMode === mode}
              >
                {widthLabels[mode]}
              </button>
            ))}
          </div>
        </section>

        <div className="comparison-column-head" aria-hidden>
          <div><span>01</span><strong>当前组件</strong><small>真实基线</small></div>
          <ArrowRight size={14} />
          <div><span>02</span><strong>最新 UI</strong><small>交互原型</small></div>
        </div>

        <section className="comparison-canvas" aria-label="组件逐项对照">
          {visibleEntries.length === 0 ? (
            <div className="comparison-empty-search">没有匹配的组件。</div>
          ) : visibleEntries.map((entry, index) => {
            const CurrentComponent = entry.component;
            const result = results[entry.id] ?? 'untested';
            const isActive = entry.id === activeId;
            return (
              <article
                key={entry.id}
                ref={(node) => { rowRefs.current[entry.id] = node; }}
                className={`comparison-row ${isActive ? 'is-active' : ''}`}
                data-result={result}
                aria-labelledby={`${entry.id}-title`}
              >
                <header className="comparison-row__header">
                  <div>
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    <div>
                      <h2 id={`${entry.id}-title`}>{entry.name}</h2>
                      <p>{entry.description}</p>
                    </div>
                  </div>
                  <code>{entry.id}</code>
                </header>

                <div className="comparison-pair">
                  <section className="comparison-current" aria-label={`${entry.name} 当前组件`}>
                    <div className="comparison-pane-label">
                      <span className="legend-dot legend-dot--current" />当前基线
                      <small>{entry.source === 'registry' ? '注册表样例' : '会话部件'}</small>
                    </div>
                    <div className="comparison-render">
                      {isActive ? (
                        <CurrentComponent key={`${entry.id}-${replayEpochs[entry.id] ?? 0}`} />
                      ) : (
                        <button
                          type="button"
                          className="comparison-load-current"
                          onClick={() => replay(entry.id)}
                        >
                          <Play size={13} />
                          载入并测试当前组件
                        </button>
                      )}
                    </div>
                  </section>

                  <section className="comparison-latest" aria-label={`${entry.name} 最新 UI 插槽`}>
                    <div className="comparison-pane-label">
                      <span className="legend-dot legend-dot--latest" />最新 UI
                      <small>Beautiful UI 方向</small>
                    </div>
                    <div className="comparison-render comparison-render--latest">
                      <LatestFlowChatPreview key={`latest-${entry.id}-${replayEpochs[entry.id] ?? 0}`} previewId={entry.id} />
                    </div>
                  </section>
                </div>

                <footer className="comparison-row__footer">
                  <button type="button" onClick={() => replay(entry.id)}>
                    <RotateCcw size={13} />重播当前样例
                  </button>
                  <div role="group" aria-label={`${entry.name} 测试结果`}>
                    <button
                      type="button"
                      className={result === 'pass' ? 'is-selected' : ''}
                      onClick={() => setResult(entry.id, result === 'pass' ? 'untested' : 'pass')}
                      aria-pressed={result === 'pass'}
                    >
                      <Check size={13} />功能通过
                    </button>
                    <button
                      type="button"
                      className={result === 'fail' ? 'is-selected is-fail' : ''}
                      onClick={() => setResult(entry.id, result === 'fail' ? 'untested' : 'fail')}
                      aria-pressed={result === 'fail'}
                    >
                      <X size={13} />待复核
                    </button>
                  </div>
                </footer>
              </article>
            );
          })}
        </section>

        <footer className="comparison-page-footer">
          <ArrowDown size={13} />
          共 {visibleEntries.length} 项 · 测试标记仅保留在本次预览内存中
        </footer>
      </main>
    </div>
  );
};
