import React from 'react';
import { Bot } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Tooltip } from '@/component-library';
import type { CanvasTab } from '../types';
import type {
  ShortDramaTeamAgentStatus,
  ShortDramaTeamAgentStatusProjection,
} from '@/flow_chat/types/short-drama-team-status';
import { getShortDramaTeamTabDisplayTitle } from './shortDramaTeamPanelPresentation';

export interface ShortDramaTeamPanelControlsProps {
  tabs: readonly CanvasTab[];
  statuses: readonly ShortDramaTeamAgentStatusProjection[];
  onToggle: () => void;
}

const statusPriority: readonly ShortDramaTeamAgentStatus[] = [
  'failed',
  'attention',
  'live',
  'completed',
  'waiting',
  'cancelled',
];

export const ShortDramaTeamPanelControls: React.FC<
  ShortDramaTeamPanelControlsProps
> = ({
  tabs,
  statuses,
  onToggle,
}) => {
  const { t } = useTranslation('components');
  const statusByTabId = React.useMemo(
    () => new Map(statuses.map(status => [status.tabId, status])),
    [statuses],
  );
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
  const compactLabel = t('canvas.shortDramaTeamCompact');
  const statusSummary = statusPriority
    .map(status => `${t(`canvas.shortDramaTeamStatus.${status}`)} ${statusCounts[status]}`)
    .join(' · ');
  const agentSummary = tabs
    .map(tab => [
      getShortDramaTeamTabDisplayTitle(tab, t),
      t(`canvas.shortDramaTeamStatus.${statusByTabId.get(tab.id)?.status ?? 'waiting'}`),
    ].join(' · '))
    .join('；');
  const accessibleLabel = [
    t('canvas.expandShortDramaTeam'),
    `${compactLabel} ${tabs.length}`,
    statusSummary,
    agentSummary,
  ].join(' · ');

  return (
    <aside
      className="short-drama-team-panel-controls is-rail"
      data-testid="short-drama-team-panel-controls"
      aria-label={t('canvas.shortDramaTeam')}
    >
      {tabs.length === 0 ? (
        <span
          className="short-drama-team-panel-controls__preparing"
          role="status"
          aria-label={t('canvas.shortDramaTeamStatus.waiting')}
        >
          <span aria-hidden="true">…</span>
        </span>
      ) : (
        <Tooltip content={t('canvas.expandShortDramaTeam')} placement="bottom">
          <button
            type="button"
            className={[
              'short-drama-team-panel-controls__toggle',
              'short-drama-team-panel-controls__summary',
              `is-status-${summaryStatus}`,
            ].join(' ')}
            data-testid="short-drama-team-panel-toggle"
            data-short-drama-team-summary-status={summaryStatus}
            aria-label={accessibleLabel}
            aria-expanded={false}
            onClick={onToggle}
          >
            <span
              className="short-drama-team-panel-controls__summary-icon"
              aria-hidden="true"
            >
              <Bot size={14} strokeWidth={1.8} />
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
