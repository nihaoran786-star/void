/**
 * The seam between the short-drama panel and the board (plan §3.1).
 *
 * A context rather than a prop, deliberately. `onArtifactFocus` is drilled
 * through seven components to reach six render sites; threading a second
 * callback the same way would add thirty lines of plumbing to a file
 * `AGENTS.md` names an orchestration hotspot. With a context the hotspot gains
 * one import and six one-line elements, and the wiring lives in the container.
 *
 * The button below is presentational on purpose: it renders, it calls, it
 * shows the result. It knows nothing about canvas surfaces.
 */
import React from 'react';
import { LayoutGrid } from 'lucide-react';

import { useI18n } from '@/infrastructure/i18n';
import { notificationService } from '@/shared/notification-system/services/NotificationService';
import { canRefineShortDramaArtifactOnCanvas } from '@/shared/services/canvas-short-drama/shortDramaCanvasPredicates';
import type { ShortDramaArtifact } from '@/shared/services/short-drama/ShortDramaTypes';
// Type-only, so the hotspot's import graph never reaches the canvas surface
// service: the module that does call it is loaded lazily by the container.
import type { ShortDramaCanvasHandoffResult } from './shortDramaCanvasHandoff';

export type ShortDramaCanvasHandoffSender = (
  artifact: ShortDramaArtifact,
) => Promise<ShortDramaCanvasHandoffResult>;

const ShortDramaCanvasHandoffContext = React.createContext<
  ShortDramaCanvasHandoffSender | undefined
>(undefined);

export const ShortDramaCanvasHandoffProvider: React.FC<{
  send?: ShortDramaCanvasHandoffSender;
  children: React.ReactNode;
}> = ({ send, children }) => (
  <ShortDramaCanvasHandoffContext.Provider value={send}>
    {children}
  </ShortDramaCanvasHandoffContext.Provider>
);

/**
 * "Refine on the canvas". A visible entry of its own rather than a second
 * meaning bolted onto the screen-reader focus button: that one drives
 * `activeArtifactFocusByStage`, which feeds the stage agents' context, and a
 * cross-panel open must not quietly rewrite what an agent is looking at.
 */
export const ArtifactSendToCanvasButton: React.FC<{
  artifact: ShortDramaArtifact;
}> = ({ artifact }) => {
  const { t } = useI18n('components');
  const send = React.useContext(ShortDramaCanvasHandoffContext);
  const [busy, setBusy] = React.useState(false);

  if (!send || !canRefineShortDramaArtifactOnCanvas(artifact)) return null;

  return (
    <button
      type="button"
      className="short-drama-card__canvas-handoff"
      data-testid="short-drama-send-to-canvas"
      disabled={busy}
      aria-label={t('shortDrama.canvasHandoff.send', { title: artifact.title })}
      title={t('shortDrama.canvasHandoff.sendShort')}
      onClick={event => {
        // The card underneath opens a preview and moves the stage focus; this
        // button does neither.
        event.stopPropagation();
        setBusy(true);
        void send(artifact)
          .then(result => {
            if (result.status === 'sent') return;
            notificationService.warning(
              result.reason === 'unusable-picture'
                ? t('shortDrama.canvasHandoff.unusablePicture')
                : t('shortDrama.canvasHandoff.unavailable'),
              { duration: 4000 },
            );
          })
          .finally(() => setBusy(false));
      }}
    >
      {/* The same glyph the canvas capability rail uses, so the two read as
          one place rather than two features. */}
      <LayoutGrid size={13} aria-hidden="true" />
    </button>
  );
};

ArtifactSendToCanvasButton.displayName = 'ArtifactSendToCanvasButton';
