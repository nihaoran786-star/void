import { $, browser, expect } from '@wdio/globals';
import * as path from 'node:path';
import { saveElementScreenshot, saveScreenshot } from '../helpers/screenshot-utils';

const screenshotDirectory = path.resolve(
  process.cwd(),
  '..',
  '..',
  '.codex-artifacts',
  'minimal-workspace',
);
const workspacePath = process.cwd();

async function activateMinimalPresentation(): Promise<void> {
  const target = new URL(await browser.getUrl());
  target.searchParams.set('void-ui', 'minimal');
  await browser.url(target.toString());
  await browser.waitUntil(async () => browser.execute(() => (
    document.body.classList.contains('void-ui--minimal')
    && document.querySelector('[data-testid="app-layout"]')
      ?.getAttribute('data-ui-presentation') === 'minimal'
    && !document.querySelector('.splash-screen')
  )), {
    timeout: 15_000,
    interval: 100,
    timeoutMsg: 'Minimal presentation did not activate for portal verification',
  });
}

describe('L0 Minimal portal surfaces', () => {
  before(async () => {
    await activateMinimalPresentation();
    await browser.takeScreenshot();
  });

  afterEach(async () => {
    await browser.execute(() => {
      const scopedWindow = window as Window & Record<string, unknown>;
      for (const key of [
        '__branchSelectE2ERoot',
        '__editorBreadcrumbE2ERoot',
        '__quickLookE2ERoot',
      ]) {
        const root = scopedWindow[key] as { unmount?(): void } | undefined;
        root?.unmount?.();
        delete scopedWindow[key];
      }
      for (const id of [
        'branch-select-e2e-host',
        'branch-select-e2e-origin',
        'editor-breadcrumb-e2e-host',
        'quick-look-e2e-host',
        'quick-look-e2e-origin',
      ]) {
        document.getElementById(id)?.remove();
      }
    });
  });

  it('opens the real worktree branch dialog and returns focus to its launcher', async () => {
    await browser.execute(async () => {
      const branchSource = await fetch(
        '/src/app/components/panels/BranchSelectModal.tsx',
      ).then(response => response.text());
      const mainSource = await fetch('/src/main.tsx').then(response => response.text());
      const reactPath = branchSource.match(/from "([^"]*\/react\.js[^"]*)"/)?.[1];
      const reactDomPath = mainSource.match(/from "([^"]*\/react-dom_client\.js[^"]*)"/)?.[1];
      if (!reactPath || !reactDomPath) {
        throw new Error('Unable to resolve Vite React modules for branch dialog verification');
      }

      const reactModule = await import(reactPath);
      const reactDomModule = await import(reactDomPath);
      const React = reactModule.default ?? reactModule;
      const createRoot = reactDomModule.createRoot ?? reactDomModule.default?.createRoot;
      const branchModule = await import('/src/app/components/panels/BranchSelectModal.tsx');
      const BranchSelectModal = branchModule.BranchSelectModal ?? branchModule.default;
      if (!createRoot || !BranchSelectModal) {
        throw new Error('Unable to mount the real branch dialog component');
      }

      const origin = document.createElement('button');
      origin.id = 'branch-select-e2e-origin';
      origin.textContent = 'Branch launcher';
      origin.style.position = 'fixed';
      origin.style.left = '-9999px';
      document.body.appendChild(origin);
      origin.focus();

      const host = document.createElement('div');
      host.id = 'branch-select-e2e-host';
      document.body.appendChild(host);
      const root = createRoot(host);
      const Harness = () => {
        const [isOpen, setIsOpen] = React.useState(true);
        return React.createElement(BranchSelectModal, {
          isOpen,
          repositoryPath: '',
          title: '分支与工作树',
          onClose: () => setIsOpen(false),
          onSelect: () => undefined,
        });
      };
      root.render(React.createElement(Harness));
      (window as Window & Record<string, unknown>).__branchSelectE2ERoot = root;
    });

    const dialog = await $('.branch-select-dialog');
    await dialog.waitForDisplayed({ timeout: 10_000 });
    await browser.waitUntil(async () => browser.execute(() => (
      document.activeElement === document.querySelector('.branch-select-dialog__input input')
    )), {
      timeout: 5_000,
      interval: 50,
      timeoutMsg: 'Branch dialog did not focus its search input',
    });
    await $('.branch-select-dialog__input input').setValue('visual-branch');
    await browser.waitUntil(async () => browser.execute(() => (
      document.querySelectorAll('.branch-select-dialog__item--new').length === 1
    )), {
      timeout: 5_000,
      interval: 50,
      timeoutMsg: 'Branch dialog did not expose its create-branch action',
    });

    const dialogContract = await browser.execute(() => {
      const element = document.querySelector<HTMLElement>('.branch-select-dialog');
      if (!element) return null;
      const style = getComputedStyle(element);
      return {
        role: element.getAttribute('role'),
        modal: element.getAttribute('aria-modal'),
        width: style.width,
        radius: style.borderRadius,
        branchButtons: element.querySelectorAll<HTMLButtonElement>(
          '.branch-select-dialog__item',
        ).length,
      };
    });
    expect(dialogContract?.role).toBe('dialog');
    expect(dialogContract?.modal).toBe('true');
    expect(dialogContract?.width).toBe('360px');
    expect(dialogContract?.branchButtons ?? 0).toBeGreaterThan(0);

    await saveScreenshot('portal-branch-select-dialog', {
      directory: screenshotDirectory,
      includeTimestamp: false,
      prefix: 'slice9-minimal',
    });
    await saveElementScreenshot('.branch-select-dialog', 'portal-branch-select-dialog-surface', {
      directory: screenshotDirectory,
      includeTimestamp: false,
      prefix: 'slice9-minimal',
    });

    await browser.keys(['Shift', 'Tab']);
    expect(await browser.execute(() => (
      document.activeElement?.classList.contains('branch-select-dialog__close')
    ))).toBe(true);
    await browser.keys(['Escape']);
    await browser.waitUntil(async () => browser.execute(() => (
      !document.querySelector('.branch-select-dialog')
    )), {
      timeout: 5_000,
      interval: 50,
      timeoutMsg: 'Branch dialog did not close with Escape',
    });
    await browser.waitUntil(async () => browser.execute(() => (
      document.activeElement?.id === 'branch-select-e2e-origin'
    )), {
      timeout: 5_000,
      interval: 50,
      timeoutMsg: 'Branch dialog did not return focus to its launcher',
    });
  });

  it('opens the real editor breadcrumb menu with keyboard navigation', async () => {
    const filePath = path.join(workspacePath, 'package.json');
    await browser.execute(async (targetFilePath, targetWorkspacePath) => {
      const breadcrumbSource = await fetch(
        '/src/tools/editor/components/EditorBreadcrumb.tsx',
      ).then(response => response.text());
      const mainSource = await fetch('/src/main.tsx').then(response => response.text());
      const reactPath = breadcrumbSource.match(/from "([^"]*\/react\.js[^"]*)"/)?.[1];
      const reactDomPath = mainSource.match(/from "([^"]*\/react-dom_client\.js[^"]*)"/)?.[1];
      if (!reactPath || !reactDomPath) {
        throw new Error('Unable to resolve Vite React modules for breadcrumb verification');
      }

      const reactModule = await import(reactPath);
      const reactDomModule = await import(reactDomPath);
      const React = reactModule.default ?? reactModule;
      const createRoot = reactDomModule.createRoot ?? reactDomModule.default?.createRoot;
      const breadcrumbModule = await import('/src/tools/editor/components/EditorBreadcrumb.tsx');
      const EditorBreadcrumb = breadcrumbModule.EditorBreadcrumb ?? breadcrumbModule.default;
      if (!createRoot || !EditorBreadcrumb) {
        throw new Error('Unable to mount the real editor breadcrumb component');
      }

      const host = document.createElement('div');
      host.id = 'editor-breadcrumb-e2e-host';
      host.style.cssText = [
        'position:fixed',
        'left:360px',
        'top:92px',
        'z-index:10000',
        'width:min(620px,calc(100vw - 400px))',
        'min-height:36px',
        'display:flex',
        'align-items:center',
        'padding:0 10px',
        'background:var(--void-bg-1)',
        'border:1px solid var(--void-border-2)',
        'border-radius:8px',
      ].join(';');
      document.body.appendChild(host);
      const root = createRoot(host);
      root.render(React.createElement(EditorBreadcrumb, {
        filePath: targetFilePath,
        workspacePath: targetWorkspacePath,
      }));
      (window as Window & Record<string, unknown>).__editorBreadcrumbE2ERoot = root;
    }, filePath, workspacePath);

    const breadcrumb = await $('.editor-breadcrumb');
    await breadcrumb.waitForDisplayed({ timeout: 15_000 });
    const firstSegment = await $('.editor-breadcrumb__item--clickable');
    await firstSegment.click();
    const menu = await $('.editor-breadcrumb-dropdown');
    await menu.waitForDisplayed({ timeout: 10_000 });

    await browser.waitUntil(async () => browser.execute(() => (
      document.querySelectorAll('.editor-breadcrumb-dropdown [role="menuitem"]').length > 0
    )), {
      timeout: 10_000,
      interval: 100,
      timeoutMsg: 'Breadcrumb directory items did not load',
    });
    expect(await menu.getAttribute('role')).toBe('menu');
    expect((await menu.getAttribute('aria-label'))?.trim().length ?? 0).toBeGreaterThan(0);

    await saveScreenshot('portal-editor-breadcrumb-menu', {
      directory: screenshotDirectory,
      includeTimestamp: false,
      prefix: 'slice9-minimal',
    });
    await saveElementScreenshot('.editor-breadcrumb-dropdown', 'portal-editor-breadcrumb-menu-surface', {
      directory: screenshotDirectory,
      includeTimestamp: false,
      prefix: 'slice9-minimal',
    });

    const focusBefore = await browser.execute(() => (
      document.activeElement?.textContent?.trim() ?? ''
    ));
    await browser.keys(['ArrowDown']);
    const focusAfter = await browser.execute(() => (
      document.activeElement?.textContent?.trim() ?? ''
    ));
    expect(focusAfter).not.toBe(focusBefore);

    await browser.keys(['Escape']);
    await browser.waitUntil(async () => browser.execute(() => (
      !document.querySelector('.editor-breadcrumb-dropdown')
    )), {
      timeout: 5_000,
      interval: 50,
      timeoutMsg: 'Breadcrumb menu did not close with Escape',
    });
    expect(await browser.execute(() => (
      document.activeElement?.classList.contains('editor-breadcrumb__item')
    ))).toBe(true);
  });

  it('renders the real Quick Look portal with only its two working actions', async () => {
    await browser.execute(async () => {
      const quickLookSource = await fetch(
        '/src/app/components/panels/content-canvas/quick-look/QuickLook.tsx',
      ).then(response => response.text());
      const mainSource = await fetch('/src/main.tsx').then(response => response.text());
      const reactPath = quickLookSource.match(/from "([^"]*\/react\.js[^"]*)"/)?.[1];
      const reactDomPath = mainSource.match(/from "([^"]*\/react-dom_client\.js[^"]*)"/)?.[1];
      if (!reactPath || !reactDomPath) {
        throw new Error('Unable to resolve Vite React modules for Quick Look verification');
      }

      const reactModule = await import(reactPath);
      const reactDomModule = await import(reactDomPath);
      const React = reactModule.default ?? reactModule;
      const createRoot = reactDomModule.createRoot ?? reactDomModule.default?.createRoot;
      const quickLookModule = await import(
        '/src/app/components/panels/content-canvas/quick-look/QuickLook.tsx'
      );
      const QuickLook = quickLookModule.QuickLook ?? quickLookModule.default;
      if (!createRoot || !QuickLook) {
        throw new Error('Unable to mount the real Quick Look component');
      }
      const origin = document.createElement('button');
      origin.id = 'quick-look-e2e-origin';
      origin.textContent = 'Quick Look origin';
      origin.style.position = 'fixed';
      origin.style.left = '-9999px';
      document.body.appendChild(origin);
      origin.focus();
      const host = document.createElement('div');
      host.id = 'quick-look-e2e-host';
      document.body.appendChild(host);
      const root = createRoot(host);

      const Harness = () => {
        const [isOpen, setIsOpen] = React.useState(true);
        return React.createElement(QuickLook, {
          isOpen,
          content: {
            type: 'text-viewer',
            title: 'Quick Look · package.json',
            data: '{ "name": "void" }',
          },
          position: { x: 560, y: 160 },
          onClose: () => setIsOpen(false),
          onPin: () => undefined,
        });
      };

      root.render(React.createElement(Harness));
      (window as Window & Record<string, unknown>).__quickLookE2ERoot = root;
    });

    const quickLook = await $('.canvas-quick-look');
    await quickLook.waitForDisplayed({ timeout: 10_000 });
    const contract = await browser.execute(() => {
      const element = document.querySelector<HTMLElement>('.canvas-quick-look');
      if (!element) return null;
      const style = getComputedStyle(element);
      return {
        role: element.getAttribute('role'),
        label: element.getAttribute('aria-label'),
        width: style.width,
        actionCount: element.querySelectorAll<HTMLButtonElement>(
          '.canvas-quick-look__action-btn',
        ).length,
      };
    });
    expect(contract).toEqual({
      role: 'dialog',
      label: 'Quick Look · package.json',
      width: '460px',
      actionCount: 2,
    });

    await saveScreenshot('portal-quick-look', {
      directory: screenshotDirectory,
      includeTimestamp: false,
      prefix: 'slice9-minimal',
    });
    await saveElementScreenshot('.canvas-quick-look', 'portal-quick-look-surface', {
      directory: screenshotDirectory,
      includeTimestamp: false,
      prefix: 'slice9-minimal',
    });

    await $('.canvas-quick-look__close-btn').click();
    await browser.waitUntil(async () => browser.execute(() => (
      !document.querySelector('.canvas-quick-look')
      && document.activeElement?.id === 'quick-look-e2e-origin'
    )), {
      timeout: 5_000,
      interval: 50,
      timeoutMsg: 'Quick Look did not close and restore focus',
    });

  });
});
