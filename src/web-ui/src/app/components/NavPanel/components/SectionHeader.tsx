/**
 * SectionHeader — collapsible, scene-opening, or static section title row.
 */

import React, { useCallback } from 'react';
import { ChevronRight } from 'lucide-react';

interface SectionHeaderProps {
  label: string;
  collapsible: boolean;
  isOpen: boolean;
  controlsId?: string;
  onToggle?: () => void;
  onSceneOpen?: () => void;
  actions?: React.ReactNode;
}

const SectionHeader: React.FC<SectionHeaderProps> = ({
  label,
  collapsible,
  isOpen,
  controlsId,
  onToggle,
  onSceneOpen,
  actions,
}) => {
  const isInteractive = collapsible || !!onSceneOpen;
  const isSceneEntry = !collapsible && !!onSceneOpen;

  const handleActivate = useCallback(() => {
    if (collapsible) {
      onToggle?.();
      return;
    }
    onSceneOpen?.();
  }, [collapsible, onSceneOpen, onToggle]);

  return (
    <div
      className={[
        'void-nav-panel__section-header',
        isInteractive && 'void-nav-panel__section-header--interactive',
        collapsible && 'void-nav-panel__section-header--collapsible',
        onSceneOpen && 'void-nav-panel__section-header--scene-link',
        isSceneEntry && 'void-nav-panel__section-header--scene-entry',
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={isInteractive ? handleActivate : undefined}
      role={isInteractive ? 'button' : undefined}
      tabIndex={isInteractive ? 0 : undefined}
      aria-expanded={collapsible ? isOpen : undefined}
      aria-controls={collapsible ? controlsId : undefined}
      onKeyDown={
        isInteractive
          ? e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleActivate();
              }
            }
          : undefined
      }
    >
      <span className="void-nav-panel__section-label">{label}</span>
      {onSceneOpen ? (
        <span className="void-nav-panel__section-indicator" aria-hidden="true">
          <ChevronRight size={14} />
        </span>
      ) : null}
      {actions ? (
        <div
          className="void-nav-panel__section-actions"
          onClick={e => e.stopPropagation()}
          onKeyDown={e => e.stopPropagation()}
        >
          {actions}
        </div>
      ) : null}
    </div>
  );
};

export default SectionHeader;
