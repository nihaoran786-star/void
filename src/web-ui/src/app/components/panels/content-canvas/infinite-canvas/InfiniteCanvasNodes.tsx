/**
 * Custom reactflow node renderers for the Infinite Canvas panel.
 *
 * Nodes are pure projections: every edit is reported back to the panel via
 * callbacks carried in the node data, and the panel routes it through the
 * infinite-canvas DocumentService. Nodes never persist anything themselves.
 *
 * Visual language (owner reference boards, `docs/design/
 * infinite-canvas-visual-language.md`): a card IS its media. The frame has no
 * padding, no title bar and no file name; the type label sits OUTSIDE the card
 * above it as small grey text; every control is absent until the card is
 * hovered or selected. The prompt editor and the generate button are gone from
 * the card face entirely: they live in the generator that floats under the
 * selected card (§6).
 */
import React from 'react';
import { Handle, Position } from '@xyflow/react';
import {
  AlertTriangle,
  Brush,
  Download,
  Eraser,
  Expand,
  Image as ImageIcon,
  Maximize2,
  MoreHorizontal,
  Palette,
  Play,
  Plus,
  RefreshCw,
  Scaling,
  Scissors,
  SlidersHorizontal,
  Type,
} from 'lucide-react';

import { useI18n } from '@/infrastructure/i18n';
import type {
  CanvasImageOperationKind,
  ImageToolErrorKind,
  ImageToolId,
  InfiniteCanvasGenerationParams,
} from '@/shared/services/infinite-canvas';
import { IMAGE_TOOL_DEFINITIONS } from '@/shared/services/infinite-canvas';
import { InfiniteCanvasVideoCard } from './InfiniteCanvasVideoCard';

export interface InfiniteCanvasMediaRef {
  workspacePath: string;
  relativePath: string;
}

export type InfiniteCanvasImagePreviewResolver = (
  mediaRef: InfiniteCanvasMediaRef,
  mediaKind?: 'image' | 'video',
) => Promise<string | undefined>;

export interface InfiniteCanvasTextNodeData extends Record<string, unknown> {
  text: string;
  onCommitText: (nodeId: string, text: string) => void;
}

export interface InfiniteCanvasImageNodeGeneration {
  operationId: string;
  toolId: CanvasImageOperationKind;
  resultMode: 'self' | 'derived';
  status: 'pending' | 'failed';
  errorKind?: ImageToolErrorKind;
}

export interface InfiniteCanvasImageNodeDerivation {
  sourceNodeId: string;
  toolId: CanvasImageOperationKind;
  operationId: string;
}

/**
 * Shared media-card data: everything the video card needs. The image card
 * extends it with the five-tool and style-preset surface (P3 keeps the video
 * card intentionally minimal: prompt + generate + pending/failed states).
 */
export interface InfiniteCanvasMediaNodeData extends Record<string, unknown> {
  /** Absent on blank generation cards and derived placeholders. */
  mediaRef?: InfiniteCanvasMediaRef;
  prompt?: string;
  generation?: InfiniteCanvasImageNodeGeneration;
  derivedFrom?: InfiniteCanvasImageNodeDerivation;
  /** Ordered reference badges (edge creation order), e.g. tu-yi/tu-er labels. */
  referenceLabels?: readonly string[];
  resolvePreviewUrl: InfiniteCanvasImagePreviewResolver;
  /**
   * §6: the prompt and the dispatch live in the bottom generator now. These
   * two stay on the node data because the panel's projection is one shape and
   * the generator reads the card's prompt through it; the card face itself no
   * longer renders either.
   */
  onCommitPrompt: (nodeId: string, prompt: string) => void;
  onGenerate: (nodeId: string) => void;
  onRetryGeneration: (nodeId: string) => void;
  onRemoveFailedGeneration: (nodeId: string) => void;
  /** P4 W1: opens the full-screen viewer on this card's media. */
  onOpenViewer?: (nodeId: string) => void;
  /** P4 W3: the card's generation parameters, as stored on the node. */
  generationParams?: InfiniteCanvasGenerationParams;
  /** P4 W3: collapsed summary of the card's generation parameters. */
  generationParamsSummary?: string;
  /**
   * P4 W3: opens the generation parameter popover for this card. The
   * triggering button is handed over so the popover can anchor to it
   * (owner feedback 2026-08-26: no more full-page popovers).
   */
  onOpenParams?: (nodeId: string, anchor?: HTMLElement) => void;
  /** §3: the small `+` off the card's right edge — derive the next card. */
  onSpawnNext?: (nodeId: string) => void;
  /** §4 output group: save a copy of this card's media. */
  onSaveMediaAs?: (nodeId: string) => void;
  /** §4 overflow: opens the card's existing right-click menu at the icon. */
  onOpenMore?: (nodeId: string, at: { clientX: number; clientY: number }) => void;
}

export interface InfiniteCanvasImageNodeData extends InfiniteCanvasMediaNodeData {
  /** Resolved display name of the applied style preset, if any. */
  stylePresetName?: string;
  onOpenStylePicker: (nodeId: string, anchor?: HTMLElement) => void;
  /** Opens the instruction-completion dialog for one of the five tools. */
  onRunImageTool: (nodeId: string, toolId: ImageToolId) => void;
  /** P3: derives a blank video card wired to this image (image-to-video). */
  onDeriveVideoCard?: (nodeId: string) => void;
}

export type InfiniteCanvasVideoNodeData = InfiniteCanvasMediaNodeData;

interface NodeRendererProps<TData> {
  id: string;
  data: TData;
  selected?: boolean;
}

/** §4: one icon per contract tool; the label stays on title / aria-label. */
const IMAGE_TOOL_ICONS: Partial<Record<string, React.ReactNode>> = {
  upscale: <Scaling size={14} aria-hidden="true" />,
  expand: <Expand size={14} aria-hidden="true" />,
  inpaint: <Brush size={14} aria-hidden="true" />,
  erase: <Eraser size={14} aria-hidden="true" />,
  matting: <Scissors size={14} aria-hidden="true" />,
};

/**
 * §2: the grey line above the card. `Reference` is a card that carries media
 * nobody generated here (picked from the library, pasted); everything else on
 * the generation lane reads as an Image / Video Generation card.
 */
function cardLabelKey(
  mediaKind: 'image' | 'video',
  data: InfiniteCanvasMediaNodeData,
): string {
  // A five-tool derivative names its tool: that is what the old blue
  // "derived" pill said, said now in the same grey line as everything else.
  const derivedTool = data.derivedFrom?.toolId;
  if (derivedTool && derivedTool !== 'generate') return `infiniteCanvas.tools.${derivedTool}`;
  if (mediaKind === 'video') return 'infiniteCanvas.cardLabel.video';
  const generated = Boolean(data.generation || data.derivedFrom || data.prompt);
  return generated
    ? 'infiniteCanvas.cardLabel.image'
    : 'infiniteCanvas.cardLabel.reference';
}

/**
 * The label strip that floats above the card: icon, one grey line, the
 * reference-order marks, and a small accent dot once the card holds a
 * finished result. No background, no pill — §2.
 */
const NodeLabel: React.FC<{
  labelKey: string;
  icon: React.ReactNode;
  referenceLabels?: readonly string[];
  done?: boolean;
}> = ({ labelKey, icon, referenceLabels, done }) => {
  const { t } = useI18n('components');
  return (
    <div className="infinite-canvas-node__label">
      <span className="infinite-canvas-node__label-icon" aria-hidden="true">{icon}</span>
      <span className="infinite-canvas-node__label-text">{t(labelKey)}</span>
      {(referenceLabels ?? []).length > 0 ? (
        <span
          className="infinite-canvas-node__reference-badges"
          role="group"
          aria-label={t('infiniteCanvas.generation.referencesLabel')}
        >
          {(referenceLabels ?? []).map((label, index) => (
            <span
              key={`${index}-${label}`}
              className="infinite-canvas-node__badge infinite-canvas-node__badge--reference"
              data-reference-order={index + 1}
            >
              {label}
            </span>
          ))}
        </span>
      ) : null}
      {done ? (
        <span
          className="infinite-canvas-node__label-done"
          role="img"
          aria-label={t('infiniteCanvas.status.ready')}
        />
      ) : null}
    </div>
  );
};

NodeLabel.displayName = 'InfiniteCanvasNodeLabel';

export const InfiniteCanvasTextNode: React.FC<
  NodeRendererProps<InfiniteCanvasTextNodeData>
> = ({ id, data, selected }) => {
  const { t } = useI18n('components');
  const [draft, setDraft] = React.useState(data.text);

  React.useEffect(() => {
    setDraft(data.text);
  }, [data.text]);

  return (
    <div
      className="infinite-canvas-node infinite-canvas-node--text"
      data-selected={selected ? 'true' : undefined}
    >
      <Handle type="target" position={Position.Left} />
      <NodeLabel
        labelKey="infiniteCanvas.cardLabel.text"
        icon={<Type size={12} aria-hidden="true" />}
      />
      {/* §2 text card: a dark panel holding nothing but the words. */}
      <div className="infinite-canvas-node__frame">
        <textarea
          className="infinite-canvas-node__text-input nodrag"
          aria-label={t('infiniteCanvas.textNode.ariaLabel')}
          placeholder={t('infiniteCanvas.textNode.placeholder')}
          value={draft}
          onChange={event => setDraft(event.target.value)}
          onBlur={() => {
            if (draft !== data.text) data.onCommitText(id, draft);
          }}
        />
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
};

InfiniteCanvasTextNode.displayName = 'InfiniteCanvasTextNode';

function fileNameOf(relativePath: string): string {
  return relativePath.split(/[\\/]/).pop() || relativePath;
}

const NodeMedia: React.FC<{
  mediaRef: InfiniteCanvasMediaRef;
  mediaKind: 'image' | 'video';
  resolvePreviewUrl: InfiniteCanvasImagePreviewResolver;
}> = ({ mediaRef, mediaKind, resolvePreviewUrl }) => {
  const { t } = useI18n('components');
  const [previewUrl, setPreviewUrl] = React.useState<string | undefined>(undefined);
  const [failed, setFailed] = React.useState(false);
  // §6: a single click selects the card (and floats its generator); it must
  // never enlarge. Full screen is the toolbar's expand entry or a double
  // click on the card, both handled by the card body — so the media itself
  // carries no click surface of its own.

  React.useEffect(() => {
    let cancelled = false;
    setPreviewUrl(undefined);
    setFailed(false);
    void resolvePreviewUrl(mediaRef, mediaKind).then(url => {
      if (cancelled) return;
      if (url) {
        setPreviewUrl(url);
      } else {
        setFailed(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [mediaKind, mediaRef, resolvePreviewUrl]);

  // A resolved URL that fails to load (deleted file, revoked asset scope)
  // falls back to the previewUnavailable state instead of a broken icon.
  const onMediaError = React.useCallback(() => {
    setPreviewUrl(undefined);
    setFailed(true);
  }, []);

  if (previewUrl) {
    if (mediaKind === 'video') {
      // §5: the browser's control chrome is replaced by the inline transport
      // bar, which only appears on hover.
      return (
        <InfiniteCanvasVideoCard
          src={previewUrl}
          label={fileNameOf(mediaRef.relativePath)}
          onError={onMediaError}
        />
      );
    }
    return (
      <img
        className="infinite-canvas-node__image"
        src={previewUrl}
        alt={fileNameOf(mediaRef.relativePath)}
        draggable={false}
        onError={onMediaError}
      />
    );
  }
  // §2: no words on the card face — a static icon carries the state, and the
  // wording stays available to assistive tech through the label.
  return (
    <div
      className="infinite-canvas-node__image-placeholder"
      data-state={failed ? 'unavailable' : 'loading'}
      role="img"
      aria-label={failed
        ? t(mediaKind === 'video'
          ? 'infiniteCanvas.video.previewUnavailable'
          : 'infiniteCanvas.imageNode.previewUnavailable')
        : t(mediaKind === 'video'
          ? 'infiniteCanvas.video.previewLoading'
          : 'infiniteCanvas.imageNode.previewLoading')}
    >
      {mediaKind === 'video'
        ? <Play size={22} aria-hidden="true" />
        : <ImageIcon size={22} aria-hidden="true" />}
    </div>
  );
};

NodeMedia.displayName = 'InfiniteCanvasNodeMedia';

/**
 * Shared image/video card body. The frame is the media (or its placeholder);
 * everything else lives in the label above it or in the hover layer below it.
 */
const InfiniteCanvasMediaCard: React.FC<
  NodeRendererProps<InfiniteCanvasImageNodeData | InfiniteCanvasVideoNodeData>
  & { mediaKind: 'image' | 'video' }
> = ({ id, data, selected, mediaKind }) => {
  const { t } = useI18n('components');
  const { mediaRef, generation } = data;
  const imageData = mediaKind === 'image' ? data as InfiniteCanvasImageNodeData : undefined;
  const pending = generation?.status === 'pending';
  const failed = generation?.status === 'failed';
  const referenceLabels = data.referenceLabels ?? [];

  return (
    <div
      className={`infinite-canvas-node infinite-canvas-node--${mediaKind}`}
      data-selected={selected ? 'true' : undefined}
      data-generation-status={generation?.status}
      // §6: clicking a card only selects it. Enlarging is explicit — this
      // double click, or the expand entry in the toolbar above.
      onDoubleClick={mediaRef && data.onOpenViewer
        ? () => data.onOpenViewer?.(id)
        : undefined}
    >
      <Handle type="target" position={Position.Left} />
      <NodeLabel
        labelKey={cardLabelKey(mediaKind, data)}
        icon={mediaKind === 'video'
          ? <Play size={12} aria-hidden="true" />
          : <ImageIcon size={12} aria-hidden="true" />}
        referenceLabels={referenceLabels}
        done={Boolean(mediaRef) && !pending && !failed}
      />
      <div className="infinite-canvas-node__frame">
        {mediaRef ? (
          <NodeMedia
            mediaRef={mediaRef}
            mediaKind={mediaKind}
            resolvePreviewUrl={data.resolvePreviewUrl}
          />
        ) : failed ? (
          <div
            className="infinite-canvas-node__generation-failed nodrag"
            role="alert"
            data-error-kind={generation?.errorKind ?? 'backend'}
          >
            <AlertTriangle size={18} aria-hidden="true" />
            <strong>{t('infiniteCanvas.generation.failedTitle')}</strong>
            <span>
              {t(`infiniteCanvas.generation.errorKind.${generation?.errorKind ?? 'backend'}`)}
            </span>
            <span className="infinite-canvas-node__generation-failed-actions">
              <button
                type="button"
                className="infinite-canvas-node__generation-retry"
                onClick={() => data.onRetryGeneration(id)}
              >
                {t('infiniteCanvas.generation.retry')}
              </button>
              <button
                type="button"
                className="infinite-canvas-node__generation-remove"
                onClick={() => data.onRemoveFailedGeneration(id)}
              >
                {t('infiniteCanvas.generation.remove')}
              </button>
            </span>
          </div>
        ) : (
          // §2 blank / generating: the same dark rounded rectangle with a
          // static icon; generating only adds one restrained progress line.
          <div
            className="infinite-canvas-node__generation-placeholder"
            data-state={pending ? 'pending' : 'blank'}
            role={pending ? 'status' : 'img'}
            aria-label={pending
              ? t(mediaKind === 'video'
                ? 'infiniteCanvas.video.pending'
                : 'infiniteCanvas.generation.pending')
              : t(mediaKind === 'video'
                ? 'infiniteCanvas.video.blankHint'
                : 'infiniteCanvas.generation.blankHint')}
          >
            {mediaKind === 'video'
              ? <Play size={22} aria-hidden="true" />
              : <ImageIcon size={22} aria-hidden="true" />}
            {pending ? (
              <span className="infinite-canvas-node__progress" aria-hidden="true" />
            ) : null}
          </div>
        )}
      </div>
      {/*
        §3: the small `+` off the right edge derives the next card. Dim at
        rest, bright on hover — the card itself stays undecorated. §6 adds the
        drag gesture: dragging off this edge onto empty board creates a blank
        card wired to this one; that drag is reactflow's connection drag on the
        source handle below, so the click and the drag share one edge.
      */}
      {data.onSpawnNext ? (
        <button
          type="button"
          className="infinite-canvas-node__spawn nodrag"
          data-node-action="spawn-next"
          aria-label={t('infiniteCanvas.handles.spawnNext')}
          title={t('infiniteCanvas.handles.spawnNext')}
          onClick={() => data.onSpawnNext?.(id)}
        >
          <Plus size={12} aria-hidden="true" />
        </button>
      ) : null}
      {/*
        §4: the dark pill toolbar. Icon-only, grouped by hairline dividers
        (edit / organise / output), absent until the card is hovered or
        selected, and it takes no layout space. Entries that cannot act on
        this card are hidden rather than greyed out (§7's rule).
      */}
      <div
        className="infinite-canvas-node__toolbar nodrag"
        role="toolbar"
        aria-label={t('infiniteCanvas.imageNode.toolsLabel')}
      >
        {imageData && mediaRef ? (
          <>
            <span className="infinite-canvas-node__tools">
              {IMAGE_TOOL_DEFINITIONS.map(definition => (
                <button
                  key={definition.toolId}
                  type="button"
                  className="infinite-canvas-node__tool"
                  data-tool-id={definition.toolId}
                  aria-label={t(definition.labelKey)}
                  title={t(definition.labelKey)}
                  onClick={() => imageData.onRunImageTool(id, definition.toolId)}
                >
                  {IMAGE_TOOL_ICONS[definition.toolId] ?? <Brush size={14} aria-hidden="true" />}
                </button>
              ))}
            </span>
            <span className="infinite-canvas-node__toolbar-divider" aria-hidden="true" />
          </>
        ) : null}
        {imageData ? (
          <button
            type="button"
            className="infinite-canvas-node__style-button"
            data-has-style={imageData.stylePresetName ? 'true' : undefined}
            aria-label={imageData.stylePresetName ?? t('infiniteCanvas.imageNode.styleButton')}
            title={imageData.stylePresetName ?? t('infiniteCanvas.imageNode.styleButton')}
            onClick={event => imageData.onOpenStylePicker(id, event.currentTarget)}
          >
            <Palette size={14} aria-hidden="true" />
          </button>
        ) : null}
        {data.onOpenParams ? (
          <button
            type="button"
            className="infinite-canvas-node__params-button"
            data-node-action="open-params"
            data-has-params={data.generationParamsSummary ? 'true' : undefined}
            aria-label={data.generationParamsSummary || t('infiniteCanvas.params.button')}
            title={data.generationParamsSummary || t('infiniteCanvas.params.button')}
            onClick={event => data.onOpenParams?.(id, event.currentTarget)}
          >
            <SlidersHorizontal size={14} aria-hidden="true" />
          </button>
        ) : null}
        {imageData?.onDeriveVideoCard && mediaRef ? (
          // Not one of the five contract tools: image-to-video derives a
          // blank video card, so it keeps its own class and no tool id.
          <button
            type="button"
            className="infinite-canvas-node__derive-video"
            aria-label={t('infiniteCanvas.video.deriveFromImage')}
            title={t('infiniteCanvas.video.deriveFromImage')}
            onClick={() => imageData.onDeriveVideoCard?.(id)}
          >
            <Play size={14} aria-hidden="true" />
          </button>
        ) : null}
        <span className="infinite-canvas-node__toolbar-divider" aria-hidden="true" />
        <button
          type="button"
          className="infinite-canvas-node__toolbar-button"
          data-node-action="regenerate"
          disabled={pending}
          aria-label={mediaRef
            ? t('infiniteCanvas.generation.regenerate')
            : t('infiniteCanvas.generation.generate')}
          title={mediaRef
            ? t('infiniteCanvas.generation.regenerate')
            : t('infiniteCanvas.generation.generate')}
          onClick={() => data.onGenerate(id)}
        >
          <RefreshCw size={14} aria-hidden="true" />
        </button>
        {mediaRef && data.onSaveMediaAs ? (
          <button
            type="button"
            className="infinite-canvas-node__toolbar-button"
            data-node-action="save-as"
            aria-label={t('infiniteCanvas.viewer.saveAs')}
            title={t('infiniteCanvas.viewer.saveAs')}
            onClick={() => data.onSaveMediaAs?.(id)}
          >
            <Download size={14} aria-hidden="true" />
          </button>
        ) : null}
        {mediaRef && data.onOpenViewer ? (
          // The video element owns its own click surface, so both kinds
          // reach the full-screen viewer through this explicit entry.
          <button
            type="button"
            className="infinite-canvas-node__toolbar-button"
            data-node-action="open-viewer-entry"
            aria-label={t('infiniteCanvas.viewer.open')}
            title={t('infiniteCanvas.viewer.open')}
            onClick={() => data.onOpenViewer?.(id)}
          >
            <Maximize2 size={14} aria-hidden="true" />
          </button>
        ) : null}
        {data.onOpenMore ? (
          <button
            type="button"
            className="infinite-canvas-node__toolbar-button"
            data-node-action="more"
            aria-label={t('infiniteCanvas.menu.more')}
            title={t('infiniteCanvas.menu.more')}
            onClick={event => data.onOpenMore?.(id, {
              clientX: event.clientX,
              clientY: event.clientY,
            })}
          >
            <MoreHorizontal size={14} aria-hidden="true" />
          </button>
        ) : null}
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
};

InfiniteCanvasMediaCard.displayName = 'InfiniteCanvasMediaCard';

export const InfiniteCanvasImageNode: React.FC<
  NodeRendererProps<InfiniteCanvasImageNodeData>
> = props => <InfiniteCanvasMediaCard {...props} mediaKind="image" />;

InfiniteCanvasImageNode.displayName = 'InfiniteCanvasImageNode';

/** P3 video card: shared card body with a `<video>` media element. */
export const InfiniteCanvasVideoNode: React.FC<
  NodeRendererProps<InfiniteCanvasVideoNodeData>
> = props => <InfiniteCanvasMediaCard {...props} mediaKind="video" />;

InfiniteCanvasVideoNode.displayName = 'InfiniteCanvasVideoNode';
