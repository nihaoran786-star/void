/**
 * Card-anchored generator (visual language §6, owner correction 2026-08-26).
 *
 * This is NOT a global input box parked at the bottom of the board. It belongs
 * to the one selected card and floats directly under it: the prompt it shows is
 * that card's last prompt, and the parameter summary, the count and the send
 * button all act on that card. Deselect the card and it is gone — with nothing
 * selected the canvas carries no input surface at all.
 *
 * Pure presentation: every action is a callback the panel routes through the
 * same DocumentService commands and the same DirectImageGenerationGateway lane
 * the card controls used. Nothing about the generation contract changes here.
 *
 * §6 lists a sound switch, a microphone and a balance readout. This build has
 * no audio parameter, no speech capture and no balance port, so those three
 * are deliberately NOT rendered rather than faked.
 */
import React from 'react';

import { useI18n } from '@/infrastructure/i18n';
import type {
  InfiniteCanvasImagePreviewResolver,
  InfiniteCanvasMediaRef,
} from './InfiniteCanvasNodes';

export interface InfiniteCanvasGeneratorReference {
  nodeId: string;
  order: number;
  mediaRef?: InfiniteCanvasMediaRef;
}

export interface InfiniteCanvasGeneratorTarget {
  nodeId: string;
  mediaKind: 'image' | 'video';
  prompt: string;
  /** Collapsed parameter choice, when the card carries one. */
  paramsSummary?: string;
  modelLabel: string;
  count?: number;
  stylePresetName?: string;
  /** A card that is mid-generation cannot be dispatched again. */
  pending: boolean;
}

/**
 * Where the generator sits, in panel pixels: directly under the card it
 * belongs to. Owner feedback 2026-08-26 — it must be symmetric about the card
 * and a touch wider on BOTH sides, not card-width and left-aligned; the panel
 * therefore centres it on the card's midline. Recomputed whenever the card
 * moves or the viewport pans / zooms, so the input tracks its card.
 */
export interface InfiniteCanvasGeneratorPlacement {
  left: number;
  top: number;
  width: number;
}

export interface InfiniteCanvasGeneratorProps {
  /** The selected card. There is no generator without one. */
  target: InfiniteCanvasGeneratorTarget;
  placement?: InfiniteCanvasGeneratorPlacement;
  references: readonly InfiniteCanvasGeneratorReference[];
  resolvePreviewUrl: InfiniteCanvasImagePreviewResolver;
  onSubmit: (prompt: string) => void;
  /**
   * Persists an edited prompt onto the target card without dispatching, so a
   * draft written here is not lost by clicking away — the same commit the old
   * on-card prompt box made on blur.
   */
  onCommitPrompt?: (prompt: string) => void;
  onAddReference: (anchor: HTMLElement) => void;
  /**
   * Owner feedback 2026-08-26: each reference thumbnail carries a small `×`
   * that breaks that reference connection. The panel routes it through the
   * existing edge-removal mutation, so it is one undoable step and neither
   * card's media is touched.
   */
  onRemoveReference?: (nodeId: string) => void;
  /** The anchor element is passed so the popover opens next to its trigger. */
  onOpenParams?: (anchor: HTMLElement) => void;
  /**
   * §7.3-A: the model name opens the MODEL LIST, a separate popover from the
   * parameters. The two are mutually exclusive; the panel enforces that.
   */
  onOpenModel?: (anchor: HTMLElement) => void;
  onOpenStyle?: (anchor: HTMLElement) => void;
}

/** One small square in the reference queue; resolves its own preview. */
const GeneratorThumbnail: React.FC<{
  reference: InfiniteCanvasGeneratorReference;
  resolvePreviewUrl: InfiniteCanvasImagePreviewResolver;
  onRemove?: (nodeId: string) => void;
}> = ({ reference, resolvePreviewUrl, onRemove }) => {
  const { t } = useI18n('components');
  const [url, setUrl] = React.useState<string | undefined>(undefined);
  const { mediaRef } = reference;

  React.useEffect(() => {
    if (!mediaRef) return undefined;
    let cancelled = false;
    setUrl(undefined);
    // Same forceDataUrl lane the cards use — this app has no assetProtocol.
    void resolvePreviewUrl(mediaRef, 'image').then(resolved => {
      if (!cancelled) setUrl(resolved);
    });
    return () => {
      cancelled = true;
    };
  }, [mediaRef, resolvePreviewUrl]);

  const label = t('infiniteCanvas.generator.referenceThumbnail', {
    order: reference.order,
  });
  return (
    <span
      className="infinite-canvas-generator__thumb"
      data-canvas-generator-reference={reference.nodeId}
      data-reference-order={reference.order}
      role="img"
      aria-label={label}
      title={label}
    >
      {url ? <img src={url} alt="" draggable={false} /> : null}
      {onRemove ? (
        <button
          type="button"
          className="infinite-canvas-generator__thumb-remove"
          data-canvas-generator-action="remove-reference"
          data-reference-node={reference.nodeId}
          aria-label={t('infiniteCanvas.generator.removeReference')}
          title={t('infiniteCanvas.generator.removeReference')}
          onClick={event => {
            event.stopPropagation();
            onRemove(reference.nodeId);
          }}
        >
          <svg viewBox="0 0 12 12" width="8" height="8" aria-hidden="true">
            <path
              d="M3 3l6 6M9 3l-6 6"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </button>
      ) : null}
    </span>
  );
};

GeneratorThumbnail.displayName = 'InfiniteCanvasGeneratorThumbnail';

export const InfiniteCanvasGenerator: React.FC<InfiniteCanvasGeneratorProps> = ({
  target,
  placement,
  references,
  resolvePreviewUrl,
  onSubmit,
  onCommitPrompt,
  onAddReference,
  onRemoveReference,
  onOpenParams,
  onOpenModel,
  onOpenStyle,
}) => {
  const { t } = useI18n('components');
  const [draft, setDraft] = React.useState(target.prompt);
  const targetNodeId = target.nodeId;
  const targetPrompt = target.prompt;

  // Selecting another card adopts that card's prompt; the generator is a view
  // of the card it is attached to, not a second place a prompt could hide. A
  // blank generation card therefore opens with an empty field.
  React.useEffect(() => {
    setDraft(targetPrompt);
  }, [targetNodeId, targetPrompt]);

  const pending = target.pending;
  const submit = React.useCallback(() => {
    if (pending) return;
    onSubmit(draft);
  }, [draft, onSubmit, pending]);

  return (
    <div
      className="infinite-canvas-generator"
      data-canvas-generator="root"
      data-canvas-generator-target={targetNodeId}
      // Until the card has been measured the stylesheet's own placement keeps
      // the input on screen; once it is measured, the inline box wins.
      data-canvas-generator-anchored={placement ? 'true' : undefined}
      role="group"
      aria-label={t('infiniteCanvas.generator.label')}
      style={placement
        ? {
            left: `${placement.left}px`,
            top: `${placement.top}px`,
            width: `${placement.width}px`,
          }
        : undefined}
    >
      <div className="infinite-canvas-generator__references">
        {onOpenStyle ? (
          // §6's leftmost "reference / character" entry. Ours is the style
          // preset catalogue: the one look-and-character library we have.
          <button
            type="button"
            className="infinite-canvas-generator__icon-button"
            data-canvas-generator-action="style"
            data-has-style={target.stylePresetName ? 'true' : undefined}
            aria-label={t('infiniteCanvas.generator.style')}
            title={target.stylePresetName ?? t('infiniteCanvas.generator.style')}
            onClick={event => onOpenStyle(event.currentTarget)}
          >
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <circle cx="8" cy="8" r="5.6" fill="none" stroke="currentColor" strokeWidth="1.2" />
              <circle cx="8" cy="8" r="1.9" fill="currentColor" />
            </svg>
          </button>
        ) : null}
        <span
          className="infinite-canvas-generator__thumbs"
          role="group"
          aria-label={t('infiniteCanvas.generator.references')}
        >
          {references.map(reference => (
            <GeneratorThumbnail
              key={reference.nodeId}
              reference={reference}
              resolvePreviewUrl={resolvePreviewUrl}
              onRemove={onRemoveReference}
            />
          ))}
        </span>
        <button
          type="button"
          className="infinite-canvas-generator__add"
          data-canvas-generator-action="add-reference"
          aria-label={t('infiniteCanvas.generator.addReference')}
          title={t('infiniteCanvas.generator.addReference')}
          onClick={event => onAddReference(event.currentTarget)}
        >
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path d="M8 3.5v9M3.5 8h9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <textarea
        className="infinite-canvas-generator__prompt nodrag"
        data-canvas-generator-field="prompt"
        aria-label={t('infiniteCanvas.generator.label')}
        placeholder={t('infiniteCanvas.generator.placeholder')}
        value={draft}
        disabled={pending}
        rows={2}
        onChange={event => setDraft(event.target.value)}
        onBlur={() => {
          if (draft !== targetPrompt) onCommitPrompt?.(draft);
        }}
        onKeyDown={event => {
          if (event.key !== 'Enter' || event.shiftKey) return;
          event.preventDefault();
          submit();
        }}
      />
      <div className="infinite-canvas-generator__bar">
        {/* §7.3-A: model name first, then the parameter summary pill; each
            opens its own popover. */}
        <button
          type="button"
          className="infinite-canvas-generator__meta infinite-canvas-generator__meta--model"
          data-canvas-generator-action="model"
          aria-label={t('infiniteCanvas.params.model')}
          title={target.modelLabel}
          onClick={event => (onOpenModel ?? onOpenParams)?.(event.currentTarget)}
        >
          {target.modelLabel}
        </button>
        <span className="infinite-canvas-generator__dot" aria-hidden="true" />
        <button
          type="button"
          className="infinite-canvas-generator__meta infinite-canvas-generator__meta--params"
          data-canvas-generator-action="params"
          data-has-params={target.paramsSummary ? 'true' : undefined}
          title={target.paramsSummary || t('infiniteCanvas.params.button')}
          onClick={event => onOpenParams?.(event.currentTarget)}
        >
          {target.paramsSummary || t('infiniteCanvas.params.button')}
        </button>
        <span className="infinite-canvas-generator__dot" aria-hidden="true" />
        <button
          type="button"
          className="infinite-canvas-generator__meta"
          data-canvas-generator-action="count"
          onClick={event => onOpenParams?.(event.currentTarget)}
        >
          {/* `n`, not `count`: i18next reserves `count` for plurals. */}
          {t('infiniteCanvas.generator.count', { n: target.count ?? 1 })}
        </button>
        <span className="infinite-canvas-generator__spacer" />
        <button
          type="button"
          className="infinite-canvas-generator__send"
          data-canvas-generator-action="send"
          disabled={pending}
          aria-label={t('infiniteCanvas.generator.send')}
          title={t('infiniteCanvas.generator.sendHint')}
          onClick={submit}
        >
          <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
            <path
              d="M8 12.5v-9M4.2 7.3 8 3.5l3.8 3.8"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );
};

InfiniteCanvasGenerator.displayName = 'InfiniteCanvasGenerator';
