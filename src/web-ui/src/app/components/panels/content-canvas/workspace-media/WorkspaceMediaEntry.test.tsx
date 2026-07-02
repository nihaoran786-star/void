import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => ({
      'workspaceMedia.entry': 'Media',
    })[key] || key,
  }),
}));

import { WorkspaceMediaEntry } from './WorkspaceMediaEntry';
import type { WorkspaceMediaLibraryService } from '@/shared/services/workspace-media/WorkspaceMediaTypes';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('WorkspaceMediaEntry', () => {
  let dom: JSDOM;
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
      pretendToBeVisual: true,
    });
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    vi.stubGlobal('CustomEvent', dom.window.CustomEvent);

    container = dom.window.document.getElementById('root') as HTMLDivElement;
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('stays hidden when media availability is unavailable', async () => {
    const service: WorkspaceMediaLibraryService = {
      checkAvailability: vi.fn(async () => ({ status: 'unavailable', checkedAt: 100 })),
      scanLibrary: vi.fn(),
    };

    await act(async () => {
      root.render(<WorkspaceMediaEntry workspacePath="C:/work" service={service} />);
    });

    expect(container.querySelector('button')).toBeNull();
  });

  it('shows a media entry when availability is available but does not auto-open a tab', async () => {
    const service: WorkspaceMediaLibraryService = {
      checkAvailability: vi.fn(async () => ({ status: 'available', firstDetectedAt: 100 })),
      scanLibrary: vi.fn(),
    };
    const onOpen = vi.fn();

    await act(async () => {
      root.render(<WorkspaceMediaEntry workspacePath="C:/work" service={service} onOpen={onOpen} />);
    });

    const button = container.querySelector('button') as HTMLButtonElement;
    expect(button).toBeTruthy();
    expect(button.getAttribute('aria-label')).toBe('Media');
    expect(onOpen).not.toHaveBeenCalled();

    act(() => {
      button.click();
    });

    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('rechecks unavailable workspaces so the entry appears after media is created', async () => {
    vi.useFakeTimers();
    const service: WorkspaceMediaLibraryService = {
      checkAvailability: vi.fn()
        .mockResolvedValueOnce({ status: 'unavailable', checkedAt: 100 })
        .mockResolvedValueOnce({ status: 'available', firstDetectedAt: 200 }),
      scanLibrary: vi.fn(),
    };

    await act(async () => {
      root.render(<WorkspaceMediaEntry workspacePath="C:/work" service={service} />);
    });

    expect(container.querySelector('button')).toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(5000);
      await Promise.resolve();
    });

    expect(service.checkAvailability).toHaveBeenCalledTimes(2);
    expect(container.querySelector('button')).toBeTruthy();
  });
});
