/**
 * Markdown component exports
 */
import { createElement, lazy, memo, Suspense } from 'react';
import type { MarkdownProps } from './Markdown';

const DeferredMarkdown = lazy(() =>
  import('./Markdown').then((module) => ({ default: module.Markdown })),
);

function MarkdownFallback({ className, content }: MarkdownProps) {
  return createElement(
    'div',
    {
      'aria-busy': true,
      className: ['markdown-renderer', className].filter(Boolean).join(' '),
      style: { whiteSpace: 'pre-wrap' },
    },
    String(content ?? ''),
  );
}

export const Markdown = memo(function Markdown(props: MarkdownProps) {
  return createElement(
    Suspense,
    { fallback: createElement(MarkdownFallback, props) },
    createElement(DeferredMarkdown, props),
  );
});

export type { MarkdownProps, LineRange } from './Markdown';

export const MarkdownRenderer = Markdown;
export type { MarkdownProps as MarkdownRendererProps } from './Markdown';

export { MermaidBlock } from './MermaidBlock';
export type { MermaidBlockProps } from './MermaidBlock';

export { ReproductionStepsBlock } from './ReproductionStepsBlock';
export type { ReproductionStepsBlockProps } from './ReproductionStepsBlock';
