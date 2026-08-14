/**
 * Processing indicator.
 * After 1s of continuous processing, shows the Beautiful UI loading state
 * with a rotating live hint and elapsed time.
 * reserveSpace keeps layout height even when hidden.
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
}

export const ProcessingIndicator: React.FC<ProcessingIndicatorProps> = ({ visible, reserveSpace = false }) => {
  const isPresentationActive = useFlowChatPresentationActive();
  const isEffectivelyVisible = visible && isPresentationActive;
  const { t } = useTranslation('flow-chat/processing-hints');
  const rawHints = t('items', { returnObjects: true });
  const hints = Array.isArray(rawHints)
    ? rawHints.filter((item): item is string => typeof item === 'string')
    : [];

  const [showHint, setShowHint] = useState(false);
  const [hintIndex, setHintIndex] = useState(0);

  const delayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rotateTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isEffectivelyVisible && hints.length > 0) {
      const initialIndex = Math.floor(Math.random() * hints.length);
      setHintIndex(initialIndex);

      delayTimerRef.current = setTimeout(() => {
        setShowHint(true);
        rotateTimerRef.current = setInterval(() => {
          setHintIndex(prev => (prev + 1) % hints.length);
        }, 5000);
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
  }, [hints.length, isEffectivelyVisible]);

  const shouldRender = isEffectivelyVisible || reserveSpace;
  if (!shouldRender) return null;

  return (
    <div className="processing-indicator" aria-hidden={!isEffectivelyVisible}>
      <div
        className="processing-indicator__content"
        style={isEffectivelyVisible ? undefined : { visibility: 'hidden' as const }}
      >
        {showHint && hints.length > 0 && (
          <BeautifulUIStage mode="inline">
            <LoadingState label={hints[hintIndex]} variant="Drive" />
          </BeautifulUIStage>
        )}
      </div>
    </div>
  );
};
