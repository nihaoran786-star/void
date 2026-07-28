import { $, browser, expect } from '@wdio/globals';
import * as path from 'node:path';
import { openWorkspace } from '../helpers/workspace-helper';
import { saveScreenshot } from '../helpers/screenshot-utils';

const screenshotDirectory = path.resolve(
  process.cwd(),
  '..',
  '..',
  '.codex-artifacts',
  'team-capability-rail',
);
const TEST_WORKSPACE_PATH = process.env.E2E_TEST_WORKSPACE || process.cwd();

const waitForMinimalPresentation = () => browser.waitUntil(
  async () => browser.execute(() => (
    document
      .querySelector('[data-testid="app-layout"]')
      ?.getAttribute('data-ui-presentation') === 'minimal'
    && !document.querySelector('.splash-screen')
  )),
  {
    timeout: 20_000,
    interval: 100,
    timeoutMsg: 'Minimal presentation did not settle for team rail verification',
  },
);

const openShortDramaFixture = async () => {
  await browser.execute(() => {
    window.dispatchEvent(new CustomEvent('void:open-short-drama-center'));
  });
  await $('[data-testid="short-drama-center"]').waitForDisplayed({
    timeout: 15_000,
  });
  await browser.execute(async () => {
    const { useAgentCanvasStore } = await import(
      '/src/app/components/panels/content-canvas/stores/index.ts'
    );
    const state = useAgentCanvasStore.getState();
    const centerEntry = (['primary', 'secondary', 'tertiary'] as const)
      .map((groupId) => {
        const group = groupId === 'primary'
          ? state.primaryGroup
          : groupId === 'secondary'
            ? state.secondaryGroup
            : state.tertiaryGroup;
        return {
          groupId,
          tab: group.tabs.find(tab => tab.content.type === 'short-drama-center'),
        };
      })
      .find(entry => entry.tab);
    if (!centerEntry?.tab || centerEntry.tab.content.type !== 'short-drama-center') {
      throw new Error('Expected the short-drama center canvas tab');
    }
    state.switchToTab(centerEntry.tab.id, centerEntry.groupId);
    state.updateTabContent(centerEntry.tab.id, centerEntry.groupId, {
      ...centerEntry.tab.content,
      data: {
        ...centerEntry.tab.content.data,
        staticFixtureEpisodeCount: 1,
      },
    });
  });
};

describe('L0 session team capability rail visual contract', () => {
  let sourceUrl = '';
  let originalWindowSize = { width: 1280, height: 800 };
  let createdMediaSessionId: string | null = null;

  before(async () => {
    sourceUrl = await browser.getUrl();
    originalWindowSize = await browser.getWindowSize();
    await waitForMinimalPresentation();
    const hasWorkspace = await openWorkspace(TEST_WORKSPACE_PATH);
    expect(hasWorkspace).toBe(true);
    await browser.setWindowSize(2582, 1390);

    createdMediaSessionId = await browser.execute(async () => {
      const { useAgentCanvasStore } = await import(
        '/src/app/components/panels/content-canvas/stores/index.ts'
      );
      const { globalStateAPI } = await import(
        '/src/shared/types/global-state.ts'
      );
      const { flowChatManager } = await import(
        '/src/flow_chat/services/FlowChatManager.ts'
      );
      const { openMainSession } = await import(
        '/src/flow_chat/services/openBtwSession.ts'
      );
      useAgentCanvasStore.getState().reset();
      const workspace = await globalStateAPI.getCurrentWorkspace();
      if (!workspace?.rootPath) {
        throw new Error('Expected a workspace before creating the Media session');
      }
      const sessionId = await flowChatManager.createChatSession(
        { workspacePath: workspace.rootPath },
        'Media',
      );
      await openMainSession(sessionId);
      return sessionId;
    });

    await $('.void-session-scene').waitForDisplayed({ timeout: 20_000 });
    await openShortDramaFixture();
  });

  it('keeps the team entry compact and opens coordination beside the canvas', async () => {
    const rail = await $('[data-testid="session-capability-rail"]');
    const teamToggle = await $('[data-testid="short-drama-team-panel-toggle"]');
    const editorArea = await $('.canvas-editor-area[data-short-drama-team-mode]');
    await rail.waitForDisplayed({ timeout: 10_000 });
    await teamToggle.waitForClickable({ timeout: 10_000 });

    const compactWidth = await rail.getSize('width');
    expect(compactWidth).toBeGreaterThanOrEqual(35);
    expect(compactWidth).toBeLessThanOrEqual(37);

    await saveScreenshot('team-rail-compact-full', {
      directory: screenshotDirectory,
      includeTimestamp: false,
      prefix: 'slice-team',
    });

    await teamToggle.click();
    await browser.waitUntil(async () => (
      await editorArea.getAttribute('data-short-drama-team-mode')
    ) === 'open', {
      timeout: 10_000,
      interval: 100,
      timeoutMsg: 'Team coordination pane did not open beside the canvas',
    });
    await browser.waitUntil(async () => (await rail.getSize('width')) <= 37, {
      timeout: 5_000,
      interval: 50,
      timeoutMsg: 'Team capability rail stayed expanded after pointer activation',
    });
    const layoutEvidence = await browser.execute(() => {
      const scene = document.querySelector<HTMLElement>('.void-session-scene');
      const editor = document.querySelector<HTMLElement>(
        '.canvas-editor-area[data-short-drama-team-mode="open"]',
      );
      const canvas = editor?.querySelector<HTMLElement>(
        ':scope > .canvas-editor-area__primary',
      );
      const team = editor?.querySelector<HTMLElement>(
        ':scope > .canvas-editor-area__secondary',
      );
      return {
        documentOverflow:
          document.documentElement.scrollWidth
          - document.documentElement.clientWidth,
        sceneOverflow: scene ? scene.scrollWidth - scene.clientWidth : 999,
        canvasWidth: canvas?.getBoundingClientRect().width ?? 0,
        teamWidth: team?.getBoundingClientRect().width ?? 0,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio,
      };
    });
    expect(layoutEvidence.canvasWidth).toBeGreaterThan(200);
    expect(layoutEvidence.teamWidth).toBeGreaterThan(280);
    expect(layoutEvidence.documentOverflow).toBeLessThanOrEqual(1);
    expect(layoutEvidence.sceneOverflow).toBeLessThanOrEqual(1);

    await saveScreenshot('team-coordination-open-full', {
      directory: screenshotDirectory,
      includeTimestamp: false,
      prefix: 'slice-team',
    });
  });

  after(async () => {
    if (createdMediaSessionId) {
      await browser.execute(async (sessionId) => {
        const { flowChatManager } = await import(
          '/src/flow_chat/services/FlowChatManager.ts'
        );
        await flowChatManager.deleteChatSession(sessionId);
      }, createdMediaSessionId);
    }
    await browser.setWindowSize(
      originalWindowSize.width,
      originalWindowSize.height,
    );
    await browser.url(sourceUrl);
  });
});
