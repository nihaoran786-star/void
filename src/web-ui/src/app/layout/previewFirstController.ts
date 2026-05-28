export interface PreviewFirstLayoutDeps {
  isSupported: () => boolean;
  updateLayout: (layout: { chatCollapsed: boolean; rightPanelCollapsed?: boolean }) => void;
  openFloatingChat: () => Promise<void> | void;
  closeFloatingChat: () => Promise<void> | void;
}

export async function setPreviewFirstLayout(
  enabled: boolean,
  deps: PreviewFirstLayoutDeps,
): Promise<void> {
  if (enabled) {
    deps.updateLayout({
      chatCollapsed: true,
      rightPanelCollapsed: false,
    });

    if (deps.isSupported()) {
      await deps.openFloatingChat();
    }
    return;
  }

  deps.updateLayout({
    chatCollapsed: false,
  });

  if (deps.isSupported()) {
    await deps.closeFloatingChat();
  }
}
