import { afterEach, describe, expect, it, vi } from 'vitest';
import { setPreviewFirstLayout } from './previewFirstController';

describe('setPreviewFirstLayout', () => {
  const updateLayout = vi.fn();
  const openFloatingChat = vi.fn();
  const closeFloatingChat = vi.fn();

  afterEach(() => {
    updateLayout.mockReset();
    openFloatingChat.mockReset();
    closeFloatingChat.mockReset();
  });

  it('enters preview-first by making the preview area primary and opening desktop compact chat', async () => {
    await setPreviewFirstLayout(true, {
      isSupported: () => true,
      updateLayout,
      openFloatingChat,
      closeFloatingChat,
    });

    expect(updateLayout).toHaveBeenCalledWith({
      chatCollapsed: true,
      rightPanelCollapsed: false,
    });
    expect(openFloatingChat).toHaveBeenCalledTimes(1);
    expect(closeFloatingChat).not.toHaveBeenCalled();
  });

  it('exits preview-first by restoring normal chat layout and closing presentation only', async () => {
    await setPreviewFirstLayout(false, {
      isSupported: () => true,
      updateLayout,
      openFloatingChat,
      closeFloatingChat,
    });

    expect(updateLayout).toHaveBeenCalledWith({
      chatCollapsed: false,
    });
    expect(closeFloatingChat).toHaveBeenCalledTimes(1);
  });

  it('does not attempt to open a desktop window in unsupported runtimes', async () => {
    await setPreviewFirstLayout(true, {
      isSupported: () => false,
      updateLayout,
      openFloatingChat,
      closeFloatingChat,
    });

    expect(updateLayout).toHaveBeenCalledWith({
      chatCollapsed: true,
      rightPanelCollapsed: false,
    });
    expect(openFloatingChat).not.toHaveBeenCalled();
  });
});
