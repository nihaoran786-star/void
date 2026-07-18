import React from 'react';
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
  statuses,
  onToggle,
}) => {
  const { t } = useTranslation('components');
  const isOpen = mode === 'open';
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
            aria-expanded={isOpen}
            onClick={onToggle}
          >
            {!isOpen && (
              <>
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
              </>
            )}
            <span className="short-drama-team-panel-controls__toggle-glyph" aria-hidden="true">
              {isOpen ? '›' : '‹'}
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
