/**
 * Common tool card component
 * Provides unified card styles and interaction logic
 */
import React, { ReactNode } from 'react';
import { shouldIgnoreCardToggleClick } from '@/shared/utils/textSelection';
import { SmoothHeightCollapse } from '../components/modern/SmoothHeightCollapse';
import type { ToolCardHeaderAffordanceKind } from './ToolCardHeaderLayoutContext';
import { ToolCardIconSlot } from './ToolCardIconSlot';
import { ToolCardStatusIcon } from './ToolCardStatusIcon';
import {
  renderToolCardHeaderActivation,
  statusUsesLoadingShimmer,
} from './toolCardPresentation';
import './BaseToolCard.scss';

export type ToolCardStatus =
  | 'pending'
  | 'preparing'
  | 'streaming'
  | 'receiving'
  | 'running'
  | 'completed'
  | 'error'
  | 'cancelled'
  | 'analyzing'
  | 'pending_confirmation'
  | 'confirmed';

export interface BaseToolCardProps {
  /** Tool status */
  status: ToolCardStatus;
  /** Visual density hint; complex and actionable tools remain cards by default. */
  presentation?: 'card' | 'status-row';
  /** Whether expanded */
  isExpanded?: boolean;
  /** Card click callback */
  onClick?: (e: React.MouseEvent) => void;
  /** Custom class name */
  className?: string;
  /** Header content */
  header: ReactNode;
  /** Expanded content (optional) */
  expandedContent?: ReactNode;
  /** Error content (optional) */
  errorContent?: ReactNode;
  /** Whether to show error */
  isFailed?: boolean;
  /** Whether user confirmation is required (for highlighting border) */
  requiresConfirmation?: boolean;
  /**
   * When set, controls hover chevron on the left tool icon.
   * When omitted: true if the card is clickable, not failed, and expandedContent is passed and truthy.
   * (Some cards pass expandedContent only while expanded; set this explicitly for those.)
   */
  headerExpandAffordance?: boolean;
  /** Hover icon: chevron-down (inline expand) vs chevron-right (open right). Default `expand`. */
  headerAffordanceKind?: ToolCardHeaderAffordanceKind;
}

/**
 * Base tool card component
 */
export const BaseToolCard: React.FC<BaseToolCardProps> = ({
  status,
  presentation = 'card',
  isExpanded = false,
  onClick,
  className = '',
  header,
  expandedContent,
  errorContent,
  isFailed = false,
  requiresConfirmation = false,
  headerExpandAffordance: headerExpandAffordanceProp,
  headerAffordanceKind: headerAffordanceKindProp = 'expand',
}) => {
  const handleCardClick = (event: React.MouseEvent) => {
    if (shouldIgnoreCardToggleClick(event)) {
      return;
    }

    onClick!(event);
  };

  const hasExpandedContent = isExpanded && expandedContent && !isFailed;
  const showConfirmationHighlight = requiresConfirmation && 
    status !== 'completed' && 
    status !== 'confirmed' &&
    status !== 'cancelled' && 
    status !== 'error';

  const resolvedHeaderExpandAffordance =
    headerExpandAffordanceProp !== undefined
      ? headerExpandAffordanceProp
      : Boolean(onClick) && !isFailed && Boolean(expandedContent);

  const resolvedHeader =
    React.isValidElement<ToolCardHeaderProps>(header) && header.type === ToolCardHeader
      ? React.cloneElement(header, {
          expandAffordance:
            header.props.expandAffordance ?? resolvedHeaderExpandAffordance,
          affordanceKind:
            header.props.affordanceKind ?? headerAffordanceKindProp,
          headerExpanded: header.props.headerExpanded ?? isExpanded,
          onAffordanceClick: header.props.onAffordanceClick ?? onClick,
        })
      : header;

  return (
    <div
      className={`base-tool-card-wrapper ${presentation === 'status-row' ? 'base-tool-card-wrapper--status-row' : ''} ${showConfirmationHighlight ? 'requires-confirmation' : ''} ${statusUsesLoadingShimmer(status) ? 'base-tool-card-wrapper--loading-shimmer' : ''} ${className}`.trim()}
    >
      <div 
        className={`base-tool-card status-${status} ${isExpanded ? 'expanded' : ''} ${resolvedHeaderExpandAffordance ? 'base-tool-card--header-expandable' : ''}`.trim()}
        onClick={onClick ? handleCardClick : undefined}
      >
        <div className="base-tool-card-header">
          {resolvedHeader}
        </div>
      </div>
      
      <SmoothHeightCollapse isOpen={Boolean(hasExpandedContent)} className="base-tool-card-expanded-collapse">
        <div className="base-tool-card-expanded">
          {expandedContent}
        </div>
      </SmoothHeightCollapse>
      
      <SmoothHeightCollapse isOpen={Boolean(isFailed && errorContent)} className="base-tool-card-error-collapse">
        <div className="base-tool-card-error">
          {errorContent}
        </div>
      </SmoothHeightCollapse>
    </div>
  );
};

/**
 * Tool card header subcomponent Props
 */
export interface ToolCardHeaderProps {
  /** Left tool identifier icon (colored) */
  icon?: ReactNode;
  /** Custom class name for tool icon */
  iconClassName?: string;
  /** Override context: show hover chevron when expandable */
  expandAffordance?: boolean;
  /** Override context: expand vs open-right-panel hint icon */
  affordanceKind?: ToolCardHeaderAffordanceKind;
  /** Override context: expanded state for chevron rotation */
  headerExpanded?: boolean;
  /** Optional dedicated affordance click handler for the left icon rail. */
  onAffordanceClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  /** Action text */
  action?: string;
  /** Main content */
  content?: ReactNode;
  /** Right extra content (e.g., statistics, buttons, etc.) */
  extra?: ReactNode;
  /** Status icon at right border */
  statusIcon?: ReactNode;
}

/**
 * Tool card header component
 */
export function ToolCardHeader({
  icon,
  iconClassName,
  expandAffordance = false,
  affordanceKind = 'expand',
  headerExpanded = false,
  onAffordanceClick,
  action,
  content,
  extra,
  statusIcon,
}: ToolCardHeaderProps) {
  return (
    <>
      {icon != null && icon !== false && icon !== '' && (
        <ToolCardIconSlot
          icon={icon}
          iconClassName={iconClassName}
          expandable={expandAffordance}
          affordanceKind={affordanceKind}
          isExpanded={headerExpanded}
        />
      )}
      {expandAffordance && onAffordanceClick && (
        renderToolCardHeaderActivation(
          affordanceKind,
          headerExpanded,
          onAffordanceClick,
        )
      )}
      {action && <span className="tool-card-action">{action}</span>}
      {content && <div className="tool-card-content">{content}</div>}
      {extra && <div className="tool-card-extra">{extra}</div>}
      {statusIcon && (
        <ToolCardStatusIcon
          icon={statusIcon}
          withDivider={Boolean(extra)}
        />
      )}
    </>
  );
}
