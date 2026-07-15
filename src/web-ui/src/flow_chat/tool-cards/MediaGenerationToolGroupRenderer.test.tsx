// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FlowToolItem } from '../types/flow-chat';
import { createMediaToolGroup } from './mediaToolGrouping';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mediaCardState = vi.hoisted(() => ({ shouldThrow: false }));

vi.mock('./MediaGenerationToolGroupCard', () => ({
  MediaGenerationToolGroupCard: () => {
    if (mediaCardState.shouldThrow) {
      throw new Error('media group render failed');
    }
    return <div data-testid="media-group-card">media group</div>;
  },
}));

vi.mock('./CompactToolCard', () => ({
  CompactToolCard: ({
    expandedContent,
    header,
  }: {
    expandedContent?: React.ReactNode;
    header: React.ReactNode;
  }) => <div data-testid="tool-card-error">{header}{expandedContent}</div>,
  CompactToolCardHeader: ({
    action,
    content,
  }: {
    action: React.ReactNode;
    content: React.ReactNode;
  }) => <>{action} {content}</>,
}));

vi.mock('@/shared/utils/logger', () => ({
  createLogger: () => ({ error: vi.fn() }),
}));

import { MediaGenerationToolGroupRenderer } from './MediaGenerationToolGroupRenderer';

function mediaItem(id: string): FlowToolItem {
  return {
    id,
    type: 'tool',
    toolName: 'GenerateImage',
    status: 'completed',
    timestamp: 1,
    toolCall: { id, input: { prompt: id } },
  };
}

describe('MediaGenerationToolGroupRenderer', () => {
  let container: HTMLDivElement;
  let root: Root;
  let preventWindowError: (event: ErrorEvent) => void;

  beforeEach(() => {
    preventWindowError = event => event.preventDefault();
    window.addEventListener('error', preventWindowError);
    mediaCardState.shouldThrow = false;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    window.removeEventListener('error', preventWindowError);
    container.remove();
    vi.restoreAllMocks();
  });

  it('loads the grouped media card behind a local suspense boundary', async () => {
    const group = createMediaToolGroup([mediaItem('image-1'), mediaItem('image-2')]);

    await act(async () => {
      root.render(<MediaGenerationToolGroupRenderer group={group} sessionId="session-1" />);
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid="media-group-card"]')).not.toBeNull();
  });

  it('keeps sibling content mounted when the grouped media card fails', async () => {
    mediaCardState.shouldThrow = true;
    const group = createMediaToolGroup([mediaItem('image-3'), mediaItem('image-4')]);

    await act(async () => {
      root.render(
        <div>
          <div data-testid="sibling-content">sibling</div>
          <MediaGenerationToolGroupRenderer group={group} sessionId="session-1" />
        </div>,
      );
    });

    expect(container.querySelector('[role="alert"]')?.textContent)
      .toContain('Tool card render failed');
    expect(container.querySelector('[data-testid="sibling-content"]')?.textContent)
      .toBe('sibling');
  });
});
