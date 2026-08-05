import { $, $$, browser, expect } from '@wdio/globals';
import * as path from 'node:path';

import { capturePhysicalVoidWindow } from '../helpers/screenshot-utils';
import { openWorkspace } from '../helpers/workspace-helper';

const artifactDirectory = path.resolve(
  process.cwd(),
  '..',
  '..',
  '.codex-artifacts',
  'customization-dispatch-draft',
);

async function activateChineseMinimalPresentation(): Promise<void> {
  const target = new URL(await browser.getUrl());
  target.searchParams.set('void-ui', 'minimal');
  await browser.url(target.toString());
  await browser.waitUntil(async () => browser.execute(() => (
    document.querySelector('[data-testid="app-layout"]')
      ?.getAttribute('data-ui-presentation') === 'minimal'
    && !document.querySelector('.splash-screen')
  )), {
    timeout: 20_000,
    interval: 100,
    timeoutMsg: 'Minimal presentation did not settle for dispatch smoke',
  });
  await browser.execute(async () => {
    // @ts-expect-error Resolved by Vite inside the embedded browser runtime.
    const { i18nService } = await import('/src/infrastructure/i18n/index.ts');
    await i18nService.changeLanguage('zh-CN');
  });
}

async function openCustomizationCenter(): Promise<void> {
  const extensionToggle = await $('.void-nav-panel__top-action-btn--expand');
  if ((await extensionToggle.getAttribute('aria-expanded')) !== 'true') {
    await extensionToggle.click();
  }
  const entry = await $('[data-testid="nav-agents"]');
  await entry.waitForClickable({ timeout: 15_000 });
  await entry.click();
  await $('.void-agents-shell').waitForDisplayed({ timeout: 20_000 });
}

async function findCardByName(
  cardSelector: string,
  nameSelector: string,
  expectedName: string,
): Promise<WebdriverIO.Element> {
  let match: WebdriverIO.Element | undefined;
  await browser.waitUntil(async () => {
    const cards = await $$(cardSelector);
    for (const card of cards) {
      if ((await card.$(nameSelector).getText()).trim() === expectedName) {
        match = card;
        return true;
      }
    }
    return false;
  }, {
    timeout: 20_000,
    interval: 150,
    timeoutMsg: `Catalog card was not found: ${expectedName}`,
  });
  if (!match) throw new Error(`Catalog card resolved without an element: ${expectedName}`);
  return match;
}

async function activateDispatchButton(button: WebdriverIO.Element): Promise<void> {
  expect(await button.isEnabled()).toBe(true);
  const ariaLabel = await button.getAttribute('aria-label');
  const activated = await browser.execute((label) => {
    const dispatch = Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
      .find(candidate => candidate.getAttribute('aria-label') === label);
    if (!dispatch) return false;
    dispatch.focus();
    dispatch.click();
    return true;
  }, ariaLabel);
  expect(activated).toBe(true);
}

async function dispatchCoreAgent(
  displayName: string,
  expectedMode: 'code' | 'cowork' | 'media',
): Promise<void> {
  await openCustomizationCenter();
  const card = await findCardByName(
    '.core-agent-card',
    '.core-agent-card__name',
    displayName,
  );
  const dispatch = await card.$('.core-agent-card__dispatch');
  await activateDispatchButton(dispatch);
  await $('[data-testid="chat-input-container"]').waitForDisplayed({ timeout: 20_000 });

  const creationModes = await $('.welcome-panel__creation-modes');
  await creationModes.waitForDisplayed({ timeout: 10_000 });
  const activeMode = await creationModes.$(
    `.welcome-panel__creation-mode:nth-of-type(${expectedMode === 'code' ? 1 : expectedMode === 'cowork' ? 2 : 3})`,
  );
  expect(await activeMode.getAttribute('aria-checked')).toBe('true');
  expect(await $('[data-testid="chat-input-workspace-strip"]').getText()).toContain('选择工作区');
  expect(await $('.gallery-detail-modal').isExisting()).toBe(false);
}

describe('L0 customization market dispatch drafts', () => {
  before(async () => {
    await activateChineseMinimalPresentation();
    expect(await openWorkspace()).toBe(true);
  });

  it('routes the three room employees to unpersisted Code, Cowork, and Media drafts', async () => {
    await dispatchCoreAgent('代码执行', 'code');
    await dispatchCoreAgent('日常办公', 'cowork');
    await dispatchCoreAgent('设计创意', 'media');
  });

  it('dispatches a Team into the new-session composer with role and workspace choice intact', async () => {
    await openCustomizationCenter();
    const teamTab = await $('.agents-catalog-tabs [role="tab"]:nth-child(2)');
    await teamTab.waitForClickable({ timeout: 10_000 });
    await teamTab.click();
    const card = await findCardByName(
      '.agent-team-card',
      '.agent-team-card__title',
      '代码审查团队',
    );
    const dispatch = await card.$('.agent-team-card__dispatch');
    await activateDispatchButton(dispatch);

    const composer = await $('[data-testid="chat-input-container"]');
    await composer.waitForDisplayed({ timeout: 20_000 });
    const capsule = await $('.void-chat-input__persona-capsule');
    await capsule.waitForDisplayed({ timeout: 10_000 });
    expect(await capsule.getText()).toContain('代码审查团队');
    expect(await $('[data-testid="chat-input-workspace-strip"]').getText()).toContain('选择工作区');
    expect(await $('.void-scene-bar').getText()).toContain('代码审查团队 · 新建会话');

    expect(await $('.welcome-panel__creation-mode[aria-checked="true"]').getText()).toContain('代码会话');

    const layout = await browser.execute(() => {
      const requireRect = (selector: string) => {
        const element = document.querySelector<HTMLElement>(selector);
        if (!element) throw new Error(`Missing full-window evidence: ${selector}`);
        const value = element.getBoundingClientRect();
        return {
          left: value.left,
          top: value.top,
          right: value.right,
          bottom: value.bottom,
          width: value.width,
          height: value.height,
        };
      };
      return {
        viewport: { width: window.innerWidth, height: window.innerHeight },
        app: requireRect('[data-testid="app-layout"]'),
        nav: requireRect('.void-nav-panel'),
        top: requireRect('.void-scene-bar'),
        controls: requireRect('.void-scene-bar__controls .window-controls'),
        composer: requireRect('[data-testid="chat-input-container"]'),
        bottom: requireRect('[data-testid="chat-input-workspace-strip"]'),
      };
    });
    expect(layout.nav.left).toBeGreaterThanOrEqual(-1);
    expect(layout.top.top).toBeGreaterThanOrEqual(-1);
    expect(layout.controls.right).toBeLessThanOrEqual(layout.viewport.width + 1);
    expect(layout.composer.right).toBeLessThanOrEqual(layout.viewport.width + 1);
    expect(layout.bottom.bottom).toBeLessThanOrEqual(layout.viewport.height + 1);
    expect(layout.app.bottom).toBeGreaterThanOrEqual(layout.viewport.height - 1);

    const capture = await capturePhysicalVoidWindow('team-new-session-draft', {
      directory: artifactDirectory,
    });
    expect(capture.metadata.capture_bounds.width).toBeGreaterThan(0);
    expect(capture.metadata.capture_bounds.height).toBeGreaterThan(0);
  });

  it('stages the flagship AI short-drama Team in a Media draft before opening its canvas', async () => {
    await openCustomizationCenter();
    const teamTab = await $('.agents-catalog-tabs [role="tab"]:nth-child(2)');
    await teamTab.waitForClickable({ timeout: 10_000 });
    await teamTab.click();
    const card = await findCardByName(
      '.agent-team-card',
      '.agent-team-card__title',
      'AI 短剧团队',
    );
    await activateDispatchButton(await card.$('.agent-team-card__dispatch'));

    const capsule = await $('.void-chat-input__persona-capsule');
    await capsule.waitForDisplayed({ timeout: 20_000 });
    expect(await capsule.getText()).toContain('AI 短剧团队');
    expect(await $('.welcome-panel__creation-mode[aria-checked="true"]').getText()).toContain('媒体会话');
    expect(await $('[data-testid="chat-input-workspace-strip"]').getText()).toContain('选择工作区');
    expect(await $('.void-scene-bar').getText()).toContain('AI 短剧团队 · 新建会话');
    expect(await $('[data-testid="short-drama-center"]').isExisting()).toBe(false);
  });
});
