// @vitest-environment jsdom

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  openRightPanelPreview,
} from './PreviewService';

describe('PreviewService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('dispatches an agent browser tab request for the right panel', () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

    const response = openRightPanelPreview({
      url: 'http://127.0.0.1:5173',
      source: 'manual',
      workspaceKey: 'workspace-a',
    });

    expect(response.status).toBe('accepted');
    expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'expand-right-panel' }));

    vi.advanceTimersByTime(300);

    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'agent-create-tab',
        detail: expect.objectContaining({
          type: 'browser',
          title: 'Preview',
          data: { url: 'http://127.0.0.1:5173' },
          checkDuplicate: true,
          replaceExisting: true,
          duplicateCheckKey: 'preview:workspace-a:http://127.0.0.1:5173',
        }),
      })
    );
  });

  it('rejects unsupported URL schemes', () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

    const response = openRightPanelPreview({
      url: 'javascript:alert(1)',
      source: 'manual',
    });

    expect(response.status).toBe('unsupported');
    expect(dispatchSpy).not.toHaveBeenCalled();
  });
});
