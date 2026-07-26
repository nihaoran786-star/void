import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const webUiRoot = path.resolve(__dirname, '../..');

function read(relativePath: string): string {
  return fs.readFileSync(path.join(webUiRoot, relativePath), 'utf8');
}

describe('new session home visual governance', () => {
  it('keeps the welcome surface graphic-free and driven by the shared composer', () => {
    const panelSource = read('flow_chat/components/WelcomePanel.tsx');
    const paneStyles = read('app/scenes/session/ChatPane.scss');
    const sceneStyles = read('app/scenes/session/SessionScene.scss');

    expect(panelSource).toContain("t('welcome.promptTitle')");
    expect(panelSource).not.toMatch(/<img\b/);
    expect(panelSource).not.toContain('/Logo-ICON.png');
    expect(panelSource).not.toContain('/Void-Logo.png');
    expect(panelSource).toContain('welcome-panel__creation-modes');
    expect(panelSource).toContain('welcome.creationModeCowork');
    expect(panelSource).not.toContain('welcome.creationModeShortDrama');
    expect(paneStyles).toContain(':has(.welcome-panel__creation-modes)');
    expect(paneStyles).toContain('.void-chat-input-drop-zone');
    expect(paneStyles).toContain(
      'min-height: var(--workspace-composer-min-height)',
    );
    expect(paneStyles).toMatch(
      /\.welcome-panel__cowork\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?width:\s*min\(100%, 172px\);/,
    );
    expect(sceneStyles).toMatch(
      /\.void-ui--minimal \.void-session-scene__chat-pane\s*\{[\s\S]*?min-width:\s*min\(400px, 100%\);[\s\S]*?container-name:\s*session-chat-pane;/,
    );
    expect(paneStyles).toMatch(
      /@container session-chat-pane \(max-width: 360px\)[\s\S]*?\.welcome-panel__creation-modes\s*\{[\s\S]*?width:\s*100%;[\s\S]*?\.welcome-panel__creation-mode\s*\{[\s\S]*?flex:\s*1 1 0;/,
    );
    expect(paneStyles).toMatch(
      /@container session-chat-pane \(max-width: 360px\)[\s\S]*?\.void-chat-input-workspace-strip__picker-trigger\s*\{[\s\S]*?width:\s*28px;[\s\S]*?\.void-chat-input-workspace-strip__workspace,[\s\S]*?svg:last-child\s*\{[\s\S]*?display:\s*none;/,
    );
    expect(paneStyles).toMatch(
      /@container session-chat-pane \(max-width: 360px\)[\s\S]*?\.void-chat-input-workspace-strip__picker-menu\s*\{[\s\S]*?left:\s*calc\(0px - var\(--workspace-space-6\) - var\(--workspace-space-4\)\);[\s\S]*?100cqw/,
    );
  });

  it('preserves the open-workspace affordance when no workspace is selected', () => {
    const panelSource = read('flow_chat/components/WelcomePanel.tsx');
    const paneStyles = read('app/scenes/session/ChatPane.scss');

    expect(panelSource).toContain(
      "const needsWorkspace = !isDraft && !isClawSession && !hasWorkspace",
    );
    expect(panelSource).toContain('welcome-panel--needs-workspace');
    expect(paneStyles).toContain(
      '.welcome-panel:not(.welcome-panel--needs-workspace) .welcome-panel__narrative',
    );
    expect(paneStyles).not.toMatch(
      /(?<!not\(\.welcome-panel--needs-workspace\)\s)\.welcome-panel__narrative\s*\{\s*display:\s*none/,
    );
  });

  it('keeps a new session as an unpersisted draft until the first send', () => {
    const mainNavSource = read('app/components/NavPanel/MainNav.tsx');
    const workspaceItemSource = read(
      'app/components/NavPanel/sections/workspaces/WorkspaceItem.tsx',
    );
    const chatInputSource = read('flow_chat/components/ChatInput.tsx');
    const draftServiceSource = read('flow_chat/services/NewSessionDraftService.ts');
    const senderSource = read('flow_chat/hooks/useMessageSender.ts');

    expect(mainNavSource).toContain("beginNewSessionDraft('code', null)");
    expect(mainNavSource).toContain(
      '? selectNewSessionDraftWorkspace',
    );
    expect(mainNavSource).toContain(
      'onWorkspaceActivate={',
    );
    expect(workspaceItemSource).toContain('if (onActivate)');
    expect(workspaceItemSource).toContain('onActivate(workspace)');
    expect(chatInputSource).toContain(
      'if (sessionChanged && previousScopeId)',
    );
    expect(chatInputSource).not.toContain(
      'sessionChanged && previousSessionId && previousScopeId',
    );
    expect(chatInputSource).toContain(
      'const composerScopeId = currentSessionId || draftId',
    );
    expect(chatInputSource).toContain(
      'if (!derivedState && !isNewSessionDraft)',
    );
    expect(mainNavSource).not.toContain('pickWorkspaceForProjectChatSession');
    expect(draftServiceSource).toContain('activeSessionId: null');
    expect(senderSource).toContain('...newSessionConfig');
    expect(senderSource).toContain('onSessionCreated?.(sessionId)');
  });
});
