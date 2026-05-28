import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  closeCompactChatFloatingWindow,
  getCompactChatFloatingWindowStatus,
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

  it('starts native resize dragging for a specific borderless window edge', async () => {
    const startResizeDragging = vi.fn();
    tauriWindow.getCurrentWindow.mockReturnValue({ startResizeDragging });

    await startCompactChatFloatingWindowResize('SouthEast');

    expect(startResizeDragging).toHaveBeenCalledWith('SouthEast');
  });
});
