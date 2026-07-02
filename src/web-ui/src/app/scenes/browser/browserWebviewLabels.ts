let browserPanelWebviewSequence = 0;

function createEntropySuffix(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function createBrowserPanelWebviewLabel(): string {
  const sequence = browserPanelWebviewSequence++;
  return `embedded-browser-panel-view-${sequence}-${createEntropySuffix()}`;
}
