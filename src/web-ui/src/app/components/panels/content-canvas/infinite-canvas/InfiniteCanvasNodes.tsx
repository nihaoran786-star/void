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
  ChevronLeft,
  ChevronRight,
  CornerUpLeft,
  Crop,
  Download,
  Eraser,
  Image as ImageIcon,
  ImageUpscale,
  Maximize2,
  MoreHorizontal,
  Palette,
  Play,
  Plus,
  RefreshCw,
  Scissors,
  SlidersHorizontal,
  Type,
} from 'lucide-react';

import { useI18n } from '@/infrastructure/i18n';
import type {
  CanvasImageOperationKind,
  ImageToolErrorKind,
  ImageToolId,
  InfiniteCanvasDomainRef,
  InfiniteCanvasGenerationParams,
  InfiniteCanvasImagePreviewResolver,
  InfiniteCanvasMediaRef,
} from '@/shared/services/infinite-canvas';
import { IMAGE_TOOL_DEFINITIONS } from '@/shared/services/infinite-canvas';
import { useInfiniteCanvasDomainOrigin } from './infiniteCanvasDomainOrigins';
import { infiniteCanvasWillAutoFile } from './infiniteCanvasPanelModel';
import { InfiniteCanvasVideoCard } from './InfiniteCanvasVideoCard';

/**
 * Both types are defined once, in `shared/services/infinite-canvas`, and only
 * re-exported here. They used to be declared in this file, which meant a pure
 * helper module had to import a React component file to name a media
 * reference. The re-export keeps every existing `from './InfiniteCanvasNodes'`
 * import working unchanged.
 */
export type {
  InfiniteCanvasImagePreviewResolver,
  InfiniteCanvasMediaRef,
} from '@/shared/services/infinite-canvas';

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
  /**
   * §7.6: every picture this card carries, oldest first. A card that only ever
   * produced one picture projects a list of one, and the count badge and the
   * gallery both stay away.
   */
  mediaVariants?: readonly InfiniteCanvasMediaRef[];
  /** §7.6: index into {@link mediaVariants} of the picture on the card face. */
  activeVariantIndex?: number;
  /** §7.6: makes one of the card's pictures the current one (undoable). */
  onSelectVariant?: (nodeId: string, index: number) => void;
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
  /**
   * §4 overflow: opens the "more (…)" drawer anchored to the icon. The panel
   * owns the drawer, because the surface has to be placed in PANEL
   * coordinates and this card lives inside reactflow's transformed pane.
   */
  onOpenOverflow?: (nodeId: string, anchor: HTMLElement) => void;
  /**
   * K3: which short-drama asset this card belongs to. Read-only on the card —
   * the badge cannot be edited or dismissed, and deleting the card is the only
   * way to undo the belonging.
   */
  domainRef?: InfiniteCanvasDomainRef;
  /**
   * C1: the last press on this card could not resolve its asset's coordinates,
   * so whatever it produces will stay on the board. Set by the panel after the
   * fact; the batch-size half of the same story the card works out itself.
   */
  domainManualReturn?: boolean;
  /**
   * K3 §5.2: "send back to short drama". Present only on a card that belongs
   * to an asset; the panel supplies it, the card only presses it.
   */
  onSendToShortDrama?: (nodeId: string) => void;
  /** The press is in flight. One at a time, so a double press cannot double-write. */
  sendToShortDramaBusy?: boolean;
}

export interface InfiniteCanvasImageNodeData extends InfiniteCanvasMediaNodeData {
  /** Resolved display name of the applied style preset, if any. */
  stylePresetName?: string;
  /**
   * §7.5: the applied preset's sample picture, as a `public/` relative path.
   * Absent for the 156 presets that ship no upstream image; those fall back to
   * the deterministic swatch, which is a finished tile too.
   */
  styleThumbnailRef?: string;
  onOpenStylePicker: (nodeId: string, anchor?: HTMLElement) => void;
  /**
   * Opens the surface for one of the five tools. Which surface is the panel's
   * call: `inpaint` and `erase` open the P5 mask editor, the other three keep
   * the placeholder-completion instruction dialog.
   */
  onRunImageTool: (nodeId: string, toolId: ImageToolId) => void;
  /**
   * P5 W2: opens the crop editor. Visual language §4 puts crop FIRST in the
   * toolbar; it was missing until P5 only because nothing could write image
   * bytes to disk. Absent on cards without a picture.
   */
  onCropImage?: (nodeId: string) => void;
}

export type InfiniteCanvasVideoNodeData = InfiniteCanvasMediaNodeData;

interface NodeRendererProps<TData> {
  id: string;
  data: TData;
  selected?: boolean;
}

/**
 * §4: one icon per contract tool; the label stays on title / aria-label.
 *
 * `upscale` used to wear lucide's `Scaling`, a plain resize box that said
 * nothing about resolution; `ImageUpscale` is the glyph for exactly this.
 * `expand` has no entry because outpainting is not on the pill any more — it
 * sits in the overflow drawer, with its own icon.
 */
const IMAGE_TOOL_ICONS: Partial<Record<string, React.ReactNode>> = {
  upscale: <ImageUpscale size={14} aria-hidden="true" />,
  inpaint: <Brush size={14} aria-hidden="true" />,
  erase: <Eraser size={14} aria-hidden="true" />,
  matting: <Scissors size={14} aria-hidden="true" />,
};

/**
 * §4 caps the pill at "about ten" icons, and the toolbar had reached
 * thirteen. The edit group keeps the four contract tools the owner reaches
 * for constantly (retouch, erase, enlarge, cut out); outpainting is the one
 * that is neither frequent nor named in §4's action mapping, so it moved into
 * the overflow drawer. The five-tool contract itself is untouched — this is
 * only which of them the pill shows first.
 */
const PILL_TOOL_IDS: readonly string[] = ['upscale', 'inpaint', 'erase', 'matting'];

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
 * K3 §5.1.8: "from short drama · Character CHAR-001".
 *
 * It rides in the label strip ABOVE the card rather than as a corner pill over
 * the picture, because the visual language is explicit that the card face
 * carries no decoration (§2) and that marks of this kind stay grey and stay at
 * the same level as the type label (§2, §3.2 reference marks). A badge sitting
 * on the picture would be the one thing the whole board is designed not to do.
 *
 * Read-only, always: there is no way to edit the belonging and no way to click
 * it off. Deleting the card is the only way to undo it.
 */
const NodeDomainBadge: React.FC<{
  domainRef?: InfiniteCanvasDomainRef;
  /**
   * A5 / C1: `'manual'` means the next result will NOT file itself into the
   * asset. The badge has to carry this, because it is the one thing on the
   * card that claims a link to short drama — and a badge that reads the same
   * whether the link is live or not is worse than no badge at all.
   */
  autoFile?: 'auto' | 'manual';
}> = ({ domainRef, autoFile }) => {
  const { t } = useI18n('components');
  const origin = useInfiniteCanvasDomainOrigin(domainRef);
  if (!domainRef || !origin) return null;

  const kind = t(`infiniteCanvas.domainRef.kind.${domainRef.kind}`);
  const origin_ = origin.state === 'dangling'
    ? t('infiniteCanvas.domainRef.labelMissing', { kind })
    : origin.state === 'known' && origin.handle
      ? t('infiniteCanvas.domainRef.label', { kind, handle: origin.handle })
      // Still reading the project, or an asset with no handle yet: say where
      // the card came from without claiming anything about what it is now.
      : t('infiniteCanvas.domainRef.labelPending', { kind });
  // §5.2: a picture that went home is not finished — someone still has to say
  // yes to it. The card says so instead of looking done.
  const reviewing = origin.state === 'known' && origin.status === 'reviewing';
  const label = reviewing
    ? t('infiniteCanvas.domainRef.labelReviewing', { origin: origin_ })
    : origin_;
  // A5 / C1: dimmed, and it says why on hover. Not hidden and not reworded —
  // the card really did come from short drama, and that stays true. What
  // changes is only whether the next picture walks home by itself.
  const manual = autoFile === 'manual';

  return (
    <span
      className="infinite-canvas-node__domain-badge"
      data-testid="infinite-canvas-domain-badge"
      data-domain-state={origin.state}
      data-domain-kind={domainRef.kind}
      data-domain-reviewing={reviewing ? 'true' : undefined}
      data-domain-autofile={autoFile}
      title={manual ? t('infiniteCanvas.domainRef.manualReturn') : undefined}
    >
      {label}
      {manual ? (
        <span className="infinite-canvas-node__domain-badge-manual">
          {t('infiniteCanvas.domainRef.manualReturnMark')}
        </span>
      ) : null}
    </span>
  );
};

NodeDomainBadge.displayName = 'InfiniteCanvasNodeDomainBadge';

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
  domainRef?: InfiniteCanvasDomainRef;
  domainAutoFile?: 'auto' | 'manual';
}> = ({ labelKey, icon, referenceLabels, done, domainRef, domainAutoFile }) => {
  const { t } = useI18n('components');
  return (
    <div className="infinite-canvas-node__label">
      <span className="infinite-canvas-node__label-icon" aria-hidden="true">{icon}</span>
      <span className="infinite-canvas-node__label-text">{t(labelKey)}</span>
      <NodeDomainBadge domainRef={domainRef} autoFile={domainAutoFile} />
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

  /**
   * H3: the effect keys on WHICH FILE this is, not on the object that names
   * it. Keyed on the object, a projection that handed down an equal-but-new
   * `mediaRef` re-ran the effect, and its first line blanks the preview — so
   * scrolling the board turned every picture into a placeholder and then made
   * it re-read, re-base64 and re-decode the same bytes off disk.
   */
  const mediaKey = `${mediaRef.workspacePath}|${mediaRef.relativePath}`;
  // Read inside the effect without being part of its identity: the key above
  // already changes whenever the ref names a different file.
  const mediaRefRef = React.useRef(mediaRef);
  mediaRefRef.current = mediaRef;

  React.useEffect(() => {
    let cancelled = false;
    setPreviewUrl(undefined);
    setFailed(false);
    void resolvePreviewUrl(mediaRefRef.current, mediaKind).then(url => {
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
  }, [mediaKey, mediaKind, resolvePreviewUrl]);

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

/** §7.6: the gallery is a four-up grid; anything beyond that pages. */
const VARIANT_PAGE_SIZE = 4;

/**
 * One tile of the §7.6 gallery. Deliberately thinner than {@link NodeMedia}:
 * a thumbnail is a still picture even for a video card, with no transport bar
 * and no click surface of its own — the tile itself is the button.
 */
const VariantThumb: React.FC<{
  mediaRef: InfiniteCanvasMediaRef;
  mediaKind: 'image' | 'video';
  resolvePreviewUrl: InfiniteCanvasImagePreviewResolver;
}> = ({ mediaRef, mediaKind, resolvePreviewUrl }) => {
  const [previewUrl, setPreviewUrl] = React.useState<string | undefined>(undefined);

  React.useEffect(() => {
    let cancelled = false;
    setPreviewUrl(undefined);
    void resolvePreviewUrl(mediaRef, mediaKind).then(url => {
      if (!cancelled && url) setPreviewUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [mediaKind, mediaRef, resolvePreviewUrl]);

  if (!previewUrl) {
    return (
      <span className="infinite-canvas-node__gallery-placeholder" aria-hidden="true">
        {mediaKind === 'video'
          ? <Play size={16} aria-hidden="true" />
          : <ImageIcon size={16} aria-hidden="true" />}
      </span>
    );
  }
  if (mediaKind === 'video') {
    return (
      <video
        className="infinite-canvas-node__gallery-media"
        src={previewUrl}
        muted
        playsInline
        preload="metadata"
      />
    );
  }
  return (
    <img
      className="infinite-canvas-node__gallery-media"
      src={previewUrl}
      alt=""
      draggable={false}
    />
  );
};

VariantThumb.displayName = 'InfiniteCanvasVariantThumb';

/**
 * §7.6's gallery: the card's pictures, four to a page, the current one marked.
 *
 * It is rendered inside the card rather than as a panel-level popover on
 * purpose. Everything it points at lives in the card's own box, so anchoring
 * it here keeps it correct at every zoom level without a single coordinate
 * conversion — the class of bug §7.1's panel-owned surfaces have to fight.
 */
const NodeVariantGallery: React.FC<{
  variants: readonly InfiniteCanvasMediaRef[];
  activeIndex: number;
  mediaKind: 'image' | 'video';
  resolvePreviewUrl: InfiniteCanvasImagePreviewResolver;
  onSelect: (index: number) => void;
}> = ({ variants, activeIndex, mediaKind, resolvePreviewUrl, onSelect }) => {
  const { t } = useI18n('components');
  const pageCount = Math.max(1, Math.ceil(variants.length / VARIANT_PAGE_SIZE));
  // Opening the gallery should show the picture the card face shows.
  const [page, setPage] = React.useState(() => Math.floor(activeIndex / VARIANT_PAGE_SIZE));
  // A shrinking list (undo of a landing) must not strand the pager past its end.
  const safePage = Math.min(page, pageCount - 1);
  const start = safePage * VARIANT_PAGE_SIZE;
  const shown = variants.slice(start, start + VARIANT_PAGE_SIZE);

  return (
    <div
      className="infinite-canvas-node__gallery nodrag"
      role="group"
      data-canvas-variant-gallery=""
      aria-label={t('infiniteCanvas.variants.galleryLabel')}
    >
      <div className="infinite-canvas-node__gallery-grid">
        {shown.map((variant, offset) => {
          const index = start + offset;
          const current = index === activeIndex;
          return (
            <button
              key={`${variant.workspacePath}/${variant.relativePath}`}
              type="button"
              className="infinite-canvas-node__gallery-tile"
              data-canvas-variant-index={index}
              data-current={current ? 'true' : undefined}
              aria-current={current ? 'true' : undefined}
              aria-label={current
                ? t('infiniteCanvas.variants.current')
                : t('infiniteCanvas.variants.select')}
              title={t('infiniteCanvas.variants.thumbnail', { index: index + 1 })}
              onClick={() => onSelect(index)}
            >
              <VariantThumb
                mediaRef={variant}
                mediaKind={mediaKind}
                resolvePreviewUrl={resolvePreviewUrl}
              />
            </button>
          );
        })}
      </div>
      {pageCount > 1 ? (
        <div className="infinite-canvas-node__gallery-pager">
          <button
            type="button"
            className="infinite-canvas-node__gallery-page"
            data-canvas-variant-page="previous"
            disabled={safePage === 0}
            aria-label={t('infiniteCanvas.variants.previousPage')}
            title={t('infiniteCanvas.variants.previousPage')}
            onClick={() => setPage(Math.max(0, safePage - 1))}
          >
            <ChevronLeft size={12} aria-hidden="true" />
          </button>
          <span className="infinite-canvas-node__gallery-page-status">
            {t('infiniteCanvas.variants.pageStatus', {
              page: safePage + 1,
              total: pageCount,
            })}
          </span>
          <button
            type="button"
            className="infinite-canvas-node__gallery-page"
            data-canvas-variant-page="next"
            disabled={safePage >= pageCount - 1}
            aria-label={t('infiniteCanvas.variants.nextPage')}
            title={t('infiniteCanvas.variants.nextPage')}
            onClick={() => setPage(Math.min(pageCount - 1, safePage + 1))}
          >
            <ChevronRight size={12} aria-hidden="true" />
          </button>
        </div>
      ) : null}
    </div>
  );
};

NodeVariantGallery.displayName = 'InfiniteCanvasNodeVariantGallery';

/**
 * §4's pill, as a shape rather than a flat list: groups in, hairlines between
 * whichever groups survived.
 *
 * The dividers used to be written inline next to the entries they followed,
 * which meant a card that could run nothing in a group still drew that
 * group's hairline — a blank card showed a bar that opened with a stray line.
 * Handing the groups over as arrays lets the empty ones disappear whole.
 */
const CardToolbar: React.FC<{
  label: string;
  groups: readonly (readonly React.ReactNode[])[];
}> = ({ label, groups }) => {
  const populated = groups
    .map(group => group.filter(Boolean))
    .filter(group => group.length > 0);

  return (
    <div
      className="infinite-canvas-node__toolbar nodrag"
      role="toolbar"
      data-canvas-toolbar-groups={populated.length}
      aria-label={label}
    >
      {populated.map((group, index) => (
        // Group order is fixed by the source, so the index is a stable key.
        <React.Fragment key={index}>
          {index > 0 ? (
            <span className="infinite-canvas-node__toolbar-divider" aria-hidden="true" />
          ) : null}
          {group}
        </React.Fragment>
      ))}
    </div>
  );
};

CardToolbar.displayName = 'InfiniteCanvasCardToolbar';

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
  // §7.6: the card's own pictures. A card that only ever produced one shows
  // neither badge nor gallery, so nothing changes for the common case.
  const variants = data.mediaVariants ?? (mediaRef ? [mediaRef] : []);
  const activeVariantIndex = data.activeVariantIndex ?? 0;
  const [galleryOpen, setGalleryOpen] = React.useState(false);
  const hasGallery = variants.length > 1 && Boolean(data.onSelectVariant);
  // K3 §5.2: the return leg needs the same answer the badge does — is the
  // asset this card belongs to still there?
  const domainOrigin = useInfiniteCanvasDomainOrigin(data.domainRef);
  const domainDangling = domainOrigin?.state === 'dangling';
  /**
   * A5 / C1: will the next press file its result into the asset by itself?
   *
   * Two causes, one answer. The batch size is on the card, so this is live —
   * turning the count up to four weakens the badge BEFORE anything is paid
   * for. The other cause (coordinates that could not be read) only becomes
   * known when a press tries, so the panel sets it afterwards.
   */
  const domainAutoFile = data.domainRef
    ? (infiniteCanvasWillAutoFile(data) && !data.domainManualReturn
        ? 'auto' as const
        : 'manual' as const)
    : undefined;
  React.useEffect(() => {
    if (!hasGallery) setGalleryOpen(false);
  }, [hasGallery]);

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
        domainRef={data.domainRef}
        domainAutoFile={domainAutoFile}
      />
      <div className="infinite-canvas-node__frame">
        {mediaRef ? (
          <>
            <NodeMedia
              mediaRef={mediaRef}
              mediaKind={mediaKind}
              resolvePreviewUrl={data.resolvePreviewUrl}
            />
            {/*
              §7.6: a regenerate now runs ON this card, so the card face has to
              say so. Same restrained line the blank placeholder uses — no
              overlay, no words over the picture.
            */}
            {pending ? (
              <span className="infinite-canvas-node__progress" aria-hidden="true" />
            ) : null}
          </>
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
        §7.6: the count badge. One small number in the corner, in the same
        restrained grey the §2 type label uses — it says how many pictures this
        card holds and opens the gallery; it never competes with the picture.
      */}
      {hasGallery ? (
        <button
          type="button"
          className="infinite-canvas-node__variant-badge nodrag"
          data-node-action="variants"
          data-canvas-variant-count={variants.length}
          aria-expanded={galleryOpen}
          aria-label={t('infiniteCanvas.variants.badge', { count: variants.length })}
          title={t('infiniteCanvas.variants.badge', { count: variants.length })}
          onClick={() => setGalleryOpen(open => !open)}
        >
          {variants.length}
        </button>
      ) : null}
      {hasGallery && galleryOpen ? (
        <NodeVariantGallery
          variants={variants}
          activeIndex={activeVariantIndex}
          mediaKind={mediaKind}
          resolvePreviewUrl={data.resolvePreviewUrl}
          onSelect={index => data.onSelectVariant?.(id, index)}
        />
      ) : null}
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
        §4: the dark pill toolbar. Icon-only, three hairline-separated groups
        (edit / organise / output) plus the overflow entry, absent until the
        card is hovered or selected, and it takes no layout space. Entries that
        cannot act on this card are hidden rather than greyed out (§7's rule),
        and an empty group takes its divider with it.
      */}
      <CardToolbar
        label={t('infiniteCanvas.imageNode.toolsLabel')}
        groups={[
          // Edit — what the owner does to the picture itself, and the group
          // §4 names first. Crop leads because it costs nothing and runs on
          // this machine; the contract tools follow in §4's own order.
          [
            imageData?.onCropImage && mediaRef ? (
              <button
                key="crop"
                type="button"
                className="infinite-canvas-node__crop-button"
                data-node-action="crop"
                aria-label={t('infiniteCanvas.crop.button')}
                title={t('infiniteCanvas.crop.button')}
                onClick={() => imageData.onCropImage?.(id)}
              >
                <Crop size={14} aria-hidden="true" />
              </button>
            ) : null,
            imageData && mediaRef ? (
              <span className="infinite-canvas-node__tools" key="tools">
                {IMAGE_TOOL_DEFINITIONS
                  .filter(definition => PILL_TOOL_IDS.includes(definition.toolId))
                  .map(definition => (
                    <button
                      key={definition.toolId}
                      type="button"
                      className="infinite-canvas-node__tool"
                      data-tool-id={definition.toolId}
                      aria-label={t(definition.labelKey)}
                      title={t(definition.labelKey)}
                      onClick={() => imageData.onRunImageTool(id, definition.toolId)}
                    >
                      {IMAGE_TOOL_ICONS[definition.toolId]
                        ?? <Brush size={14} aria-hidden="true" />}
                    </button>
                  ))}
              </span>
            ) : null,
          ],
          // Organise — what the card should be, rather than what it holds.
          // Neither spends a generation on its own.
          [
            imageData ? (
              <button
                key="style"
                type="button"
                className="infinite-canvas-node__style-button"
                data-node-action="style"
                data-has-style={imageData.stylePresetName ? 'true' : undefined}
                aria-label={imageData.stylePresetName ?? t('infiniteCanvas.imageNode.styleButton')}
                title={imageData.stylePresetName ?? t('infiniteCanvas.imageNode.styleButton')}
                onClick={event => imageData.onOpenStylePicker(id, event.currentTarget)}
              >
                <Palette size={14} aria-hidden="true" />
              </button>
            ) : null,
            data.onOpenParams ? (
              <button
                key="params"
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
            ) : null,
          ],
          // Output — produce a result, then take it somewhere.
          [
            <button
              key="regenerate"
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
            </button>,
            mediaRef && data.onSaveMediaAs ? (
              <button
                key="save-as"
                type="button"
                className="infinite-canvas-node__toolbar-button"
                data-node-action="save-as"
                aria-label={t('infiniteCanvas.viewer.saveAs')}
                title={t('infiniteCanvas.viewer.saveAs')}
                onClick={() => data.onSaveMediaAs?.(id)}
              >
                <Download size={14} aria-hidden="true" />
              </button>
            ) : null,
            data.domainRef && mediaRef && data.onSendToShortDrama ? (
              /*
                §5.2: "send back to short drama". It sits in the output group,
                next to save-a-copy and open-full-screen, because it is the same
                kind of act — take the finished picture somewhere. It appears
                only on a card that belongs to an asset, so no ordinary card
                grows a button it could never use.

                A card whose asset was deleted keeps the entry but disabled,
                and says why on hover. §7 would normally hide an entry that
                cannot act, but silence here reads as "this card was never from
                short drama", which is the one thing that is not true. The
                picture stays the user's either way; only the way home is gone.
              */
              <button
                key="send-to-short-drama"
                type="button"
                className="infinite-canvas-node__toolbar-button"
                data-node-action="send-to-short-drama"
                data-domain-dangling={domainDangling ? 'true' : undefined}
                disabled={Boolean(data.sendToShortDramaBusy) || domainDangling}
                aria-label={domainDangling
                  ? t('infiniteCanvas.writeBack.assetMissing')
                  : t('infiniteCanvas.writeBack.button')}
                title={domainDangling
                  ? t('infiniteCanvas.writeBack.assetMissing')
                  : t('infiniteCanvas.writeBack.button')}
                onClick={() => data.onSendToShortDrama?.(id)}
              >
                <CornerUpLeft size={14} aria-hidden="true" />
              </button>
            ) : null,
            mediaRef && data.onOpenViewer ? (
              // The video element owns its own click surface, so both kinds
              // reach the full-screen viewer through this explicit entry.
              <button
                key="open-viewer-entry"
                type="button"
                className="infinite-canvas-node__toolbar-button"
                data-node-action="open-viewer-entry"
                aria-label={t('infiniteCanvas.viewer.open')}
                title={t('infiniteCanvas.viewer.open')}
                onClick={() => data.onOpenViewer?.(id)}
              >
                <Maximize2 size={14} aria-hidden="true" />
              </button>
            ) : null,
          ],
          // Overflow — its own group, so the hairline always reads as "and
          // everything else".
          [
            data.onOpenOverflow ? (
              <button
                key="more"
                type="button"
                className="infinite-canvas-node__toolbar-button"
                data-node-action="more"
                aria-haspopup="menu"
                aria-label={t('infiniteCanvas.menu.more')}
                title={t('infiniteCanvas.menu.more')}
                onClick={event => data.onOpenOverflow?.(id, event.currentTarget)}
              >
                <MoreHorizontal size={14} aria-hidden="true" />
              </button>
            ) : null,
          ],
        ]}
      />
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
