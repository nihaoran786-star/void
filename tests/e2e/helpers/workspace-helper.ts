/**
 * Helper utilities for workspace operations in e2e tests.
 */

import { browser, $, $$ } from '@wdio/globals';
import { isWorkspaceReady } from './workspace-readiness.js';

export interface WorkspaceState {
  currentWorkspacePath: string | null;
  openedWorkspacePaths: string[];
  workspaceLabels: string[];
  managerCurrentWorkspacePath: string | null;
  managerLoading: boolean;
  applicationShellReady: boolean;
}

/**
 * Open a workspace through the frontend state layer so the UI stays in sync.
 */
export async function openWorkspaceThroughFrontend(workspacePath: string): Promise<void> {
  await browser.execute(async (targetWorkspacePath: string) => {
    const { workspaceManager } = await import('/src/infrastructure/services/business/workspaceManager.ts');
    await workspaceManager.openWorkspace(targetWorkspacePath);
  }, workspacePath);
}

/**
 * Read the current frontend-visible workspace state.
 */
export async function getWorkspaceState(): Promise<WorkspaceState> {
  return browser.execute(async () => {
    const { globalStateAPI } = await import('/src/shared/types/global-state.ts');
    const { workspaceManager } = await import('/src/infrastructure/services/business/workspaceManager.ts');
    const currentWorkspace = await globalStateAPI.getCurrentWorkspace();
    const openedWorkspaces = await globalStateAPI.getOpenedWorkspaces();
    const managerState = workspaceManager.getState();
    const workspaceLabels = Array.from(document.querySelectorAll('.void-nav-panel__workspace-item-label'))
      .map(element => element.textContent?.trim() || '')
      .filter(Boolean);

    return {
      currentWorkspacePath: currentWorkspace?.rootPath || null,
      openedWorkspacePaths: openedWorkspaces.map(workspace => workspace.rootPath),
      workspaceLabels,
      managerCurrentWorkspacePath: managerState.currentWorkspace?.rootPath ?? null,
      managerLoading: managerState.loading,
      applicationShellReady: Boolean(
        document.querySelector('[data-testid="app-layout"]')
        && document.querySelector('[data-testid="app-main-content"]')
        && document.querySelector('.void-nav-panel')
        && !document.querySelector('.splash-screen'),
      ),
    };
  });
}

/**
 * Wait until both frontend state layers agree and the stable application shell
 * is ready. Workspace labels are presentation-only and may be absent when the
 * navigation is collapsed or filtered.
 */
export async function waitForWorkspaceReady(
  workspacePath: string,
  _projectName: string = '',
  timeout: number = 15000,
): Promise<WorkspaceState> {
  await browser.waitUntil(async () => {
    const state = await getWorkspaceState();
    return isWorkspaceReady(state, workspacePath);
  }, {
    timeout,
    interval: 500,
    timeoutMsg: `Workspace did not become active in frontend state: ${workspacePath}`,
  });

  return getWorkspaceState();
}

/**
 * Open a workspace and wait until the frontend is ready to interact with it.
 */
export async function openWorkspace(
  workspacePath: string = process.env.E2E_TEST_WORKSPACE || process.cwd(),
): Promise<boolean> {
  try {
    await openWorkspaceThroughFrontend(workspacePath);
    await waitForWorkspaceReady(workspacePath);
    return true;
  } catch (error) {
    console.error('[WorkspaceHelper] Failed to open workspace through frontend state:', error);
    return false;
  }
}

/**
 * Ensure a Code session is open for the active workspace.
 */
export async function ensureCodeSessionOpen(): Promise<void> {
  const chatInput = await $('[data-testid="chat-input-container"]');
  if (await chatInput.isExisting()) {
    return;
  }

  const existingCodeSession = await $(
    '.void-nav-panel__inline-item:has(.void-nav-panel__inline-item-icon.is-code) '
    + '.void-nav-panel__inline-item-activation',
  );
  if (await existingCodeSession.isExisting()) {
    await existingCodeSession.click();
  } else {
    const minimalModeTrigger = await $('.void-nav-panel__session-mode-menu-trigger');
    if (await minimalModeTrigger.isExisting()) {
      await minimalModeTrigger.click();
      const codeModeOption = await $(
        '#void-session-mode-menu [role="menuitemradio"]:first-child',
      );
      await codeModeOption.waitForExist({ timeout: 5000 });
      await codeModeOption.click();
      await $('.void-nav-panel__session-create-action').click();
    } else {
      const classicCreateAction = await $(
        '.void-nav-panel__workspace-create-main--split-left',
      );
      if (await classicCreateAction.isExisting()) {
        await classicCreateAction.click();
      } else {
        throw new Error('No existing or creatable Code session action was found');
      }
    }
  }

  await browser.waitUntil(async () => {
    const input = await $('[data-testid="chat-input-container"]');
    return input.isExisting();
  }, {
    timeout: 15000,
    interval: 500,
    timeoutMsg: 'Code session did not open',
  });
}

/**
 * Checks if any workspace is currently active in the frontend.
 */
export async function isWorkspaceOpen(): Promise<boolean> {
  const state = await getWorkspaceState();
  if (state.currentWorkspacePath) {
    return true;
  }

  const chatInput = await $('[data-testid="chat-input-container"]');
  return await chatInput.isExisting();
}

export default {
  openWorkspaceThroughFrontend,
  getWorkspaceState,
  waitForWorkspaceReady,
  openWorkspace,
  ensureCodeSessionOpen,
  isWorkspaceOpen,
};
