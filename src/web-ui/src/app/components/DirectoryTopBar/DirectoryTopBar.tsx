import React from 'react';
import { Plus } from 'lucide-react';
import './DirectoryTopBar.scss';

/**
 * The one directory top bar shared by the employee, skill and connector
 * catalogs: page name + count · filter pills · elastic gap · quiet search ·
 * icon-only utilities · one primary action.
 *
 * Presentation only. Every page keeps its own state, filters and actions and
 * passes them in; this component owns nothing but the shape. Having a single
 * component — rather than three look-alike headers — is what keeps the three
 * catalogs from drifting apart again.
 */

export interface DirectoryChip {
  id: string;
  label: string;
  active: boolean;
  /** Rendered dimmed; still selectable, because an empty filter is a fact. */
  empty?: boolean;
  title?: string;
  onSelect: () => void;
}

export interface DirectoryChipGroup {
  id: string;
  /** Accessible name for the group; never rendered as visible copy. */
  label: string;
  /**
   * `tabs` switches which catalog is shown (roving tab stop, aria-selected);
   * `filters` narrows the current catalog (toggle buttons, aria-pressed).
   */
  mode: 'tabs' | 'filters';
  chips: DirectoryChip[];
  onChipKeyDown?: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
}

export interface DirectoryStat {
  key: string;
  label: string;
  /** Quiet ink only — status tones recolor the text, never fill a pill. */
  tone?: 'neutral' | 'success' | 'warning';
}

export interface DirectoryPrimaryAction {
  /** Accessible name and tooltip; the control itself stays a bare `+`. */
  label: string;
  onClick: () => void;
  disabled?: boolean;
  expanded?: boolean;
  controls?: string;
}

export interface DirectoryTopBarProps {
  title: string;
  count?: number;
  /** One muted line under the bar row; a page's reason to exist, not chrome. */
  mission?: string;
  /** Quiet inline text figures right after the count, middot-separated. */
  stats?: DirectoryStat[];
  groups?: DirectoryChipGroup[];
  /** The page's own search control, already bound to its own state. */
  search?: React.ReactNode;
  /** Icon-only secondary controls, rendered before the primary action. */
  utilities?: React.ReactNode;
  primary?: DirectoryPrimaryAction;
  className?: string;
}

const DirectoryTopBar: React.FC<DirectoryTopBarProps> = ({
  title,
  count,
  mission,
  stats,
  groups = [],
  search,
  utilities,
  primary,
  className,
}) => (
  <header
    className={['directory-topbar', className].filter(Boolean).join(' ')}
  >
    <h2 className="directory-topbar__title">
      <span className="directory-topbar__title-text">{title}</span>
      {count === undefined ? null : (
        <span className="directory-topbar__count">{count}</span>
      )}
    </h2>

    {stats && stats.length > 0 ? (
      <span className="directory-topbar__stats">
        {stats.map(stat => (
          <span
            key={stat.key}
            className={[
              'directory-topbar__stat',
              stat.tone && stat.tone !== 'neutral'
                ? `directory-topbar__stat--${stat.tone}`
                : null,
            ].filter(Boolean).join(' ')}
          >
            {stat.label}
          </span>
        ))}
      </span>
    ) : null}

    {groups.length > 0 && (
      <div className="directory-topbar__chips">
        {groups.map(group => (
          <div
            key={group.id}
            className="directory-topbar__chip-group"
            role={group.mode === 'tabs' ? 'tablist' : 'group'}
            aria-label={group.label}
          >
            {group.chips.map(chip => (
              <button
                key={chip.id}
                type="button"
                className={[
                  'directory-chip',
                  `directory-chip--${group.mode}`,
                  chip.active && 'is-active',
                  chip.empty && 'is-empty',
                ].filter(Boolean).join(' ')}
                onClick={chip.onSelect}
                onKeyDown={group.onChipKeyDown}
                title={chip.title}
                {...(group.mode === 'tabs'
                  ? {
                      role: 'tab',
                      'aria-selected': chip.active,
                      tabIndex: chip.active ? 0 : -1,
                    }
                  : { 'aria-pressed': chip.active })}
              >
                {chip.label}
              </button>
            ))}
          </div>
        ))}
      </div>
    )}

    <span className="directory-topbar__spacer" aria-hidden="true" />

    {search ? <div className="directory-topbar__search">{search}</div> : null}

    {utilities ? (
      <div className="directory-topbar__utilities">{utilities}</div>
    ) : null}

    {primary ? (
      <button
        type="button"
        className="directory-topbar__primary"
        onClick={primary.onClick}
        disabled={primary.disabled}
        aria-label={primary.label}
        title={primary.label}
        aria-expanded={primary.expanded}
        aria-controls={primary.controls}
      >
        <Plus size={16} aria-hidden="true" />
      </button>
    ) : null}

    {mission ? (
      <p className="directory-topbar__mission">{mission}</p>
    ) : null}
  </header>
);

export default DirectoryTopBar;
