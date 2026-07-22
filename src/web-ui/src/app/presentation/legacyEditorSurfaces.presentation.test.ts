// @vitest-environment node

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (url: URL) => readFileSync(url, 'utf8').replace(/\r\n/g, '\n');

const diffComponent = read(new URL(
  '../components/panels/DiffFullscreenViewer.tsx',
  import.meta.url,
));
const diffStyles = read(new URL(
  '../components/panels/DiffFullscreenViewer.css',
  import.meta.url,
));
const diffMinimalStyles = read(new URL(
  '../components/panels/DiffFullscreenViewer.minimal.scss',
  import.meta.url,
));
const snapshotComponent = read(new URL(
  '../../flow_chat/tool-cards/SnapshotFullscreenDiffViewer.tsx',
  import.meta.url,
));
const snapshotStyles = read(new URL(
  '../../flow_chat/tool-cards/SnapshotFullscreenDiffViewer.css',
  import.meta.url,
));
const snapshotMinimalStyles = read(new URL(
  '../../flow_chat/tool-cards/SnapshotFullscreenDiffViewer.minimal.scss',
  import.meta.url,
));
const remoteComponent = read(new URL(
  '../../features/ssh-remote/RemoteFileBrowser.tsx',
  import.meta.url,
));
const remoteStyles = read(new URL(
  '../../features/ssh-remote/RemoteFileBrowser.scss',
  import.meta.url,
));
const remoteMinimalStyles = read(new URL(
  '../../features/ssh-remote/RemoteFileBrowser.minimal.scss',
  import.meta.url,
));
const statusBarComponent = read(new URL(
  '../../tools/editor/components/EditorStatusBar.tsx',
  import.meta.url,
));
const statusPopoverComponent = read(new URL(
  '../../tools/editor/components/StatusBarPopovers/StatusBarPopovers.tsx',
  import.meta.url,
));
const statusBarMinimalStyles = read(new URL(
  '../../tools/editor/components/EditorStatusBar.minimal.scss',
  import.meta.url,
));
const statusPopoverMinimalStyles = read(new URL(
  '../../tools/editor/components/StatusBarPopovers/StatusBarPopovers.minimal.scss',
  import.meta.url,
));

describe('legacy editor surface presentation boundaries', () => {
  it('scopes generic fullscreen diff selectors below their owning overlays', () => {
    for (const selector of [
      'header-actions',
      'header-btn',
      'file-info',
      'file-name',
      'file-icon',
      'file-details',
      'fullscreen-loading-overlay',
      'loading-spinner',
    ]) {
      expect(diffStyles).not.toMatch(new RegExp(`^\\.${selector}(?:\\s|\\{|:|\\.)`, 'm'));
      expect(snapshotStyles).not.toMatch(new RegExp(`^\\.${selector}(?:\\s|\\{|:|\\.)`, 'm'));
    }
    expect(diffStyles).toContain('.diff-fullscreen-overlay .header-btn');
    expect(snapshotStyles).toContain('.snapshot-fullscreen-overlay .header-btn');
  });

  it('keeps both diff viewers modal, focus-safe, and free of global arrow listeners', () => {
    for (const component of [diffComponent, snapshotComponent]) {
      expect(component).toContain('role="dialog"');
      expect(component).toContain('aria-modal="true"');
      expect(component).toContain("event.key === 'Escape'");
      expect(component).toContain("event.key !== 'Tab'");
      expect(component).toContain('returnTarget?.isConnected');
    }
    expect(snapshotComponent).not.toContain(
      "document.addEventListener('keydown', handleKeyboard)",
    );
    expect(snapshotComponent).toContain('onKeyDown={handleFileNavigationKeyDown}');
    expect(snapshotComponent).toContain('aria-pressed={index === safeSelectedFileIndex}');
  });

  it('keeps remote file behavior behind sshApi while exposing keyboard dialog semantics', () => {
    expect(remoteComponent).toContain('sshApi.readDir(connectionId, path)');
    expect(remoteComponent).toContain('role="dialog"');
    expect(remoteComponent).toContain('aria-modal="true"');
    expect(remoteComponent).toContain('data-remote-file-row');
    expect(remoteComponent).toContain('onKeyDown={(event) => handleRowKeyDown(event, entry)}');
    expect(remoteComponent).toContain("event.key === 'ContextMenu'");
    expect(remoteComponent).toContain('role="menu"');
    expect(remoteComponent).toContain('role="menuitem"');
    expect(remoteComponent).toContain('<Pencil size={14} aria-hidden="true" />');
    expect(remoteComponent).toContain('<Trash2 size={14} aria-hidden="true" />');
    expect(remoteComponent).not.toContain('✏️');
    expect(remoteComponent).not.toContain('🗑️');
    expect(remoteStyles).toContain('@media (max-width: 720px)');
    expect(remoteStyles).toContain('@media (max-width: 520px)');
  });

  it('uses native status actions and listbox keyboard semantics', () => {
    expect(statusBarComponent).toContain('<button');
    expect(statusBarComponent).toContain("popupType=\"listbox\"");
    expect(statusPopoverComponent).toContain('role="listbox"');
    expect(statusPopoverComponent).toContain('role="option"');
    expect(statusPopoverComponent).toContain('aria-selected=');
    expect(statusPopoverComponent).toContain(
      "['ArrowDown', 'ArrowUp', 'Home', 'End']",
    );
    expect(statusPopoverComponent).toContain('getPopoverLeft(anchorRect');
  });

  it('projects every surface through workspace tokens in the Minimal asset', () => {
    for (const stylesheet of [
      diffMinimalStyles,
      snapshotMinimalStyles,
      remoteMinimalStyles,
      statusBarMinimalStyles,
      statusPopoverMinimalStyles,
    ]) {
      expect(stylesheet).toContain('.void-ui--minimal');
      expect(stylesheet).toContain('var(--workspace-');
      expect(stylesheet).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
    }
  });

  it('keeps compact desktop actions at the 28px pointer-hit minimum', () => {
    expect(remoteMinimalStyles).toMatch(
      /&__breadcrumb-btn\s*\{[\s\S]*?min-height:\s*28px;/,
    );
    expect(remoteMinimalStyles).toMatch(
      /&--edit\s*\{[\s\S]*?width:\s*28px;[\s\S]*?height:\s*28px;/,
    );
    expect(remoteMinimalStyles).toMatch(
      /&__breadcrumb\s*\{[\s\S]*?&::after\s*\{[\s\S]*?pointer-events:\s*none;/,
    );
  });
});
