import React from 'react';

import type { ShortDramaStage } from '@/shared/services/short-drama';
import { getNextShortDramaRovingTabIndex } from './ShortDramaKeyboardNavigation';

const SHORT_DRAMA_STAGE_ORDER: readonly ShortDramaStage[] = [
  'script',
  'assets',
  'storyboards',
  'video',
  'post',
];

interface ShortDramaTopBarProps {
  selectedStage: ShortDramaStage;
  onStageSelect: (stage: ShortDramaStage) => void;
  t: (key: string, values?: Record<string, unknown>) => string;
  onTeamOpen?: () => void;
  teamMemberCount?: number;
}

export function ShortDramaTopBar({
  selectedStage,
  onStageSelect,
  t,
  onTeamOpen,
  teamMemberCount = 0,
}: ShortDramaTopBarProps) {
  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    currentIndex: number,
  ) => {
    const nextIndex = getNextShortDramaRovingTabIndex(
      currentIndex,
      event.key,
      SHORT_DRAMA_STAGE_ORDER.length,
    );
    if (nextIndex === null) {
      return;
    }

    event.preventDefault();
    const nextStage = SHORT_DRAMA_STAGE_ORDER[nextIndex];
    const tabs = event.currentTarget.parentElement
      ?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    tabs?.[nextIndex]?.focus();
    if (nextStage) {
      onStageSelect(nextStage);
    }
  };

  return (
    <header className="short-drama-center__topbar">
      <nav
        className="short-drama-center__tabs"
        aria-label={t('shortDrama.tabs.label')}
        role="tablist"
      >
        {SHORT_DRAMA_STAGE_ORDER.map((stage, index) => {
          const isSelected = selectedStage === stage;
          return (
            <button
              key={stage}
              type="button"
              className={`short-drama-center__tab ${isSelected ? 'is-active' : ''}`}
              data-testid="short-drama-stage-tab"
              data-short-drama-stage={stage}
              role="tab"
              aria-selected={isSelected}
              tabIndex={isSelected ? 0 : -1}
              onClick={() => onStageSelect(stage)}
              onKeyDown={event => handleKeyDown(event, index)}
              onFocus={(event) => {
                event.currentTarget.scrollIntoView?.({
                  block: 'nearest',
                  inline: 'nearest',
                });
              }}
            >
              {t(`shortDrama.tabs.${stage}`)}
            </button>
          );
        })}
      </nav>
      {onTeamOpen && (
        <button
          type="button"
          className="short-drama-center__team-reopen"
          data-testid="short-drama-team-reopen"
          aria-label={t('canvas.shortDramaTeam')}
          onClick={onTeamOpen}
        >
          <span>{t('canvas.shortDramaTeam')}</span>
          {teamMemberCount > 0 && <span aria-hidden="true">{teamMemberCount}</span>}
        </button>
      )}
    </header>
  );
}
