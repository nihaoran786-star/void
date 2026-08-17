// @vitest-environment jsdom

import React, { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({
  documentVisible: true,
  moduleLoads: 0,
  mounts: 0,
}));

vi.mock('@/app/hooks/useDocumentVisibilityState', () => ({
  useDocumentVisibilityState: () => harness.documentVisible,
}));

vi.mock('./SessionsSection', () => {
  harness.moduleLoads += 1;
  const MockSessionsSection = ({ isVisible }: { isVisible?: boolean }) => {
    useEffect(() => {
      harness.mounts += 1;
    }, []);
    return <div data-testid="sessions" data-visible={String(isVisible)} />;
  };
  return { default: MockSessionsSection };
});

import DeferredSessionsSection from './DeferredSessionsSection';

describe('DeferredSessionsSection', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    harness.moduleLoads = 0;
    harness.mounts = 0;
    harness.documentVisible = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('loads on first active presentation and retains the same mounted list while paused', async () => {
    await act(async () => {
      root.render(<DeferredSessionsSection isVisible={false} />);
    });
    expect(container.querySelector('[data-testid="sessions"]')).toBeNull();
    expect(harness.moduleLoads).toBe(0);

    harness.documentVisible = false;
    await act(async () => {
      root.render(<DeferredSessionsSection />);
    });
    expect(container.querySelector('[data-testid="sessions"]')).toBeNull();
    expect(harness.moduleLoads).toBe(0);

    harness.documentVisible = true;
    await act(async () => {
      root.render(<DeferredSessionsSection />);
      await Promise.resolve();
    });
    const sessions = container.querySelector('[data-testid="sessions"]');
    expect(sessions?.getAttribute('data-visible')).toBe('true');
    expect(harness.moduleLoads).toBe(1);
    expect(harness.mounts).toBe(1);

    harness.documentVisible = false;
    await act(async () => {
      root.render(<DeferredSessionsSection isVisible />);
    });
    expect(container.querySelector('[data-testid="sessions"]')).toBe(sessions);
    expect(sessions?.getAttribute('data-visible')).toBe('false');
    expect(harness.moduleLoads).toBe(1);
    expect(harness.mounts).toBe(1);

    harness.documentVisible = true;
    await act(async () => {
      root.render(<DeferredSessionsSection isVisible />);
    });
    expect(container.querySelector('[data-testid="sessions"]')).toBe(sessions);
    expect(sessions?.getAttribute('data-visible')).toBe('true');
  });
});
