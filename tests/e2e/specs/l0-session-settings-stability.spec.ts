import { $, browser, expect } from '@wdio/globals';
import * as path from 'node:path';

import { openWorkspace } from '../helpers/workspace-helper';
import { saveScreenshot } from '../helpers/screenshot-utils';

const TEST_WORKSPACE_PATH = process.env.E2E_TEST_WORKSPACE || process.cwd();
const SESSION_PROBE_MESSAGE = 'Void E2E stability probe. Reply OK.';
const SESSION_PROBE_TITLE_PREFIXES = [
  'Void E2E stability',
  'E2E Stability Probe',
  'E2E稳定性探测',
];
const screenshotDirectory = path.resolve(
  process.cwd(),
  '..',
  '..',
  '.codex-artifacts',
  'stability-audit',
);

type SettingsTab = 'account' | 'session-personalization';

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

const openSessionScene = async () => {
  await browser.execute(() => {
    window.dispatchEvent(new CustomEvent('scene:open', {
      detail: { sceneId: 'session' },
    }));
  });
  await $('.void-session-scene').waitForDisplayed({ timeout: 15_000 });
};

const openSettingsTab = async (tab: SettingsTab, readySelector: string) => {
  await browser.execute(async (tabId) => {
    const modulePath = '/src/app/scenes/settings/settingsStore.ts';
    const { useSettingsStore } = await import(/* @vite-ignore */ modulePath);
    useSettingsStore.getState().setActiveTab(tabId);
    window.dispatchEvent(new CustomEvent('scene:open', {
      detail: { sceneId: 'settings' },
    }));
  }, tab);
  await $(readySelector).waitForDisplayed({ timeout: 15_000 });
  await waitForDoubleAnimationFrame();
};

describe('L0 session composer and settings stability', () => {
  let createdSessionId: string | null = null;
  let previousSessionId: string | null = null;
  let sessionsBeforeSend: string[] = [];

  before(async () => {
    await browser.maximizeWindow();
    await browser.keys([
      process.platform === 'darwin' ? 'Meta' : 'Control',
      '0',
    ]);
    await waitForDoubleAnimationFrame();
    expect(await openWorkspace(TEST_WORKSPACE_PATH)).toBe(true);
    await browser.execute(async ({ titlePrefixes, workspacePath }) => {
      const agentPath = '/src/infrastructure/api/service-api/AgentAPI.ts';
      const flowStorePath = '/src/flow_chat/store/FlowChatStore.ts';
      const sessionApiPath = '/src/infrastructure/api/service-api/SessionAPI.ts';
      const { agentAPI } = await import(/* @vite-ignore */ agentPath);
      const { flowChatStore } = await import(/* @vite-ignore */ flowStorePath);
      const { SessionAPI } = await import(/* @vite-ignore */ sessionApiPath);
      const sessionAPI = new SessionAPI();
      const staleProbeSessions = (await sessionAPI.listSessions(workspacePath))
        .filter(session => titlePrefixes.some(
          prefix => session.sessionName.startsWith(prefix),
        ));

      for (const session of staleProbeSessions) {
        await agentAPI.cancelSession(session.sessionId).catch(() => undefined);
        await sessionAPI.deleteSession(session.sessionId, workspacePath);
        flowChatStore.removeSession(session.sessionId);
      }
    }, {
      titlePrefixes: SESSION_PROBE_TITLE_PREFIXES,
      workspacePath: TEST_WORKSPACE_PATH,
    });
  });

  afterEach(async () => {
    if (!createdSessionId) {
      return;
    }

    const sessionId = createdSessionId;
    const restoreSessionId = previousSessionId;
    createdSessionId = null;
    previousSessionId = null;

    await browser.execute(async ({ restoreSessionId, sessionId, workspacePath }) => {
      const agentPath = '/src/infrastructure/api/service-api/AgentAPI.ts';
      const flowStorePath = '/src/flow_chat/store/FlowChatStore.ts';
      const sessionApiPath = '/src/infrastructure/api/service-api/SessionAPI.ts';
      const sessionPath = '/src/flow_chat/services/openBtwSession.ts';
      const { agentAPI } = await import(/* @vite-ignore */ agentPath);
      const { flowChatStore } = await import(/* @vite-ignore */ flowStorePath);
      const { SessionAPI } = await import(/* @vite-ignore */ sessionApiPath);
      const { openMainSession } = await import(/* @vite-ignore */ sessionPath);

      await agentAPI.cancelSession(sessionId).catch(() => undefined);
      const sessionAPI = new SessionAPI();
      await sessionAPI.deleteSession(sessionId, workspacePath);
      flowChatStore.removeSession(sessionId);
      const remainingSessions = await sessionAPI.listSessions(workspacePath);
      if (remainingSessions.some(session => session.sessionId === sessionId)) {
        throw new Error(`E2E session cleanup failed: ${sessionId}`);
      }
      if (restoreSessionId) {
        await openMainSession(restoreSessionId);
      }
    }, {
      restoreSessionId,
      sessionId,
      workspacePath: TEST_WORKSPACE_PATH,
    });
  });

  it('isolates new-task drafts and creates a real session on first send', async () => {
    await openSessionScene();
    previousSessionId = await browser.execute(async () => {
      const modulePath = '/src/flow_chat/store/FlowChatStore.ts';
      const { flowChatStore } = await import(/* @vite-ignore */ modulePath);
      return flowChatStore.getState().activeSessionId;
    });
    sessionsBeforeSend = await browser.execute(async (workspacePath) => {
      const modulePath = '/src/infrastructure/api/service-api/SessionAPI.ts';
      const { SessionAPI } = await import(/* @vite-ignore */ modulePath);
      return (await new SessionAPI().listSessions(workspacePath))
        .map(session => session.sessionId);
    }, TEST_WORKSPACE_PATH);

    const createAction = await $('.void-nav-panel__session-create-action');
    await createAction.waitForClickable({ timeout: 10_000 });
    await createAction.click();
    await $('[data-testid="chat-input-textarea"]').waitForDisplayed({
      timeout: 15_000,
    });

    await $('.void-chat-input-workspace-strip__picker-trigger')
      .waitForDisplayed({ timeout: 10_000 });

    await browser.execute((value) => {
      const input = document.querySelector<HTMLElement>(
        '[data-testid="chat-input-textarea"]',
      );
      if (!input) throw new Error('New-task composer is unavailable');
      input.focus();
      input.textContent = value;
      input.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        data: value,
        inputType: 'insertText',
      }));
    }, 'first isolated draft');

    await createAction.click();
    await browser.waitUntil(async () => browser.execute(() => {
      const input = document.querySelector<HTMLElement>(
        '[data-testid="chat-input-textarea"]',
      );
      return Boolean(
        document.querySelector(
          '.void-chat-input-workspace-strip__picker-trigger',
        )
        && (input?.textContent ?? '') === '',
      );
    }), {
      timeout: 10_000,
      interval: 100,
      timeoutMsg: 'A second new task reused the previous draft content',
    });

    await browser.execute((workspaceName) => {
      const item = Array.from(
        document.querySelectorAll<HTMLButtonElement>(
          '.void-nav-panel__workspace-item-name-btn',
        ),
      ).find(candidate => (
        candidate.closest('.void-nav-panel__workspace-item')
          ?.querySelector('.void-nav-panel__workspace-item-label')
          ?.textContent?.trim() === workspaceName
      ));
      if (!item) throw new Error(`Workspace nav item is unavailable: ${workspaceName}`);
      item.click();
    }, path.basename(TEST_WORKSPACE_PATH));

    await browser.waitUntil(async () => browser.execute((workspaceName) => (
      document.querySelector(
        '.void-chat-input-workspace-strip__picker-trigger',
      )?.textContent?.includes(workspaceName) === true
    ), path.basename(TEST_WORKSPACE_PATH)), {
      timeout: 10_000,
      interval: 100,
      timeoutMsg: 'Clicking a workspace did not bind it to the new-task draft',
    });

    await browser.execute((value) => {
      const input = document.querySelector<HTMLElement>(
        '[data-testid="chat-input-textarea"]',
      );
      if (!input) throw new Error('New-task composer is unavailable');
      input.focus();
      input.textContent = value;
      input.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        data: value,
        inputType: 'insertText',
      }));
    }, SESSION_PROBE_MESSAGE);

    const sendButton = await $('[data-testid="chat-input-send-btn"]');
    await browser.waitUntil(async () => sendButton.isEnabled(), {
      timeout: 10_000,
      interval: 100,
      timeoutMsg: 'New-task send button remained disabled after workspace selection',
    });
    await dismissVisualObstructions();
    await saveScreenshot('new-task-ready', {
      directory: screenshotDirectory,
      includeTimestamp: false,
      prefix: 'stability',
    });

    await sendButton.click();
    await browser.waitUntil(async () => browser.execute((probeMessage) => (
      !document.querySelector(
        '.void-chat-input-workspace-strip__picker-trigger',
      )
      && document.body.innerText.includes(probeMessage)
    ), SESSION_PROBE_MESSAGE), {
      timeout: 20_000,
      interval: 100,
      timeoutMsg: 'First send did not transition the draft into a real session',
    });
    createdSessionId = await browser.execute(async ({ knownSessionIds, workspacePath }) => {
      const modulePath = '/src/infrastructure/api/service-api/SessionAPI.ts';
      const { SessionAPI } = await import(/* @vite-ignore */ modulePath);
      return (await new SessionAPI().listSessions(workspacePath))
        .find(session => !knownSessionIds.includes(session.sessionId))
        ?.sessionId ?? null;
    }, {
      knownSessionIds: sessionsBeforeSend,
      workspacePath: TEST_WORKSPACE_PATH,
    });
    expect(createdSessionId).not.toBeNull();
    expect(createdSessionId).not.toBe(previousSessionId);
  });

  it('keeps workspace memory inside the personalization layout', async () => {
    await openSettingsTab('session-personalization', '.agent-memory-settings');
    const geometry = await browser.execute(() => {
      const section = document.querySelector<HTMLElement>('.agent-memory-settings');
      const content = section?.closest<HTMLElement>(
        '.void-config-page-content__inner',
      );
      if (!section || !content) {
        throw new Error('Workspace memory is outside the shared settings layout');
      }
      const sectionRect = section.getBoundingClientRect();
      const contentRect = content.getBoundingClientRect();
      const rawCommandVisible = document.body.innerText.includes(
        'Command list_agent_memories not found',
      );
      return {
        contentRight: contentRect.right,
        rawCommandVisible,
        sectionRight: sectionRect.right,
        sectionWidth: sectionRect.width,
        widestButton: Math.max(
          0,
          ...Array.from(section.querySelectorAll('button'))
            .map(button => button.getBoundingClientRect().width),
        ),
      };
    });

    expect(geometry.sectionRight).toBeLessThanOrEqual(geometry.contentRight + 1);
    expect(geometry.widestButton).toBeLessThan(geometry.sectionWidth * 0.75);
    expect(geometry.rawCommandVisible).toBe(false);
    await dismissVisualObstructions();
    await saveScreenshot('settings-personalization', {
      directory: screenshotDirectory,
      includeTimestamp: false,
      prefix: 'stability',
    });
  });

  it('renders subscription login as a structured account panel', async () => {
    await openSettingsTab('account', '.subscription-accounts');
    const rawCommandVisible = await browser.execute(() => (
      document.body.innerText.includes('Command subscription_auth')
    ));
    expect(rawCommandVisible).toBe(false);
    await dismissVisualObstructions();
    await saveScreenshot('settings-account', {
      directory: screenshotDirectory,
      includeTimestamp: false,
      prefix: 'stability',
    });
  });
});
