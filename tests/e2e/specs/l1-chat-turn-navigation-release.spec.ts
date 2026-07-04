/**
 * Release-compatible regression coverage for long-session header turn navigation.
 *
 * This spec intentionally uses browser-visible DOM and a persisted workspace
 * fixture instead of importing Vite-only source modules. It is designed for
 * desktop/release smoke runs where long-session scroll geometry must be proven
 * in the real message viewport.
 */
import { $, browser, expect } from '@wdio/globals';
import { openWorkspace } from '../helpers/workspace-helper';
import { saveFailureScreenshot } from '../helpers/screenshot-utils';

const SESSION_ITEM_SELECTOR = '.void-nav-panel__inline-item';
const SESSION_LABEL_SELECTOR = '.void-nav-panel__inline-item-label';
const SESSION_EXPAND_TOGGLE_SELECTOR = '.void-nav-panel__inline-toggle';
const TURN_LIST_BUTTON_SELECTOR = '[data-testid="flowchat-header-turn-list"]';
const TURN_LIST_ITEM_SELECTOR = '.flowchat-header__turn-list-item';
const MESSAGE_ROOT_SELECTOR = '.modern-flowchat-container__messages .virtual-message-list';
const MESSAGE_SCROLLER_SELECTOR =
  '[data-virtuoso-scroller="true"], [data-virtuoso-scroller], .virtual-message-list__static-scroller';

type TargetViewportMetrics = {
  rootExists: boolean;
  scrollerExists: boolean;
  targetExists: boolean;
  targetVisible: boolean;
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  maxScrollTop: number;
  targetTurnId: string | null;
  targetTop: number | null;
  targetBottom: number | null;
  scrollerTop: number | null;
  scrollerBottom: number | null;
  deltaToPinnedTop: number | null;
  distanceFromBottom: number | null;
  visibleTurnIds: string[];
  activeTurnListText: string | null;
};

function getFixtureConfig(): {
  workspacePath: string | undefined;
  sessionTitle: string | undefined;
  targetTitle: string | undefined;
  targetTurnId: string | undefined;
} {
  return {
    workspacePath: process.env.E2E_TEST_WORKSPACE,
    sessionTitle: process.env.VOID_E2E_TURN_NAV_SESSION_TITLE,
    targetTitle: process.env.VOID_E2E_TURN_NAV_TARGET_TITLE,
    targetTurnId: process.env.VOID_E2E_TURN_NAV_TARGET_TURN_ID,
  };
}

async function readVisibleSessionTitles(): Promise<string[]> {
  return browser.execute((itemSelector, labelSelector) =>
    Array.from(document.querySelectorAll<HTMLElement>(itemSelector))
      .map(item => item.querySelector<HTMLElement>(labelSelector)?.textContent?.trim() ?? '')
      .filter(Boolean),
  SESSION_ITEM_SELECTOR, SESSION_LABEL_SELECTOR);
}

async function findSessionItemByTitle(sessionTitle: string): Promise<WebdriverIO.Element | null> {
  const findVisibleTarget = async (): Promise<WebdriverIO.Element | null> => {
    const items = await $$(SESSION_ITEM_SELECTOR);
    for (const item of items) {
      const label = await item.$(SESSION_LABEL_SELECTOR);
      if (!(await label.isExisting())) {
        continue;
      }
      const text = await label.getText();
      if (text.includes(sessionTitle)) {
        return item;
      }
    }
    return null;
  };

  let lastVisibleSessionTitles: string[] = [];
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const existing = await findVisibleTarget();
    if (existing) {
      return existing;
    }

    lastVisibleSessionTitles = await readVisibleSessionTitles();
    const toggle = await $(SESSION_EXPAND_TOGGLE_SELECTOR);
    if (
      !(await toggle.isExisting()) ||
      !(await toggle.isDisplayed()) ||
      !(await toggle.isEnabled())
    ) {
      break;
    }

    const beforeCount = lastVisibleSessionTitles.length;
    await toggle.click();
    await browser.waitUntil(async () => {
      if (await findVisibleTarget()) {
        return true;
      }
      const nextTitles = await readVisibleSessionTitles();
      return nextTitles.length !== beforeCount;
    }, { timeout: 3000, interval: 100 }).catch(() => undefined);
  }

  console.log('[VoidReleaseTurnNav] visible sessions while locating target', JSON.stringify({
    target: sessionTitle,
    visibleSessionTitles: lastVisibleSessionTitles.slice(0, 40),
    visibleSessionCount: lastVisibleSessionTitles.length,
  }));
  return null;
}

async function waitForSessionHydrated(): Promise<void> {
  await browser.waitUntil(async () => {
    const turnListButton = await $(TURN_LIST_BUTTON_SELECTOR);
    if (!(await turnListButton.isExisting()) || !(await turnListButton.isEnabled())) {
      return false;
    }

    return browser.execute((rootSelector, scrollerSelector) => {
      const root = document.querySelector<HTMLElement>(rootSelector);
      const scroller = root?.querySelector<HTMLElement>(scrollerSelector) ?? null;
      const items = root?.querySelectorAll('.virtual-item-wrapper[data-turn-id]') ?? [];
      return Boolean(root && scroller && items.length > 0);
    }, MESSAGE_ROOT_SELECTOR, MESSAGE_SCROLLER_SELECTOR);
  }, {
    timeout: 30000,
    interval: 200,
    timeoutMsg: '[VoidReleaseTurnNav] fixture session did not hydrate message list',
  });
}

async function openHeaderTurnList(): Promise<void> {
  const existingItems = await $$(TURN_LIST_ITEM_SELECTOR);
  if (await existingItems.length > 0) {
    return;
  }

  const turnListButton = await $(TURN_LIST_BUTTON_SELECTOR);
  await turnListButton.waitForClickable({ timeout: 10000 });
  await turnListButton.click();
  await browser.waitUntil(async () => {
    const items = await $$(TURN_LIST_ITEM_SELECTOR);
    return await items.length > 0;
  }, {
    timeout: 3000,
    interval: 100,
    timeoutMsg: '[VoidReleaseTurnNav] turn list did not open',
  });
}

async function closeHeaderTurnList(): Promise<void> {
  const items = await $$(TURN_LIST_ITEM_SELECTOR);
  if (await items.length === 0) {
    return;
  }

  const turnListButton = await $(TURN_LIST_BUTTON_SELECTOR);
  await turnListButton.click();
  await browser.waitUntil(async () => {
    const currentItems = await $$(TURN_LIST_ITEM_SELECTOR);
    return await currentItems.length === 0;
  }, { timeout: 3000, interval: 100 }).catch(() => undefined);
}

async function readHeaderTurnListTexts(): Promise<string[]> {
  await openHeaderTurnList();
  return browser.execute((selector) =>
    Array.from(document.querySelectorAll<HTMLElement>(selector))
      .map(item => item.textContent?.trim() ?? ''),
  TURN_LIST_ITEM_SELECTOR);
}

async function scrollToPreviousHistoryBoundary(): Promise<void> {
  await browser.execute((rootSelector, scrollerSelector) => {
    const root = document.querySelector<HTMLElement>(rootSelector);
    const scroller = root?.querySelector<HTMLElement>(scrollerSelector);
    if (!scroller) {
      return;
    }
    scroller.dispatchEvent(new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaY: -1200,
      deltaMode: 0,
    }));
    scroller.scrollTop = 0;
    scroller.dispatchEvent(new Event('scroll', { bubbles: true }));
  }, MESSAGE_ROOT_SELECTOR, MESSAGE_SCROLLER_SELECTOR);
}

async function revealHistoryUntilTurnListContains(targetTitle: string): Promise<{
  attempts: number;
  itemTexts: string[];
}> {
  let itemTexts = await readHeaderTurnListTexts();
  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (itemTexts.some(text => text.includes(targetTitle))) {
      return { attempts: attempt, itemTexts };
    }

    await closeHeaderTurnList();
    await scrollToPreviousHistoryBoundary();
    await browser.pause(700);
    itemTexts = await readHeaderTurnListTexts();
  }

  throw new Error(`[VoidReleaseTurnNav] target turn title not available in header list: ${JSON.stringify({
    targetTitle,
    itemTexts,
  })}`);
}

async function scrollToLatest(): Promise<void> {
  await browser.execute((rootSelector, scrollerSelector) => {
    const root = document.querySelector<HTMLElement>(rootSelector);
    const scroller = root?.querySelector<HTMLElement>(scrollerSelector);
    if (!scroller) {
      return;
    }
    scroller.scrollTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    scroller.dispatchEvent(new Event('scroll', { bubbles: true }));
  }, MESSAGE_ROOT_SELECTOR, MESSAGE_SCROLLER_SELECTOR);
  await browser.pause(800);
}

async function clickHeaderTurnListItemByTitle(targetTitle: string): Promise<{
  itemCount: number;
  itemTexts: string[];
}> {
  await openHeaderTurnList();
  const items = await $$(TURN_LIST_ITEM_SELECTOR);
  const itemCount = await items.length;
  const itemTexts: string[] = [];
  let targetIndex = -1;
  for (let index = 0; index < itemCount; index += 1) {
    const text = await items[index].getText();
    itemTexts.push(text);
    if (targetIndex < 0 && text.includes(targetTitle)) {
      targetIndex = index;
    }
  }

  if (targetIndex < 0) {
    throw new Error(`[VoidReleaseTurnNav] turn list item not found: ${JSON.stringify({
      targetTitle,
      itemTexts,
    })}`);
  }

  await items[targetIndex].click();
  return { itemCount, itemTexts };
}

async function readTargetViewportMetrics(
  targetTitle: string,
  targetTurnId?: string,
): Promise<TargetViewportMetrics> {
  return browser.execute((rootSelector, scrollerSelector, title, turnId) => {
    const root = document.querySelector<HTMLElement>(rootSelector);
    const scroller = root?.querySelector<HTMLElement>(scrollerSelector) ?? null;
    const wrappers = Array.from(root?.querySelectorAll<HTMLElement>(
      '.virtual-item-wrapper[data-turn-id]',
    ) ?? []);
    const target = wrappers.find(element => {
      if (element.dataset.itemType !== 'user-message') {
        return false;
      }
      if (turnId && element.dataset.turnId === turnId) {
        return true;
      }
      return (element.textContent ?? '').includes(title);
    }) ?? null;
    const scrollerRect = scroller?.getBoundingClientRect() ?? null;
    const targetRect = target?.getBoundingClientRect() ?? null;
    const visibleTurnIds = scrollerRect
      ? wrappers
        .filter(element => {
          const rect = element.getBoundingClientRect();
          return rect.bottom > scrollerRect.top && rect.top < scrollerRect.bottom;
        })
        .map(element => element.dataset.turnId || '')
        .filter(Boolean)
      : [];
    const targetVisible = Boolean(
      scrollerRect &&
      targetRect &&
      targetRect.bottom > scrollerRect.top &&
      targetRect.top < scrollerRect.bottom
    );
    const activeTurnListItem = document.querySelector<HTMLElement>(
      '.flowchat-header__turn-list-item--active',
    );

    return {
      rootExists: Boolean(root),
      scrollerExists: Boolean(scroller),
      targetExists: Boolean(target),
      targetVisible,
      scrollTop: scroller?.scrollTop ?? 0,
      scrollHeight: scroller?.scrollHeight ?? 0,
      clientHeight: scroller?.clientHeight ?? 0,
      maxScrollTop: scroller ? Math.max(0, scroller.scrollHeight - scroller.clientHeight) : 0,
      targetTurnId: target?.dataset.turnId ?? null,
      targetTop: targetRect?.top ?? null,
      targetBottom: targetRect?.bottom ?? null,
      scrollerTop: scrollerRect?.top ?? null,
      scrollerBottom: scrollerRect?.bottom ?? null,
      deltaToPinnedTop: scrollerRect && targetRect ? targetRect.top - scrollerRect.top : null,
      distanceFromBottom: scrollerRect && targetRect ? scrollerRect.bottom - targetRect.bottom : null,
      visibleTurnIds: Array.from(new Set(visibleTurnIds)),
      activeTurnListText: activeTurnListItem?.textContent?.trim() ?? null,
    };
  }, MESSAGE_ROOT_SELECTOR, MESSAGE_SCROLLER_SELECTOR, targetTitle, targetTurnId ?? null);
}

describe('L1 release long-session turn navigation', () => {
  let hasFixture = false;
  let sessionTitle = '';
  let targetTitle = '';
  let targetTurnId: string | undefined;

  before(async function () {
    const config = getFixtureConfig();
    if (!config.workspacePath || !config.sessionTitle || !config.targetTitle) {
      console.log('[VoidReleaseTurnNav] Missing fixture env; skipping. Required: E2E_TEST_WORKSPACE, VOID_E2E_TURN_NAV_SESSION_TITLE, VOID_E2E_TURN_NAV_TARGET_TITLE.');
      return;
    }

    sessionTitle = config.sessionTitle;
    targetTitle = config.targetTitle;
    targetTurnId = config.targetTurnId;
    hasFixture = await openWorkspace(config.workspacePath);
  });

  it('moves the real message viewport when selecting an older turn from the header list', async function () {
    if (!hasFixture) {
      this.skip();
      return;
    }

    const item = await findSessionItemByTitle(sessionTitle);
    if (!item) {
      throw new Error(`[VoidReleaseTurnNav] fixture session not found: ${sessionTitle}`);
    }
    await item.click();
    await waitForSessionHydrated();

    await scrollToLatest();
    const before = await readTargetViewportMetrics(targetTitle, targetTurnId);
    expect(before.scrollerExists).toBe(true);
    expect(before.maxScrollTop).toBeGreaterThan(300);

    const revealState = await revealHistoryUntilTurnListContains(targetTitle);
    const clickResult = await clickHeaderTurnListItemByTitle(targetTitle);
    expect(clickResult.itemCount).toBeGreaterThan(0);
    await browser.waitUntil(async () => {
      return browser.execute(() =>
        document.querySelectorAll('.flowchat-header__turn-list-item').length === 0,
      );
    }, {
      timeout: 500,
      interval: 50,
      timeoutMsg: '[VoidReleaseTurnNav] turn list did not close promptly after accepted selection',
    });

    let lastMetrics = await readTargetViewportMetrics(targetTitle, targetTurnId);
    await browser.waitUntil(async () => {
      const metrics = await readTargetViewportMetrics(targetTitle, targetTurnId);
      lastMetrics = metrics;
      return (
        metrics.targetVisible &&
        metrics.deltaToPinnedTop !== null &&
        Math.abs(metrics.deltaToPinnedTop) <= 100
      );
    }, {
      timeout: 8000,
      interval: 150,
      timeoutMsg: `[VoidReleaseTurnNav] selected turn did not move near the top of the message viewport: ${JSON.stringify({
        sessionTitle,
        targetTitle,
        targetTurnId,
        revealState,
        clickResult,
        lastMetrics,
      })}`,
    });

    await browser.pause(600);
    const after = await readTargetViewportMetrics(targetTitle, targetTurnId);
    console.log('[VoidReleaseTurnNav] diagnostics:', JSON.stringify({
      sessionTitle,
      targetTitle,
      targetTurnId,
      revealState,
      clickResult,
      before,
      after,
    }));

    expect(after.targetExists).toBe(true);
    expect(after.targetVisible).toBe(true);
    expect(after.deltaToPinnedTop).not.toBeNull();
    expect(Math.abs(after.deltaToPinnedTop!)).toBeLessThanOrEqual(100);
    expect(after.distanceFromBottom).not.toBeNull();
    expect(after.distanceFromBottom!).toBeGreaterThan(200);
  });

  afterEach(async function () {
    if (this.currentTest?.state === 'failed') {
      await saveFailureScreenshot(`l1-chat-turn-navigation-release-${this.currentTest.title}`);
    }
  });
});
