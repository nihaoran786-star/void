import React from 'react';
import { useTranslation } from 'react-i18next';
import { Tooltip } from '@/component-library';
import type { CanvasTab } from '../types';
import type { ShortDramaTeamPanelMode } from './shortDramaTeamPanelPresentation';

export interface ShortDramaTeamPanelControlsProps {
  mode: Exclude<ShortDramaTeamPanelMode, 'closed'>;
  tabs: readonly CanvasTab[];
  activeTabId: string;
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

export const ShortDramaTeamPanelControls: React.FC<ShortDramaTeamPanelControlsProps> = ({
  mode,
  tabs,
  activeTabId,
  onToggle,
  onSelectTab,
}) => {
  const { t } = useTranslation('components');
  const isOpen = mode === 'open';
  const toggleLabel = isOpen
    ? t('canvas.collapseShortDramaTeam')
    : t('canvas.expandShortDramaTeam');

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
          return (
            <Tooltip key={tab.id} content={tab.title} placement="right">
              <button
                type="button"
                className={`short-drama-team-panel-controls__agent ${isActive ? 'is-active' : ''}`}
                aria-pressed={isActive}
                aria-label={tab.title}
                data-testid="short-drama-team-agent"
                data-short-drama-stage={stage}
                onClick={() => onSelectTab(tab.id)}
              >
                <span className="short-drama-team-panel-controls__stage-glyph" aria-hidden="true">
                  {stageGlyphs[stage] ?? 'A'}
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
