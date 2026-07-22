import React from 'react';
import { Check, ChevronDown, PanelRightClose } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Tooltip } from '@/component-library';
import type { CanvasTab } from '../types';
import type { ShortDramaTeamPanelMode } from './shortDramaTeamPanelPresentation';
import type {
  ShortDramaTeamAgentActivity,
  ShortDramaTeamAgentStatus,
  ShortDramaTeamAgentStatusProjection,
} from '@/flow_chat/types/short-drama-team-status';

export interface ShortDramaTeamPanelControlsProps {
  mode: Exclude<ShortDramaTeamPanelMode, 'closed'>;
  tabs: readonly CanvasTab[];
  activeTabId: string;
  statuses: readonly ShortDramaTeamAgentStatusProjection[];
  onToggle: () => void;
  onSelectTab: (tabId: string) => void;
}

const statusPriority: readonly ShortDramaTeamAgentStatus[] = [
  'failed',
  'attention',
  'live',
  'completed',
  'waiting',
  'cancelled',
];

export const ShortDramaTeamPanelControls: React.FC<ShortDramaTeamPanelControlsProps> = ({
  mode,
  tabs,
  activeTabId,
  statuses,
  onToggle,
  onSelectTab,
}) => {
  const { t } = useTranslation('components');
  const isOpen = mode === 'open';
  const rootRef = React.useRef<HTMLElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const optionRefs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const [isAgentMenuOpen, setIsAgentMenuOpen] = React.useState(false);
  const toggleLabel = isOpen
    ? t('canvas.collapseShortDramaTeam')
    : t('canvas.expandShortDramaTeam');
  const compactLabel = t('canvas.shortDramaTeamCompact');
  const statusByTabId = React.useMemo(
    () => new Map(statuses.map(status => [status.tabId, status])),
    [statuses],
  );
  const isPreparing = tabs.length === 0;
  const statusCounts = React.useMemo(() => {
    const counts: Record<ShortDramaTeamAgentStatus, number> = {
      waiting: 0,
      live: 0,
      attention: 0,
      completed: 0,
      cancelled: 0,
      failed: 0,
    };

    tabs.forEach(tab => {
      const status = statusByTabId.get(tab.id)?.status ?? 'waiting';
      counts[status] += 1;
    });

    return counts;
  }, [statusByTabId, tabs]);
  const summaryStatus = statusPriority.find(status => statusCounts[status] > 0)
    ?? 'waiting';
  const activeTabIndex = Math.max(
    0,
    tabs.findIndex(tab => tab.id === activeTabId),
  );
  const [highlightedIndex, setHighlightedIndex] = React.useState(activeTabIndex);
  const activeTab = tabs[activeTabIndex] ?? null;
  const activeProjection = activeTab
    ? statusByTabId.get(activeTab.id)
      ?? { tabId: activeTab.id, status: 'waiting' as const }
    : null;
  const statusSummary = statusPriority
    .map(status => `${t(`canvas.shortDramaTeamStatus.${status}`)} ${statusCounts[status]}`)
    .join(' · ');
  const agentStatusSummary = tabs
    .map(tab => {
      const projection = statusByTabId.get(tab.id)
        ?? { tabId: tab.id, status: 'waiting' as const };
      const statusLabel = t(`canvas.shortDramaTeamStatus.${projection.status}`);
      const activityLabel = formatActivityLabel(projection.activity, t);
      return [tab.title, statusLabel, activityLabel]
        .filter(Boolean)
        .join(' · ');
    })
    .join('；');
  const accessibleToggleLabel = [
    toggleLabel,
    `${compactLabel} ${tabs.length}`,
    statusSummary,
    agentStatusSummary,
  ].join(' · ');

  React.useEffect(() => {
    if (!isAgentMenuOpen) {
      return;
    }

    optionRefs.current[highlightedIndex]?.focus();
  }, [highlightedIndex, isAgentMenuOpen]);

  React.useEffect(() => {
    if (!isAgentMenuOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (
        event.target instanceof Node
        && !rootRef.current?.contains(event.target)
      ) {
        setIsAgentMenuOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [isAgentMenuOpen]);

  if (isOpen) {
    const openAgentMenu = (index = activeTabIndex) => {
      setHighlightedIndex(index);
      setIsAgentMenuOpen(true);
    };
    const closeAgentMenu = (restoreFocus: boolean) => {
      setIsAgentMenuOpen(false);
      if (restoreFocus) {
        requestAnimationFrame(() => triggerRef.current?.focus());
      }
    };
    const focusAgent = (index: number) => {
      const normalizedIndex = (index + tabs.length) % tabs.length;
      setHighlightedIndex(normalizedIndex);
    };
    const handleAgentMenuKeyDown = (
      event: React.KeyboardEvent<HTMLDivElement>,
    ) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        focusAgent(highlightedIndex + 1);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        focusAgent(highlightedIndex - 1);
      } else if (event.key === 'Home') {
        event.preventDefault();
        focusAgent(0);
      } else if (event.key === 'End') {
        event.preventDefault();
        focusAgent(tabs.length - 1);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeAgentMenu(true);
      } else if (event.key === 'Tab') {
        setIsAgentMenuOpen(false);
      }
    };
    const selectAgent = (tabId: string) => {
      onSelectTab(tabId);
      closeAgentMenu(true);
    };

    return (
      <aside
        ref={rootRef}
        className="short-drama-team-panel-controls is-open"
        data-testid="short-drama-team-panel-controls"
        aria-label={t('canvas.shortDramaTeam')}
      >
        <div className="short-drama-team-panel-controls__agent-selector">
          <button
            ref={triggerRef}
            type="button"
            className="short-drama-team-panel-controls__agent-trigger"
            data-testid="short-drama-team-agent-trigger"
            aria-haspopup="listbox"
            aria-expanded={isAgentMenuOpen}
            aria-label={[
              compactLabel,
              activeTab?.title,
              activeProjection
                ? t(`canvas.shortDramaTeamStatus.${activeProjection.status}`)
                : '',
            ].filter(Boolean).join(' · ')}
            onClick={() => {
              if (isAgentMenuOpen) {
                closeAgentMenu(false);
              } else {
                openAgentMenu();
              }
            }}
            onKeyDown={event => {
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                openAgentMenu(
                  event.key === 'ArrowDown'
                    ? activeTabIndex
                    : tabs.length - 1,
                );
              }
            }}
          >
            <span className="short-drama-team-panel-controls__agent-prefix">
              {compactLabel}
            </span>
            <span aria-hidden="true">/</span>
            {activeProjection && (
              <span
                className={[
                  'short-drama-team-panel-controls__agent-dot',
                  `is-status-${activeProjection.status}`,
                ].join(' ')}
                aria-hidden="true"
              />
            )}
            <span className="short-drama-team-panel-controls__agent-name">
              {activeTab?.title ?? compactLabel}
            </span>
            <ChevronDown size={13} aria-hidden="true" />
          </button>

          {isAgentMenuOpen && (
            <div
              className="short-drama-team-panel-controls__agent-menu"
              data-testid="short-drama-team-agent-menu"
              role="listbox"
              aria-label={t('canvas.shortDramaTeam')}
              onKeyDown={handleAgentMenuKeyDown}
            >
              {tabs.map((tab, index) => {
                const projection = statusByTabId.get(tab.id)
                  ?? { tabId: tab.id, status: 'waiting' as const };
                const isActive = tab.id === activeTab?.id;
                const stage = tab.content.metadata?.shortDramaStage;
                const stageLabel = typeof stage === 'string' && stage
                  ? t(`shortDrama.tabs.${stage}`)
                  : '';
                const metaLabel = [
                  stageLabel,
                  formatActivityLabel(projection.activity, t),
                ].filter(Boolean).join(' · ');
                return (
                  <button
                    key={tab.id}
                    ref={element => {
                      optionRefs.current[index] = element;
                    }}
                    type="button"
                    role="option"
                    className={[
                      'short-drama-team-panel-controls__agent-option',
                      isActive ? 'is-active' : '',
                    ].filter(Boolean).join(' ')}
                    data-testid="short-drama-team-agent"
                    data-short-drama-team-agent-id={tab.id}
                    aria-selected={isActive}
                    tabIndex={highlightedIndex === index ? 0 : -1}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    onClick={() => selectAgent(tab.id)}
                  >
                    <span
                      className={[
                        'short-drama-team-panel-controls__agent-dot',
                        `is-status-${projection.status}`,
                      ].join(' ')}
                      aria-hidden="true"
                    />
                    <span className="short-drama-team-panel-controls__agent-text">
                      <span className="short-drama-team-panel-controls__agent-name">
                        {tab.title}
                      </span>
                      {metaLabel ? (
                        <span className="short-drama-team-panel-controls__agent-meta">
                          {metaLabel}
                        </span>
                      ) : null}
                    </span>
                    <span className="short-drama-team-panel-controls__agent-status">
                      {t(`canvas.shortDramaTeamStatus.${projection.status}`)}
                    </span>
                    {isActive && <Check size={13} aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <Tooltip content={toggleLabel} placement="bottom">
          <button
            type="button"
            className="short-drama-team-panel-controls__collapse"
            data-testid="short-drama-team-panel-collapse"
            aria-label={toggleLabel}
            onClick={onToggle}
          >
            <PanelRightClose size={14} aria-hidden="true" />
          </button>
        </Tooltip>
      </aside>
    );
  }

  return (
    <aside
      className={`short-drama-team-panel-controls is-${mode}`}
      data-testid="short-drama-team-panel-controls"
      aria-label={t('canvas.shortDramaTeam')}
    >
      {isPreparing ? (
        <span
          className="short-drama-team-panel-controls__preparing"
          role="status"
          aria-label={t('canvas.shortDramaTeamStatus.waiting')}
        >
          <span aria-hidden="true">…</span>
        </span>
      ) : (
        <Tooltip content={accessibleToggleLabel} placement="right">
          <button
            type="button"
            className={[
              'short-drama-team-panel-controls__toggle',
              isOpen ? '' : 'short-drama-team-panel-controls__summary',
              `is-status-${summaryStatus}`,
            ].filter(Boolean).join(' ')}
            data-testid="short-drama-team-panel-toggle"
            data-short-drama-team-summary-status={summaryStatus}
            aria-label={accessibleToggleLabel}
            aria-expanded={false}
            onClick={onToggle}
          >
            <span
              className="short-drama-team-panel-controls__summary-dot"
              aria-hidden="true"
            />
            <span className="short-drama-team-panel-controls__summary-label">
              {compactLabel}
            </span>
            <span className="short-drama-team-panel-controls__summary-count">
              {tabs.length}
            </span>
          </button>
        </Tooltip>
      )}
    </aside>
  );
};

ShortDramaTeamPanelControls.displayName = 'ShortDramaTeamPanelControls';

export default ShortDramaTeamPanelControls;

function formatActivityLabel(
  activity: ShortDramaTeamAgentActivity | undefined,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  return activity ? t(`canvas.shortDramaTeamActivity.${activity}`) : '';
}
