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

  const content = (
    <>
      <span className="void-nav-panel__section-label">{label}</span>
      {onSceneOpen ? (
        <span className="void-nav-panel__section-indicator" aria-hidden="true">
          <ChevronRight size={14} />
        </span>
      ) : null}
    </>
  );

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
    >
      {isInteractive ? (
        <button
          type="button"
          className="void-nav-panel__section-toggle"
          onClick={handleActivate}
          aria-expanded={collapsible ? isOpen : undefined}
          aria-controls={collapsible ? controlsId : undefined}
        >
          {content}
        </button>
      ) : (
        <span className="void-nav-panel__section-toggle void-nav-panel__section-toggle--static">
          {content}
        </span>
      )}
      {actions ? (
        <div className="void-nav-panel__section-actions">
          {actions}
        </div>
      ) : null}
    </div>
  );
};

export default SectionHeader;
