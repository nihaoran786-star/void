import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readFlowChatFile = (name: string) => readFileSync(
  new URL(`../../flow_chat/components/${name}`, import.meta.url),
  'utf8',
);
const headerSource = readFlowChatFile('modern/FlowChatHeader.tsx');
const headerMinimalSource = readFlowChatFile('modern/FlowChatHeader.minimal.scss');
const shellMinimalSource = readFlowChatFile('modern/FlowChatShell.minimal.scss');
const presentationSource = readFileSync(
  new URL('./minimalWorkspacePresentation.scss', import.meta.url),
  'utf8',
);
const inputMinimalSource = readFileSync(
  new URL('../../flow_chat/components/ChatInput.minimal.scss', import.meta.url),
  'utf8',
);

describe('FlowChat minimal presentation contract', () => {
  it('routes every secondary header action through a real accessible menu', () => {
    expect(headerSource).toContain('aria-haspopup="menu"');
    expect(headerSource).toContain('aria-expanded={isMoreMenuOpen}');
    expect(headerSource).toContain('role="menu"');
    expect(headerSource.match(/role="menuitem"/g)?.length).toBeGreaterThanOrEqual(7);

    [
      'flowchat-header-pull-requests',
      'flowchat-header-search',
      'flowchat-header-turn-list',
      'flowchat-header-turn-prev',
      'flowchat-header-turn-next',
      'flowchat-header-workspace-media',
      'flowchat-header-preview-first-toggle',
    ].forEach(testId => {
      expect(headerSource).toContain(`data-testid="${testId}"`);
    });
  });

  it('keeps the minimal header flat, compact, focusable, and viewport-safe', () => {
    expect(headerMinimalSource).toMatch(
      /\.void-ui--minimal \.flowchat-header \{[\s\S]*?height: 33px;[\s\S]*?backdrop-filter: none;/,
    );
    expect(headerMinimalSource).toMatch(/&::after \{[\s\S]*?display: none;/);
    expect(headerMinimalSource).toContain('width: min(280px, calc(100vw - 16px));');
    expect(headerMinimalSource).toContain('min-height: 28px;');
    expect(headerMinimalSource).toContain(':focus-visible');
  });

  it('centers prose and messages without hiding rich message content', () => {
    // PINNED_TURN_VIEWPORT_OFFSET_PX and ScrollToTurnHeaderButton live in the
    // virtual-scroll layer; this presentation slice deliberately keeps 57px.
    expect(shellMinimalSource).toMatch(
      /\.message-list-header \{[\s\S]*?height: 57px;[\s\S]*?min-height: 57px;/,
    );
    expect(shellMinimalSource).toMatch(
      /:where\(\.model-round-item, \.user-message-item\)[\s\S]*?max-width: 760px;[\s\S]*?margin-inline: auto;/,
    );
    expect(shellMinimalSource).toContain('.user-message-item__actions:has(.copied, .user-message-item__rollback-spinner)');
    expect(shellMinimalSource).toContain('.model-round-item__footer:has(.copied, .spinning)');
    expect(shellMinimalSource).not.toMatch(
      /(?:user-message-item__images|tool-card|attachment|error|usage)[^{]*\{[^}]*display:\s*none/,
    );
  });

  it('aligns the composer to the same readable width while preserving multiline growth', () => {
    expect(inputMinimalSource).toMatch(
      /\.void-ui--minimal \.void-chat-input-drop-zone \{[\s\S]*?max-width: 760px;/,
    );
    expect(inputMinimalSource).toMatch(
      /&__box--capsule \{[\s\S]*?min-height: 40px;[\s\S]*?max-height: min\(240px, 38vh\);/,
    );
  });

  it('loads both chat presentation mixins from the single minimal theme entry', () => {
    expect(presentationSource).toContain('FlowChatHeader.minimal.scss');
    expect(presentationSource).toContain('FlowChatShell.minimal.scss');
    expect(presentationSource).toContain('@include flow-chat-header.styles;');
    expect(presentationSource).toContain('@include flow-chat-shell.styles;');
  });
});
