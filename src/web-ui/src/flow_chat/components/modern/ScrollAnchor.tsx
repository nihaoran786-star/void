/**
 * Conversation turn rail.
 * Shows quiet turn ticks with preview and jump navigation.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { i18nService } from '@/infrastructure/i18n';
import { usePresentationVirtualItems } from './useFlowChatPresentationStore';
import './ScrollAnchor.scss';

/**
 * A tick has to stay large enough to hit with a mouse or a thumb, so the step is
 * derived from the rail's measured height rather than a fixed budget. The floor
 * is what makes a long conversation usable: with the ~700px a normal window
 * gives the rail, 8px keeps every turn clickable past 80 turns.
 */
export const MIN_ANCHOR_STEP = 8;
export const MAX_ANCHOR_STEP = 14;
const FALLBACK_TRACK_HEIGHT = 320;

export function computeAnchorStep(availableHeight: number, turnCount: number): number {
  if (turnCount <= 0) return MAX_ANCHOR_STEP;
  const height = availableHeight > 0 ? availableHeight : FALLBACK_TRACK_HEIGHT;
  return Math.max(MIN_ANCHOR_STEP, Math.min(MAX_ANCHOR_STEP, height / turnCount));
}

interface ScrollAnchorProps {
  activeTurnId?: string | null;
  onAnchorNavigate: (turnId: string, behavior: ScrollBehavior) => void;
}

interface AnchorPoint {
  id: string;
  turnId: string;
  content: string;
  responsePreview: string;
  timestamp: number;
  turnNumber: number;
}

const cleanPreviewText = (content: string): string => content
  .replace(/^\s{0,3}#{1,6}\s+/gm, '')
  .replace(/`([^`]+)`/g, '$1')
  .replace(/^\s*>\s?/gm, '')
  .replace(/\s+/g, ' ')
  .trim();

const truncateContent = (content: string, maxLength: number): string => {
  if (content.length <= maxLength) return content;
  return `${content.substring(0, maxLength).trimEnd()}…`;
};

const prefersReducedMotion = (): boolean => (
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches
);

export const ScrollAnchor: React.FC<ScrollAnchorProps> = ({
  activeTurnId,
  onAnchorNavigate,
}) => {
  const { t } = useTranslation('flow-chat');
  const virtualItems = usePresentationVirtualItems();
  const [previewedAnchor, setPreviewedAnchor] = useState<AnchorPoint | null>(null);
  const [previewPosition, setPreviewPosition] = useState({ x: 0, y: 0 });
  const railRef = useRef<HTMLElement | null>(null);
  const [railHeight, setRailHeight] = useState(0);

  useEffect(() => {
    const node = railRef.current;
    if (!node) return;
    setRailHeight(node.clientHeight);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => setRailHeight(node.clientHeight));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const anchorPoints = useMemo<AnchorPoint[]>(() => {
    if (virtualItems.length === 0) return [];

    const responsePreviewByTurn = new Map<string, string>();
    virtualItems.forEach(item => {
      if (item.type !== 'model-round') return;

      item.data.items.forEach(flowItem => {
        if (flowItem.type !== 'text') return;
        const content = cleanPreviewText(flowItem.content || '');
        if (content) responsePreviewByTurn.set(item.turnId, content);
      });
    });

    const anchors: AnchorPoint[] = [];
    virtualItems.forEach(item => {
      if (item.type !== 'user-message') return;
      anchors.push({
        id: item.data.id,
        turnId: item.turnId,
        content: cleanPreviewText(item.data.content || ''),
        responsePreview: responsePreviewByTurn.get(item.turnId) || '',
        timestamp: item.data.timestamp || Date.now(),
        turnNumber: anchors.length + 1,
      });
    });

    return anchors;
  }, [virtualItems]);

  const handleAnchorClick = useCallback((anchor: AnchorPoint) => {
    onAnchorNavigate(anchor.turnId, prefersReducedMotion() ? 'auto' : 'smooth');
    setPreviewedAnchor(null);
  }, [onAnchorNavigate]);

  const showPreview = useCallback((anchor: AnchorPoint, element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    const viewportHeight = typeof window === 'undefined' ? rect.bottom : window.innerHeight;
    const centerY = rect.top + rect.height / 2;
    setPreviewedAnchor(anchor);
    setPreviewPosition({
      x: rect.right + 14,
      y: Math.min(Math.max(centerY, 104), Math.max(104, viewportHeight - 104)),
    });
  }, []);

  const hidePreview = useCallback(() => {
    setPreviewedAnchor(null);
  }, []);

  const formatTimestamp = useCallback((timestamp: number) => {
    return i18nService.formatDate(new Date(timestamp), {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }, []);

  if (anchorPoints.length === 0) return null;

  return (
    <>
      <nav
        ref={railRef}
        className="scroll-anchor"
        aria-label={t('scroll.anchorNavigation')}
        style={{
          '--anchor-step': `${computeAnchorStep(railHeight, anchorPoints.length)}px`,
        } as React.CSSProperties}
      >
        <div className="scroll-anchor__track">
          {anchorPoints.map((anchor, index) => {
            const isCurrent = activeTurnId === anchor.turnId;
            const isPreviewed = previewedAnchor?.id === anchor.id;
            const previewId = `scroll-anchor-preview-${anchor.id}`;

            return (
              <button
                key={anchor.id}
                type="button"
                className={`scroll-anchor__point${isCurrent ? ' is-current' : ''}${isPreviewed ? ' is-previewed' : ''}`}
                style={{
                  '--anchor-delay': `${Math.min(index * 18, 180)}ms`,
                } as React.CSSProperties}
                aria-label={t('scroll.anchorJumpLabel', {
                  current: anchor.turnNumber,
                  content: truncateContent(anchor.content, 60),
                })}
                aria-current={isCurrent ? 'step' : undefined}
                aria-describedby={isPreviewed ? previewId : undefined}
                onClick={() => handleAnchorClick(anchor)}
                onMouseEnter={event => showPreview(anchor, event.currentTarget)}
                onMouseLeave={hidePreview}
                onFocus={event => showPreview(anchor, event.currentTarget)}
                onBlur={hidePreview}
              >
                <span className="scroll-anchor__tick" aria-hidden="true" />
              </button>
            );
          })}
        </div>
      </nav>

      {previewedAnchor ? (
        <div
          id={`scroll-anchor-preview-${previewedAnchor.id}`}
          className="scroll-anchor__preview"
          role="tooltip"
          style={{
            left: `${previewPosition.x}px`,
            top: `${previewPosition.y}px`,
          }}
        >
          <div className="scroll-anchor__preview-meta">
            <span>
              {t('scroll.anchorTurn', {
                current: previewedAnchor.turnNumber,
                total: anchorPoints.length,
              })}
            </span>
            <span>{formatTimestamp(previewedAnchor.timestamp)}</span>
          </div>
          <div className="scroll-anchor__preview-title">
            {truncateContent(previewedAnchor.content, 92)}
          </div>
          <div className="scroll-anchor__preview-content">
            {previewedAnchor.responsePreview
              ? truncateContent(previewedAnchor.responsePreview, 150)
              : t('scroll.anchorNoResponse')}
          </div>
        </div>
      ) : null}
    </>
  );
};

ScrollAnchor.displayName = 'ScrollAnchor';
