/**
 * Compact tool card component
 * Used for ReadFile, GrepSearch, WebSearch, etc. with transparent gray background
 *
 * Features:
 * - Collapsed: transparent background, no border, single-line display
 * - Expanded: shows detailed content with dark background box
 * - Simple gray style, text brightens on hover
 */

import React, { ReactNode } from 'react';
import { shouldIgnoreCardToggleClick } from '@/shared/utils/textSelection';
import {
  BaseToolCard,
  type BaseToolCardProps,
} from './BaseToolCard';
import {
  renderToolCardHeaderActivation,
  statusUsesLoadingShimmer,
} from './toolCardPresentation';
import { ToolCardIconSlot } from './ToolCardIconSlot';
import { ToolCardStatusIcon } from './ToolCardStatusIcon';
import type { ToolCardHeaderAffordanceKind } from './ToolCardHeaderLayoutContext';
import './CompactToolCard.scss';

export interface CompactToolCardProps {
  /** Tool status */
  status: BaseToolCardProps['status'];
  /** Whether expanded */
  isExpanded?: boolean;
  /** Card click callback */
  onClick?: (e: React.MouseEvent) => void;
  /** Custom class name */
  className?: string;
  /** Whether clickable */
  clickable?: boolean;
  /** Whether this row represents an actionable confirmation request. */
  requiresConfirmation?: boolean;
  /** Header content */
  header: ReactNode;
  /** Expanded content (optional) */
  expandedContent?: ReactNode;
}

export const CompactToolCard: React.FC<CompactToolCardProps> = ({
  status,
  isExpanded = false,
  onClick,
  className = '',
  clickable = false,
  requiresConfirmation = false,
  header,
  expandedContent,
}) => {
  const isInteractive = clickable && Boolean(onClick);
  const handleWrapperClick = (event: React.MouseEvent) => {
    if (shouldIgnoreCardToggleClick(event)) {
      return;
    }

    onClick!(event);
  };
  const resolvedHeader =
    React.isValidElement<CompactToolCardHeaderProps>(header)
    && header.type === CompactToolCardHeader
      ? React.cloneElement(header, {
          onAffordanceClick:
            header.props.onAffordanceClick ?? (isInteractive ? onClick : undefined),
          expandable: header.props.expandable ?? isInteractive,
          affordanceKind:
            header.props.affordanceKind
            ?? 'expand',
          isExpanded: header.props.isExpanded ?? isExpanded,
        })
      : header;

  if (isExpanded && expandedContent) {
    return (
      <BaseToolCard
        status={status}
        isExpanded
        onClick={isInteractive ? onClick : undefined}
        className={`compact-tool-card-wrapper--expanded-card ${className}`.trim()}
        requiresConfirmation={requiresConfirmation}
        header={resolvedHeader}
        expandedContent={expandedContent}
        headerExpandAffordance={isInteractive}
      />
    );
  }

  return (
    <div
      className={`compact-tool-card-wrapper compact-tool-card-wrapper--dense-command${requiresConfirmation ? ' requires-confirmation' : ''}${statusUsesLoadingShimmer(status) ? ' compact-tool-card-wrapper--loading-shimmer' : ''} ${className}`.trim()}
    >
      <div
        className={`compact-tool-card status-${status} ${isInteractive ? 'clickable' : ''} ${isExpanded ? 'expanded' : ''}`}
        onClick={isInteractive ? handleWrapperClick : undefined}
      >
        {resolvedHeader}
      </div>

    </div>
  );
};

export interface CompactToolCardHeaderProps {
  /** Left tool icon (should be 16px lucide icon) */
  icon?: ReactNode;
  /** Custom class name for the icon element */
  iconClassName?: string;
  /** Show hover chevron when expandable */
  expandable?: boolean;
  /** Expand vs open-right-panel hint icon */
  affordanceKind?: ToolCardHeaderAffordanceKind;
  /** Expanded state for chevron rotation */
  isExpanded?: boolean;
  /** Click handler for the left icon rail affordance */
  onAffordanceClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  /** Whether to show the left icon divider (default false for compact) */
  showDivider?: boolean;
  /** Action label (text or inline markup) */
  action?: ReactNode;
  /** Main content */
  content?: ReactNode;
  /** Right extra content (e.g., statistics) */
  extra?: ReactNode;
  /** Right status icon (should be 14px) */
  rightStatusIcon?: ReactNode;
  /** Whether right status icon has a divider */
  rightStatusIconWithDivider?: boolean;
}

export function CompactToolCardHeader({
  icon,
  iconClassName,
  expandable = false,
  affordanceKind = 'expand',
  isExpanded = false,
  onAffordanceClick,
  showDivider = false,
  action,
  content,
  extra,
  rightStatusIcon,
  rightStatusIconWithDivider = false,
}: CompactToolCardHeaderProps) {
  return (
    <>
      {icon && (
        <ToolCardIconSlot
          icon={icon}
          iconClassName={iconClassName}
          expandable={expandable}
          affordanceKind={affordanceKind}
          isExpanded={isExpanded}
          showDivider={showDivider}
        />
      )}
      {expandable && onAffordanceClick && (
        renderToolCardHeaderActivation(
          affordanceKind,
          isExpanded,
          onAffordanceClick,
        )
      )}
      {action && <span className="compact-card-action">{action}</span>}
      {content && <span className="compact-card-content">{content}</span>}
      {extra && <span className="compact-card-extra">{extra}</span>}
      {rightStatusIcon && (
        <ToolCardStatusIcon
          icon={rightStatusIcon}
          withDivider={rightStatusIconWithDivider}
          className="compact-card-right-status-icon"
        />
      )}
    </>
  );
}
