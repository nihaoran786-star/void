/**
 * Custom reactflow node renderers for the Infinite Canvas panel.
 *
 * Nodes are pure projections: every edit is reported back to the panel via
 * callbacks carried in the node data, and the panel routes it through the
 * infinite-canvas DocumentService. Nodes never persist anything themselves.
 *
 * K2 (W6) extends the image card with the generation surface: a prompt
 * editor, generate/regenerate dispatch, pending/failed generation states with
 * retry/delete, the derived-version badge, and the ordered reference badges.
 */
import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { AlertTriangle } from 'lucide-react';

import { useI18n } from '@/infrastructure/i18n';
import type {
  CanvasImageOperationKind,
  ImageToolErrorKind,
  ImageToolId,
} from '@/shared/services/infinite-canvas';
import { IMAGE_TOOL_DEFINITIONS } from '@/shared/services/infinite-canvas';

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
  onCommitPrompt: (nodeId: string, prompt: string) => void;
  onGenerate: (nodeId: string) => void;
  onRetryGeneration: (nodeId: string) => void;
  onRemoveFailedGeneration: (nodeId: string) => void;
}

export interface InfiniteCanvasImageNodeData extends InfiniteCanvasMediaNodeData {
  /** Resolved display name of the applied style preset, if any. */
  stylePresetName?: string;
  onOpenStylePicker: (nodeId: string) => void;
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
      // preload="metadata" keeps off-screen cards cheap (poster frame +
      // duration only); the video data streams when the user hits play.
      return (
        // Generated clip: no caption track source exists for it.
        <video
          className="infinite-canvas-node__video nodrag"
          src={previewUrl}
          controls
          preload="metadata"
          aria-label={fileNameOf(mediaRef.relativePath)}
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
  return (
    <div
      className="infinite-canvas-node__image-placeholder"
      data-state={failed ? 'unavailable' : 'loading'}
    >
      {failed
        ? t(mediaKind === 'video'
          ? 'infiniteCanvas.video.previewUnavailable'
          : 'infiniteCanvas.imageNode.previewUnavailable')
        : t(mediaKind === 'video'
          ? 'infiniteCanvas.video.previewLoading'
          : 'infiniteCanvas.imageNode.previewLoading')}
    </div>
  );
};

NodeMedia.displayName = 'InfiniteCanvasNodeMedia';

/**
 * Shared image/video card body: badges, media, prompt editor, generate and
 * pending/failed generation states are one implementation; only the media
 * element and the image-only tool surface differ (K2 image behavior is
 * unchanged, the video card reuses its pending/failed styles).
 */
const InfiniteCanvasMediaCard: React.FC<
  NodeRendererProps<InfiniteCanvasImageNodeData | InfiniteCanvasVideoNodeData>
  & { mediaKind: 'image' | 'video' }
> = ({ id, data, selected, mediaKind }) => {
  const { t } = useI18n('components');
  const { mediaRef, generation, derivedFrom } = data;
  const imageData = mediaKind === 'image' ? data as InfiniteCanvasImageNodeData : undefined;
  const [promptDraft, setPromptDraft] = React.useState(data.prompt ?? '');

  React.useEffect(() => {
    setPromptDraft(data.prompt ?? '');
  }, [data.prompt]);

  const pending = generation?.status === 'pending';
  const failed = generation?.status === 'failed';
  const referenceLabels = data.referenceLabels ?? [];

  return (
    <div
      className={`infinite-canvas-node infinite-canvas-node--${mediaKind}`}
      data-selected={selected ? 'true' : undefined}
      data-generation-status={generation?.status}
    >
      <Handle type="target" position={Position.Left} />
      {(derivedFrom || referenceLabels.length > 0) ? (
        <div className="infinite-canvas-node__badges">
          {derivedFrom ? (
            <span
              className="infinite-canvas-node__badge infinite-canvas-node__badge--derived"
              aria-label={t('infiniteCanvas.generation.derivedBadgeLabel')}
              data-derived-tool-id={derivedFrom.toolId}
            >
              {derivedFrom.toolId === 'generate'
                ? t('infiniteCanvas.generation.derivedFromGenerate')
                : t(`infiniteCanvas.tools.${derivedFrom.toolId}`)}
            </span>
          ) : null}
          {referenceLabels.length > 0 ? (
            <span
              className="infinite-canvas-node__reference-badges"
              role="group"
              aria-label={t('infiniteCanvas.generation.referencesLabel')}
            >
              {referenceLabels.map((label, index) => (
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
        </div>
      ) : null}
      {mediaRef ? (
        <>
          <NodeMedia
            mediaRef={mediaRef}
            mediaKind={mediaKind}
            resolvePreviewUrl={data.resolvePreviewUrl}
          />
          <p className="infinite-canvas-node__image-caption">
            {fileNameOf(mediaRef.relativePath)}
          </p>
        </>
      ) : failed ? (
        <div
          className="infinite-canvas-node__generation-failed nodrag"
          role="alert"
          data-error-kind={generation?.errorKind ?? 'backend'}
        >
          <AlertTriangle size={14} aria-hidden="true" />
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
        <div
          className="infinite-canvas-node__generation-placeholder"
          data-state={pending ? 'pending' : 'blank'}
          role={pending ? 'status' : undefined}
        >
          {pending ? (
            <>
              <span className="infinite-canvas-node__spinner" aria-hidden="true" />
              {t(mediaKind === 'video'
                ? 'infiniteCanvas.video.pending'
                : 'infiniteCanvas.generation.pending')}
            </>
          ) : (
            t(mediaKind === 'video'
              ? 'infiniteCanvas.video.blankHint'
              : 'infiniteCanvas.generation.blankHint')
          )}
        </div>
      )}
      <textarea
        className="infinite-canvas-node__prompt-input nodrag"
        aria-label={t(mediaKind === 'video'
          ? 'infiniteCanvas.video.promptLabel'
          : 'infiniteCanvas.generation.promptLabel')}
        placeholder={t(mediaKind === 'video'
          ? 'infiniteCanvas.video.promptPlaceholder'
          : 'infiniteCanvas.generation.promptPlaceholder')}
        value={promptDraft}
        disabled={pending}
        onChange={event => setPromptDraft(event.target.value)}
        onBlur={() => {
          if (promptDraft !== (data.prompt ?? '')) data.onCommitPrompt(id, promptDraft);
        }}
      />
      <div className="infinite-canvas-node__footer">
        <button
          type="button"
          className="infinite-canvas-node__generate-button nodrag"
          disabled={pending}
          onClick={() => data.onGenerate(id)}
        >
          {mediaKind === 'video'
            ? (mediaRef
              ? t('infiniteCanvas.video.regenerate')
              : t('infiniteCanvas.video.generate'))
            : (mediaRef
              ? t('infiniteCanvas.generation.regenerate')
              : t('infiniteCanvas.generation.generate'))}
        </button>
        {imageData ? (
          <button
            type="button"
            className="infinite-canvas-node__style-button nodrag"
            data-has-style={imageData.stylePresetName ? 'true' : undefined}
            onClick={() => imageData.onOpenStylePicker(id)}
          >
            {imageData.stylePresetName ?? t('infiniteCanvas.imageNode.styleButton')}
          </button>
        ) : null}
      </div>
      {imageData && mediaRef ? (
        <div
          className="infinite-canvas-node__tools nodrag"
          role="group"
          aria-label={t('infiniteCanvas.imageNode.toolsLabel')}
        >
          {IMAGE_TOOL_DEFINITIONS.map(definition => (
            <button
              key={definition.toolId}
              type="button"
              className="infinite-canvas-node__tool"
              data-tool-id={definition.toolId}
              onClick={() => imageData.onRunImageTool(id, definition.toolId)}
            >
              {t(definition.labelKey)}
            </button>
          ))}
          {imageData.onDeriveVideoCard ? (
            // Not one of the five contract tools: image-to-video derives a
            // blank video card, so it keeps its own class and no tool id.
            <button
              type="button"
              className="infinite-canvas-node__derive-video"
              onClick={() => imageData.onDeriveVideoCard?.(id)}
            >
              {t('infiniteCanvas.video.deriveFromImage')}
            </button>
          ) : null}
        </div>
      ) : null}
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
