// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { TerminalOutputFallback } from './LazyTerminalOutputRenderer';

describe('TerminalOutputFallback', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('renders a bounded plain-text preview while the xterm renderer chunk loads', () => {
    act(() => {
      root.render(
        <TerminalOutputFallback
          className="terminal-xterm-output"
          content={'\x1b[31mone\x1b[0m\ntwo\n\x1b]0;title\x07three\nfour'}
          maxRows={2}
        />,
      );
    });

    const fallback = container.querySelector<HTMLPreElement>('pre.terminal-output-pre');
    expect(fallback).not.toBeNull();
    expect(fallback?.className).toContain('terminal-xterm-output');
    expect(fallback?.textContent).toBe('three\nfour');
    expect(fallback?.style.height).toBe('34px');
    expect(fallback?.style.maxHeight).toBe('34px');
    expect(fallback?.style.overflow).toBe('hidden');
  });
});
