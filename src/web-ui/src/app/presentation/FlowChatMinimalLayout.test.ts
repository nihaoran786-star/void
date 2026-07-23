import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { compile } from 'sass';
import { describe, expect, it } from 'vitest';

const readFlowChatFile = (name: string) => readFileSync(
  new URL(`../../flow_chat/components/${name}`, import.meta.url),
  'utf8',
);
const headerSource = readFlowChatFile('modern/FlowChatHeader.tsx');
const headerMinimalSource = readFlowChatFile('modern/FlowChatHeader.minimal.scss');
const shellMinimalSource = readFlowChatFile('modern/FlowChatShell.minimal.scss');
const userMessageMinimalSource = readFlowChatFile('modern/UserMessage.minimal.scss');
const toolCardShellMinimalSource = readFileSync(
  new URL('../../flow_chat/tool-cards/ToolCardShell.minimal.scss', import.meta.url),
  'utf8',
);
const presentationSource = readFileSync(
  new URL('./minimalWorkspacePresentation.scss', import.meta.url),
  'utf8',
);
const inputMinimalSource = readFileSync(
  new URL('../../flow_chat/components/ChatInput.minimal.scss', import.meta.url),
  'utf8',
);
const richTextMinimalSource = readFileSync(
  new URL('../../flow_chat/components/RichTextInput.minimal.scss', import.meta.url),
  'utf8',
);
const fileMentionMinimalSource = readFileSync(
  new URL('../../flow_chat/components/FileMentionPicker.minimal.scss', import.meta.url),
  'utf8',
);
const workspaceStripMinimalSource = readFileSync(
  new URL('../../flow_chat/components/ChatInputWorkspaceStrip.minimal.scss', import.meta.url),
  'utf8',
);
const compiledPresentationCss = compile(
  fileURLToPath(new URL('./minimalWorkspacePresentation.scss', import.meta.url)),
  { style: 'expanded' },
).css;

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
      /\.void-ui--minimal \.flowchat-header \{[\s\S]*?height: var\(--workspace-topbar-height\);[\s\S]*?backdrop-filter: none;/,
    );
    expect(headerMinimalSource).toMatch(/&::after \{[\s\S]*?display: none;/);
    expect(headerMinimalSource).toContain('width: min(280px, calc(100vw - 16px));');
    expect(headerMinimalSource).toContain('min-height: 28px;');
    expect(headerMinimalSource).toContain(':focus-visible');
  });

  it('keeps programmatically moved menu focus visible without broadening header focus rules', () => {
    expect(headerMinimalSource).toMatch(
      /&__more-menu-item:focus:not\(:disabled\) \{[\s\S]*?color: var\(--workspace-text-primary\);[\s\S]*?background: var\(--workspace-surface-hover\);[\s\S]*?outline: 2px solid var\(--workspace-focus-ring\);[\s\S]*?outline-offset: -2px;[\s\S]*?box-shadow: none;[\s\S]*?\}/,
    );
    expect(headerMinimalSource).not.toContain(
      '&__more-menu-item:focus-visible,',
    );
    expect(headerMinimalSource).toMatch(
      /&__message:focus-visible,[\s\S]*?&__more-button:focus-visible,[\s\S]*?&__subagent-nav-button:focus-visible,[\s\S]*?&__search-close:focus-visible \{/,
    );
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

  it('aligns the composer to the same readable width with one bounded two-level layout', () => {
    expect(inputMinimalSource).toMatch(
      /\.void-ui--minimal \.void-chat-input-drop-zone \{[\s\S]*?bottom: var\(--workspace-space-2\);[\s\S]*?max-width: 760px;[\s\S]*?padding-inline: var\(--workspace-space-2\);/,
    );
    expect(inputMinimalSource).toMatch(
      /&--capsule \{[\s\S]*?\.void-chat-input__box--capsule \{[\s\S]*?grid-template-areas:[\s\S]*?'input input input'[\s\S]*?'tools meta status';[\s\S]*?grid-template-columns: auto minmax\(0, 1fr\) auto;[\s\S]*?row-gap: var\(--workspace-space-2\);[\s\S]*?min-height: var\(--workspace-composer-min-height\);[\s\S]*?max-height: min\(240px, 38vh\);/,
    );
    expect(inputMinimalSource).toMatch(
      /\.void-chat-input-workspace-strip \{[\s\S]*?grid-area: meta;[\s\S]*?align-self: stretch;/,
    );
    expect(inputMinimalSource).toMatch(
      /&__box:focus-within \{[\s\S]*?border-color: var\(--workspace-focus-ring-subtle\);[\s\S]*?box-shadow: none;/,
    );
    expect(inputMinimalSource).not.toContain('box-shadow: inset 0 0 0 1px var(--workspace-focus-ring);');
    expect(inputMinimalSource).not.toMatch(/rgba?\(|#[0-9a-f]{3,8}\b/i);
    expect(compiledPresentationCss).toMatch(
      /\.void-ui--minimal \.void-chat-input--capsule \.void-chat-input__box--capsule \{[\s\S]*?display: grid;/,
    );
    expect(compiledPresentationCss).not.toContain(
      '.void-ui--minimal .void-chat-input--capsule .void-ui--minimal',
    );
  });

  it('loads both chat presentation mixins from the single minimal theme entry', () => {
    expect(presentationSource).toContain('FlowChatHeader.minimal.scss');
    expect(presentationSource).toContain('FlowChatShell.minimal.scss');
    expect(presentationSource).toContain('UserMessage.minimal.scss');
    expect(presentationSource).toContain('ToolCardShell.minimal.scss');
    expect(presentationSource).toContain('RichTextInput.minimal.scss');
    expect(presentationSource).toContain('FileMentionPicker.minimal.scss');
    expect(presentationSource).toContain('ChatInputWorkspaceStrip.minimal.scss');
    expect(presentationSource).toContain('@include flow-chat-header.styles;');
    expect(presentationSource).toContain('@include flow-chat-shell.styles;');
    expect(presentationSource).toContain('@include user-message.styles;');
    expect(presentationSource).toContain('@include tool-card-shell.styles;');
    expect(presentationSource).toContain('@include rich-text-input.styles;');
    expect(presentationSource).toContain('@include file-mention-picker.styles;');
    expect(presentationSource).toContain('@include chat-input-workspace-strip.styles;');
  });

  it('projects user messages as compact right-aligned bubbles without hiding rich content', () => {
    expect(userMessageMinimalSource).toContain('width: fit-content;');
    expect(userMessageMinimalSource).toContain(
      'max-width: min(620px, calc(100% - 32px));',
    );
    expect(userMessageMinimalSource).toMatch(
      /\.user-message-item__actions \{[\s\S]*?position: absolute;[\s\S]*?right: 100%;/,
    );
    expect(userMessageMinimalSource).toContain(
      '.user-message-item:focus-within .user-message-item__copy-btn',
    );
    expect(userMessageMinimalSource).toContain(
      'margin-bottom: calc(var(--flowchat-turn-gap) + 30px);',
    );
    expect(userMessageMinimalSource).toContain(
      '.user-message-item:not(.user-message-item--failed)',
    );
    expect(userMessageMinimalSource).toContain('.user-message-item__images');
    expect(userMessageMinimalSource).not.toMatch(/rgba?\(|#[0-9a-f]{3,8}\b/i);
    expect(userMessageMinimalSource).not.toMatch(/var\(\s*--[^,)]+\s*,/);
    expect(userMessageMinimalSource).not.toMatch(/(?:linear|radial|conic)-gradient/i);
    expect(userMessageMinimalSource).not.toContain('transition: all');
  });

  it('projects shared tool cards as low-noise token surfaces without changing their state classes', () => {
    expect(toolCardShellMinimalSource).toContain(
      '.void-ui--minimal .virtual-message-list',
    );
    expect(toolCardShellMinimalSource).toContain(
      '.base-tool-card-wrapper:not(.task-tool-display):not(',
    );
    expect(toolCardShellMinimalSource).toContain(
      '.compact-tool-card-wrapper:not(.media-generation-card)',
    );
    expect(toolCardShellMinimalSource).toContain('.task-tool-display');
    expect(toolCardShellMinimalSource).toContain('.media-generation-card');
    expect(toolCardShellMinimalSource).toContain('.compact-tool-card');
    expect(toolCardShellMinimalSource).toContain(
      ').requires-confirmation {',
    );
    expect(toolCardShellMinimalSource).toContain(
      'border-color: var(--workspace-status-warning-border);',
    );
    expect(toolCardShellMinimalSource).toContain('backdrop-filter: none;');
    expect(toolCardShellMinimalSource).toContain('filter: none;');
    expect(toolCardShellMinimalSource).toContain(
      '@media (prefers-reduced-motion: reduce)',
    );
    expect(toolCardShellMinimalSource).not.toMatch(/rgba?\(|#[0-9a-f]{3,8}\b/i);
    expect(toolCardShellMinimalSource).not.toMatch(/var\(\s*--[^,)]+\s*,/);
    expect(toolCardShellMinimalSource).not.toMatch(
      /(?:linear|radial|conic)-gradient/i,
    );
    expect(toolCardShellMinimalSource).not.toContain('transition: all');
    expect(toolCardShellMinimalSource).not.toContain('infinite');
  });

  it('projects composer child surfaces through the governed workspace tokens', () => {
    for (const source of [
      inputMinimalSource,
      richTextMinimalSource,
      fileMentionMinimalSource,
      workspaceStripMinimalSource,
    ]) {
      expect(source).not.toMatch(/rgba?\(|#[0-9a-f]{3,8}\b/i);
      expect(source).not.toMatch(/var\(\s*--[^,)]+\s*,/);
      expect(source).not.toMatch(/(?:linear|radial|conic)-gradient/i);
    }

    expect(richTextMinimalSource).toContain('.rich-text-tag-pill[data-context-type]');
    expect(fileMentionMinimalSource).toContain('backdrop-filter: none;');
    expect(workspaceStripMinimalSource).toContain(
      '.void-chat-input-workspace-strip__usage-btn.icon-btn',
    );
    expect(inputMinimalSource).toContain('@media (prefers-reduced-motion: reduce)');
  });
});
