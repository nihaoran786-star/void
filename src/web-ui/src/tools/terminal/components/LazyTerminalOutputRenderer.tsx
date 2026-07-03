import React, { Suspense } from 'react';
import type { CSSProperties } from 'react';

interface LazyTerminalOutputRendererProps {
  content: string;
  className?: string;
  terminalId?: string;
  minHeight?: number;
  maxHeight?: number;
  maxRows?: number;
}

const DeferredTerminalOutputRenderer = React.lazy(() =>
  import('./TerminalOutputRenderer').then((module) => ({
    default: module.TerminalOutputRenderer,
  })),
);

const FALLBACK_OUTPUT_FONT_SIZE = 12;
const FALLBACK_OUTPUT_LINE_HEIGHT = 1.4;
const FALLBACK_OUTPUT_ROW_HEIGHT = Math.ceil(FALLBACK_OUTPUT_FONT_SIZE * FALLBACK_OUTPUT_LINE_HEIGHT);

function stripTerminalControlSequences(content: string): string {
  return content
    // eslint-disable-next-line no-control-regex -- terminal control sequences are expected in command output.
    .replace(/\x1b[\]PX_^][\s\S]*?(?:\x07|\x1b\\)/g, '')
    // eslint-disable-next-line no-control-regex -- terminal control sequences are expected in command output.
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
    // eslint-disable-next-line no-control-regex -- terminal control sequences are expected in command output.
    .replace(/\x1b[ -/]*[@-~]/g, '');
}

function takeLastRows(content: string, maxRows?: number): string {
  if (!maxRows || maxRows <= 0) {
    return content;
  }

  const rows = content.split(/\r\n|\r|\n/);
  return rows.slice(-maxRows).join('\n');
}

function calculateFallbackHeight(
  content: string,
  maxRows?: number,
  minHeight = FALLBACK_OUTPUT_ROW_HEIGHT,
  maxHeight = 300,
): number {
  const rows = content ? content.split(/\r\n|\r|\n/) : [''];
  const visibleRows = maxRows != null && maxRows > 0
    ? Math.min(rows.length, maxRows)
    : rows.length;
  const estimatedHeight = Math.max(1, visibleRows) * FALLBACK_OUTPUT_ROW_HEIGHT;
  const effectiveMaxHeight = maxRows != null && maxRows > 0
    ? maxRows * FALLBACK_OUTPUT_ROW_HEIGHT
    : maxHeight;

  return Math.min(Math.max(estimatedHeight, minHeight), Math.max(minHeight, effectiveMaxHeight));
}

export function TerminalOutputFallback({
  className,
  content,
  minHeight,
  maxHeight,
  maxRows,
}: LazyTerminalOutputRendererProps) {
  const preview = stripTerminalControlSequences(takeLastRows(content, maxRows));
  const height = calculateFallbackHeight(preview, maxRows, minHeight, maxHeight);
  const style: CSSProperties = {
    height: `${height}px`,
    maxHeight: `${height}px`,
    overflow: 'hidden',
  };

  return (
    <pre
      className={['terminal-output-pre', className].filter(Boolean).join(' ')}
      style={style}
    >
      {preview}
    </pre>
  );
}

export function LazyTerminalOutputRenderer(props: LazyTerminalOutputRendererProps) {
  return (
    <Suspense fallback={<TerminalOutputFallback {...props} />}>
      <DeferredTerminalOutputRenderer {...props} />
    </Suspense>
  );
}

export type { LazyTerminalOutputRendererProps };
