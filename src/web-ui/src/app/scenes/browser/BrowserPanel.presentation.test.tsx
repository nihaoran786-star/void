// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import BrowserPanel from './BrowserPanel';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/component-library', () => ({
  IconButton: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock('@/shared/context-system', () => ({
  useContextStore: (selector: (state: { addContext: () => void }) => unknown) =>
    selector({ addContext: vi.fn() }),
}));

const browserPanelSource = readFileSync(
  resolve(process.cwd(), 'src/app/scenes/browser/BrowserPanel.tsx'),
  'utf8',
);

describe('BrowserPanel presentation boundary', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('keeps the same iframe and URL mounted across inactive panel renders', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<BrowserPanel isActive initialUrl="https://example.com/preserved" />);
    });
    const iframe = container.querySelector('iframe');
    expect(iframe).not.toBeNull();
    const originalSrc = iframe?.getAttribute('src');

    await act(async () => {
      root.render(<BrowserPanel isActive={false} initialUrl="https://example.com/preserved" />);
    });

    expect(container.querySelector('iframe')).toBe(iframe);
    expect(container.querySelector('iframe')?.getAttribute('src')).toBe(originalSrc);

    await act(async () => {
      root.unmount();
    });
  });

  it('uses only its explicit upstream presentation state', () => {
    expect(browserPanelSource).toContain('const shouldShowWebview = isActive;');
    expect(browserPanelSource).not.toContain('useSceneStore');
  });

  it('pauses host observers and inspector work while hidden without unmounting the iframe', () => {
    expect(browserPanelSource).toContain('if (!isTauri || !shouldShowWebview) return;');
    expect(browserPanelSource).toContain('if (!shouldShowWebview) {\n      stopInspector();');
    expect(browserPanelSource).toContain('<iframe');
    expect(browserPanelSource).not.toMatch(
      /Transition browser panel webview visibility failed[\s\S]{0,240}closeWebview/,
    );
  });

  it('shares holder ownership and uses the atomic swap/occlusion boundaries', () => {
    expect(browserPanelSource).toContain('browserHolderWindowManager.acquire');
    expect(browserPanelSource).toContain('swapBrowserWebview({');
    expect(browserPanelSource).toContain('presentationLifecycle.setOccluded(hasOverlay)');
    expect(browserPanelSource).toContain('.void-toolbar-mode');
    expect(browserPanelSource).toContain('checkOverlays();');
    expect(browserPanelSource).toContain('TOOLBAR_MODE_ACTIVATION_FAILED_EVENT');
    expect(browserPanelSource).toMatch(
      /handleToolbarActivationFailed[\s\S]{0,160}checkOverlays\(\)/,
    );
    expect(browserPanelSource).not.toContain('holderWindowRef');
  });

  it('commits URL/polling only after activation and pauses host work while occluded', () => {
    const publishStart = browserPanelSource.indexOf('const publishWebviewSlot');
    const publishEnd = browserPanelSource.indexOf('const closeWebview', publishStart);
    const publishSource = browserPanelSource.slice(publishStart, publishEnd);

    expect(publishSource).not.toContain('setPollingLabel');
    expect(browserPanelSource).toContain('commitCandidate: ({ label: committedLabel }) => {');
    expect(browserPanelSource).toContain('currentUrlRef.current = url;');
    expect(browserPanelSource).toContain('setCurrentUrl(url);');
    expect(browserPanelSource).toContain('setPollingLabel(committedLabel);');
    expect(browserPanelSource).toContain('getBrowserHostTaskActivity');
    expect(browserPanelSource).toContain('!pollingActive || !pollingLabel');
    expect(browserPanelSource).toContain('if (!isTauri || !resizeRecoveryActive)');
    expect(browserPanelSource).toContain('const [hasRenderableBounds, setHasRenderableBounds] = useState(false)');
    expect(browserPanelSource).toContain('target !== webviewRef.current');
    expect(browserPanelSource).toContain('setIsOccluded(hasOverlay);');
  });

  it('keeps zero-size navigation pending and retries the whole swap from resize work', () => {
    const syncStart = browserPanelSource.indexOf('const syncWebviewBounds');
    const syncEnd = browserPanelSource.indexOf('const readCurrentWebviewSlot', syncStart);
    const syncSource = browserPanelSource.slice(syncStart, syncEnd);

    expect(browserPanelSource).toContain('Promise<boolean>');
    expect(browserPanelSource).toContain('if (!canPresent)');
    expect(browserPanelSource).toContain('steps: [() => handle.show()]');
    expect(syncSource).toContain('updateCurrentRenderableBounds(false)');
    expect(syncSource).toContain('stopInspector();');
    expect(browserPanelSource).toContain("result.status === 'blocked'");
    expect(browserPanelSource).toContain('pendingNavigation.suspend(requestToken);');
    expect(browserPanelSource).toContain('const retryUrl = pendingNavigation.retryUrl();');
    expect(browserPanelSource).toMatch(
      /if \(!handle\) \{\s+retryPendingNavigationRef\.current\(\);/,
    );
    expect(browserPanelSource).toMatch(
      /if \(result\.status === 'blocked'\) \{\s+await restored\?\.hide/,
    );
    expect(browserPanelSource).toContain(
      "else if (restored && restoredPresentation.status !== 'active')",
    );
  });
});
