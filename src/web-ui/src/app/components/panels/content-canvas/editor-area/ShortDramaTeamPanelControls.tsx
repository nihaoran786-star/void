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

const stageGlyphs: Record<string, string> = {
  script: 'S',
  assets: 'A',
  storyboards: 'F',
  video: 'V',
  post: 'E',
};

const stageOf = (tab: CanvasTab): string =>
  typeof tab.content.metadata?.shortDramaStage === 'string'
    ? tab.content.metadata.shortDramaStage
    : '';

const statusGlyphs: Record<ShortDramaTeamAgentStatus, string> = {
  waiting: '·',
  live: '•',
  attention: '!',
  completed: '✓',
  cancelled: '–',
  failed: '×',
};

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
  const toggleLabel = isOpen
    ? t('canvas.collapseShortDramaTeam')
    : t('canvas.expandShortDramaTeam');
  const statusByTabId = React.useMemo(
    () => new Map(statuses.map(status => [status.tabId, status])),
    [statuses],
  );

  return (
    <aside
      className={`short-drama-team-panel-controls is-${mode}`}
      data-testid="short-drama-team-panel-controls"
      aria-label={t('canvas.shortDramaTeam')}
    >
      <Tooltip content={toggleLabel} placement="right">
        <button
          type="button"
          className="short-drama-team-panel-controls__toggle"
          data-testid="short-drama-team-panel-toggle"
          aria-label={toggleLabel}
          aria-expanded={isOpen}
          onClick={onToggle}
        >
          <span className="short-drama-team-panel-controls__toggle-glyph" aria-hidden="true">
            {isOpen ? '›' : '‹'}
          </span>
        </button>
      </Tooltip>

      <div
        className="short-drama-team-panel-controls__agents"
        aria-label={t('canvas.shortDramaTeamAgents')}
      >
        {tabs.map(tab => {
          const stage = stageOf(tab);
          const isActive = tab.id === activeTabId;
          const projection = statusByTabId.get(tab.id)
            ?? { tabId: tab.id, status: 'waiting' as const };
          const statusLabel = t(`canvas.shortDramaTeamStatus.${projection.status}`);
          const activityLabel = formatActivityLabel(
            projection.activity,
            t,
          );
          const agentLabel = [tab.title, statusLabel, activityLabel]
            .filter(Boolean)
            .join(' · ');
          return (
            <Tooltip key={tab.id} content={agentLabel} placement="right">
              <button
                type="button"
                className={[
                  'short-drama-team-panel-controls__agent',
                  `is-status-${projection.status}`,
                  isActive ? 'is-active' : '',
                ].filter(Boolean).join(' ')}
                aria-pressed={isActive}
                aria-label={agentLabel}
                data-testid="short-drama-team-agent"
                data-short-drama-stage={stage}
                data-short-drama-agent-status={projection.status}
                onClick={() => onSelectTab(tab.id)}
              >
                <span className="short-drama-team-panel-controls__stage-glyph" aria-hidden="true">
                  {stageGlyphs[stage] ?? 'A'}
                </span>
                <span
                  className="short-drama-team-panel-controls__status-glyph"
                  aria-hidden="true"
                >
                  {statusGlyphs[projection.status]}
                </span>
              </button>
            </Tooltip>
          );
        })}
      </div>
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
