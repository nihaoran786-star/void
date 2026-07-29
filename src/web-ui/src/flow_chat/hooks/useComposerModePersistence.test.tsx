// @vitest-environment jsdom

import React, { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useComposerModePersistence } from './useComposerModePersistence';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('useComposerModePersistence', () => {
  let container: HTMLDivElement;
  let root: Root;
  let current: ReturnType<typeof useComposerModePersistence> | undefined;
  const persistMode = vi.fn();

  function Harness({ sessionId = 'parent' }: { sessionId?: string }) {
    const value = useComposerModePersistence({
      sessionId,
      enabled: true,
      persistMode,
    });
    useEffect(() => {
      current = value;
    }, [value]);
    return null;
  }

  beforeEach(() => {
    persistMode.mockReset().mockResolvedValue(undefined);
    current = undefined;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('同步建立 pending 门禁，提交完成后解除', async () => {
    let resolvePersistence: (() => void) | undefined;
    persistMode.mockImplementationOnce(() => new Promise<void>(resolve => {
      resolvePersistence = resolve;
    }));
    await act(async () => {
      root.render(<Harness />);
    });

    let update: Promise<void> | undefined;
    act(() => {
      update = current?.persistModeChange('Plan');
    });
    expect(current?.isModePersistencePending('parent')).toBe(true);
    expect(persistMode).toHaveBeenCalledWith('parent', 'Plan');

    await act(async () => {
      await expect(current?.persistModeChange('debug')).rejects.toThrow(
        'mode_persistence_pending',
      );
      resolvePersistence?.();
      await update;
    });
    expect(current?.modePersistencePending).toBe(false);
  });

  it('旧会话事务不会把新会话错误识别为 pending', async () => {
    let resolvePersistence: (() => void) | undefined;
    persistMode.mockImplementationOnce(() => new Promise<void>(resolve => {
      resolvePersistence = resolve;
    }));
    await act(async () => {
      root.render(<Harness />);
    });

    let update: Promise<void> | undefined;
    act(() => {
      update = current?.persistModeChange('Plan');
    });
    await act(async () => {
      root.render(<Harness sessionId="another-parent" />);
    });

    expect(current?.isModePersistencePending('parent')).toBe(true);
    expect(current?.isModePersistencePending('another-parent')).toBe(false);
    expect(current?.modePersistencePending).toBe(false);

    await act(async () => {
      resolvePersistence?.();
      await update;
    });
  });
});
