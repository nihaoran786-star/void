/**
 * Custom reactflow node renderers for the Infinite Canvas panel.
 *
 * Nodes are pure projections: every edit is reported back to the panel via
 * callbacks carried in the node data, and the panel routes it through the
 * infinite-canvas DocumentService. Nodes never persist anything themselves.
 */
import React from 'react';
import { Handle, Position } from '@xyflow/react';

import { useI18n } from '@/infrastructure/i18n';
import type { ImageToolId } from '@/shared/services/infinite-canvas';
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

export interface InfiniteCanvasImageNodeData extends Record<string, unknown> {
  mediaRef: InfiniteCanvasMediaRef;
  resolvePreviewUrl: InfiniteCanvasImagePreviewResolver;
  /** Resolved display name of the applied style preset, if any. */
  stylePresetName?: string;
  onOpenStylePicker: (nodeId: string) => void;
  onRunImageTool: (nodeId: string, toolId: ImageToolId) => void;
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

export const InfiniteCanvasImageNode: React.FC<
  NodeRendererProps<InfiniteCanvasImageNodeData>
> = ({ id, data, selected }) => {
  const { t } = useI18n('components');
  const { mediaRef, resolvePreviewUrl } = data;
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

  return (
    <div
      className="infinite-canvas-node infinite-canvas-node--image"
      data-selected={selected ? 'true' : undefined}
    >
      <Handle type="target" position={Position.Left} />
      {previewUrl ? (
        <img
          className="infinite-canvas-node__image"
          src={previewUrl}
          alt={fileNameOf(mediaRef.relativePath)}
          draggable={false}
        />
      ) : (
        <div
          className="infinite-canvas-node__image-placeholder"
          data-state={failed ? 'unavailable' : 'loading'}
        >
          {failed
            ? t('infiniteCanvas.imageNode.previewUnavailable')
            : t('infiniteCanvas.imageNode.previewLoading')}
        </div>
      )}
      <p className="infinite-canvas-node__image-caption">
        {fileNameOf(mediaRef.relativePath)}
      </p>
      <div className="infinite-canvas-node__footer">
        <button
          type="button"
          className="infinite-canvas-node__style-button nodrag"
          data-has-style={data.stylePresetName ? 'true' : undefined}
          onClick={() => data.onOpenStylePicker(id)}
        >
          {data.stylePresetName ?? t('infiniteCanvas.imageNode.styleButton')}
        </button>
      </div>
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
      <Handle type="source" position={Position.Right} />
    </div>
  );
};

InfiniteCanvasImageNode.displayName = 'InfiniteCanvasImageNode';
