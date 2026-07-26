import type React from 'react';
import type { ToolCardHeaderAffordanceKind } from './ToolCardHeaderLayoutContext';
import type { ToolCardStatus } from './BaseToolCard';

export const statusUsesLoadingShimmer = (status: ToolCardStatus): boolean =>
  status !== 'pending' && status.endsWith('ing');

export const renderToolCardHeaderActivation = (
  affordanceKind: ToolCardHeaderAffordanceKind,
  isExpanded: boolean,
  onClick: React.MouseEventHandler<HTMLButtonElement>,
) => {
  const expandsInline = affordanceKind === 'expand';
  return (
    <button
      type="button"
      className="tool-card-header-activation"
      onClick={onClick}
      aria-label={
        expandsInline
          ? isExpanded ? 'Collapse details' : 'Expand details'
          : 'Open details'
      }
      aria-expanded={expandsInline ? isExpanded : undefined}
    />
  );
};
