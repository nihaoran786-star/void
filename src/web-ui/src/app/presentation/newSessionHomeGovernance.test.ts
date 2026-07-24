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

    expect(panelSource).toContain("t('welcome.promptTitle')");
    expect(panelSource).not.toMatch(/<img\b/);
    expect(panelSource).not.toContain('/Logo-ICON.png');
    expect(panelSource).not.toContain('/Void-Logo.png');
    expect(paneStyles).toContain(':has(.welcome-panel)');
    expect(paneStyles).toContain('.void-chat-input-drop-zone');
  });

  it('preserves the open-workspace affordance when no workspace is selected', () => {
    const panelSource = read('flow_chat/components/WelcomePanel.tsx');
    const paneStyles = read('app/scenes/session/ChatPane.scss');

    expect(panelSource).toContain("const needsWorkspace = !isClawSession && !hasWorkspace");
    expect(panelSource).toContain('welcome-panel--needs-workspace');
    expect(paneStyles).toContain(
      '.welcome-panel:not(.welcome-panel--needs-workspace) .welcome-panel__narrative',
    );
    expect(paneStyles).not.toMatch(
      /(?<!not\(\.welcome-panel--needs-workspace\)\s)\.welcome-panel__narrative\s*\{\s*display:\s*none/,
    );
  });
});
