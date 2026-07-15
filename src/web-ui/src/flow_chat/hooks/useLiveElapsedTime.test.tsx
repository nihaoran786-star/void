// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLiveElapsedTime } from './useLiveElapsedTime';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function Harness({ presentationActive }: { presentationActive: boolean }) {
  const { elapsedMs, remainingMs } = useLiveElapsedTime(
    1_000,
    true,
    20_000,
    false,
    presentationActive,
  );

  return (
    <output data-testid="timer">
      {elapsedMs}|{remainingMs}
    </output>
  );
}

describe('useLiveElapsedTime presentation lifecycle', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(5_000);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  it('creates no hidden interval and catches up immediately after each resume', () => {
    act(() => root.render(<Harness presentationActive={false} />));
    expect(vi.getTimerCount()).toBe(0);
    expect(container.querySelector('[data-testid="timer"]')?.textContent).toBe('0|20000');

    act(() => root.render(<Harness presentationActive />));
    expect(vi.getTimerCount()).toBe(1);
    expect(container.querySelector('[data-testid="timer"]')?.textContent).toBe('4000|16000');

    act(() => vi.advanceTimersByTime(1_000));
    expect(container.querySelector('[data-testid="timer"]')?.textContent).toBe('5000|15000');

    act(() => root.render(<Harness presentationActive={false} />));
    expect(vi.getTimerCount()).toBe(0);

    act(() => vi.advanceTimersByTime(5_000));
    expect(container.querySelector('[data-testid="timer"]')?.textContent).toBe('5000|15000');

    act(() => root.render(<Harness presentationActive />));
    expect(vi.getTimerCount()).toBe(1);
    expect(container.querySelector('[data-testid="timer"]')?.textContent).toBe('10000|10000');

    act(() => root.render(<Harness presentationActive={false} />));
    expect(vi.getTimerCount()).toBe(0);
  });
});
