import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { compile } from 'sass';
import { describe, expect, it } from 'vitest';

const readFlowChatFile = (name: string) => readFileSync(
  new URL(`../../flow_chat/components/${name}`, import.meta.url),
  'utf8',
);
const readToolCardFile = (name: string) => readFileSync(
  new URL(`../../flow_chat/tool-cards/${name}`, import.meta.url),
  'utf8',
);
const headerSource = readFlowChatFile('modern/FlowChatHeader.tsx');
const headerMinimalSource = readFlowChatFile('modern/FlowChatHeader.minimal.scss');
const shellMinimalSource = readFlowChatFile('modern/FlowChatShell.minimal.scss');
const userMessageMinimalSource = readFlowChatFile('modern/UserMessage.minimal.scss');
const userMessageBaseSource = readFlowChatFile('modern/UserMessageItem.scss');
const toolCardShellMinimalSource = readFileSync(
  new URL('../../flow_chat/tool-cards/ToolCardShell.minimal.scss', import.meta.url),
  'utf8',
);
const fileOperationToolSource = readToolCardFile('FileOperationToolCard.tsx');
const ordinaryBaseToolSources = [
  readToolCardFile('ContextCompressionDisplay.tsx'),
  fileOperationToolSource,
  readToolCardFile('MCPToolDisplay.tsx'),
];
const compactConfirmationToolSources = [
  fileOperationToolSource,
  readToolCardFile('ReadFileDisplay.tsx'),
  readToolCardFile('GitToolDisplay.tsx'),
  readToolCardFile('TerminalToolCard.tsx'),
  readToolCardFile('DefaultToolCard.tsx'),
];
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
const tokenSource = readFileSync(
  new URL('../../component-library/styles/tokens.scss', import.meta.url),
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
      'flowchat-header-preview-first-toggle',
    ].forEach(testId => {
      expect(headerSource).toContain(`data-testid="${testId}"`);
    });
    expect(headerSource).not.toContain(
      'data-testid="flowchat-header-workspace-media"',
    );
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
      /:where\(\.model-round-item, \.user-message-item\)[\s\S]*?width: min\(var\(--workspace-content-max\), calc\(100% - 32px\)\);[\s\S]*?max-width: var\(--workspace-content-max\);[\s\S]*?margin-inline: auto;/,
    );
    expect(tokenSource).toContain('--workspace-content-max: 800px;');
    expect(shellMinimalSource).toContain('.user-message-item__actions:has(.copied, .user-message-item__rollback-spinner)');
    expect(shellMinimalSource).toContain('.model-round-item__footer:has(.copied, .spinning)');
    expect(shellMinimalSource).not.toMatch(
      /(?:user-message-item__images|tool-card|attachment|error|usage)[^{]*\{[^}]*display:\s*none/,
    );
  });

  it('gives model prose the governed body scale without inflating support or rich data', () => {
    expect(shellMinimalSource).toContain('--flowchat-font-size-base: 13px;');
    expect(shellMinimalSource).toMatch(
      /\.model-round-item[\s\S]*?\.flow-text-block:not\(\.flow-text-block--runtime-status\)[\s\S]*?font-size: var\(--workspace-font-size-body\);[\s\S]*?line-height: var\(--workspace-line-height-body\);/,
    );
    expect(shellMinimalSource).toMatch(
      /\.flow-text-block:not\(\.flow-text-block--runtime-status\)[\s\S]*?\.markdown-renderer \{[\s\S]*?--markdown-font-size: var\(--workspace-font-size-body\);[\s\S]*?--markdown-line-height: var\(--workspace-line-height-body\);/,
    );
    expect(shellMinimalSource).toMatch(
      /\.flow-text-block--runtime-status \{[\s\S]*?font-size: var\(--workspace-font-size-control\);[\s\S]*?line-height: var\(--workspace-line-height-control\);/,
    );
    expect(shellMinimalSource).toMatch(
      /\.markdown-renderer[\s\S]*?\.code-block-wrapper[\s\S]*?pre\[class\*='language-'\]/,
    );
    expect(shellMinimalSource).toContain(
      'font-size: var(--flowchat-font-size-sm) !important;',
    );
    expect(shellMinimalSource).toMatch(
      /\.markdown-renderer[\s\S]*?\.table-wrapper[\s\S]*?table \{[\s\S]*?font-size: var\(--flowchat-font-size-sm\);/,
    );
    expect(shellMinimalSource).toMatch(
      /\.model-round-item \{[\s\S]*?border: 0;[\s\S]*?border-radius: 0;[\s\S]*?background: transparent;/,
    );
  });

  it('removes broad and scale transitions from minimal message controls', () => {
    expect(shellMinimalSource).toMatch(
      /\.model-round-item__action-btn \{[\s\S]*?transition:[\s\S]*?color 100ms ease,[\s\S]*?background 100ms ease,[\s\S]*?opacity 100ms ease;/,
    );
    expect(shellMinimalSource).toMatch(
      /\.model-round-item__action-btn:active \{[\s\S]*?transform: none;/,
    );
    expect(shellMinimalSource).toMatch(
      /\.code-block-wrapper[\s\S]*?\.copy-button:is\(:hover, :active\)[\s\S]*?transform: none;/,
    );
    expect(userMessageMinimalSource).toMatch(
      /\.user-message-item__content \{[\s\S]*?transition: color 100ms ease;/,
    );
    expect(shellMinimalSource).not.toContain('transition: all');
    expect(userMessageMinimalSource).not.toContain('transition: all');
  });

  it('keeps the composer low-profile with one blue primary action', () => {
    expect(inputMinimalSource).toMatch(
      /\.void-ui--minimal \.void-chat-input-drop-zone \{[\s\S]*?bottom: var\(--workspace-space-2\);[\s\S]*?max-width: var\(--workspace-content-max\);[\s\S]*?padding-inline: var\(--workspace-space-2\);/,
    );
    expect(inputMinimalSource).toMatch(
      /&--capsule \{[\s\S]*?\.void-chat-input__box--capsule \{[\s\S]*?grid-template-areas:[\s\S]*?'input input input'[\s\S]*?'tools meta status';[\s\S]*?grid-template-columns: auto minmax\(0, 1fr\) auto;[\s\S]*?row-gap: var\(--workspace-space-1\);[\s\S]*?border-radius: var\(--workspace-radius-composer\);/,
    );
    expect(inputMinimalSource).toMatch(
      /\.void-chat-input__box--capsule \{[\s\S]*?min-height: calc\([\s\S]*?var\(--workspace-control-height\) \+ var\(--workspace-space-8\)[\s\S]*?\);[\s\S]*?max-height: min\(240px, 38vh\);[\s\S]*?padding: var\(--workspace-space-1\) var\(--workspace-space-2\);/,
    );
    expect(inputMinimalSource).toMatch(
      /&__box--multi-line \{[\s\S]*?height: auto;[\s\S]*?min-height: calc\(\s*var\(--workspace-control-height\) \+\s*var\(--workspace-space-8\)\s*\);[\s\S]*?max-height: min\(280px, 42vh\);[\s\S]*?\.rich-text-input \{[\s\S]*?min-height: 22px;[\s\S]*?max-height: min\(216px, 32vh\);[\s\S]*?overflow-y: auto;/,
    );
    expect(inputMinimalSource).toMatch(
      /&__box,[\s\S]*?border-radius: var\(--workspace-radius-composer\);/,
    );
    expect(inputMinimalSource).toMatch(
      /&__box:focus-within \{[\s\S]*?border-radius: var\(--workspace-radius-composer\);/,
    );
    expect(inputMinimalSource).toMatch(
      /&__box--multi-line \{[\s\S]*?border-radius: var\(--workspace-radius-composer\);/,
    );
    expect(tokenSource).toContain('--workspace-radius-composer: 18px;');
    expect(inputMinimalSource).toMatch(
      /&__send-button,[\s\S]*?&__breathing-circle \{[\s\S]*?background: var\(--workspace-primary-action\);/,
    );
    expect(inputMinimalSource).toMatch(
      /&__send-button:hover:not\(:disabled\),[\s\S]*?&__send-button:active:not\(:disabled\) \{[\s\S]*?background: var\(--workspace-primary-action-hover\);/,
    );
    expect(inputMinimalSource).toMatch(
      /:is\([\s\S]*?:root\[data-theme-type='light'\][\s\S]*?\)[\s\S]*?\.void-ui--minimal[\s\S]*?\.void-chat-input[\s\S]*?\.void-chat-input__send-button:not\([\s\S]*?\.void-chat-input__send-button--breathing[\s\S]*?\):not\(:disabled\)[\s\S]*?\{[\s\S]*?background: var\(--workspace-primary-action\);/,
    );
    expect(inputMinimalSource).toMatch(
      /\.void-chat-input__send-button:not\([\s\S]*?\.void-chat-input__send-button--breathing[\s\S]*?\):hover:not\(:disabled\)[\s\S]*?background: var\(--workspace-primary-action-hover\);[\s\S]*?transform: none;/,
    );
    expect(inputMinimalSource).toMatch(
      /:root\[data-theme-type='light'\][\s\S]*?\.void-chat-input__box--capsule:hover,[\s\S]*?\.void-chat-input__box--capsule:focus-within[\s\S]*?\{[\s\S]*?background: var\(--workspace-surface-raised\);[\s\S]*?box-shadow: none;/,
    );
    expect(tokenSource).toContain(
      '--workspace-primary-action: var(--flowchat-link-color);',
    );
    expect(tokenSource).toMatch(
      /--workspace-primary-action-hover: color-mix\([\s\S]*?var\(--flowchat-link-color\) 84%,[\s\S]*?var\(--workspace-text-primary\)/,
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

  it('keeps workspace, permission, and usage controls quiet until interaction', () => {
    expect(workspaceStripMinimalSource).toMatch(
      /\.void-chat-input-workspace-strip__permission-trigger \{[\s\S]*?min-height: 28px;[\s\S]*?color: var\(--workspace-text-secondary\);[\s\S]*?background: transparent;/,
    );
    expect(workspaceStripMinimalSource).toContain(
      'color var(--workspace-motion-fast) var(--workspace-easing-standard),',
    );
    expect(workspaceStripMinimalSource).toContain(
      'background var(--workspace-motion-fast) var(--workspace-easing-standard);',
    );
    expect(workspaceStripMinimalSource).toMatch(
      /:where\([\s\S]*?\.void-chat-input-workspace-strip__permission-menu,[\s\S]*?\.void-chat-input-workspace-strip__picker-menu[\s\S]*?\) \{[\s\S]*?border-color: var\(--workspace-border-subtle\);[\s\S]*?border-radius: var\(--workspace-radius-panel\);[\s\S]*?background: var\(--workspace-surface-raised\);[\s\S]*?box-shadow: var\(--workspace-shadow-raised\);/,
    );
    expect(workspaceStripMinimalSource).toMatch(
      /\.void-chat-input-workspace-strip__permission-trigger--full_access \{[\s\S]*?color: var\(--workspace-status-warning-text\);/,
    );
    expect(workspaceStripMinimalSource).not.toContain('transition: all');
  });

  it('keeps the persona flyout inside narrow chat panes', () => {
    expect(inputMinimalSource).toMatch(
      /@container session-chat-pane \(max-width: 360px\)[\s\S]*?\.void-ui--minimal \.void-chat-input__boost-submenu-shell \{[\s\S]*?top: 100%;[\s\S]*?bottom: auto;[\s\S]*?left: 0;[\s\S]*?right: auto;[\s\S]*?padding: var\(--workspace-space-1\) 0 0;[\s\S]*?\.void-ui--minimal[\s\S]*?\.void-chat-input__persona-submenu-shell[\s\S]*?\.void-chat-input__boost-submenu-panel \{[\s\S]*?min-width: min\(15rem, calc\(100vw - var\(--workspace-space-6\)\)\);[\s\S]*?max-width: min\(15rem, calc\(100vw - var\(--workspace-space-6\)\)\);/,
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

  it('projects successful user messages as compact right-aligned quote surfaces without hiding rich content', () => {
    expect(userMessageBaseSource).toMatch(
      /\.user-message-item \{[\s\S]*?box-shadow: none;[\s\S]*?transition: background 0\.2s ease, border-color 0\.2s ease;/,
    );
    expect(userMessageBaseSource).not.toContain(
      'box-shadow: 0 1px 0 color-mix(in srgb, #fff 4%, transparent) inset;',
    );
    expect(userMessageMinimalSource).toContain('width: fit-content;');
    expect(userMessageMinimalSource).toContain(
      'max-width: min(560px, calc(100% - 32px));',
    );
    expect(userMessageMinimalSource).toContain(
      'padding: var(--workspace-space-1) var(--workspace-space-2);',
    );
    expect(userMessageMinimalSource).toContain(
      'border-left: 2px solid var(--workspace-border-strong);',
    );
    expect(userMessageMinimalSource).toContain(
      'border-radius: var(--workspace-radius-control);',
    );
    expect(userMessageMinimalSource).toContain(
      'background: var(--workspace-surface-panel);',
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
    expect(userMessageMinimalSource).toMatch(
      /@media \(max-width: 768px\) \{[\s\S]*?\.user-message-item:not\(\.user-message-item--failed\) \{[\s\S]*?margin-bottom: calc\(var\(--flowchat-turn-gap\) \+ 30px\);/,
    );
    expect(userMessageMinimalSource).not.toMatch(
      /\.user-message-item:not\(\.user-message-item--failed\):is\([\s\S]*?margin-bottom:/,
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

  it('opts ordinary Base tool summaries into the compact status-row presentation', () => {
    for (const source of ordinaryBaseToolSources) {
      expect(source).toContain('presentation="status-row"');
    }
  });

  it('keeps every compact approval row classified as a confirmation card', () => {
    for (const source of compactConfirmationToolSources) {
      expect(source).toMatch(
        /<CompactToolCard[\s\S]{0,360}?requiresConfirmation=\{/,
      );
    }
  });

  it('flattens only ordinary collapsed tool summaries into stable single-line rows', () => {
    expect(toolCardShellMinimalSource).toMatch(
      /\.base-tool-card-wrapper--status-row:not\(\.requires-confirmation\):not\([\s\S]*?> \.base-tool-card:is\(\.expanded, \.status-error\)[\s\S]*?border: 0;[\s\S]*?background: transparent;[\s\S]*?overflow: visible;/,
    );
    expect(toolCardShellMinimalSource).toMatch(
      /\.base-tool-card-wrapper--status-row[\s\S]*?\.base-tool-card-header \{[\s\S]*?min-height: 28px;/,
    );
    expect(toolCardShellMinimalSource).toMatch(
      /\.compact-tool-card-wrapper:not\(\.media-generation-card\):not\(\s*\.requires-confirmation\s*\):not\([\s\S]*?> \.compact-tool-card\.status-error[\s\S]*?overflow: visible;[\s\S]*?\.compact-tool-card \{[\s\S]*?min-height: 28px;[\s\S]*?background: transparent !important;/,
    );
    expect(toolCardShellMinimalSource).toContain(
      'background: var(--workspace-surface-hover) !important;',
    );
    expect(toolCardShellMinimalSource).toMatch(
      /\.compact-tool-card-wrapper:not\(\s*\.media-generation-card\s*\)\.requires-confirmation \{[\s\S]*?border: 1px solid var\(--workspace-status-warning-border\);[\s\S]*?background: var\(--workspace-status-warning-bg\);/,
    );
    expect(toolCardShellMinimalSource).toMatch(
      /\.compact-tool-card-wrapper:not\(\.media-generation-card\):has\([\s\S]*?> \.compact-tool-card\.status-error[\s\S]*?border: 1px solid var\(--workspace-status-error-border\);[\s\S]*?background: var\(--workspace-status-error-bg\);/,
    );
  });

  it('keeps completed tool rows mounted without height or margin exit animation', () => {
    expect(shellMinimalSource).toMatch(
      /:where\([\s\S]*?\.flowchat-flow-item--tool-transition,[\s\S]*?\.flowchat-flow-item--tool-active,[\s\S]*?\.flowchat-flow-item--tool-completed[\s\S]*?\) \{[\s\S]*?overflow: visible;[\s\S]*?will-change: auto;[\s\S]*?animation: none;[\s\S]*?max-height: none;[\s\S]*?opacity: 1;[\s\S]*?transform: none;/,
    );
    expect(shellMinimalSource).not.toContain(
      'will-change: opacity, transform, max-height',
    );
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
