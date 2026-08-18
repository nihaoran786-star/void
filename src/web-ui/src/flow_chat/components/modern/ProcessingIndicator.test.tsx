// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FlowChatPresentationActivityProvider } from './FlowChatPresentationActivity';
import { ProcessingIndicator } from './ProcessingIndicator';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-i18next', () => ({
  useTranslation: (namespace: string) => ({
    t: (key: string) => (
      namespace === 'flow-chat'
        ? `translated:${key}`
        : ['Hint one', 'Hint two']
    ),
  }),
}));

vi.mock('@/component-library/components/BeautifulUI', () => ({
  BeautifulUIStage: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/component-library/preview/beautiful-ui-original/components/loading-state', () => ({
  default: ({ label }: { label?: string }) => (
    <span data-testid="beautiful-loading" data-label={label} />
  ),
}));

function Harness({ isActive, labelKey }: { isActive: boolean; labelKey?: string }) {
  return (
    <FlowChatPresentationActivityProvider isActive={isActive}>
      <ProcessingIndicator visible reserveSpace labelKey={labelKey} />
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
    expect(container.querySelector('[data-testid="beautiful-loading"]')).toBeNull();
    expect(container.querySelector('.processing-indicator')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('names the reported phase instead of a rotating hint, and stops rotating', () => {
    act(() => {
      root.render(<Harness isActive labelKey="runtimeStatus.waitingForModelResponse" />);
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(
      container.querySelector('[data-testid="beautiful-loading"]')?.getAttribute('data-label'),
    ).toBe('translated:runtimeStatus.waitingForModelResponse');
    // A named phase does not rotate, so no interval is left running.
    expect(vi.getTimerCount()).toBe(0);
  });

  it('falls back to a rotating hint when no phase is reported', () => {
    act(() => {
      root.render(<Harness isActive />);
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(
      container.querySelector('[data-testid="beautiful-loading"]')?.getAttribute('data-label'),
    ).toBe('Hint one');
  });

  it('stops the hint rotation interval when hidden after reveal', () => {
    act(() => {
      root.render(<Harness isActive />);
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(container.querySelector('[data-testid="beautiful-loading"]')).not.toBeNull();
    expect(vi.getTimerCount()).toBe(1);

    act(() => {
      root.render(<Harness isActive={false} />);
    });

    expect(vi.getTimerCount()).toBe(0);
    expect(container.querySelector('[data-testid="beautiful-loading"]')).toBeNull();
  });
});
