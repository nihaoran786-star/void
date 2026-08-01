import { $, $$, browser, expect } from '@wdio/globals';
import * as path from 'node:path';
import {
  saveElementScreenshot,
  saveScreenshot,
} from '../helpers/screenshot-utils';
import {
  ensureCodeSessionOpen,
  openWorkspace,
} from '../helpers/workspace-helper';

const screenshotDirectory = path.resolve(
  process.cwd(),
  '..',
  '..',
  '.codex-artifacts',
  'customization-center',
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
    timeout: 15_000,
    interval: 100,
    timeoutMsg: 'Minimal presentation did not activate for customization capture',
  });
  await browser.execute(async () => {
    const { i18nService } = await import('/src/infrastructure/i18n/index.ts');
    await i18nService.changeLanguage('zh-CN');
  });
}

async function openCustomizationCenter(): Promise<void> {
  const extensionToggle = await $('.void-nav-panel__top-action-btn--expand');
  if ((await extensionToggle.getAttribute('aria-expanded')) !== 'true') {
    await extensionToggle.click();
  }
  const agentEntry = await $('[data-testid="nav-agents"]');
  await agentEntry.waitForClickable({ timeout: 10_000 });
  await agentEntry.click();
  await $('.void-agents-shell').waitForDisplayed({ timeout: 15_000 });
}

describe('L0 customization center visual acceptance', () => {
  before(async () => {
    await activateChineseMinimalPresentation();
    expect(await openWorkspace()).toBe(true);
  });

  it('shows the localized Agent and Team catalog with inspectable members', async () => {
    await openCustomizationCenter();
    await browser.waitUntil(async () => browser.execute(() => (
      document.querySelectorAll('.core-agent-card, .agent-team-card').length > 0
    )), {
      timeout: 15_000,
      interval: 150,
      timeoutMsg: 'Customization Agent catalog did not become ready',
    });

    const navLabels = await browser.execute(() => (
      Array.from(document.querySelectorAll(
        '#void-nav-panel-extensions [data-testid^="nav-"]',
      ))
        .map(item => item.textContent?.trim() ?? '')
    ));
    expect(navLabels).toEqual(expect.arrayContaining(['专业智能体', '技能', '连接器']));
    const agentCatalogText = await $('.void-agents-shell').getText();
    expect(agentCatalogText).toContain('电脑操作');
    expect(agentCatalogText).not.toContain('Computer Use');

    await saveScreenshot('agents-catalog', {
      directory: screenshotDirectory,
      includeTimestamp: false,
      prefix: 'customization',
    });

    const teamTab = await $('.agents-catalog-tabs [role="tab"]:nth-child(2)');
    await teamTab.click();
    await browser.waitUntil(async () => browser.execute(() => (
      document.querySelectorAll('.agent-team-card').length >= 2
    )), {
      timeout: 15_000,
      interval: 150,
      timeoutMsg: 'Fixed Team catalog cards did not become ready',
    });
    await saveScreenshot('teams-catalog', {
      directory: screenshotDirectory,
      includeTimestamp: false,
      prefix: 'customization',
    });

    const firstTeam = await $('.agent-team-card');
    await firstTeam.click();
    await $('.team-catalog-detail').waitForDisplayed({ timeout: 10_000 });
    expect((await $$('.team-catalog-detail__member')).length).toBeGreaterThan(0);
    await saveScreenshot('team-detail', {
      directory: screenshotDirectory,
      includeTimestamp: false,
      prefix: 'customization',
    });
    await saveElementScreenshot('.gallery-detail-modal', 'team-detail-surface', {
      directory: screenshotDirectory,
      includeTimestamp: false,
      prefix: 'customization',
    });
  });

  it('shows localized Agents and fixed Teams inside the real composer', async () => {
    await browser.keys(['Escape']);
    await ensureCodeSessionOpen();
    await browser.execute(async () => {
      const { useSceneStore } = await import('/src/app/stores/sceneStore.ts');
      useSceneStore.getState().openScene('session');
    });
    await $('[data-testid="chat-input-container"]').waitForDisplayed({
      timeout: 15_000,
    });

    await $('.void-chat-input__agent-boost-add').click();
    const personaTrigger = await $('.void-chat-input__boost-submenu-trigger');
    await personaTrigger.waitForClickable({ timeout: 10_000 });
    await personaTrigger.click();
    await $('.void-chat-input__persona-panel').waitForDisplayed({
      timeout: 10_000,
    });
    await browser.waitUntil(async () => browser.execute(() => (
      document.querySelectorAll('.void-chat-input__persona-item').length > 0
    )), {
      timeout: 15_000,
      interval: 150,
      timeoutMsg: 'Composer persona choices did not become ready',
    });

    const sectionLabels = await browser.execute(() => (
      Array.from(document.querySelectorAll('.void-chat-input__persona-section-title'))
        .map(item => item.textContent?.trim() ?? '')
    ));
    expect(sectionLabels).toEqual(expect.arrayContaining(['智能体', '团队']));
    const boostMenuText = await $('.void-chat-input__mode-dropdown--agent-boost')
      .getText();
    expect(boostMenuText).toContain('智能体与团队');
    expect(boostMenuText).toContain('管理智能体与团队');
    expect(boostMenuText).toContain('技能');
    expect(boostMenuText).toContain('发起侧问');

    await saveScreenshot('composer-persona-picker', {
      directory: screenshotDirectory,
      includeTimestamp: false,
      prefix: 'customization',
    });
    await saveElementScreenshot(
      '.void-chat-input__persona-panel',
      'composer-persona-picker-surface',
      {
        directory: screenshotDirectory,
        includeTimestamp: false,
        prefix: 'customization',
      },
    );

    const firstAgent = await $(
      '.void-chat-input__persona-section:first-of-type .void-chat-input__persona-item',
    );
    const firstAgentName = await firstAgent.$(
      '.void-chat-input__persona-item-name',
    ).getText();
    await firstAgent.click();
    const activePersona = await $('.void-chat-input__persona-capsule');
    await activePersona.waitForDisplayed({ timeout: 10_000 });
    expect(await activePersona.getText()).toContain(firstAgentName);
    await saveScreenshot('composer-selected-persona', {
      directory: screenshotDirectory,
      includeTimestamp: false,
      prefix: 'customization',
    });
  });
});
