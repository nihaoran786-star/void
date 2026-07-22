import { browser, expect, $, $$ } from '@wdio/globals';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { openWorkspace } from '../helpers/workspace-helper';

const TEST_WORKSPACE_PATH = process.env.E2E_TEST_WORKSPACE || process.cwd();

async function dismissVisibleNotifications(): Promise<void> {
  const closeButtons = await $$('.notification-item__close');
  for (const closeButton of closeButtons) {
    if (await closeButton.isDisplayed()) {
      await closeButton.click();
    }
  }
}

describe('Short drama center smoke', () => {
  let createdMediaSessionId: string | null = null;

  before(async () => {
    mkdirSync('reports/screenshots', { recursive: true });
    const hasWorkspace = await openWorkspace(TEST_WORKSPACE_PATH);
    expect(hasWorkspace).toBe(true);
  });

  afterEach(async () => {
    if (!createdMediaSessionId) {
      return;
    }

    const sessionId = createdMediaSessionId;
    createdMediaSessionId = null;
    await browser.execute(async (id) => {
      const { flowChatManager } = await import('/src/flow_chat/services/FlowChatManager.ts');
      await flowChatManager.deleteChatSession(id);
    }, sessionId);
  });

  it('opens the short drama center and switches stage and episode views', async () => {
    createdMediaSessionId = await browser.execute(async () => {
      const { useAgentCanvasStore } = await import('/src/app/components/panels/content-canvas/stores/index.ts');
      const { globalStateAPI } = await import('/src/shared/types/global-state.ts');
      const { flowChatManager } = await import('/src/flow_chat/services/FlowChatManager.ts');
      const { openMainSession } = await import('/src/flow_chat/services/openBtwSession.ts');
      useAgentCanvasStore.getState().reset();
      const workspace = await globalStateAPI.getCurrentWorkspace();
      if (!workspace?.rootPath) {
        throw new Error('Expected an active workspace before creating the Media parent session');
      }

      const mediaSessionId = await flowChatManager.createChatSession(
        { workspacePath: workspace.rootPath },
        'Media',
      );
      await openMainSession(mediaSessionId);
      return mediaSessionId;
    });

    const sessionScene = await $('.void-session-scene');
    await sessionScene.waitForExist({ timeout: 10000 });
    const canvas = await $('.canvas-content-canvas');
    await canvas.waitForExist({ timeout: 10000 });

    await browser.execute(() => {
      window.dispatchEvent(new CustomEvent('void:open-short-drama-center'));
    });

    await browser.waitUntil(async () => {
      return browser.execute(() => Boolean(document.querySelector('[data-testid="short-drama-center"]')));
    }, {
      timeout: 10000,
      interval: 250,
      timeoutMsg: 'short drama center did not open through global event',
    });

    const center = await $('[data-testid="short-drama-center"]');
    await center.waitForExist({ timeout: 10000 });
    await expect(center).toBeExisting();

    await browser.execute(async () => {
      const { useAgentCanvasStore } = await import('/src/app/components/panels/content-canvas/stores/index.ts');
      const canvasState = useAgentCanvasStore.getState();
      const centerEntry = (['primary', 'secondary', 'tertiary'] as const)
        .map(groupId => {
          const group = groupId === 'primary'
            ? canvasState.primaryGroup
            : groupId === 'secondary'
              ? canvasState.secondaryGroup
              : canvasState.tertiaryGroup;
          return {
            groupId,
            tab: group.tabs.find(tab => tab.content.type === 'short-drama-center'),
          };
        })
        .find(entry => entry.tab);
      if (!centerEntry?.tab || centerEntry.tab.content.type !== 'short-drama-center') {
        throw new Error('Expected the short-drama center canvas tab to exist');
      }
      canvasState.switchToTab(centerEntry.tab.id, centerEntry.groupId);
      canvasState.updateTabContent(centerEntry.tab.id, centerEntry.groupId, {
        ...centerEntry.tab.content,
        data: {
          ...centerEntry.tab.content.data,
          staticFixtureEpisodeCount: 10,
        },
      });
    });

    await browser.waitUntil(async () => (
      (await $$('[data-testid="short-drama-stage-tab"]')).length >= 5
    ), {
      timeout: 5000,
      interval: 100,
      timeoutMsg: 'short drama stage tabs did not render after loading the fixture',
    });
    const tabs = await $$('[data-testid="short-drama-stage-tab"]');
    await expect(tabs.length).toBeGreaterThanOrEqual(5);
    await browser.waitUntil(async () => browser.execute(async () => {
      const { useContextStore } = await import('/src/shared/context-system/index.ts');
      return useContextStore.getState().contexts.some(context => (
        context.metadata?.source === 'short-drama-main-ai-context-export'
          && context.type === 'code-snippet'
          && typeof context.selectedText === 'string'
          && context.selectedText.includes('listShortDramaMedia')
      ));
    }), {
      timeout: 5000,
      interval: 100,
      timeoutMsg: 'short drama main AI awareness context was not registered',
    });

    const expectActiveStageAgent = async (stage: string, title: string) => {
      await browser.waitUntil(async () => browser.execute(async (expectedStage, expectedTitle) => {
        const { useAgentCanvasStore } = await import('/src/app/components/panels/content-canvas/stores/index.ts');
        const state = useAgentCanvasStore.getState();
        const activeTab = state.secondaryGroup.tabs.find(tab => tab.id === state.secondaryGroup.activeTabId);
        return activeTab?.content.type === 'btw-session'
          && activeTab.title.includes(expectedTitle)
          && activeTab.content.metadata?.shortDramaStage === expectedStage;
      }, stage, title), {
        timeout: 15000,
        interval: 200,
        timeoutMsg: `short drama ${stage} stage agent did not become the active native subagent tab`,
      });
    };

    const scriptTab = await $('[data-testid="short-drama-stage-tab"][data-short-drama-stage="script"]');
    await scriptTab.click();
    await expectActiveStageAgent('script', 'ScriptAI');

    const isMinimalPresentation = await browser.execute(() => (
      document.querySelector('[data-ui-presentation]')
        ?.getAttribute('data-ui-presentation') === 'minimal'
    ));
    const teamPanel = await $('.canvas-editor-area[data-short-drama-team-mode]');
    await teamPanel.waitForExist({ timeout: 5000 });

    if (isMinimalPresentation) {
      await expect(teamPanel).toHaveAttribute('data-short-drama-team-mode', 'rail');
      const teamSummary = await $('[data-testid="short-drama-team-panel-toggle"]');
      await teamSummary.waitForExist({
        timeout: 5000,
        timeoutMsg: 'short drama team summary did not load on demand',
      });
      expect(await teamSummary.getAttribute('aria-label')).toBeTruthy();
      expect(await teamSummary.getAttribute('aria-expanded')).toBe('false');

      const mediaSurfaceButtons = await $$(
        '.workspace-media-entry--switcher .workspace-media-entry__option',
      );
      await expect(mediaSurfaceButtons.length).toBe(2);
      await browser.saveScreenshot('reports/short-drama-header-rail-new.png');
      const keyboardTraversalEvidence = await browser.execute(() => {
        const surfaceButtons = Array.from(document.querySelectorAll<HTMLButtonElement>(
          '.workspace-media-entry--switcher .workspace-media-entry__option',
        ));
        surfaceButtons[0]?.focus();
        return {
          focused: document.activeElement === surfaceButtons[0],
          nextLabel: surfaceButtons[1]?.getAttribute('aria-label'),
        };
      });
      expect(keyboardTraversalEvidence.focused).toBe(true);
      expect(keyboardTraversalEvidence.nextLabel).toBeTruthy();
      await browser.keys(['Tab']);
      const keyboardTabLabel = await browser.execute(() => (
        document.activeElement?.getAttribute('aria-label')
      ));
      expect(keyboardTabLabel).toBe(keyboardTraversalEvidence.nextLabel);

      const railLayout = await browser.execute(() => {
        const area = document.querySelector('.canvas-editor-area[data-short-drama-team-mode="rail"]');
        const primary = area?.querySelector(':scope > .canvas-editor-area__primary');
        const secondary = area?.querySelector(':scope > .canvas-editor-area__secondary');
        const hiddenAgentContent = secondary?.querySelector(':scope > .canvas-editor-group');
        if (
          !(area instanceof HTMLElement)
          || !(primary instanceof HTMLElement)
          || !(secondary instanceof HTMLElement)
          || !(hiddenAgentContent instanceof HTMLElement)
        ) {
          return null;
        }
        return {
          areaWidth: area.getBoundingClientRect().width,
          primaryWidth: primary.getBoundingClientRect().width,
          secondaryWidth: secondary.getBoundingClientRect().width,
          hiddenAgentVisibility: getComputedStyle(hiddenAgentContent).visibility,
        };
      });
      expect(railLayout?.secondaryWidth).toBeLessThanOrEqual(46);
      expect(railLayout?.primaryWidth).toBeGreaterThanOrEqual((railLayout?.areaWidth ?? 0) * 0.9);
      expect(railLayout?.hiddenAgentVisibility).toBe('hidden');

      const moreActions = await $(
        '.canvas-editor-area__primary .canvas-tab-panorama-btn',
      );
      await moreActions.click();
      const moreMenu = await $('[role="menu"][aria-label="更多操作"]');
      await moreMenu.waitForExist({ timeout: 3000 });
      await browser.saveScreenshot('reports/short-drama-header-menu-new.png');
      await browser.keys(['Escape']);
      await moreMenu.waitForExist({ reverse: true, timeout: 3000 });
      expect(await moreActions.isFocused()).toBe(true);

      await teamSummary.click();
      await expect(teamPanel).toHaveAttribute('data-short-drama-team-mode', 'open');
      const agentChromeEvidence = await browser.execute(async () => {
        const { useAgentCanvasStore } = await import(
          '/src/app/components/panels/content-canvas/stores/index.ts'
        );
        const nativeTabBar = document.querySelector<HTMLElement>(
          '.canvas-editor-area__secondary .canvas-tab-bar',
        );
        const sessionHeaderTitle = document.querySelector<HTMLElement>(
          '.canvas-editor-area__secondary .btw-session-panel__header-title-wrap',
        );
        return {
          total: useAgentCanvasStore.getState().secondaryGroup.tabs.length,
          activeTabId: useAgentCanvasStore.getState().secondaryGroup.activeTabId,
          nativeTabBarDisplay: nativeTabBar
            ? getComputedStyle(nativeTabBar).display
            : '',
          sessionHeaderTitleDisplay: sessionHeaderTitle
            ? getComputedStyle(sessionHeaderTitle).display
            : '',
        };
      });
      expect(agentChromeEvidence.total).toBe(5);
      expect(agentChromeEvidence.nativeTabBarDisplay).toBe('none');
      expect(agentChromeEvidence.sessionHeaderTitleDisplay).toBe('none');
      await expect((await $$(
        '[data-testid="short-drama-team-panel-toggle"]',
      )).length).toBe(0);
      const agentTrigger = await $(
        '[data-testid="short-drama-team-agent-trigger"]',
      );
      const panelCollapse = await $(
        '[data-testid="short-drama-team-panel-collapse"]',
      );
      await agentTrigger.waitForClickable({ timeout: 3000 });
      await panelCollapse.waitForClickable({ timeout: 3000 });
      expect(await agentTrigger.getAttribute('aria-expanded')).toBe('false');
      expect(await panelCollapse.getAttribute('aria-label')).toBeTruthy();
      await browser.saveScreenshot('reports/short-drama-header-team-open-new.png');

      await agentTrigger.click();
      const agentMenu = await $('[data-testid="short-drama-team-agent-menu"]');
      await agentMenu.waitForDisplayed({ timeout: 3000 });
      const agentOptions = await $$('[data-testid="short-drama-team-agent"]');
      expect(agentOptions).toHaveLength(5);
      await browser.saveScreenshot('reports/short-drama-header-team-menu-new.png');
      await browser.keys(['ArrowDown']);
      const focusedAgentId = await browser.execute(() => (
        document.activeElement?.getAttribute('data-short-drama-team-agent-id')
      ));
      expect(focusedAgentId).toBeTruthy();
      const focusedAgent = await $(
        `[data-testid="short-drama-team-agent"]`
        + `[data-short-drama-team-agent-id="${focusedAgentId}"]`,
      );
      await focusedAgent.click();
      await agentMenu.waitForExist({ reverse: true, timeout: 3000 });
      await browser.waitUntil(async () => browser.execute(async (
        previousActiveTabId,
      ) => {
        const { useAgentCanvasStore } = await import(
          '/src/app/components/panels/content-canvas/stores/index.ts'
        );
        return (
          useAgentCanvasStore.getState().secondaryGroup.activeTabId
          !== previousActiveTabId
        );
      }, agentChromeEvidence.activeTabId), {
        timeout: 3000,
        interval: 100,
        timeoutMsg: 'single-row team selector did not switch the active agent',
      });

      const refreshedAgentTrigger = await $(
        '[data-testid="short-drama-team-agent-trigger"]',
      );
      await refreshedAgentTrigger.click();
      const reopenedAgentMenu = await $(
        '[data-testid="short-drama-team-agent-menu"]',
      );
      await reopenedAgentMenu.waitForDisplayed({ timeout: 3000 });
      await browser.keys(['Escape']);
      await reopenedAgentMenu.waitForExist({ reverse: true, timeout: 3000 });
      expect(await refreshedAgentTrigger.isFocused()).toBe(true);

      const openLayout = await browser.execute(() => {
        const area = document.querySelector('.canvas-editor-area[data-short-drama-team-mode="open"]');
        const primary = area?.querySelector(':scope > .canvas-editor-area__primary');
        const secondary = area?.querySelector(':scope > .canvas-editor-area__secondary');
        if (
          !(area instanceof HTMLElement)
          || !(primary instanceof HTMLElement)
          || !(secondary instanceof HTMLElement)
        ) {
          return null;
        }
        const primaryRect = primary.getBoundingClientRect();
        const secondaryRect = secondary.getBoundingClientRect();
        return {
          areaWidth: area.getBoundingClientRect().width,
          primaryWidth: primaryRect.width,
          secondaryWidth: secondaryRect.width,
          primaryRight: primaryRect.right,
          secondaryLeft: secondaryRect.left,
        };
      });
      expect(openLayout?.secondaryWidth).toBeLessThanOrEqual(420);
      expect(openLayout?.primaryWidth).toBeGreaterThanOrEqual((openLayout?.areaWidth ?? 0) * 0.68);
      expect(openLayout?.primaryRight).toBeLessThanOrEqual((openLayout?.secondaryLeft ?? 0) + 1);
      await panelCollapse.click();
      await expect(teamPanel).toHaveAttribute('data-short-drama-team-mode', 'rail');
    } else {
      await expect(teamPanel).toHaveAttribute('data-short-drama-team-mode', 'closed');
      await expect((await $$('[data-testid="short-drama-team-agent"]')).length).toBe(0);
      const classicKeyboardPolicyEvidence = await browser.execute(() => {
        const stageTab = document.querySelector<HTMLButtonElement>(
          '[data-testid="short-drama-stage-tab"][data-short-drama-stage="script"]',
        );
        stageTab?.focus();
        const tabEvent = new KeyboardEvent('keydown', {
          key: 'Tab',
          bubbles: true,
          cancelable: true,
        });
        const dispatchResult = stageTab?.dispatchEvent(tabEvent);
        return {
          focused: document.activeElement === stageTab,
          defaultPrevented: tabEvent.defaultPrevented,
          dispatchResult,
        };
      });
      expect(classicKeyboardPolicyEvidence.focused).toBe(true);
      expect(classicKeyboardPolicyEvidence.defaultPrevented).toBe(true);
      expect(classicKeyboardPolicyEvidence.dispatchResult).toBe(false);
      const classicLayout = await browser.execute(() => {
        const area = document.querySelector('.canvas-editor-area[data-short-drama-team-mode="closed"]');
        const primary = area?.querySelector(':scope > .canvas-editor-area__primary');
        const secondary = area?.querySelector(':scope > .canvas-editor-area__secondary');
        const agentContent = secondary?.querySelector(':scope > .canvas-editor-group');
        if (
          !(area instanceof HTMLElement)
          || !(primary instanceof HTMLElement)
          || !(secondary instanceof HTMLElement)
          || !(agentContent instanceof HTMLElement)
        ) {
          return null;
        }
        return {
          primaryWidth: primary.getBoundingClientRect().width,
          secondaryWidth: secondary.getBoundingClientRect().width,
          agentVisibility: getComputedStyle(agentContent).visibility,
        };
      });
      expect(classicLayout?.primaryWidth).toBeGreaterThan(100);
      expect(classicLayout?.secondaryWidth).toBeGreaterThan(100);
      expect(classicLayout?.agentVisibility).toBe('visible');
    }

    const assetsTab = await $('[data-testid="short-drama-stage-tab"][data-short-drama-stage="assets"]');
    await assetsTab.click();
    await browser.waitUntil(async () => browser.execute(() => Boolean(document.querySelector('.short-drama-center__asset-page'))), {
      timeout: 3000,
      interval: 100,
      timeoutMsg: 'short drama asset page did not render',
    });
    const hasEpisodeRailOnAssets = await browser.execute(() => Boolean(document.querySelector('[data-testid="short-drama-episode-rail"]')));
    expect(hasEpisodeRailOnAssets).toBe(false);
    const assetUsage = await $('.short-drama-center__asset-usage');
    await expect(assetUsage).toBeExisting();
    await expect(assetUsage).toHaveText(expect.stringContaining('EP01-SB01'));
    const assetImagePreview = await $('.short-drama-center__asset-page [data-testid="short-drama-media-preview"] img');
    await expect(assetImagePreview).toBeExisting();
    await expect(await assetImagePreview.getAttribute('src')).toContain('data:image/svg+xml');
    await expect(await assetImagePreview.getAttribute('loading')).toBe('lazy');
    await expectActiveStageAgent('assets', 'AssetAI');

    const storyboardsTab = await $('[data-testid="short-drama-stage-tab"][data-short-drama-stage="storyboards"]');
    await storyboardsTab.click();
    await browser.waitUntil(async () => browser.execute(() => Boolean(document.querySelector('[data-testid="short-drama-artifact-card"]'))), {
      timeout: 3000,
      interval: 100,
      timeoutMsg: 'short drama storyboard stage did not render',
    });
    const storyboardImagePreview = await $('[data-testid="short-drama-artifact-card"] [data-testid="short-drama-media-preview"] img');
    await expect(storyboardImagePreview).toBeExisting();
    await expect(await storyboardImagePreview.getAttribute('src')).toContain('data:image/svg+xml');
    await expect(await storyboardImagePreview.getAttribute('loading')).toBe('lazy');
    const storyboardCard = await $('[data-testid="short-drama-artifact-card"]');
    await expect(storyboardCard).toHaveText(expect.stringContaining('第 1 场 第 1 镜'));
    await expect(storyboardCard).not.toHaveText(expect.stringContaining('shortDrama.storyboards'));
    await expectActiveStageAgent('storyboards', 'SplitAI');

    const videoTab = await $('[data-testid="short-drama-stage-tab"][data-short-drama-stage="video"]');
    await videoTab.click();

    const episodeRail = await $('[data-testid="short-drama-episode-rail"]');
    await episodeRail.waitForExist({ timeout: 5000 });
    await expect(episodeRail).toBeExisting();

    const videoStage = await $('[data-testid="short-drama-video-stage"]');
    await expect(videoStage).toBeExisting();
    const videoPreview = await $('[data-testid="short-drama-video-stage"] [data-testid="short-drama-media-preview"] video');
    await expect(videoPreview).toBeExisting();
    await expect(await videoPreview.getAttribute('src')).toContain('/short-drama-static/final-preview.mp4');
    await expect(await videoPreview.getAttribute('preload')).toBe('metadata');
    const videoRailPreviews = await $$('[data-testid="short-drama-video-rail-item"] [data-testid="short-drama-media-preview"]');
    await expect(videoRailPreviews.length).toBeGreaterThan(0);
    const secondEpisodeButton = await $('[data-testid="short-drama-episode-rail"] button[data-episode-id="episode-02"]');
    await secondEpisodeButton.click();
    await browser.waitUntil(async () => (
      (await secondEpisodeButton.getAttribute('class')).includes('is-active')
    ), {
      timeout: 3000,
      interval: 100,
      timeoutMsg: 'episode 02 did not become active on video stage',
    });

    const hasInlineStageAgentDrawer = await browser.execute(() => Boolean(document.querySelector('[data-testid="short-drama-stage-agent-drawer"]')));
    expect(hasInlineStageAgentDrawer).toBe(false);
    await expectActiveStageAgent('video', 'VideoAI');

    const cards = await $$('[data-testid="short-drama-artifact-card"]');
    await expect(cards.length).toBeGreaterThan(0);

    const postTab = await $('[data-testid="short-drama-stage-tab"][data-short-drama-stage="post"]');
    await postTab.click();
    await browser.waitUntil(async () => browser.execute(() => Boolean(document.querySelector('.short-drama-center__post'))), {
      timeout: 5000,
      interval: 100,
      timeoutMsg: 'short drama post stage did not render',
    });
    await expectActiveStageAgent('post', 'EditorAI');
    const activePostEpisode = await $('[data-testid="short-drama-episode-rail"] button.is-active');
    await expect(await activePostEpisode.getAttribute('data-episode-id')).toBe('episode-02');
    const awarenessContextText = await browser.execute(async () => {
      const { useContextStore } = await import('/src/shared/context-system/index.ts');
      const context = useContextStore.getState().contexts
        .filter(item => item.metadata?.source === 'short-drama-main-ai-context-export')
        .sort((a, b) => b.timestamp - a.timestamp)[0];
      return context?.type === 'code-snippet' ? context.selectedText : undefined;
    });
    expect(awarenessContextText).toContain('activeStage: post');
    expect(awarenessContextText).toContain('activeEpisodeId: episode-02');
    expect(awarenessContextText).toContain('reviewShortDramaStageOutput');
    expect(awarenessContextText).not.toContain('/short-drama-static/final-preview.mp4');
    const firstEpisodeButton = await $('[data-testid="short-drama-episode-rail"] button[data-episode-id="episode-01"]');
    await firstEpisodeButton.click();
    const finalPreviewVideo = await $('.short-drama-center__final-preview [data-testid="short-drama-media-preview"] video');
    await finalPreviewVideo.waitForExist({ timeout: 5000 });
    await expect(finalPreviewVideo).toBeExisting();
    await expect(await finalPreviewVideo.getAttribute('src')).toContain('/short-drama-static/final-preview.mp4');
    await expect(await finalPreviewVideo.getAttribute('preload')).toBe('metadata');
    const postRowPreviews = await $$('[data-testid="short-drama-post-row"] [data-testid="short-drama-media-preview"]');
    await expect(postRowPreviews.length).toBeGreaterThan(0);
    if (isMinimalPresentation) {
      const flattenedPostEvidence = await browser.execute(() => {
        const finalPreview = document.querySelector<HTMLElement>(
          '.short-drama-center__final-preview',
        );
        const postList = document.querySelector<HTMLElement>(
          '.short-drama-center__post-list',
        );
        const postRow = document.querySelector<HTMLElement>(
          '[data-testid="short-drama-post-row"]',
        );
        const rowPreview = postRow?.querySelector<HTMLElement>(
          '.short-drama-media-preview--row',
        );
        const rowStatus = postRow?.querySelector<HTMLElement>(
          ':scope > .short-drama-pill',
        );
        if (!finalPreview || !postList || !postRow || !rowPreview || !rowStatus) {
          return null;
        }
        const finalStyle = getComputedStyle(finalPreview);
        const listStyle = getComputedStyle(postList);
        const rowStyle = getComputedStyle(postRow);
        return {
          finalBorderWidth: finalStyle.borderTopWidth,
          finalPaddingTop: finalStyle.paddingTop,
          listBorderWidth: listStyle.borderTopWidth,
          listOverflow: listStyle.overflow,
          rowColumns: rowStyle.gridTemplateColumns,
          rowPreviewWidth: rowPreview.getBoundingClientRect().width,
          rowStatusVisible: rowStatus.getBoundingClientRect().width > 0,
        };
      });
      expect(flattenedPostEvidence?.finalBorderWidth).toBe('0px');
      expect(flattenedPostEvidence?.finalPaddingTop).toBe('0px');
      expect(flattenedPostEvidence?.listBorderWidth).toBe('0px');
      expect(flattenedPostEvidence?.listOverflow).toBe('visible');
      expect(flattenedPostEvidence?.rowColumns.split(' ')).toHaveLength(3);
      expect(flattenedPostEvidence?.rowPreviewWidth).toBeLessThanOrEqual(82);
      expect(flattenedPostEvidence?.rowStatusVisible).toBe(true);
      await dismissVisibleNotifications();
      await browser.saveScreenshot('reports/short-drama-post-ready-minimal.png');

      const readyPostTeamSummary = await $(
        '[data-testid="short-drama-team-panel-toggle"]',
      );
      await readyPostTeamSummary.click();
      await expect(teamPanel).toHaveAttribute('data-short-drama-team-mode', 'open');
      const narrowPostEvidence = await browser.execute(() => {
        const center = document.querySelector<HTMLElement>(
          '[data-testid="short-drama-center"]',
        );
        const row = document.querySelector<HTMLElement>(
          '[data-testid="short-drama-post-row"]',
        );
        if (!center || !row) {
          return null;
        }
        return {
          centerWidth: center.getBoundingClientRect().width,
          centerScrollWidth: center.scrollWidth,
          rowWidth: row.getBoundingClientRect().width,
          rowScrollWidth: row.scrollWidth,
        };
      });
      expect(narrowPostEvidence?.centerWidth).toBeGreaterThan(300);
      expect(narrowPostEvidence?.centerScrollWidth)
        .toBeLessThanOrEqual((narrowPostEvidence?.centerWidth ?? 0) + 8);
      expect(narrowPostEvidence?.rowScrollWidth)
        .toBeLessThanOrEqual((narrowPostEvidence?.rowWidth ?? 0) + 2);
      await browser.saveScreenshot(
        'reports/short-drama-post-ready-team-open-minimal.png',
      );
      const readyPostPanelCollapse = await $(
        '[data-testid="short-drama-team-panel-collapse"]',
      );
      await readyPostPanelCollapse.click();
      await expect(teamPanel).toHaveAttribute('data-short-drama-team-mode', 'rail');
    }
    const thirdEpisodeButton = await $('[data-testid="short-drama-episode-rail"] button[data-episode-id="episode-03"]');
    await thirdEpisodeButton.click();
    await browser.waitUntil(async () => (
      (await thirdEpisodeButton.getAttribute('class')).includes('is-active')
    ), {
      timeout: 3000,
      interval: 100,
      timeoutMsg: 'episode 03 did not become active on the post stage',
    });
    const emptyFinalPreview = await $('[data-testid="short-drama-episode-section"][data-episode-id="episode-03"] .short-drama-center__final-preview [data-testid="short-drama-media-preview"].is-empty.is-video');
    await emptyFinalPreview.waitForExist({ timeout: 5000 });
    await expect(emptyFinalPreview).toBeExisting();
    await expect(emptyFinalPreview).toHaveText(expect.stringContaining('Episode 03 post placeholder'));
    const emptyFinalPreviewVideos = await $$('[data-testid="short-drama-episode-section"][data-episode-id="episode-03"] .short-drama-center__final-preview [data-testid="short-drama-media-preview"].is-empty video');
    await expect(emptyFinalPreviewVideos.length).toBe(0);
    if (isMinimalPresentation) {
      await browser.saveScreenshot('reports/short-drama-post-empty-minimal.png');
    }

    mkdirSync('reports', { recursive: true });
    if (isMinimalPresentation) {
      await browser.saveScreenshot('reports/short-drama-team-rail.png');
      const teamSummary = await $('[data-testid="short-drama-team-panel-toggle"]');
      await teamSummary.click();
      await expect(teamPanel).toHaveAttribute('data-short-drama-team-mode', 'open');
      await browser.saveScreenshot('reports/short-drama-team-open.png');
      const panelCollapse = await $(
        '[data-testid="short-drama-team-panel-collapse"]',
      );
      await panelCollapse.click();
      await expect(teamPanel).toHaveAttribute('data-short-drama-team-mode', 'rail');
    } else {
      await browser.saveScreenshot('reports/short-drama-classic-layout.png');
    }
    await browser.saveScreenshot('reports/short-drama-media-preview.png');

    const dimensions = await browser.execute(() => {
      const panel = document.querySelector('[data-testid="short-drama-center"]') as HTMLElement | null;
      if (!panel) return null;
      const rect = panel.getBoundingClientRect();
      return {
        width: rect.width,
        height: rect.height,
        scrollWidth: panel.scrollWidth,
        scrollHeight: panel.scrollHeight,
      };
    });

    expect(dimensions?.width).toBeGreaterThan(300);
    expect(dimensions?.height).toBeGreaterThan(300);
    expect(dimensions?.scrollWidth).toBeLessThanOrEqual((dimensions?.width ?? 0) + 8);
  });

  it('keeps the long-series episode rail stable for a 100 episode fixture', async () => {
    createdMediaSessionId = await browser.execute(async () => {
      const { globalStateAPI } = await import('/src/shared/types/global-state.ts');
      const { flowChatManager } = await import('/src/flow_chat/services/FlowChatManager.ts');
      const { openMainSession } = await import('/src/flow_chat/services/openBtwSession.ts');
      const workspace = await globalStateAPI.getCurrentWorkspace();
      if (!workspace?.rootPath) {
        throw new Error('Expected an active workspace before creating the Media parent session');
      }
      const mediaSessionId = await flowChatManager.createChatSession(
        { workspacePath: workspace.rootPath },
        'Media',
      );
      await openMainSession(mediaSessionId);
      return mediaSessionId;
    });

    const sessionScene = await $('.void-session-scene');
    await sessionScene.waitForExist({ timeout: 10000 });
    const canvas = await $('.canvas-content-canvas');
    await canvas.waitForExist({ timeout: 10000 });

    await browser.execute(async (workspacePath) => {
      const { useAgentCanvasStore } = await import('/src/app/components/panels/content-canvas/stores/index.ts');
      useAgentCanvasStore.getState().reset();
      useAgentCanvasStore.getState().addTab({
        type: 'short-drama-center',
        title: 'Short drama 100',
        data: { workspacePath, staticFixtureEpisodeCount: 100 },
        metadata: {
          duplicateCheckKey: `short-drama-100:${workspacePath}`,
        },
      }, 'active', 'primary');
    }, join(TEST_WORKSPACE_PATH, 'short-drama-100'));

    const center = await $('[data-testid="short-drama-center"]');
    await center.waitForExist({ timeout: 10000 });

    const postTab = await $('[data-testid="short-drama-stage-tab"][data-short-drama-stage="post"]');
    await postTab.click();
    const hundredthEpisodeButton = await $('[data-testid="short-drama-episode-rail"] button[data-episode-id="episode-100"]');
    await hundredthEpisodeButton.waitForExist({ timeout: 5000 });
    await expect(hundredthEpisodeButton).toHaveText('100');
    await hundredthEpisodeButton.click();
    await browser.waitUntil(async () => (
      (await hundredthEpisodeButton.getAttribute('class')).includes('is-active')
    ), {
      timeout: 5000,
      interval: 100,
      timeoutMsg: 'episode 100 did not become active on the post stage',
    });

    const emptyFinalPreview = await $('[data-testid="short-drama-episode-section"][data-episode-id="episode-100"] .short-drama-center__final-preview [data-testid="short-drama-media-preview"].is-empty.is-video');
    await emptyFinalPreview.waitForExist({ timeout: 5000 });
    await expect(emptyFinalPreview).toBeExisting();
    await expect(emptyFinalPreview).toHaveText(expect.stringContaining('Episode 100 post placeholder'));

    const videoTab = await $('[data-testid="short-drama-stage-tab"][data-short-drama-stage="video"]');
    await videoTab.click();
    await browser.waitUntil(async () => {
      const activeVideoEpisode = await $('[data-testid="short-drama-episode-rail"] button.is-active');
      return (await activeVideoEpisode.getAttribute('data-episode-id')) === 'episode-100';
    }, {
      timeout: 5000,
      interval: 100,
      timeoutMsg: 'episode 100 was not preserved after switching to the video stage',
    });

    const dimensions = await browser.execute(() => {
      const panel = document.querySelector('[data-testid="short-drama-center"]') as HTMLElement | null;
      const rail = document.querySelector('[data-testid="short-drama-episode-rail"]') as HTMLElement | null;
      if (!panel || !rail) return null;
      const panelRect = panel.getBoundingClientRect();
      const railRect = rail.getBoundingClientRect();
      return {
        panelWidth: panelRect.width,
        panelScrollWidth: panel.scrollWidth,
        railWidth: railRect.width,
      };
    });

    expect(dimensions?.panelWidth).toBeGreaterThan(300);
    expect(dimensions?.panelScrollWidth).toBeLessThanOrEqual((dimensions?.panelWidth ?? 0) + 8);
    expect(dimensions?.railWidth).toBeLessThanOrEqual(40);
  });
});
