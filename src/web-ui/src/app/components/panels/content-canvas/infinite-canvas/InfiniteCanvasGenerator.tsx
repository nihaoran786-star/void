/**
 * Bottom floating generator (visual language §6) — the single place a canvas
 * generation is started.
 *
 * The card face no longer carries a prompt box or a generate button: this
 * panel floats over the lower half of the board, is always present, and acts
 * on the selected card when there is one (regenerate / use as the edit target)
 * or creates a new card when there is not.
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

export interface InfiniteCanvasGeneratorProps {
  target?: InfiniteCanvasGeneratorTarget;
  references: readonly InfiniteCanvasGeneratorReference[];
  resolvePreviewUrl: InfiniteCanvasImagePreviewResolver;
  onSubmit: (prompt: string) => void;
  /**
   * Persists an edited prompt onto the target card without dispatching, so a
   * draft written here is not lost by clicking away — the same commit the old
   * on-card prompt box made on blur.
   */
  onCommitPrompt?: (prompt: string) => void;
  onAddReference: () => void;
  onOpenParams?: () => void;
  onOpenStyle?: () => void;
}

/** One small square in the reference queue; resolves its own preview. */
const GeneratorThumbnail: React.FC<{
  reference: InfiniteCanvasGeneratorReference;
  resolvePreviewUrl: InfiniteCanvasImagePreviewResolver;
}> = ({ reference, resolvePreviewUrl }) => {
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
    </span>
  );
};

GeneratorThumbnail.displayName = 'InfiniteCanvasGeneratorThumbnail';

export const InfiniteCanvasGenerator: React.FC<InfiniteCanvasGeneratorProps> = ({
  target,
  references,
  resolvePreviewUrl,
  onSubmit,
  onCommitPrompt,
  onAddReference,
  onOpenParams,
  onOpenStyle,
}) => {
  const { t } = useI18n('components');
  const [draft, setDraft] = React.useState(target?.prompt ?? '');
  const targetNodeId = target?.nodeId;
  const targetPrompt = target?.prompt;

  // Switching target adopts that card's prompt; the generator is a view of the
  // card it is acting on, not a second place where a prompt could hide.
  React.useEffect(() => {
    setDraft(targetPrompt ?? '');
  }, [targetNodeId, targetPrompt]);

  const pending = target?.pending ?? false;
  const submit = React.useCallback(() => {
    if (pending) return;
    onSubmit(draft);
  }, [draft, onSubmit, pending]);

  return (
    <div
      className="infinite-canvas-generator"
      data-canvas-generator="root"
      data-canvas-generator-target={targetNodeId}
      role="group"
      aria-label={t('infiniteCanvas.generator.label')}
    >
      <div className="infinite-canvas-generator__references">
        {onOpenStyle ? (
          // §6's leftmost "reference / character" entry. Ours is the style
          // preset catalogue: the one look-and-character library we have.
          <button
            type="button"
            className="infinite-canvas-generator__icon-button"
            data-canvas-generator-action="style"
            data-has-style={target?.stylePresetName ? 'true' : undefined}
            aria-label={t('infiniteCanvas.generator.style')}
            title={target?.stylePresetName ?? t('infiniteCanvas.generator.style')}
            onClick={onOpenStyle}
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
            />
          ))}
        </span>
        <button
          type="button"
          className="infinite-canvas-generator__add"
          data-canvas-generator-action="add-reference"
          aria-label={t('infiniteCanvas.generator.addReference')}
          title={t('infiniteCanvas.generator.addReference')}
          onClick={onAddReference}
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
          if (draft !== (targetPrompt ?? '')) onCommitPrompt?.(draft);
        }}
        onKeyDown={event => {
          if (event.key !== 'Enter' || event.shiftKey) return;
          event.preventDefault();
          submit();
        }}
      />
      <div className="infinite-canvas-generator__bar">
        {target ? (
          <>
            <button
              type="button"
              className="infinite-canvas-generator__meta"
              data-canvas-generator-action="model"
              onClick={onOpenParams}
            >
              {target.modelLabel}
            </button>
            <span className="infinite-canvas-generator__dot" aria-hidden="true" />
            <button
              type="button"
              className="infinite-canvas-generator__meta"
              data-canvas-generator-action="params"
              data-has-params={target.paramsSummary ? 'true' : undefined}
              title={target.paramsSummary || t('infiniteCanvas.params.button')}
              onClick={onOpenParams}
            >
              {target.paramsSummary || t('infiniteCanvas.params.button')}
            </button>
            <span className="infinite-canvas-generator__dot" aria-hidden="true" />
            <button
              type="button"
              className="infinite-canvas-generator__meta"
              data-canvas-generator-action="count"
              onClick={onOpenParams}
            >
              {/* `n`, not `count`: i18next reserves `count` for plurals. */}
              {t('infiniteCanvas.generator.count', { n: target.count ?? 1 })}
            </button>
          </>
        ) : (
          // No card selected: the generator will create one. Parameters and
          // style belong to a card, so they appear once the card exists.
          <span className="infinite-canvas-generator__hint">
            {t('infiniteCanvas.generator.newCard')}
          </span>
        )}
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
