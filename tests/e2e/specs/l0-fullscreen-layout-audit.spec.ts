import { $, browser, expect } from '@wdio/globals';
import * as path from 'node:path';

import { openWorkspace } from '../helpers/workspace-helper';
import { saveScreenshot } from '../helpers/screenshot-utils';

const TEST_WORKSPACE_PATH = process.env.E2E_TEST_WORKSPACE || process.cwd();
const screenshotDirectory = path.resolve(
  process.cwd(),
  '..',
  '..',
  '.codex-artifacts',
  'fullscreen-audit',
);

const settingsTabs = [
  'account',
  'basics',
  'appearance',
  'models',
  'archived-sessions',
  'keyboard',
  'session-personalization',
  'session-permissions',
  'quick-actions',
  'review',
  'mcp-tools',
  'acp-agents',
  'editor',
] as const;

type SettingsTab = (typeof settingsTabs)[number];

const waitForDoubleAnimationFrame = () => browser.execute(async () => {
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
});

const dismissVisualObstructions = async () => {
  await browser.execute(async () => {
    const modulePath = '/src/shared/notification-system/index.ts';
    const { notificationService } = await import(/* @vite-ignore */ modulePath);
    notificationService.toggleCenter(false);
    notificationService.dismissAll();
  });
  await waitForDoubleAnimationFrame();
};

const openScene = async (sceneId: 'automation' | 'settings', selector: string) => {
  await browser.execute((id) => {
    window.dispatchEvent(new CustomEvent('scene:open', {
      detail: { sceneId: id },
    }));
  }, sceneId);
  await $(selector).waitForDisplayed({ timeout: 15_000 });
  await dismissVisualObstructions();
};

const openSettingsTab = async (tab: SettingsTab) => {
  await browser.execute(async (tabId) => {
    const modulePath = '/src/app/scenes/settings/settingsStore.ts';
    const { useSettingsStore } = await import(/* @vite-ignore */ modulePath);
    useSettingsStore.getState().setActiveTab(tabId);
    window.dispatchEvent(new CustomEvent('scene:open', {
      detail: { sceneId: 'settings' },
    }));
  }, tab);
  await $('.void-config-page-layout').waitForDisplayed({ timeout: 20_000 });
  await browser.waitUntil(async () => browser.execute(async (tabId) => {
    const modulePath = '/src/app/scenes/settings/settingsStore.ts';
    const { useSettingsStore } = await import(/* @vite-ignore */ modulePath);
    return useSettingsStore.getState().activeTab === tabId;
  }, tab), {
    timeout: 10_000,
    interval: 100,
    timeoutMsg: `Settings tab did not activate: ${tab}`,
  });
  await browser.execute(() => {
    document.querySelector<HTMLElement>('.void-config-page-layout')
      ?.scrollTo({ top: 0 });
  });
  await dismissVisualObstructions();
};

const verifyFullscreenSurface = async (selector: string) => {
  const evidence = await browser.execute((surfaceSelector) => {
    const surface = document.querySelector<HTMLElement>(surfaceSelector);
    if (!surface) throw new Error(`Surface is unavailable: ${surfaceSelector}`);
    const rect = surface.getBoundingClientRect();
    return {
      documentClientWidth: document.documentElement.clientWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      devicePixelRatio: window.devicePixelRatio,
      rect: {
        bottom: rect.bottom,
        left: rect.left,
        right: rect.right,
        top: rect.top,
      },
      surfaceClientWidth: surface.clientWidth,
      surfaceScrollWidth: surface.scrollWidth,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
    };
  }, selector);

  expect(
    evidence.viewportWidth * evidence.devicePixelRatio,
  ).toBeGreaterThanOrEqual(1_900);
  expect(
    evidence.viewportHeight * evidence.devicePixelRatio,
  ).toBeGreaterThanOrEqual(1_000);
  expect(evidence.documentScrollWidth).toBeLessThanOrEqual(
    evidence.documentClientWidth + 1,
  );
  expect(evidence.surfaceScrollWidth).toBeLessThanOrEqual(
    evidence.surfaceClientWidth + 1,
  );
  expect(evidence.rect.left).toBeGreaterThanOrEqual(-1);
  expect(evidence.rect.right).toBeLessThanOrEqual(evidence.viewportWidth + 1);
  expect(evidence.rect.top).toBeGreaterThanOrEqual(-1);
  expect(evidence.rect.bottom).toBeLessThanOrEqual(evidence.viewportHeight + 1);
};

const captureFullscreenSurface = async (name: string, selector: string) => {
  await dismissVisualObstructions();
  await verifyFullscreenSurface(selector);
  await saveScreenshot(name, {
    directory: screenshotDirectory,
    includeTimestamp: false,
    prefix: 'fullscreen',
  });
};

describe('L0 complete-window layout audit at 100% zoom', () => {
  let mediaSessionId: string | null = null;

  before(async () => {
    await browser.maximizeWindow();
    await browser.keys([
      process.platform === 'darwin' ? 'Meta' : 'Control',
      '0',
    ]);
    await waitForDoubleAnimationFrame();
    const desktopZoom = await browser.execute(async () => {
      const internals = (
        window as Window & {
          __TAURI_INTERNALS__?: {
            invoke<T>(command: string, args?: unknown): Promise<T>;
          };
        }
      ).__TAURI_INTERNALS__;
      if (!internals) throw new Error('Tauri internals are unavailable');
      return internals.invoke<number>('get_config', {
        request: {
          path: 'app.zoom_level',
          skipRetryOnNotFound: true,
        },
      });
    });
    expect(desktopZoom).toBe(1);
    expect(await openWorkspace(TEST_WORKSPACE_PATH)).toBe(true);
    await dismissVisualObstructions();

    mediaSessionId = await browser.execute(async () => {
      const globalStatePath = '/src/shared/types/global-state.ts';
      const managerPath = '/src/flow_chat/services/FlowChatManager.ts';
      const { globalStateAPI } = await import(/* @vite-ignore */ globalStatePath);
      const { flowChatManager } = await import(/* @vite-ignore */ managerPath);
      const workspace = await globalStateAPI.getCurrentWorkspace();
      if (!workspace?.rootPath) {
        throw new Error('A workspace is required for the layout audit');
      }
      return flowChatManager.createChatSession(
        { workspacePath: workspace.rootPath },
        'Media',
      );
    });
  });

  it('captures automation and every settings category as complete windows', async () => {
    await openScene('automation', '.automation-scene');
    await captureFullscreenSurface('automation', '.automation-scene');

    for (const tab of settingsTabs) {
      await openSettingsTab(tab);
      await captureFullscreenSurface(`settings-${tab}`, '.void-settings-scene');
    }
  });

  it('captures media and short-drama workspaces as complete windows', async () => {
    if (!mediaSessionId) throw new Error('Media audit session is unavailable');

    await browser.execute(async (sessionId) => {
      const modulePath = '/src/flow_chat/services/openBtwSession.ts';
      const { openMainSession } = await import(/* @vite-ignore */ modulePath);
      await openMainSession(sessionId);
    }, mediaSessionId);
    await $('.void-session-scene').waitForDisplayed({ timeout: 20_000 });

    await browser.execute(() => {
      window.dispatchEvent(new CustomEvent('void:open-workspace-media'));
    });
    await $('.workspace-media-gallery').waitForDisplayed({ timeout: 20_000 });
    await captureFullscreenSurface('media', '.workspace-media-gallery');

    await browser.execute(() => {
      window.dispatchEvent(new CustomEvent('void:open-short-drama-center'));
    });
    await $('[data-testid="short-drama-center"]').waitForDisplayed({
      timeout: 20_000,
    });
    await captureFullscreenSurface(
      'short-drama',
      '[data-testid="short-drama-center"]',
    );
  });

  after(async () => {
    if (!mediaSessionId) return;
    const sessionId = mediaSessionId;
    mediaSessionId = null;
    await browser.execute(async (id) => {
      const managerPath = '/src/flow_chat/services/FlowChatManager.ts';
      const { flowChatManager } = await import(/* @vite-ignore */ managerPath);
      await flowChatManager.deleteChatSession(id);
    }, sessionId);
  });
});
