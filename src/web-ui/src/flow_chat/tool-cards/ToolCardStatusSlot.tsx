/**
 * Unified left-slot component for compact tool card headers.
 *
 * Two display modes (controlled by `defaultIcon`):
 *
 * "status" (default) — most tools:
 *   - Default: status icon (dots / check / X)
 *   - Hover:   tool-specific icon
 *
 * "tool" — identity-first tools (Git, Shell):
 *   - Default: tool-specific icon
 *   - Hover:   status icon
 *
 * Usage: pass as the `icon` prop of CompactToolCardHeader.
 */

import React, { ReactNode } from 'react';
import { Check, X } from 'lucide-react';
import type { ToolProcessingDotsSize } from '@/component-library';
import type { BaseToolCardProps } from './BaseToolCard';
import './ToolCardStatusSlot.scss';

export type ToolCardStatusSlotStatus = BaseToolCardProps['status'];

export interface ToolCardStatusSlotProps {
  status: ToolCardStatusSlotStatus;
  toolIcon?: ReactNode;
  /**
   * Which icon is shown by default (non-hovered).
   * - `"status"` (default): dots/check/X default; tool icon on hover.
   * - `"tool"`: tool icon default; dots/check/X on hover.
   */
  defaultIcon?: 'status' | 'tool';
  size?: ToolProcessingDotsSize;
}

function StatusIcon({ status, size }: { status: ToolCardStatusSlotStatus; size: ToolProcessingDotsSize }) {
  const dotSize = Math.max(6, Math.round(size / 2));
  switch (status) {
    case 'completed':
      return <Check size={size} className="tcss-check" />;
    case 'error':
      return <X size={size} className="tcss-error" />;
    case 'cancelled':
      return <X size={size} className="tcss-cancelled" />;
    case 'pending':
    case 'pending_confirmation':
    case 'confirmed':
      // Queued: hollow hairline ring.
      return (
        <span
          className="tcss-dot tcss-dot--queued"
          style={{ width: dotSize, height: dotSize }}
          aria-hidden
        />
      );
    default:
      // Active: accent dot with a single quiet ripple.
      return (
        <span
          className="tcss-dot tcss-dot--active"
          style={{ width: dotSize, height: dotSize }}
          aria-hidden
        />
      );
  }
}

export const ToolCardStatusSlot: React.FC<ToolCardStatusSlotProps> = ({
  status,
  toolIcon,
  defaultIcon = 'status',
  size = 16,
}) => {
  const hasIcon = toolIcon != null;
  const toolFirst = defaultIcon === 'tool' && hasIcon;

  return (
    <div
      className={[
        'tool-card-status-slot',
        hasIcon ? 'tool-card-status-slot--has-icon' : '',
        toolFirst ? 'tool-card-status-slot--tool-first' : '',
      ].filter(Boolean).join(' ')}
    >
      <div className="tool-card-status-slot__status-layer">
        <StatusIcon status={status} size={size} />
      </div>
      {hasIcon && (
        <div className="tool-card-status-slot__icon-layer" aria-hidden>
          {toolIcon}
        </div>
      )}
    </div>
  );
};
