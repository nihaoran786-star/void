import { $, browser, expect } from '@wdio/globals';
import * as path from 'node:path';
import { openWorkspace } from '../helpers/workspace-helper';
import {
  saveElementScreenshot,
  saveScreenshot,
} from '../helpers/screenshot-utils';

const screenshotDirectory = path.resolve(
  process.cwd(),
  '..',
  '..',
  '.codex-artifacts',
  'minimal-workspace',
);
const TEST_WORKSPACE_PATH = process.env.E2E_TEST_WORKSPACE || process.cwd();

type TauriInternals = {
  invoke<T>(command: string, args?: unknown): Promise<T>;
};

type NavigationEvidence = {
  activeStageBoxShadow: string;
  activeStageOutlineWidth: string;
  activeSurfaceBoxShadow: string;
  auxPaneWidth: number;
  auxPaneInsideScene: boolean;
  chatPaneWidth: number;
  centerWidth: number;
  centerOverflow: number;
  documentOverflow: number;
  firstStageInsideTabs: boolean;
  lastStageInsideTabs: boolean;
  primaryColumnWidth: number;
  stageButtonCount: number;
  stageButtonHeights: number[];
  stageTabsClientWidth: number;
  stageTabsScrollLeft: number;
  stageTabsScrollWidth: number;
  sessionOverflow: number;
  sessionWidth: number;
  surfaceButtonCount: number;
  surfaceButtonHeights: number[];
  surfaceGroupBackground: string;
  surfaceGroupBorderWidth: string;
  surfaceGroupHeight: number;
  topbarHeight: number;
};

type EpisodeRailEvidence = {
  buttonCount: number;
  display: string;
  everyButtonInsideRail: boolean;
  railInsidePanel: boolean;
  railVisible: boolean;
  verticallyOrdered: boolean;
};

type TabHeaderEvidence = {
  actionsInsideHeader: boolean;
  headerHeight: number;
  hiddenTabBadge: string;
  visibleTabCount: number;
};

type WelcomeLayoutEvidence = {
  contentInsideMessages: boolean;
  headingInsideMessages: boolean;
  headingTextInsideMessages: boolean;
  headingTextLeft: number;
  headingText: string;
  messagesInsideScene: boolean;
  messagesLeft: number;
  messagesWidth: number;
  navRight: number;
  sceneLeft: number;
  welcomeOverflow: number;
};

const readThemeSelection = () => browser.execute(async () => {
  const internals = (
    window as Window & { __TAURI_INTERNALS__?: TauriInternals }
  ).__TAURI_INTERNALS__;
  if (!internals) {
    throw new Error('Tauri internals are unavailable while reading the theme');
  }
  return internals.invoke<unknown>('get_config', {
    request: {
      path: 'themes.current',
      skipRetryOnNotFound: true,
    },
  });
});

const writeThemeSelection = (themeId: string) => browser.execute(
  async (nextThemeId) => {
    const internals = (
      window as Window & { __TAURI_INTERNALS__?: TauriInternals }
    ).__TAURI_INTERNALS__;
    if (!internals) {
      throw new Error('Tauri internals are unavailable while setting the theme');
    }
    await internals.invoke('set_config', {
      request: {
        path: 'themes.current',
        value: nextThemeId,
      },
    });
  },
  themeId,
);

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
    timeoutMsg: 'Minimal presentation did not settle for short-drama navigation',
  },
);

const waitForTheme = (themeId: string) => browser.waitUntil(
  async () => browser.execute((expectedThemeId) => (
    document.documentElement.getAttribute('data-theme') === expectedThemeId
    && !document.querySelector('.splash-screen')
  ), themeId),
  {
    timeout: 20_000,
    interval: 100,
    timeoutMsg: `Theme ${themeId} did not settle for short-drama navigation`,
  },
);

const dismissVisibleNotifications = () => browser.execute(() => {
  document.querySelectorAll<HTMLButtonElement>('.notification-item__close')
    .forEach(button => button.click());
});

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
        staticFixtureEpisodeCount: 10,
      },
    });
  });
  await browser.waitUntil(async () => browser.execute(() => (
    document.querySelectorAll('[data-testid="short-drama-stage-tab"]').length === 5
  )), {
    timeout: 10_000,
    interval: 100,
    timeoutMsg: 'Short-drama fixture stage navigation did not render',
  });
  await dismissVisibleNotifications();
};

const readNavigationEvidence = (): Promise<NavigationEvidence> =>
  browser.execute(() => {
    const center = document.querySelector<HTMLElement>(
      '[data-testid="short-drama-center"]',
    );
    const session = document.querySelector<HTMLElement>('.void-session-scene');
    const auxPane = document.querySelector<HTMLElement>(
      '.void-session-scene__aux-pane:not(.void-session-scene__aux-pane--collapsed)',
    );
    const chatPane = document.querySelector<HTMLElement>(
      '.void-session-scene__chat-pane',
    );
    const topbar = document.querySelector<HTMLElement>(
      '.short-drama-center__topbar',
    );
    const primaryColumn = document.querySelector<HTMLElement>(
      '.canvas-editor-area[data-short-drama-team-mode] > .canvas-editor-area__primary',
    );
    const tabs = document.querySelector<HTMLElement>(
      '.short-drama-center__tabs',
    );
    const stageButtons = Array.from(
      document.querySelectorAll<HTMLButtonElement>(
        '[data-testid="short-drama-stage-tab"]',
      ),
    );
    const firstStage = stageButtons.at(0);
    const lastStage = stageButtons.at(-1);
    const group = document.querySelector<HTMLElement>(
      '.workspace-media-entry--switcher',
    );
    const surfaceButtons = group
      ? Array.from(group.querySelectorAll<HTMLButtonElement>(
        '.workspace-media-entry__option',
      ))
      : [];
    const activeSurface = group?.querySelector<HTMLElement>('.is-active');
    const activeStage = document.activeElement instanceof HTMLElement
      && document.activeElement.matches('[data-testid="short-drama-stage-tab"]')
      ? document.activeElement
      : document.querySelector<HTMLElement>(
        '[data-testid="short-drama-stage-tab"].is-active',
      );
    const tabsRect = tabs?.getBoundingClientRect();
    const firstStageRect = firstStage?.getBoundingClientRect();
    const lastStageRect = lastStage?.getBoundingClientRect();
    const groupStyle = group ? getComputedStyle(group) : null;
    const sessionRect = session?.getBoundingClientRect();
    const auxPaneRect = auxPane?.getBoundingClientRect();
    return {
      activeStageBoxShadow: activeStage
        ? getComputedStyle(activeStage).boxShadow
        : '',
      activeStageOutlineWidth: activeStage
        ? getComputedStyle(activeStage).outlineWidth
        : '',
      activeSurfaceBoxShadow: activeSurface
        ? getComputedStyle(activeSurface).boxShadow
        : '',
      auxPaneWidth: auxPaneRect?.width ?? 0,
      auxPaneInsideScene: Boolean(
        sessionRect
        && auxPaneRect
        && auxPaneRect.left >= sessionRect.left - 1
        && auxPaneRect.right <= sessionRect.right + 1
      ),
      centerOverflow: center
        ? center.scrollWidth - center.clientWidth
        : Number.POSITIVE_INFINITY,
      centerWidth: center?.getBoundingClientRect().width ?? 0,
      documentOverflow:
        document.documentElement.scrollWidth - document.documentElement.clientWidth,
      chatPaneWidth: chatPane?.getBoundingClientRect().width ?? 0,
      firstStageInsideTabs: Boolean(
        tabsRect
        && firstStageRect
        && firstStageRect.left >= tabsRect.left - 1
        && firstStageRect.right <= tabsRect.right + 1
      ),
      lastStageInsideTabs: Boolean(
        tabsRect
        && lastStageRect
        && lastStageRect.left >= tabsRect.left - 1
        && lastStageRect.right <= tabsRect.right + 1
      ),
      primaryColumnWidth: primaryColumn?.getBoundingClientRect().width ?? 0,
      stageButtonCount: stageButtons.length,
      stageButtonHeights: stageButtons.map(
        button => button.getBoundingClientRect().height,
      ),
      stageTabsClientWidth: tabs?.clientWidth ?? 0,
      stageTabsScrollLeft: tabs?.scrollLeft ?? Number.POSITIVE_INFINITY,
      stageTabsScrollWidth: tabs?.scrollWidth ?? Number.POSITIVE_INFINITY,
      sessionOverflow: session
        ? session.scrollWidth - session.clientWidth
        : Number.POSITIVE_INFINITY,
      sessionWidth: sessionRect?.width ?? 0,
      surfaceButtonCount: surfaceButtons.length,
      surfaceButtonHeights: surfaceButtons.map(
        button => button.getBoundingClientRect().height,
      ),
      surfaceGroupBackground: groupStyle?.backgroundColor ?? '',
      surfaceGroupBorderWidth: groupStyle?.borderTopWidth ?? '',
      surfaceGroupHeight: group?.getBoundingClientRect().height ?? 0,
      topbarHeight: topbar?.getBoundingClientRect().height ?? 0,
    };
  });

const readEpisodeRailEvidence = (): Promise<EpisodeRailEvidence> =>
  browser.execute(() => {
    const rail = document.querySelector<HTMLElement>(
      '[data-testid="short-drama-episode-rail"]',
    );
    const buttons = rail
      ? Array.from(rail.querySelectorAll<HTMLButtonElement>(
        'button[data-episode-id]',
      ))
      : [];
    const railRect = rail?.getBoundingClientRect();
    const panelRect = document
      .querySelector<HTMLElement>('[data-testid="short-drama-center"]')
      ?.getBoundingClientRect();
    const buttonRects = buttons.map(button => button.getBoundingClientRect());
    return {
      buttonCount: buttons.length,
      display: rail ? getComputedStyle(rail).display : '',
      everyButtonInsideRail: Boolean(
        railRect
        && buttonRects.every(rect => (
          rect.left >= railRect.left - 1
          && rect.right <= railRect.right + 1
        ))
      ),
      railInsidePanel: Boolean(
        railRect
        && panelRect
        && railRect.left >= panelRect.left - 1
        && railRect.right <= panelRect.right + 1
      ),
      railVisible: Boolean(
        railRect
        && railRect.width > 0
        && railRect.right > 0
        && railRect.left < window.innerWidth
      ),
      verticallyOrdered: buttonRects.every((rect, index) => (
        index === 0 || rect.top > buttonRects[index - 1]!.top
      )),
    };
  });

const readTabHeaderEvidence = (): Promise<TabHeaderEvidence> =>
  browser.execute(() => {
    const primaryColumn = document.querySelector<HTMLElement>(
      '.canvas-editor-area[data-short-drama-team-mode] > .canvas-editor-area__primary',
    );
    const header = primaryColumn?.querySelector<HTMLElement>('.canvas-tab-bar');
    const actions = header?.querySelector<HTMLElement>('.canvas-tab-bar__actions');
    const headerRect = header?.getBoundingClientRect();
    const actionsRect = actions?.getBoundingClientRect();
    return {
      actionsInsideHeader: Boolean(
        headerRect
        && actionsRect
        && actionsRect.left >= headerRect.left - 1
        && actionsRect.right <= headerRect.right + 1
      ),
      headerHeight: headerRect?.height ?? 0,
      hiddenTabBadge:
        header?.querySelector<HTMLElement>('.canvas-tab-panorama-btn__badge')
          ?.textContent?.trim() ?? '',
      visibleTabCount:
        header?.querySelectorAll('.canvas-tab-bar__tabs [role="tab"]').length ?? -1,
    };
  });

const readWelcomeLayoutEvidence = (): Promise<WelcomeLayoutEvidence> =>
  browser.execute(() => {
    const heading = document.querySelector<HTMLElement>(
      '.welcome-panel__heading',
    );
    const content = heading?.closest<HTMLElement>('.welcome-panel__content');
    const welcome = heading?.closest<HTMLElement>('.welcome-panel');
    const messages = heading?.closest<HTMLElement>(
      '.modern-flowchat-container__messages',
    );
    const scene = document.querySelector<HTMLElement>(
      '.void-workspace-body__scene-area',
    );
    const nav = document.querySelector<HTMLElement>(
      '.void-workspace-body__nav-area:not(.is-collapsed)',
    );
    const contentRect = content?.getBoundingClientRect();
    const headingRect = heading?.getBoundingClientRect();
    const headingTextRange = heading ? document.createRange() : null;
    headingTextRange?.selectNodeContents(heading!);
    const headingTextRect = headingTextRange?.getBoundingClientRect();
    const messagesRect = messages?.getBoundingClientRect();
    const sceneRect = scene?.getBoundingClientRect();
    const navRect = nav?.getBoundingClientRect();
    const isInside = (rect: DOMRect | undefined) => Boolean(
      rect
      && messagesRect
      && rect.left >= messagesRect.left - 1
      && rect.right <= messagesRect.right + 1
    );
    return {
      contentInsideMessages: isInside(contentRect),
      headingInsideMessages: isInside(headingRect),
      headingTextInsideMessages: isInside(headingTextRect),
      headingTextLeft: headingTextRect?.left ?? Number.NEGATIVE_INFINITY,
      headingText: heading?.textContent?.trim() ?? '',
      messagesInsideScene: Boolean(
        messagesRect
        && sceneRect
        && messagesRect.left >= sceneRect.left - 1
        && messagesRect.right <= sceneRect.right + 1
      ),
      messagesLeft: messagesRect?.left ?? Number.NEGATIVE_INFINITY,
      messagesWidth: messagesRect?.width ?? 0,
      navRight: navRect?.right ?? 0,
      sceneLeft: sceneRect?.left ?? Number.POSITIVE_INFINITY,
      welcomeOverflow: welcome
        ? welcome.scrollWidth - welcome.clientWidth
        : Number.POSITIVE_INFINITY,
    };
  });

describe('L0 Minimal short-drama creation navigation visual contract', () => {
  let sourceUrl = '';
  let originalThemeSelection = 'system';
  let originalWindowSize = { width: 1280, height: 800 };
  let createdMediaSessionId: string | null = null;

  before(async () => {
    sourceUrl = await browser.getUrl();
    originalWindowSize = await browser.getWindowSize();
    const themeSelection = await readThemeSelection();
    if (typeof themeSelection === 'string' && themeSelection.length > 0) {
      originalThemeSelection = themeSelection;
    }

    await writeThemeSelection('void-light');
    await browser.url(sourceUrl);
    await waitForMinimalPresentation();
    await waitForTheme('void-light');
    const hasWorkspace = await openWorkspace(TEST_WORKSPACE_PATH);
    expect(hasWorkspace).toBe(true);
    await browser.setWindowSize(1280, 800);

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

    await openShortDramaFixture();
  });

  it('uses one quiet 28px switcher and compact stage strip without changing click paths', async () => {
    const firstStage = await $(
      '[data-testid="short-drama-stage-tab"][data-short-drama-stage="script"]',
    );
    await browser.execute(() => {
      document.querySelector<HTMLButtonElement>(
        '[data-testid="short-drama-stage-tab"][data-short-drama-stage="script"]',
      )?.focus();
    });

    const evidence = await readNavigationEvidence();
    expect(evidence.surfaceGroupHeight).toBeGreaterThanOrEqual(27);
    expect(evidence.surfaceGroupHeight).toBeLessThanOrEqual(29);
    expect(evidence.surfaceGroupBorderWidth).toBe('0px');
    expect(evidence.surfaceGroupBackground).toBe('rgba(0, 0, 0, 0)');
    expect(evidence.surfaceButtonCount).toBe(2);
    expect(evidence.surfaceButtonHeights.every(height => (
      height >= 27 && height <= 29
    ))).toBe(true);
    expect(evidence.activeSurfaceBoxShadow).toBe('none');
    expect(evidence.topbarHeight).toBeLessThanOrEqual(40);
    expect(evidence.stageButtonCount).toBe(5);
    expect(evidence.stageButtonHeights.every(height => (
      height >= 27 && height <= 29
    ))).toBe(true);
    expect(evidence.activeStageOutlineWidth).toBe('2px');
    expect(evidence.activeStageBoxShadow).toBe('none');
    expect(evidence.lastStageInsideTabs).toBe(true);
    expect(evidence.centerOverflow).toBeLessThanOrEqual(1);
    expect(evidence.documentOverflow).toBeLessThanOrEqual(1);
    expect(evidence.sessionOverflow).toBeLessThanOrEqual(1);
    expect(evidence.auxPaneInsideScene).toBe(true);
    expect(await firstStage.isFocused()).toBe(true);

    const welcomeLayout = await readWelcomeLayoutEvidence();
    expect(welcomeLayout.messagesWidth).toBeGreaterThan(0);
    expect(welcomeLayout.messagesLeft)
      .toBeGreaterThanOrEqual(welcomeLayout.sceneLeft - 1);
    expect(welcomeLayout.messagesLeft)
      .toBeGreaterThanOrEqual(welcomeLayout.navRight - 1);
    expect(welcomeLayout.messagesInsideScene).toBe(true);
    expect(welcomeLayout.welcomeOverflow).toBeLessThanOrEqual(1);
    expect(welcomeLayout.contentInsideMessages).toBe(true);
    expect(welcomeLayout.headingInsideMessages).toBe(true);
    expect(welcomeLayout.headingTextLeft)
      .toBeGreaterThanOrEqual(welcomeLayout.messagesLeft - 1);
    expect(welcomeLayout.headingTextInsideMessages).toBe(true);
    expect(welcomeLayout.headingText).toContain('，编程搭档');

    await saveScreenshot('short-drama-navigation-focus-light-full', {
      directory: screenshotDirectory,
      includeTimestamp: false,
      prefix: 'slice24-minimal',
    });
    await saveElementScreenshot(
      '[data-testid="short-drama-center"]',
      'short-drama-navigation-focus-light',
      {
        directory: screenshotDirectory,
        includeTimestamp: false,
        prefix: 'slice24-minimal',
      },
    );

    const mediaButton = await $(
      '.workspace-media-entry--switcher .workspace-media-entry__option:first-child',
    );
    await mediaButton.click();
    await $('.workspace-media-gallery').waitForDisplayed({ timeout: 10_000 });
    const shortDramaButton = await $(
      '.workspace-media-entry--switcher .workspace-media-entry__option:last-child',
    );
    await shortDramaButton.click();
    await $('[data-testid="short-drama-center"]').waitForDisplayed({
      timeout: 10_000,
    });
  });

  it('keeps the final stage keyboard-reachable in a dark compressed rail', async () => {
    await writeThemeSelection('void-dark');
    await browser.url(sourceUrl);
    await browser.setWindowSize(720, 720);
    await waitForMinimalPresentation();
    await waitForTheme('void-dark');
    if (!createdMediaSessionId) {
      throw new Error('Expected the Media session before dark verification');
    }
    await browser.execute(async (sessionId) => {
      const { openMainSession } = await import(
        '/src/flow_chat/services/openBtwSession.ts'
      );
      await openMainSession(sessionId);
    }, createdMediaSessionId);
    await $('.void-session-scene').waitForDisplayed({ timeout: 20_000 });
    await openShortDramaFixture();

    const scriptStage = await $(
      '[data-testid="short-drama-stage-tab"][data-short-drama-stage="script"]',
    );
    await scriptStage.click();
    const teamPanel = await $('.canvas-editor-area[data-short-drama-team-mode]');
    await teamPanel.waitForExist({ timeout: 10_000 });
    const teamToggle = await $('[data-testid="short-drama-team-panel-toggle"]');
    await teamToggle.waitForClickable({ timeout: 10_000 });
    if (await teamPanel.getAttribute('data-short-drama-team-mode') === 'open') {
      await teamToggle.click();
    }
    await browser.waitUntil(
      async () => (
        await teamPanel.getAttribute('data-short-drama-team-mode')
      ) === 'rail',
      {
        timeout: 10_000,
        interval: 100,
        timeoutMsg: 'Short-drama team panel did not settle into its compact rail',
      },
    );

    await browser.execute(() => {
      document.querySelector<HTMLButtonElement>(
        '[data-testid="short-drama-stage-tab"][data-short-drama-stage="script"]',
      )?.focus();
    });
    for (let index = 0; index < 4; index += 1) {
      await browser.keys(['Tab']);
    }
    const focusedStage = await browser.execute(() => (
      document.activeElement?.getAttribute('data-short-drama-stage')
    ));
    expect(focusedStage).toBe('post');

    const compressed = await readNavigationEvidence();

    await saveScreenshot(
      'short-drama-navigation-focus-dark-narrow-full',
      {
        directory: screenshotDirectory,
        includeTimestamp: false,
        prefix: 'slice24-minimal',
      },
    );
    await saveElementScreenshot(
      '[data-testid="short-drama-center"]',
      'short-drama-navigation-focus-dark-narrow',
      {
        directory: screenshotDirectory,
        includeTimestamp: false,
        prefix: 'slice24-minimal',
      },
    );

    expect(compressed.stageTabsScrollWidth)
      .toBeLessThanOrEqual(compressed.stageTabsClientWidth + 1);
    expect(compressed.stageTabsScrollLeft).toBeLessThanOrEqual(1);
    expect(compressed.firstStageInsideTabs).toBe(true);
    expect(compressed.lastStageInsideTabs).toBe(true);
    expect(compressed.activeStageOutlineWidth).toBe('2px');
    expect(compressed.activeStageBoxShadow).toBe('none');
    expect(compressed.centerWidth).toBeGreaterThanOrEqual(160);
    expect(compressed.primaryColumnWidth).toBeGreaterThanOrEqual(160);
    expect(compressed.centerOverflow).toBeLessThanOrEqual(1);
    expect(compressed.documentOverflow).toBeLessThanOrEqual(1);
    expect(compressed.sessionOverflow).toBeLessThanOrEqual(1);
    expect(compressed.auxPaneInsideScene).toBe(true);

    const tabHeader = await readTabHeaderEvidence();
    expect(tabHeader.headerHeight).toBeGreaterThanOrEqual(31);
    expect(tabHeader.headerHeight).toBeLessThanOrEqual(33);
    expect(tabHeader.visibleTabCount).toBe(0);
    expect(tabHeader.hiddenTabBadge).toBe('+1');
    expect(tabHeader.actionsInsideHeader).toBe(true);

    const moreButton = await $(
      '.canvas-editor-area[data-short-drama-team-mode] > '
      + '.canvas-editor-area__primary .canvas-tab-panorama-btn',
    );
    await moreButton.waitForClickable({ timeout: 10_000 });
    await moreButton.click();
    const overflowMenu = await $('.canvas-tab-overflow-menu');
    await overflowMenu.waitForDisplayed({ timeout: 10_000 });

    const pinAction = await $(
      '.canvas-tab-overflow-menu__item-action:not(.canvas-tab-overflow-menu__item-close)',
    );
    const originalPinLabel = await pinAction.getAttribute('aria-label');
    await pinAction.click();
    await browser.waitUntil(async () => (
      await $(
        '.canvas-tab-overflow-menu__item-action:not(.canvas-tab-overflow-menu__item-close)',
      ).getAttribute('aria-label')
    ) !== originalPinLabel, {
      timeout: 10_000,
      interval: 100,
      timeoutMsg: 'Hidden short-drama tab did not toggle its pin state',
    });
    await $(
      '.canvas-tab-overflow-menu__item-action:not(.canvas-tab-overflow-menu__item-close)',
    ).click();
    await browser.waitUntil(async () => (
      await $(
        '.canvas-tab-overflow-menu__item-action:not(.canvas-tab-overflow-menu__item-close)',
      ).getAttribute('aria-label')
    ) === originalPinLabel, {
      timeout: 10_000,
      interval: 100,
      timeoutMsg: 'Hidden short-drama tab did not restore its original pin state',
    });

    expect(await $(
      '.canvas-tab-overflow-menu__item-action[title]',
    ).isExisting()).toBe(true);
    expect(await $('.canvas-tab-overflow-menu__item-close').isExisting()).toBe(true);
    await saveScreenshot('short-drama-tab-menu-dark-narrow-full', {
      directory: screenshotDirectory,
      includeTimestamp: false,
      prefix: 'slice24-minimal',
    });
    await browser.keys(['Escape']);
    await overflowMenu.waitForDisplayed({ reverse: true, timeout: 10_000 });

    const postStage = await $(
      '[data-testid="short-drama-stage-tab"][data-short-drama-stage="post"]',
    );
    await postStage.click();
    await $('.short-drama-center__post').waitForDisplayed({ timeout: 10_000 });

    const episodeRail = await readEpisodeRailEvidence();
    expect(episodeRail.display).toBe('grid');
    expect(episodeRail.buttonCount).toBe(10);
    expect(episodeRail.everyButtonInsideRail).toBe(true);
    expect(episodeRail.verticallyOrdered).toBe(true);

    await saveScreenshot('short-drama-navigation-post-dark-narrow-full', {
      directory: screenshotDirectory,
      includeTimestamp: false,
      prefix: 'slice24-minimal',
    });
    await saveElementScreenshot(
      '[data-testid="short-drama-center"]',
      'short-drama-navigation-post-dark-narrow',
      {
        directory: screenshotDirectory,
        includeTimestamp: false,
        prefix: 'slice24-minimal',
      },
    );

    const secondEpisode = await $(
      '[data-testid="short-drama-episode-rail"] button[data-episode-id="episode-02"]',
    );
    await secondEpisode.waitForClickable({ timeout: 10_000 });
    await secondEpisode.click();
    await browser.waitUntil(
      async () => (
        await secondEpisode.getAttribute('class')
      )?.split(/\s+/).includes('is-active') === true,
      {
        timeout: 10_000,
        interval: 100,
        timeoutMsg: 'Episode 2 did not become active from the compressed rail',
      },
    );

    const selectedEpisodeRail = await readEpisodeRailEvidence();
    expect(selectedEpisodeRail.railVisible).toBe(true);
    expect(selectedEpisodeRail.railInsidePanel).toBe(true);
    expect(selectedEpisodeRail.everyButtonInsideRail).toBe(true);

    await saveScreenshot(
      'short-drama-navigation-episode-02-dark-narrow-full',
      {
        directory: screenshotDirectory,
        includeTimestamp: false,
        prefix: 'slice24-minimal',
      },
    );
    await saveElementScreenshot(
      '[data-testid="short-drama-center"]',
      'short-drama-navigation-episode-02-dark-narrow',
      {
        directory: screenshotDirectory,
        includeTimestamp: false,
        prefix: 'slice24-minimal',
      },
    );
  });

  after(async () => {
    const cleanupErrors: string[] = [];
    const attempt = async (label: string, action: () => Promise<void>) => {
      try {
        await action();
      } catch (error) {
        cleanupErrors.push(
          `${label}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    };

    if (createdMediaSessionId) {
      const sessionId = createdMediaSessionId;
      await attempt('delete media session', async () => {
        await browser.execute(async (id) => {
          const { flowChatManager } = await import(
            '/src/flow_chat/services/FlowChatManager.ts'
          );
          await flowChatManager.deleteChatSession(id);
        }, sessionId);
      });
    }
    await attempt('restore theme', async () => {
      await writeThemeSelection(originalThemeSelection);
    });
    await attempt('restore URL', async () => {
      await browser.url(sourceUrl);
      await browser.waitUntil(async () => browser.execute(() => (
        Boolean(document.querySelector('[data-testid="app-layout"]'))
        && !document.querySelector('.splash-screen')
      )), {
        timeout: 20_000,
        interval: 100,
        timeoutMsg: 'Original URL did not settle during navigation cleanup',
      });
    });
    await attempt('restore window size', async () => {
      await browser.setWindowSize(
        originalWindowSize.width,
        originalWindowSize.height,
      );
    });
    await attempt('verify theme restore', async () => {
      const restored = await readThemeSelection();
      if (restored !== originalThemeSelection) {
        throw new Error(
          `expected ${originalThemeSelection}, received ${String(restored)}`,
        );
      }
    });
    if (cleanupErrors.length > 0) {
      throw new Error(
        `Short-drama navigation cleanup failed:\n${cleanupErrors.join('\n')}`,
      );
    }
  });
});
