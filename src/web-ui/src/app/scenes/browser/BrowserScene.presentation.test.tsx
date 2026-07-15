// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import BrowserScene from './BrowserScene';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/component-library', () => ({
  IconButton: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));

const sceneViewportSource = readFileSync(
  resolve(process.cwd(), 'src/app/scenes/SceneViewport.tsx'),
  'utf8',
);
const browserSceneSource = readFileSync(
  resolve(process.cwd(), 'src/app/scenes/browser/BrowserScene.tsx'),
  'utf8',
);

describe('BrowserScene presentation boundary', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('keeps the same iframe and URL mounted while presentation is hidden', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<BrowserScene isActive />);
    });
    const iframe = container.querySelector('iframe');
    expect(iframe).not.toBeNull();
    const originalSrc = iframe?.getAttribute('src');

    await act(async () => {
      root.render(<BrowserScene isActive={false} />);
    });

    expect(container.querySelector('iframe')).toBe(iframe);
    expect(container.querySelector('iframe')?.getAttribute('src')).toBe(originalSrc);

    await act(async () => {
      root.unmount();
    });
  });

  it('receives the final document-aware presentation state from SceneViewport', () => {
    expect(sceneViewportSource).toContain('<BrowserScene isActive={isActive} />');
    expect(browserSceneSource).toContain('React.FC<BrowserSceneProps> = ({ isActive })');
    expect(browserSceneSource).not.toContain('useSceneStore');
  });

  it('installs host observers only while active and never closes on a transition failure', () => {
    expect(browserSceneSource).toContain('if (!isTauri || !isActive)');
    expect(browserSceneSource).toContain("log.warn('Transition browser webview visibility failed'");
    expect(browserSceneSource).toContain('void handle.hide().catch(() => {});');
    expect(browserSceneSource).not.toMatch(
      /Transition browser webview visibility failed[\s\S]{0,240}closeWebview/,
    );
  });

  it('wires holder, swap, and overlay ownership through their dedicated modules', () => {
    expect(browserSceneSource).toContain('browserHolderWindowManager.acquire');
    expect(browserSceneSource).toContain('swapBrowserWebview({');
    expect(browserSceneSource).toContain('presentationLifecycle.setOccluded(hasOverlay)');
    expect(browserSceneSource).toContain('.void-toolbar-mode');
    expect(browserSceneSource).toContain('checkOverlays();');
    expect(browserSceneSource).toContain('TOOLBAR_MODE_ACTIVATION_FAILED_EVENT');
    expect(browserSceneSource).toMatch(
      /handleToolbarActivationFailed[\s\S]{0,160}checkOverlays\(\)/,
    );
    expect(browserSceneSource).not.toContain('holderWindowRef');
  });

  it('commits URL/polling only after activation and pauses host work while occluded', () => {
    const publishStart = browserSceneSource.indexOf('const publishWebviewSlot');
    const publishEnd = browserSceneSource.indexOf('const closeWebview', publishStart);
    const publishSource = browserSceneSource.slice(publishStart, publishEnd);

    expect(publishSource).not.toContain('setPollingLabel');
    expect(browserSceneSource).toContain('commitCandidate: ({ label }) => {');
    expect(browserSceneSource).toContain('currentUrlRef.current = url;');
    expect(browserSceneSource).toContain('setCurrentUrl(url);');
    expect(browserSceneSource).toContain('setPollingLabel(label);');
    expect(browserSceneSource).toContain('getBrowserHostTaskActivity');
    expect(browserSceneSource).toContain('!pollingActive || !pollingLabel');
    expect(browserSceneSource).toContain('if (!isTauri || !resizeRecoveryActive)');
    expect(browserSceneSource).toContain('const [hasRenderableBounds, setHasRenderableBounds] = useState(false)');
    expect(browserSceneSource).toContain('target !== webviewRef.current');
    expect(browserSceneSource).toContain('setIsOccluded(hasOverlay);');
  });

  it('keeps zero-size navigation pending and retries the whole swap from resize work', () => {
    expect(browserSceneSource).toContain('Promise<boolean>');
    expect(browserSceneSource).toContain('if (!canPresent)');
    expect(browserSceneSource).toContain('steps: [() => handle.show()]');
    expect(browserSceneSource).toContain("result.status === 'blocked'");
    expect(browserSceneSource).toContain('pendingNavigation.suspend(requestToken);');
    expect(browserSceneSource).toContain('const retryUrl = pendingNavigation.retryUrl();');
    expect(browserSceneSource).toMatch(
      /if \(!handle\) \{\s+retryPendingNavigationRef\.current\(\);/,
    );
    expect(browserSceneSource).toMatch(
      /if \(result\.status === 'blocked'\) \{\s+await restored\?\.hide/,
    );
    expect(browserSceneSource).toContain(
      "else if (restored && restoredPresentation.status !== 'active')",
    );
  });
});
