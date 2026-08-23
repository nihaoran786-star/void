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

export interface InfiniteCanvasImageNodeData extends Record<string, unknown> {
  /** Absent on blank generation cards and derived placeholders. */
  mediaRef?: InfiniteCanvasMediaRef;
  prompt?: string;
  generation?: InfiniteCanvasImageNodeGeneration;
  derivedFrom?: InfiniteCanvasImageNodeDerivation;
  /** Ordered reference badges (edge creation order), e.g. tu-yi/tu-er labels. */
  referenceLabels?: readonly string[];
  resolvePreviewUrl: InfiniteCanvasImagePreviewResolver;
  /** Resolved display name of the applied style preset, if any. */
  stylePresetName?: string;
  onOpenStylePicker: (nodeId: string) => void;
  /** Opens the instruction-completion dialog for one of the five tools. */
  onRunImageTool: (nodeId: string, toolId: ImageToolId) => void;
  onCommitPrompt: (nodeId: string, prompt: string) => void;
  onGenerate: (nodeId: string) => void;
  onRetryGeneration: (nodeId: string) => void;
  onRemoveFailedGeneration: (nodeId: string) => void;
}

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

const ImageNodeMedia: React.FC<{
  mediaRef: InfiniteCanvasMediaRef;
  resolvePreviewUrl: InfiniteCanvasImagePreviewResolver;
}> = ({ mediaRef, resolvePreviewUrl }) => {
  const { t } = useI18n('components');
  const [previewUrl, setPreviewUrl] = React.useState<string | undefined>(undefined);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    setPreviewUrl(undefined);
    setFailed(false);
    void resolvePreviewUrl(mediaRef).then(url => {
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
  }, [mediaRef, resolvePreviewUrl]);

  if (previewUrl) {
    return (
      <img
        className="infinite-canvas-node__image"
        src={previewUrl}
        alt={fileNameOf(mediaRef.relativePath)}
        draggable={false}
      />
    );
  }
  return (
    <div
      className="infinite-canvas-node__image-placeholder"
      data-state={failed ? 'unavailable' : 'loading'}
    >
      {failed
        ? t('infiniteCanvas.imageNode.previewUnavailable')
        : t('infiniteCanvas.imageNode.previewLoading')}
    </div>
  );
};

ImageNodeMedia.displayName = 'InfiniteCanvasImageNodeMedia';

export const InfiniteCanvasImageNode: React.FC<
  NodeRendererProps<InfiniteCanvasImageNodeData>
> = ({ id, data, selected }) => {
  const { t } = useI18n('components');
  const { mediaRef, generation, derivedFrom } = data;
  const [promptDraft, setPromptDraft] = React.useState(data.prompt ?? '');

  React.useEffect(() => {
    setPromptDraft(data.prompt ?? '');
  }, [data.prompt]);

  const pending = generation?.status === 'pending';
  const failed = generation?.status === 'failed';
  const referenceLabels = data.referenceLabels ?? [];

  return (
    <div
      className="infinite-canvas-node infinite-canvas-node--image"
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
          <ImageNodeMedia mediaRef={mediaRef} resolvePreviewUrl={data.resolvePreviewUrl} />
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
              {t('infiniteCanvas.generation.pending')}
            </>
          ) : (
            t('infiniteCanvas.generation.blankHint')
          )}
        </div>
      )}
      <textarea
        className="infinite-canvas-node__prompt-input nodrag"
        aria-label={t('infiniteCanvas.generation.promptLabel')}
        placeholder={t('infiniteCanvas.generation.promptPlaceholder')}
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
          {mediaRef
            ? t('infiniteCanvas.generation.regenerate')
            : t('infiniteCanvas.generation.generate')}
        </button>
        <button
          type="button"
          className="infinite-canvas-node__style-button nodrag"
          data-has-style={data.stylePresetName ? 'true' : undefined}
          onClick={() => data.onOpenStylePicker(id)}
        >
          {data.stylePresetName ?? t('infiniteCanvas.imageNode.styleButton')}
        </button>
      </div>
      {mediaRef ? (
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
              onClick={() => data.onRunImageTool(id, definition.toolId)}
            >
              {t(definition.labelKey)}
            </button>
          ))}
        </div>
      ) : null}
      <Handle type="source" position={Position.Right} />
    </div>
  );
};

InfiniteCanvasImageNode.displayName = 'InfiniteCanvasImageNode';
