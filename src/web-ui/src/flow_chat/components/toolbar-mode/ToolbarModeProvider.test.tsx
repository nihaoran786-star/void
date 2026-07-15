// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  TOOLBAR_MODE_ACTIVATING_EVENT,
  TOOLBAR_MODE_ACTIVATION_FAILED_EVENT,
} from '@/shared/constants/toolbarModeEvents';
import { useToolbarModeContext } from './ToolbarModeContext';
import { ToolbarModeProvider } from './ToolbarModeProvider';

const windowHandle = vi.hoisted(() => ({
  center: vi.fn(),
  isDecorated: vi.fn(),
  isMaximized: vi.fn(),
  maximize: vi.fn(),
  outerPosition: vi.fn(),
  outerSize: vi.fn(),
  scaleFactor: vi.fn(),
  setAlwaysOnTop: vi.fn(),
  setDecorations: vi.fn(),
  setFocus: vi.fn(),
  setMinSize: vi.fn(),
  setPosition: vi.fn(),
  setResizable: vi.fn(),
  setSize: vi.fn(),
  setSkipTaskbar: vi.fn(),
  setTitleBarStyle: vi.fn(),
  unmaximize: vi.fn(),
}));

vi.mock('@tauri-apps/api/window', () => ({
  currentMonitor: vi.fn(),
  getCurrentWindow: () => windowHandle,
}));

vi.mock('@tauri-apps/api/dpi', () => ({
  PhysicalPosition: class PhysicalPosition {},
  PhysicalSize: class PhysicalSize {},
}));

vi.mock('@/shared/utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  }),
}));

describe('ToolbarModeProvider activation events', () => {
  beforeEach(() => {
    for (const mock of Object.values(windowHandle)) {
      mock.mockReset();
      mock.mockResolvedValue(undefined);
    }
    windowHandle.outerPosition.mockResolvedValue({ x: 100, y: 100 });
    windowHandle.outerSize.mockResolvedValue({ width: 1200, height: 800 });
    windowHandle.isMaximized.mockResolvedValue(false);
    windowHandle.isDecorated.mockResolvedValue(true);
    windowHandle.scaleFactor.mockResolvedValue(1);
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  it('publishes activation-failed when startup fails before toolbar DOM mounts', async () => {
    windowHandle.outerPosition.mockRejectedValueOnce(new Error('window unavailable'));
    const events: string[] = [];
    const handleActivating = () => events.push(TOOLBAR_MODE_ACTIVATING_EVENT);
    const handleFailed = () => events.push(TOOLBAR_MODE_ACTIVATION_FAILED_EVENT);
    window.addEventListener(TOOLBAR_MODE_ACTIVATING_EVENT, handleActivating);
    window.addEventListener(TOOLBAR_MODE_ACTIVATION_FAILED_EVENT, handleFailed);

    let enableToolbarMode: (() => Promise<void>) | undefined;
    const CaptureContext = () => {
      enableToolbarMode = useToolbarModeContext().enableToolbarMode;
      return null;
    };

    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <ToolbarModeProvider>
          <CaptureContext />
        </ToolbarModeProvider>,
      );
    });

    await act(async () => {
      await enableToolbarMode?.();
    });

    expect(events).toEqual([
      TOOLBAR_MODE_ACTIVATING_EVENT,
      TOOLBAR_MODE_ACTIVATION_FAILED_EVENT,
    ]);
    expect(document.querySelector('.void-toolbar-mode')).toBeNull();

    window.removeEventListener(TOOLBAR_MODE_ACTIVATING_EVENT, handleActivating);
    window.removeEventListener(TOOLBAR_MODE_ACTIVATION_FAILED_EVENT, handleFailed);
    await act(async () => {
      root.unmount();
    });
  });

  it('keeps toolbar presentation mounted until native window restoration settles', async () => {
    let latestContext: ReturnType<typeof useToolbarModeContext> | undefined;
    const CaptureContext = () => {
      latestContext = useToolbarModeContext();
      return <span data-toolbar-mode={String(latestContext.isToolbarMode)} />;
    };

    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <ToolbarModeProvider>
          <CaptureContext />
        </ToolbarModeProvider>,
      );
    });

    await act(async () => {
      await latestContext?.enableToolbarMode();
    });
    expect(container.querySelector('span')?.dataset.toolbarMode).toBe('true');
    windowHandle.setMinSize.mockClear();

    let resolveFocus: (() => void) | undefined;
    windowHandle.setFocus.mockReturnValueOnce(new Promise<void>((resolve) => {
      resolveFocus = resolve;
    }));

    let disablePromise: Promise<void> | undefined;
    let duplicateDisablePromise: Promise<void> | undefined;
    await act(async () => {
      disablePromise = latestContext?.disableToolbarMode();
      duplicateDisablePromise = latestContext?.disableToolbarMode();
      await vi.waitFor(() => {
        expect(windowHandle.setFocus).toHaveBeenCalledOnce();
      });
    });

    expect(duplicateDisablePromise).toBe(disablePromise);
    expect(windowHandle.setMinSize).toHaveBeenCalledOnce();
    expect(container.querySelector('span')?.dataset.toolbarMode).toBe('true');

    await act(async () => {
      resolveFocus?.();
      await disablePromise;
    });
    expect(container.querySelector('span')?.dataset.toolbarMode).toBe('false');

    await act(async () => {
      root.unmount();
    });
  });

  it('commits toolbar presentation only after native activation settles', async () => {
    let latestContext: ReturnType<typeof useToolbarModeContext> | undefined;
    const CaptureContext = () => {
      latestContext = useToolbarModeContext();
      return <span data-toolbar-mode={String(latestContext.isToolbarMode)} />;
    };

    let resolveMinSize: (() => void) | undefined;
    windowHandle.setMinSize.mockReturnValueOnce(new Promise<void>((resolve) => {
      resolveMinSize = resolve;
    }));

    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <ToolbarModeProvider>
          <CaptureContext />
        </ToolbarModeProvider>,
      );
    });

    let enablePromise: Promise<void> | undefined;
    await act(async () => {
      enablePromise = latestContext?.enableToolbarMode();
      await vi.waitFor(() => {
        expect(windowHandle.setMinSize).toHaveBeenCalledOnce();
      });
    });
    expect(container.querySelector('span')?.dataset.toolbarMode).toBe('false');

    await act(async () => {
      resolveMinSize?.();
      await enablePromise;
    });
    expect(container.querySelector('span')?.dataset.toolbarMode).toBe('true');

    await act(async () => {
      root.unmount();
    });
  });

  it('waits for every concurrent activation mutation before publishing failure', async () => {
    let latestContext: ReturnType<typeof useToolbarModeContext> | undefined;
    const CaptureContext = () => {
      latestContext = useToolbarModeContext();
      return <span data-toolbar-mode={String(latestContext.isToolbarMode)} />;
    };

    let resolveSize: (() => void) | undefined;
    windowHandle.setAlwaysOnTop.mockRejectedValueOnce(new Error('always-on-top unavailable'));
    windowHandle.setSize.mockReturnValueOnce(new Promise<void>((resolve) => {
      resolveSize = resolve;
    }));

    const failed = vi.fn();
    window.addEventListener(TOOLBAR_MODE_ACTIVATION_FAILED_EVENT, failed);

    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <ToolbarModeProvider>
          <CaptureContext />
        </ToolbarModeProvider>,
      );
    });

    let enablePromise: Promise<void> | undefined;
    let duplicateEnablePromise: Promise<void> | undefined;
    await act(async () => {
      enablePromise = latestContext?.enableToolbarMode();
      duplicateEnablePromise = latestContext?.enableToolbarMode();
      await vi.waitFor(() => {
        expect(windowHandle.setSize).toHaveBeenCalledOnce();
      });
    });

    expect(duplicateEnablePromise).toBe(enablePromise);
    expect(failed).not.toHaveBeenCalled();
    expect(container.querySelector('span')?.dataset.toolbarMode).toBe('false');

    await act(async () => {
      resolveSize?.();
      await enablePromise;
    });
    expect(failed).toHaveBeenCalledOnce();
    expect(container.querySelector('span')?.dataset.toolbarMode).toBe('false');

    window.removeEventListener(TOOLBAR_MODE_ACTIVATION_FAILED_EVENT, failed);
    await act(async () => {
      root.unmount();
    });
  });
});
