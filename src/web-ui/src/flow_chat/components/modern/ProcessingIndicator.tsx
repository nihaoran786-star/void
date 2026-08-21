/**
 * Processing indicator.
 * After 1s of continuous processing, shows the Beautiful UI loading state
 * with a rotating live hint and elapsed time.
 *
 * The indicator is pinned to the bottom edge of the transcript viewport rather
 * than appended to the end of the message flow: the answer streams upward past
 * a status line that never moves, so the eye keeps one fixed place to check
 * "is it still working". `ProcessingIndicatorSpacer` holds the matching height
 * inside the scrolled flow so the last line of a turn cannot settle underneath
 * the pinned bar.
 */

import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BeautifulUIStage } from '@/component-library/components/BeautifulUI';
import LoadingState from '@/component-library/preview/beautiful-ui-original/components/loading-state';
import { useFlowChatPresentationActive } from './FlowChatPresentationActivity';
import './ProcessingIndicator.scss';

interface ProcessingIndicatorProps {
  visible: boolean;
  /** When true, preserve height to avoid layout jumps. */
  reserveSpace?: boolean;
  /**
   * i18n key for the phase the runtime actually reported. When present it wins
   * over the rotating hints, so the one indicator says what is happening.
   */
  labelKey?: string;
  /** Render as the fixed bar at the bottom of the transcript viewport. */
  pinned?: boolean;
}

/** Height the pinned bar occupies, mirrored by the in-flow spacer. */
export const PROCESSING_INDICATOR_RESERVED_PX = 34;

/**
 * In-flow placeholder for the pinned bar. It carries no content — its only job
 * is to keep the tail of the transcript scrollable above the pinned status.
 */
export const ProcessingIndicatorSpacer: React.FC<{ reserve: boolean }> = ({ reserve }) => (
  <div
    className="processing-indicator-spacer"
    aria-hidden
    style={{ height: reserve ? `${PROCESSING_INDICATOR_RESERVED_PX}px` : 0 }}
  />
);

export const ProcessingIndicator: React.FC<ProcessingIndicatorProps> = ({ visible, reserveSpace = false, labelKey, pinned = false }) => {
  const isPresentationActive = useFlowChatPresentationActive();
  const isEffectivelyVisible = visible && isPresentationActive;
  const { t } = useTranslation('flow-chat/processing-hints');
  const { t: tFlowChat } = useTranslation('flow-chat');
  const label = labelKey ? tFlowChat(labelKey) : undefined;
  const rawHints = t('items', { returnObjects: true });
  const hints = Array.isArray(rawHints)
    ? rawHints.filter((item): item is string => typeof item === 'string')
    : [];

  const [showHint, setShowHint] = useState(false);
  const [hintIndex, setHintIndex] = useState(0);

  const delayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rotateTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const hasLabel = Boolean(label);

  useEffect(() => {
    if (isEffectivelyVisible && (hints.length > 0 || hasLabel)) {
      const initialIndex = hints.length > 0
        ? Math.floor(Math.random() * hints.length)
        : 0;
      setHintIndex(initialIndex);

      delayTimerRef.current = setTimeout(() => {
        setShowHint(true);
        // A reported phase is real information; it must not be rotated away.
        if (!hasLabel && hints.length > 0) {
          rotateTimerRef.current = setInterval(() => {
            setHintIndex(prev => (prev + 1) % hints.length);
          }, 5000);
        }
      }, 1000);
    } else {
      if (delayTimerRef.current) {
        clearTimeout(delayTimerRef.current);
        delayTimerRef.current = null;
      }
      if (rotateTimerRef.current) {
        clearInterval(rotateTimerRef.current);
        rotateTimerRef.current = null;
      }
      setShowHint(false);
    }

    return () => {
      if (delayTimerRef.current) clearTimeout(delayTimerRef.current);
      if (rotateTimerRef.current) clearInterval(rotateTimerRef.current);
    };
  }, [hasLabel, hints.length, isEffectivelyVisible]);

  // The pinned bar overlays the transcript, so an invisible copy would sit on
  // top of the last lines and swallow their clicks.
  const shouldRender = isEffectivelyVisible || (reserveSpace && !pinned);
  if (!shouldRender) return null;

  return (
    <div
      className={`processing-indicator${pinned ? ' processing-indicator--pinned' : ''}`}
      aria-hidden={!isEffectivelyVisible}
    >
      <div
        className="processing-indicator__content"
        style={isEffectivelyVisible ? undefined : { visibility: 'hidden' as const }}
      >
        {showHint && (label || hints.length > 0) && (
          <BeautifulUIStage mode="inline">
            <LoadingState label={label ?? hints[hintIndex]} variant="Drive" />
          </BeautifulUIStage>
        )}
      </div>
    </div>
  );
};
