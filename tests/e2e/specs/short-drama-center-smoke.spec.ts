import { browser, expect, $, $$ } from '@wdio/globals';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { openWorkspace } from '../helpers/workspace-helper';

const TEST_WORKSPACE_PATH = process.env.E2E_TEST_WORKSPACE || process.cwd();

describe('Short drama center smoke', () => {
  before(async () => {
    mkdirSync('reports/screenshots', { recursive: true });
    const hasWorkspace = await openWorkspace(TEST_WORKSPACE_PATH);
    expect(hasWorkspace).toBe(true);
  });

  it('opens the short drama center and switches stage and episode views', async () => {
    await browser.execute(async () => {
      const { useAgentCanvasStore } = await import('/src/app/components/panels/content-canvas/stores/index.ts');
      const { useSceneStore } = await import('/src/app/stores/sceneStore.ts');
      useAgentCanvasStore.getState().reset();
      useSceneStore.getState().openScene('session');
    });

    const sessionScene = await $('.void-session-scene');
    await sessionScene.waitForExist({ timeout: 10000 });
    const canvas = await $('.canvas-content-canvas');
    await canvas.waitForExist({ timeout: 10000 });

    await browser.execute(async () => {
      const { globalStateAPI } = await import('/src/shared/types/global-state.ts');
      const { flowChatManager } = await import('/src/flow_chat/services/FlowChatManager.ts');
      const workspace = await globalStateAPI.getCurrentWorkspace();
      if (!workspace?.rootPath) {
        throw new Error('Expected an active workspace before creating the Media parent session');
      }

      const mediaSessionId = await flowChatManager.createChatSession(
        { workspacePath: workspace.rootPath },
        'Media',
      );
      await flowChatManager.switchChatSession(mediaSessionId);
    });

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
      await browser.waitUntil(async () => (
        (await $$('[data-testid="short-drama-team-agent"]')).length === 5
      ), {
        timeout: 5000,
        interval: 100,
        timeoutMsg: 'short drama team controls did not load on demand',
      });
      const teamAgentButtons = await $$('[data-testid="short-drama-team-agent"]');
      await expect(teamAgentButtons.length).toBe(5);
      expect(await teamAgentButtons[0].getAttribute('aria-label')).toBeTruthy();
      expect(await teamAgentButtons[0].getAttribute('aria-pressed')).toMatch(/true|false/);
      const keyboardFocusEvidence = await browser.execute(() => {
        const firstAgent = document.querySelector<HTMLButtonElement>(
          '[data-testid="short-drama-team-agent"]',
        );
        firstAgent?.focus();
        return document.activeElement === firstAgent;
      });
      expect(keyboardFocusEvidence).toBe(true);

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

      const scriptAgentRailButton = await $('[data-testid="short-drama-team-agent"][data-short-drama-stage="script"]');
      await scriptAgentRailButton.click();
      await expect(teamPanel).toHaveAttribute('data-short-drama-team-mode', 'open');
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
        return {
          areaWidth: area.getBoundingClientRect().width,
          primaryWidth: primary.getBoundingClientRect().width,
          secondaryWidth: secondary.getBoundingClientRect().width,
        };
      });
      expect(openLayout?.secondaryWidth).toBeLessThanOrEqual(302);
      expect(openLayout?.primaryWidth).toBeGreaterThanOrEqual((openLayout?.areaWidth ?? 0) * 0.68);
      const teamToggle = await $('[data-testid="short-drama-team-panel-toggle"]');
      await teamToggle.click();
      await expect(teamPanel).toHaveAttribute('data-short-drama-team-mode', 'rail');
    } else {
      await expect(teamPanel).toHaveAttribute('data-short-drama-team-mode', 'closed');
      await expect((await $$('[data-testid="short-drama-team-agent"]')).length).toBe(0);
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

    mkdirSync('reports', { recursive: true });
    if (isMinimalPresentation) {
      await browser.saveScreenshot('reports/short-drama-team-rail.png');
      const postAgentRailButton = await $('[data-testid="short-drama-team-agent"][data-short-drama-stage="post"]');
      await postAgentRailButton.click();
      await expect(teamPanel).toHaveAttribute('data-short-drama-team-mode', 'open');
      await browser.saveScreenshot('reports/short-drama-team-open.png');
      const teamToggle = await $('[data-testid="short-drama-team-panel-toggle"]');
      await teamToggle.click();
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
    await browser.execute(async () => {
      const { useSceneStore } = await import('/src/app/stores/sceneStore.ts');
      useSceneStore.getState().openScene('session');
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
