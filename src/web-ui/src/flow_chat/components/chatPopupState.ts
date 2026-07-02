let chatPopupActive = false;
const chatPopupListeners = new Set<() => void>();

export function isChatPopupActive(): boolean {
  return chatPopupActive;
}

export function subscribeChatPopupChange(listener: () => void): () => void {
  chatPopupListeners.add(listener);
  return () => {
    chatPopupListeners.delete(listener);
  };
}

export function setChatPopupActive(active: boolean): void {
  if (chatPopupActive === active) {
    return;
  }

  chatPopupActive = active;
  chatPopupListeners.forEach(listener => listener());
}
