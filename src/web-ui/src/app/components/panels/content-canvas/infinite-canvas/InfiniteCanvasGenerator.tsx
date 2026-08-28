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
import { instructionBlockReason } from '@/shared/services/infinite-canvas';
import { infiniteCanvasStyleSwatch } from './infiniteCanvasStyleSwatch';
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
  /** §7.5: needed for the deterministic swatch a preset without a picture gets. */
  stylePresetId?: string;
  stylePresetName?: string;
  /** §7.5: the chosen preset's sample picture, relative to `public/`. */
  styleThumbnailRef?: string;
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
  /**
   * False until reactflow reports the card's real box. The panel still places
   * the generator from the stylesheet's card size so it is never missing, but
   * the surface stays invisible for that frame: revealing the guess and then
   * snapping to the measured box is the jitter the owner saw when clicking
   * from card to card.
   */
  measured: boolean;
}

/**
 * Where this generator is standing.
 *
 * Owner feedback 2026-08-27: "所有的都是共用输入框的" — the board-filling
 * editors do NOT get an input box of their own. They mount THIS component,
 * with the same field, the same bottom row of pills and the same round send
 * button; only the placeholder, one short status line and the reference row
 * differ. `editor` is that switch, and it is the whole of the difference.
 */
export type InfiniteCanvasGeneratorSurface = 'card' | 'editor';

export interface InfiniteCanvasGeneratorProps {
  /** The selected card. There is no generator without one. */
  target: InfiniteCanvasGeneratorTarget;
  surface?: InfiniteCanvasGeneratorSurface;
  /**
   * Overrides the field's placeholder and accessible name. The editors say
   * what THEY are asking for ("what should change"), which is narrower than
   * the board's general prompt.
   */
  placeholder?: string;
  /**
   * One very short grey line above the field — the editors' running status
   * ("paint the area first"). Nothing else may be written here.
   */
  note?: string;
  /** Machine-readable name for `note`, so tests can assert the reason. */
  noteReason?: string;
  /**
   * False parks the send button and the Enter key: the surface has something
   * outstanding, and `note` is where it says what.
   */
  canSubmit?: boolean;
  /**
   * The prefilled tool instruction this box is currently carrying, if any.
   *
   * §7.4.3 (owner 2026-08-28): there is exactly ONE input box on the whole
   * board, so the tools that need a sentence no longer open a completion
   * dialog of their own — they write their template straight in here with its
   * 【】 placeholders intact. Passing that template back tells the box which
   * brackets are the tool's, so it can say "you still have one to fill in" on
   * its own short grey line instead of a second window, and never mistake the
   * user's own 【】 punctuation for an unfinished placeholder.
   */
  instructionTemplate?: string;
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
  /**
   * The live, UNCOMMITTED text of the box, reported on every keystroke.
   *
   * P5 review C7: the prompt only reaches the document on blur, so anything
   * that reads `node.prompt` while the box is focused reads a stale value. The
   * reverse-prompt lane did exactly that: type during the 10-30 s vision call
   * without clicking away and its "the box is empty, just fill it" branch
   * overwrote what you were writing. This is how the panel sees the box as it
   * actually is.
   */
  onDraftChange?: (prompt: string) => void;
  /** Absent on the editor surface, which carries no reference row. */
  onAddReference?: (anchor: HTMLElement) => void;
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

/**
 * What a board-filling editor is handed, and nothing more.
 *
 * The panel supplies the card projection and the popover routes; the editor
 * owns the placeholder, the status line, the submit gate and the submit itself,
 * because only it knows whether its frame or its marks are ready. Naming the
 * split once here keeps the three editors from drifting apart.
 */
export type InfiniteCanvasEditorGeneratorProps = Omit<
  InfiniteCanvasGeneratorProps,
  | 'canSubmit'
  | 'instructionTemplate'
  | 'note'
  | 'noteReason'
  | 'onAddReference'
  | 'onCommitPrompt'
  | 'onDraftChange'
  | 'onRemoveReference'
  | 'onSubmit'
  | 'placeholder'
  | 'placement'
  | 'references'
  | 'resolvePreviewUrl'
  | 'surface'
>;

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

/**
 * The chosen style, as a small square (§7.5).
 *
 * Same two-state rule the style picker's grid follows: a preset with a sample
 * picture shows it, and a preset without one (156 of the 317 ship none, and
 * never will) shows the deterministic colour block instead — same square, same
 * radius, so both states are finished rather than one being an empty frame.
 * A thumbnail that fails to load falls back to the block too, because the
 * browser's broken-image glyph is not a design.
 *
 * The path is a plain `public/` URL with a leading slash. These files are NOT
 * routed through the workspace media resolver or `convertFileSrc`: those exist
 * for workspace files, and mixing the two schemes is a mistake this project has
 * already paid for.
 */
const GeneratorStyleTile: React.FC<{
  presetId: string;
  name: string;
  thumbnailRef?: string;
}> = ({ presetId, name, thumbnailRef }) => {
  const [failed, setFailed] = React.useState(false);
  const swatch = React.useMemo(
    () => infiniteCanvasStyleSwatch(presetId, name),
    [presetId, name],
  );
  React.useEffect(() => { setFailed(false); }, [thumbnailRef]);
  const source = thumbnailRef
    ? (thumbnailRef.startsWith('/') ? thumbnailRef : `/${thumbnailRef}`)
    : undefined;

  if (source && !failed) {
    return (
      <img
        className="infinite-canvas-generator__style-tile"
        data-canvas-generator-style-thumbnail="true"
        src={source}
        alt=""
        aria-hidden="true"
        loading="lazy"
        decoding="async"
        draggable={false}
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <span
      className="infinite-canvas-generator__style-tile"
      style={{ '--swatch-hue': swatch.hue } as React.CSSProperties}
      data-canvas-generator-style-swatch="true"
      aria-hidden="true"
    >
      {swatch.label}
    </span>
  );
};

GeneratorStyleTile.displayName = 'InfiniteCanvasGeneratorStyleTile';

export const InfiniteCanvasGenerator: React.FC<InfiniteCanvasGeneratorProps> = ({
  target,
  surface = 'card',
  placeholder,
  note,
  noteReason,
  canSubmit = true,
  instructionTemplate,
  placement,
  references,
  resolvePreviewUrl,
  onSubmit,
  onCommitPrompt,
  onDraftChange,
  onAddReference,
  onRemoveReference,
  onOpenParams,
  onOpenModel,
  onOpenStyle,
}) => {
  const { t } = useI18n('components');
  const [draft, setDraft] = React.useState(instructionTemplate ?? target.prompt);
  const targetNodeId = target.nodeId;
  const targetPrompt = target.prompt;

  // Selecting another card adopts that card's prompt; the generator is a view
  // of the card it is attached to, not a second place a prompt could hide. A
  // blank generation card therefore opens with an empty field.
  // The reporter is read through a ref so a caller that passes an inline
  // arrow (the panel does) cannot re-run this effect on every render.
  const reportDraft = React.useRef(onDraftChange);
  reportDraft.current = onDraftChange;

  React.useEffect(() => {
    setDraft(targetPrompt);
    reportDraft.current?.(targetPrompt);
  }, [targetNodeId, targetPrompt]);

  /**
   * Adversarial review C3: a prefilled tool instruction is a DRAFT, never the
   * card's prompt.
   *
   * It used to be written into the document the moment the tool was pressed,
   * so pressing a tool destroyed whatever the user had written — Escape did
   * not bring it back, and a later plain send spent money generating the
   * template itself. The template now lives here, as the controlled initial
   * value of the box, and withdrawing the intent puts the card's own prompt
   * straight back. Nothing about it is ever persisted.
   *
   * The ref starts empty so a box that mounts with a template already set
   * (pressing a tool on a card that was not selected) adopts it too, and it
   * runs after the effect above so the card's prompt cannot clobber it.
   */
  const appliedTemplate = React.useRef<string | undefined>(undefined);
  React.useEffect(() => {
    if (appliedTemplate.current === instructionTemplate) return;
    appliedTemplate.current = instructionTemplate;
    const next = instructionTemplate ?? targetPrompt;
    setDraft(next);
    reportDraft.current?.(next);
  }, [instructionTemplate, targetPrompt]);

  const pending = target.pending;
  /**
   * §7.4.3: a prefilled tool instruction is the one thing this box refuses to
   * send as it stands, and it says so on its own grey line — the rule the
   * deleted dialog carried, moved here rather than dropped. Nothing else may
   * grey out the send button silently: a reason always travels with it.
   */
  const instructionBlock = instructionTemplate
    ? instructionBlockReason(draft, instructionTemplate)
    : undefined;
  const shownNote = note ?? (
    instructionBlock ? t(`infiniteCanvas.tools.blocked.${instructionBlock}`) : undefined
  );
  const shownNoteReason = noteReason ?? instructionBlock;
  const blocked = pending || !canSubmit || Boolean(instructionBlock);
  const submit = React.useCallback(() => {
    if (blocked) return;
    onSubmit(draft);
  }, [blocked, draft, onSubmit]);

  return (
    <div
      className={`infinite-canvas-generator${
        surface === 'editor' ? ' infinite-canvas-generator--editor' : ''
      }`}
      data-canvas-generator="root"
      data-canvas-generator-surface={surface}
      data-canvas-generator-prompt="open"
      data-canvas-generator-instruction={instructionTemplate ? 'true' : undefined}
      data-canvas-generator-target={targetNodeId}
      // Until the card has been measured the stylesheet's own placement keeps
      // the input on screen; once it is measured, the inline box wins.
      data-canvas-generator-anchored={placement ? 'true' : undefined}
      data-canvas-generator-measured={placement?.measured ? 'true' : undefined}
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
      {/*
        The editor surface carries no reference row: its edit target is the
        picture already open in it, and `confirmMask` deliberately forwards no
        other references — an "add reference" button there would be a control
        that quietly does nothing.
      */}
      {surface === 'card' ? (
      <div className="infinite-canvas-generator__references">
        {onOpenStyle ? (
          // §6's leftmost "reference / character" entry. Ours is the style
          // preset catalogue: the one look-and-character library we have.
          // §7.5 (owner 2026-08-28): once a style is chosen this entry SHOWS
          // it — a small square picture plus the name — rather than staying a
          // generic dot that says nothing about what was picked.
          <button
            type="button"
            className={`infinite-canvas-generator__icon-button${
              target.stylePresetName ? ' infinite-canvas-generator__style--picked' : ''
            }`}
            data-canvas-generator-action="style"
            data-has-style={target.stylePresetName ? 'true' : undefined}
            aria-label={target.stylePresetName ?? t('infiniteCanvas.generator.style')}
            title={target.stylePresetName ?? t('infiniteCanvas.generator.style')}
            onClick={event => onOpenStyle(event.currentTarget)}
          >
            {target.stylePresetName ? (
              <>
                <GeneratorStyleTile
                  presetId={target.stylePresetId ?? target.stylePresetName}
                  name={target.stylePresetName}
                  thumbnailRef={target.styleThumbnailRef}
                />
                <span className="infinite-canvas-generator__style-name">
                  {target.stylePresetName}
                </span>
              </>
            ) : (
              <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                <circle cx="8" cy="8" r="5.6" fill="none" stroke="currentColor" strokeWidth="1.2" />
                <circle cx="8" cy="8" r="1.9" fill="currentColor" />
              </svg>
            )}
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
        {onAddReference ? (
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
        ) : null}
      </div>
      ) : null}
      {shownNote ? (
        <p
          className="infinite-canvas-generator__note"
          data-canvas-generator-note="true"
          data-blocked-reason={shownNoteReason}
        >
          {shownNote}
        </p>
      ) : null}
      <textarea
        className="infinite-canvas-generator__prompt nodrag"
        data-canvas-generator-field="prompt"
        aria-label={placeholder ?? t('infiniteCanvas.generator.label')}
        placeholder={placeholder ?? t('infiniteCanvas.generator.placeholder')}
        value={draft}
        disabled={pending}
        rows={2}
        onChange={event => {
          setDraft(event.target.value);
          onDraftChange?.(event.target.value);
        }}
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
            opens its own popover. Owner feedback 2026-08-27: these are small
            pressable PILLS carrying their real values, separated by the
            faintest of hairlines — not a run of grey words strung on dots. */}
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
        <span className="infinite-canvas-generator__rule" aria-hidden="true" />
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
        <span className="infinite-canvas-generator__rule" aria-hidden="true" />
        <button
          type="button"
          className="infinite-canvas-generator__meta infinite-canvas-generator__meta--count"
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
          disabled={blocked}
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
