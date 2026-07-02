// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createAutoPreviewOrchestrator,
  detectAutoPreviewCandidates,
} from './AutoPreviewService';
import { openRightPanelPreview } from './PreviewService';

const mocks = vi.hoisted(() => ({
  openRightPanelPreview: vi.fn(),
}));

vi.mock('./PreviewService', async () => {
  const actual = await vi.importActual<typeof import('./PreviewService')>('./PreviewService');
  return {
    ...actual,
    openRightPanelPreview: mocks.openRightPanelPreview,
  };
});

describe('AutoPreviewService candidate detection', () => {
  it('detects the latest loopback URL from assistant text', () => {
    const candidates = detectAutoPreviewCandidates({
      text: [
        'Old URL: http://127.0.0.1:3000',
        'New URL:',
        '```text',
        'http://127.0.0.1:5173',
        '```',
      ].join('\n'),
      source: 'assistant-message',
      sessionId: 'session-a',
      turnId: 'turn-a',
      workspaceKey: 'C:/workspace-a',
    });

    expect(candidates).toEqual([
      {
        kind: 'url',
        url: 'http://127.0.0.1:5173',
        source: 'assistant-message',
        sessionId: 'session-a',
        turnId: 'turn-a',
        workspaceKey: 'C:/workspace-a',
        confidence: 'high',
      },
    ]);
  });

  it('ignores file paths and unsupported protocols', () => {
    const candidates = detectAutoPreviewCandidates({
      text: [
        'Created index.html',
        'Open C:/project/index.html',
        'file:///C:/project/index.html',
        'javascript:alert(1)',
      ].join('\n'),
      source: 'assistant-message',
      sessionId: 'session-a',
    });

    expect(candidates).toEqual([]);
  });
});

describe('AutoPreviewService orchestrator', () => {
  beforeEach(() => {
    mocks.openRightPanelPreview.mockReset();
  });

  it('opens a high-confidence URL once per session turn', () => {
    mocks.openRightPanelPreview.mockReturnValue({
      status: 'accepted',
      source: 'manual',
      url: 'http://127.0.0.1:5173',
    });
    const orchestrator = createAutoPreviewOrchestrator();
    const candidate = {
      kind: 'url' as const,
      url: 'http://127.0.0.1:5173',
      source: 'assistant-message' as const,
      sessionId: 'session-a',
      turnId: 'turn-a',
      workspaceKey: 'C:/workspace-a',
      confidence: 'high' as const,
    };

    expect(orchestrator.maybeOpen(candidate)).toEqual({
      status: 'accepted',
      candidate,
    });
    expect(orchestrator.maybeOpen(candidate)).toEqual({
      status: 'ignored',
      reason: 'duplicate',
      candidate,
    });
    expect(openRightPanelPreview).toHaveBeenCalledTimes(1);
    expect(openRightPanelPreview).toHaveBeenCalledWith({
      url: 'http://127.0.0.1:5173',
      source: 'manual',
      workspaceKey: 'C:/workspace-a',
      title: 'Preview',
    });
  });

  it('ignores stale and low-confidence candidates', () => {
    const orchestrator = createAutoPreviewOrchestrator();
    const stale = {
      kind: 'url' as const,
      url: 'http://127.0.0.1:5173',
      source: 'assistant-message' as const,
      sessionId: 'session-a',
      turnId: 'turn-a',
      confidence: 'high' as const,
      isStale: true,
    };
    const lowConfidence = {
      ...stale,
      isStale: false,
      confidence: 'medium' as const,
    };

    expect(orchestrator.maybeOpen(stale)).toEqual({
      status: 'ignored',
      reason: 'stale',
      candidate: stale,
    });
    expect(orchestrator.maybeOpen(lowConfidence)).toEqual({
      status: 'ignored',
      reason: 'low-confidence',
      candidate: lowConfidence,
    });
    expect(openRightPanelPreview).not.toHaveBeenCalled();
  });
});
