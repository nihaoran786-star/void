import { createElement, lazy, Suspense } from 'react';
import type { CodeEditorProps } from './CodeEditor';

const LazyCodeEditor = lazy(() => import('./CodeEditor'));

/**
 * Public component-library facade. Keeps the existing API while deferring the
 * Monaco-backed implementation until a consumer actually renders the editor.
 */
export function CodeEditor(props: CodeEditorProps) {
  return createElement(
    Suspense,
    { fallback: null },
    createElement(LazyCodeEditor, props),
  );
}

CodeEditor.displayName = 'LazyCodeEditor';

export type { CodeEditorProps } from './CodeEditor';
