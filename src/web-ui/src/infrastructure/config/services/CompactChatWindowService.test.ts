import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  closeCompactChatFloatingWindow,
  getCompactChatFloatingWindowStatus,
  listenCompactChatFloatingWindowActivity,
  listenCompactChatFloatingWindowCloseRequest,
  minimizeCompactChatFloatingWindow,
  openCompactChatFloatingWindow,
  revealCompactChatFloatingWindow,
  resizeCompactChatFloatingWindow,
  startCompactChatFloatingWindowDrag,
  startCompactChatFloatingWindowResize,
} from './CompactChatWindowService';

const runtimeMock = vi.hoisted(() => ({
  isTauriRuntime: vi.fn(() => true),
  supportsNativeWindowDragging: vi.fn(() => true),
}));

const tauriCore = vi.hoisted(() => ({
  invoke: vi.fn(),
}));

const tauriWindow = vi.hoisted(() => ({
  getCurrentWindow: vi.fn(() => ({
    minimize: vi.fn(),
    startDragging: vi.fn(),
    startResizeDragging: vi.fn(),
  })),
}));

vi.mock('@/infrastructure/runtime', () => runtimeMock);
vi.mock('@tauri-apps/api/core', () => tauriCore);
vi.mock('@tauri-apps/api/window', () => tauriWindow);

describe('CompactChatWindowService', () => {
  afterEach(() => {
    runtimeMock.isTauriRuntime.mockReturnValue(true);
    runtimeMock.supportsNativeWindowDragging.mockReturnValue(true);
    tauriCore.invoke.mockReset();
    tauriWindow.getCurrentWindow.mockClear();
  });

  it('reports unsupported outside the Tauri runtime', async () => {
    runtimeMock.isTauriRuntime.mockReturnValue(false);

    await openCompactChatFloatingWindow();
    await closeCompactChatFloatingWindow();

    expect(await getCompactChatFloatingWindowStatus()).toEqual({
      supported: false,
      reason: 'unsupported-runtime',
    });
    expect(tauriCore.invoke).not.toHaveBeenCalled();
  });

  it('opens and focuses through the desktop adapter command', async () => {
    await openCompactChatFloatingWindow();
    await openCompactChatFloatingWindow();

    expect(tauriCore.invoke).toHaveBeenCalledTimes(2);
    expect(tauriCore.invoke).toHaveBeenNthCalledWith(1, 'show_compact_chat_desktop_window');
    expect(tauriCore.invoke).toHaveBeenNthCalledWith(2, 'show_compact_chat_desktop_window');
  });

  it('closes presentation only through the desktop adapter command', async () => {
    await closeCompactChatFloatingWindow();

    expect(tauriCore.invoke).toHaveBeenCalledWith('hide_compact_chat_desktop_window');
  });

  it('reveals the prepared desktop window only after the compact chat surface is ready', async () => {
    await revealCompactChatFloatingWindow();

    expect(tauriCore.invoke).toHaveBeenCalledWith('reveal_compact_chat_desktop_window');
  });

  it('resizes with bounded dimensions and no session identity', async () => {
    await resizeCompactChatFloatingWindow({ width: 420, height: 680 });

    expect(tauriCore.invoke).toHaveBeenCalledWith('resize_compact_chat_desktop_window', {
      width: 420,
      height: 680,
    });
  });

  it('starts native dragging from Tauri runtime even when metadata support detection is unavailable', async () => {
    const startDragging = vi.fn();
    tauriWindow.getCurrentWindow.mockReturnValue({ startDragging });

    await startCompactChatFloatingWindowDrag();

    expect(startDragging).toHaveBeenCalledTimes(1);

    runtimeMock.supportsNativeWindowDragging.mockReturnValue(false);
    await startCompactChatFloatingWindowDrag();

    expect(startDragging).toHaveBeenCalledTimes(2);
  });

  it('minimizes the compact chat presentation through the current desktop window', async () => {
    const minimize = vi.fn();
    tauriWindow.getCurrentWindow.mockReturnValue({ minimize });

    await minimizeCompactChatFloatingWindow();

    expect(minimize).toHaveBeenCalledTimes(1);
    expect(tauriCore.invoke).not.toHaveBeenCalled();
  });

  it('reports focus restoration and only treats an actual minimize as suspension', async () => {
    let focusHandler: ((event: { payload: boolean }) => void) | undefined;
    const unlisten = vi.fn();
    const isMinimized = vi.fn().mockResolvedValue(true);
    tauriWindow.getCurrentWindow.mockReturnValue({
      isMinimized,
      onFocusChanged: vi.fn((handler) => {
        focusHandler = handler;
        return Promise.resolve(unlisten);
      }),
    });
    const activityHandler = vi.fn();

    const remove = await listenCompactChatFloatingWindowActivity(activityHandler);
    focusHandler?.({ payload: true });
    focusHandler?.({ payload: false });
    await vi.waitFor(() => expect(activityHandler).toHaveBeenLastCalledWith('minimized'));

    expect(activityHandler).toHaveBeenNthCalledWith(1, 'focused');
    expect(isMinimized).toHaveBeenCalledTimes(1);
    remove();
    expect(unlisten).toHaveBeenCalledTimes(1);
  });

  it('ignores a stale minimized check after the window regains focus', async () => {
    let focusHandler: ((event: { payload: boolean }) => void) | undefined;
    let resolveMinimized!: (value: boolean) => void;
    const minimized = new Promise<boolean>(resolve => {
      resolveMinimized = resolve;
    });
    tauriWindow.getCurrentWindow.mockReturnValue({
      isMinimized: vi.fn(() => minimized),
      onFocusChanged: vi.fn((handler) => {
        focusHandler = handler;
        return Promise.resolve(vi.fn());
      }),
    });
    const activityHandler = vi.fn();

    await listenCompactChatFloatingWindowActivity(activityHandler);
    focusHandler?.({ payload: false });
    focusHandler?.({ payload: true });
    resolveMinimized(true);
    await Promise.resolve();

    expect(activityHandler).toHaveBeenCalledTimes(1);
    expect(activityHandler).toHaveBeenCalledWith('focused');
  });

  it('intercepts native close requests and delegates suspension-safe closing', async () => {
    let closeHandler: ((event: { preventDefault: () => void }) => void) | undefined;
    const unlisten = vi.fn();
    tauriWindow.getCurrentWindow.mockReturnValue({
      onCloseRequested: vi.fn((handler) => {
        closeHandler = handler;
        return Promise.resolve(unlisten);
      }),
    });
    const handler = vi.fn().mockResolvedValue(undefined);
    const preventDefault = vi.fn();

    const remove = await listenCompactChatFloatingWindowCloseRequest(handler);
    closeHandler?.({ preventDefault });
    await vi.waitFor(() => expect(handler).toHaveBeenCalledTimes(1));

    expect(preventDefault).toHaveBeenCalledTimes(1);
    remove();
    expect(unlisten).toHaveBeenCalledTimes(1);

    closeHandler?.({ preventDefault });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('starts native resize dragging for a specific borderless window edge', async () => {
    const startResizeDragging = vi.fn();
    tauriWindow.getCurrentWindow.mockReturnValue({ startResizeDragging });

    await startCompactChatFloatingWindowResize('SouthEast');

    expect(startResizeDragging).toHaveBeenCalledWith('SouthEast');
  });
});
