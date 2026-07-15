// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FlowChatPresentationActivityProvider } from './FlowChatPresentationActivity';
import { ProcessingIndicator } from './ProcessingIndicator';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: () => ['Hint one', 'Hint two'],
  }),
}));

vi.mock('@/component-library', () => ({
  DotMatrixLoader: () => <span data-testid="dot-matrix" />,
}));

function Harness({ isActive }: { isActive: boolean }) {
  return (
    <FlowChatPresentationActivityProvider isActive={isActive}>
      <ProcessingIndicator visible reserveSpace />
    </FlowChatPresentationActivityProvider>
  );
}

describe('ProcessingIndicator presentation lifecycle', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('clears the delayed reveal timeout when hidden', () => {
    act(() => {
      root.render(<Harness isActive />);
    });
    expect(vi.getTimerCount()).toBe(1);

    act(() => {
      root.render(<Harness isActive={false} />);
    });

    expect(vi.getTimerCount()).toBe(0);
    expect(container.querySelector('[data-testid="dot-matrix"]')).toBeNull();
    expect(container.querySelector('.processing-indicator')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('stops the hint rotation interval when hidden after reveal', () => {
    act(() => {
      root.render(<Harness isActive />);
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(container.querySelector('[data-testid="dot-matrix"]')).not.toBeNull();
    expect(vi.getTimerCount()).toBe(1);

    act(() => {
      root.render(<Harness isActive={false} />);
    });

    expect(vi.getTimerCount()).toBe(0);
    expect(container.querySelector('[data-testid="dot-matrix"]')).toBeNull();
  });
});
