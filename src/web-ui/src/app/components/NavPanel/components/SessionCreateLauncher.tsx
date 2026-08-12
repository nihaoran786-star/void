import React from 'react';
import {
  ArrowRight,
  ClipboardList,
  Code2,
  Images,
  type LucideIcon,
} from 'lucide-react';
import { Tooltip } from '@/component-library';
import { NavTechPlusIcon } from './NavTechIcons';
import type { WorkspacePresentation } from '@/app/presentation/workspacePresentation';

export type SessionLauncherMode = 'code' | 'cowork' | 'media';

export interface SessionModeLabels {
  create: string;
  mode: string;
  short: string;
}

interface SessionCreateLauncherProps {
  presentation: WorkspacePresentation;
  selectedMode: SessionLauncherMode;
  groupLabel: string;
  modeLabels: Record<SessionLauncherMode, SessionModeLabels>;
  onSelectMode: (mode: SessionLauncherMode) => void;
  onCreate: () => void;
  searchTrigger?: React.ReactNode;
  createShortcutHint?: string;
}

interface SessionModeOption {
  mode: SessionLauncherMode;
  Icon: LucideIcon;
}

const MODE_OPTIONS: SessionModeOption[] = [
  { mode: 'code', Icon: Code2 },
  { mode: 'cowork', Icon: ClipboardList },
  { mode: 'media', Icon: Images },
];

export const SessionCreateLauncher: React.FC<SessionCreateLauncherProps> = ({
  presentation,
  selectedMode,
  groupLabel,
  modeLabels,
  onSelectMode,
  onCreate,
  searchTrigger,
  createShortcutHint,
}) => {
  if (presentation === 'classic') {
    return (
      <div className="void-nav-panel__session-create">
        <div
          className={`void-nav-panel__session-mode-switch is-mode-${selectedMode}`}
          role="radiogroup"
          aria-label={groupLabel}
        >
          <span className="void-nav-panel__session-mode-indicator" aria-hidden="true" />
          {MODE_OPTIONS.map(({ mode, Icon }) => (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={selectedMode === mode}
              aria-label={modeLabels[mode].create}
              className={`void-nav-panel__session-mode-option${selectedMode === mode ? ' is-active' : ''}`}
              onClick={() => onSelectMode(mode)}
            >
              <Icon size={14} aria-hidden="true" />
              <span>{modeLabels[mode].mode}</span>
            </button>
          ))}
        </div>

        <div className="void-nav-panel__session-create-footer">
          <Tooltip content={modeLabels[selectedMode].create} placement="right" followCursor>
            <button
              type="button"
              className="void-nav-panel__session-create-action"
              onClick={onCreate}
              aria-label={modeLabels[selectedMode].create}
            >
              <span className="void-nav-panel__session-create-action-text">
                {groupLabel}
              </span>
              <span className="void-nav-panel__session-create-action-mode">
                {modeLabels[selectedMode].short}
              </span>
              <ArrowRight size={13} aria-hidden="true" />
            </button>
          </Tooltip>
        </div>
      </div>
    );
  }

  return (
    <div className="void-nav-panel__session-create void-nav-panel__session-create--minimal">
      <div className="void-nav-panel__session-create-footer">
        <Tooltip content={groupLabel} placement="right" followCursor>
          <button
            type="button"
            className="void-nav-panel__session-create-action"
            onClick={onCreate}
            aria-label={groupLabel}
          >
            <NavTechPlusIcon size={14} className="void-nav-panel__session-create-tech-icon" />
            <span className="void-nav-panel__session-create-action-text">
              {groupLabel}
            </span>
            {createShortcutHint ? (
              <kbd className="void-nav-panel__session-create-action-kbd">
                {createShortcutHint}
              </kbd>
            ) : null}
          </button>
        </Tooltip>
        {searchTrigger ? (
          <div className="void-nav-panel__session-search-slot">
            {searchTrigger}
          </div>
        ) : null}
      </div>
    </div>
  );
};
