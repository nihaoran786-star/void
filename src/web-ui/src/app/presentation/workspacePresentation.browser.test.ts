import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyWorkspacePresentationToPortalRoot,
  persistWorkspacePresentation,
  readWorkspacePresentation,
  WORKSPACE_PRESENTATION_STORAGE_KEY,
} from './workspacePresentation';

function installWindow(search = ''): JSDOM {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: `https://void.local/${search}`,
  });
  vi.stubGlobal('window', dom.window);
  return dom;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('workspace presentation browser startup', () => {
  it('starts a clean browser profile in minimal presentation', () => {
    installWindow();

    expect(readWorkspacePresentation()).toBe('minimal');
  });

  it('restores an explicitly saved classic rollback preference', () => {
    const dom = installWindow();
    dom.window.localStorage.setItem(
      WORKSPACE_PRESENTATION_STORAGE_KEY,
      'classic',
    );

    expect(readWorkspacePresentation()).toBe('classic');
  });

  it('gives the classic query rollback priority over saved minimal state', () => {
    const dom = installWindow('?void-ui=classic');
    dom.window.localStorage.setItem(
      WORKSPACE_PRESENTATION_STORAGE_KEY,
      'minimal',
    );

    expect(readWorkspacePresentation()).toBe('classic');
  });

  it('keeps query rollback available when storage is restricted', () => {
    const dom = installWindow('?void-ui=classic');
    vi.spyOn(dom.window.localStorage, 'getItem').mockImplementation(() => {
      throw new DOMException('Storage denied', 'SecurityError');
    });

    expect(readWorkspacePresentation()).toBe('classic');
  });

  it('persists either presentation without owning any runtime state', () => {
    const dom = installWindow();

    persistWorkspacePresentation('classic');
    expect(dom.window.localStorage.getItem(WORKSPACE_PRESENTATION_STORAGE_KEY))
      .toBe('classic');
    persistWorkspacePresentation('minimal');
    expect(dom.window.localStorage.getItem(WORKSPACE_PRESENTATION_STORAGE_KEY))
      .toBe('minimal');
  });

  it('projects presentation onto the shared body portal root and cleans it up', () => {
    const dom = installWindow();
    const root = dom.window.document.body;
    root.classList.add('desktop-host', 'void-ui--classic');

    const restore = applyWorkspacePresentationToPortalRoot(root, 'minimal');

    expect(root.classList.contains('desktop-host')).toBe(true);
    expect(root.classList.contains('void-ui--minimal')).toBe(true);
    expect(root.classList.contains('void-ui--classic')).toBe(false);

    restore();

    expect(root.classList.contains('desktop-host')).toBe(true);
    expect(root.classList.contains('void-ui--minimal')).toBe(false);
    expect(root.classList.contains('void-ui--classic')).toBe(false);
  });
});
