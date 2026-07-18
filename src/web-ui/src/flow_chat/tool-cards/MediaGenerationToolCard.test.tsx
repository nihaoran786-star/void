import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';

import { MediaGenerationToolCard } from './MediaGenerationToolCard';
import { MediaGenerationToolGroupCard } from './MediaGenerationToolGroupCard';
import { createMediaToolGroup } from './mediaToolGrouping';
import { FlowChatStore } from '../store/FlowChatStore';
import {
  resetWorkspaceMediaRefreshState,
  useWorkspaceMediaRefreshStore,
} from '@/shared/services/workspace-media/WorkspaceMediaEvents';
import type { DialogTurn, FlowToolItem, ModelRound, Session, ToolCardConfig } from '../types/flow-chat';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const config: ToolCardConfig = {
  toolName: 'GenerateImage',
  displayName: 'Generate Image',
  icon: 'image',
  requiresConfirmation: false,
  resultDisplayType: 'detailed',
};

function createToolItem(): FlowToolItem {
  return {
    id: 'tool-1',
    type: 'tool',
    timestamp: Date.now(),
    toolName: 'GenerateImage',
    status: 'completed',
    toolCall: {
      id: 'call-1',
      input: { prompt: 'make an image' },
    },
    toolResult: {
      success: true,
      result: {
        status: 'completed',
        kind: 'image',
        batch: {
          batch_id: 'batch-1',
          kind: 'image',
          status: 'completed',
          total_count: 1,
          completed_count: 1,
          failed_count: 0,
          pending_count: 0,
          assets: [
            {
              kind: 'image',
              url: 'https://cdn.example.com/generated-1.png',
              item_index: 1,
              task_id: 'task-1',
            },
          ],
        },
      },
    },
  };
}

function createPollingToolItem(): FlowToolItem {
  return {
    ...createToolItem(),
    status: 'running',
    toolResult: {
      success: true,
      result: {
        status: 'polling',
        kind: 'image',
        batch_id: 'batch-1',
        task_ids: ['task-1'],
        poll_interval_seconds: 5,
        batch: {
          batch_id: 'batch-1',
          kind: 'image',
          status: 'polling',
          total_count: 1,
          completed_count: 0,
          failed_count: 0,
          pending_count: 1,
          pending_task_ids: ['task-1'],
          items: [
            {
              item_index: 1,
              kind: 'image',
              task_id: 'task-1',
              status: 'polling',
            },
          ],
          assets: [],
        },
      },
    },
  };
}

function createSessionWithTool(tool: FlowToolItem): Session {
  const round: ModelRound = {
    id: 'round-1',
    index: 0,
    items: [tool],
    isStreaming: true,
    isComplete: false,
    status: 'streaming',
    startTime: 1000,
  };
  const turn: DialogTurn = {
    id: 'turn-1',
    sessionId: 'session-1',
    userMessage: {
      id: 'user-1',
      content: 'Generate an image',
      timestamp: 900,
    },
    modelRounds: [round],
    status: 'processing',
    startTime: 900,
  };

  return {
    sessionId: 'session-1',
    title: 'Session 1',
    dialogTurns: [turn],
    status: 'active',
    config: { agentType: 'agentic' },
    createdAt: 800,
    lastActiveAt: 1000,
    error: null,
    sessionKind: 'normal',
    workspacePath: 'C:/work',
  };
}

function createPollingToolItemWithId(id: string, toolName = 'GenerateImage'): FlowToolItem {
  return {
    ...createPollingToolItem(),
    id,
    toolName,
    toolCall: {
      id: `call-${id}`,
      input: { prompt: 'make media' },
    },
    toolResult: undefined,
  };
}

function createVideoToolItem(): FlowToolItem {
  return {
    ...createToolItem(),
    toolName: 'GenerateVideo',
    toolResult: {
      success: true,
      result: {
        status: 'completed',
        kind: 'video',
        batch: {
          batch_id: 'batch-video',
          kind: 'video',
          status: 'completed',
          total_count: 1,
          completed_count: 1,
          failed_count: 0,
          pending_count: 0,
          assets: [
            {
              kind: 'video',
              url: 'https://cdn.example.com/generated-1.mp4',
              item_index: 1,
              task_id: 'task-video-1',
            },
          ],
        },
      },
    },
  };
}

function createVideoToolItemWithId(id: string): FlowToolItem {
  return {
    ...createVideoToolItem(),
    id,
    toolCall: {
      id: `call-${id}`,
      input: { prompt: 'make a video' },
    },
  };
}

function createManyImageToolItem(count: number): FlowToolItem {
  const item = createToolItem();
  return {
    ...item,
    toolResult: {
      success: true,
      result: {
        status: 'completed',
        kind: 'image',
        batch: {
          batch_id: 'batch-many',
          kind: 'image',
          status: 'completed',
          total_count: count,
          completed_count: count,
          failed_count: 0,
          pending_count: 0,
          assets: Array.from({ length: count }, (_, index) => ({
            kind: 'image',
            url: `https://cdn.example.com/generated-${index + 1}.png`,
            item_index: index + 1,
            task_id: `task-${index + 1}`,
          })),
        },
      },
    },
  };
}

function createLocalImageToolItem(): FlowToolItem {
  const item = createToolItem();
  return {
    ...item,
    toolResult: {
      success: true,
      result: {
        status: 'completed',
        kind: 'image',
        batch: {
          batch_id: 'batch-local',
          kind: 'image',
          status: 'completed',
          total_count: 1,
          completed_count: 1,
          failed_count: 0,
          pending_count: 0,
          assets: [
            {
              kind: 'image',
              url: 'https://cdn.example.com/generated-local.png',
              local_path: 'C:/repo/media/generated/image-001.png',
              item_index: 1,
              task_id: 'task-local',
            },
          ],
        },
      },
    },
  };
}

describe('MediaGenerationToolCard', () => {
  let dom: JSDOM;
  let container: HTMLDivElement;
  let root: Root;
  let dispatchEvent: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
      pretendToBeVisual: true,
    });
    dispatchEvent = vi.fn();
    dom.window.dispatchEvent = dispatchEvent;
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    vi.stubGlobal('CustomEvent', dom.window.CustomEvent);
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });

    container = dom.window.document.getElementById('root') as HTMLDivElement;
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    FlowChatStore.getInstance().setState(() => ({
      sessions: new Map(),
      activeSessionId: null,
    }));
    resetWorkspaceMediaRefreshState();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('opens generated assets in the lightweight media preview', () => {
    act(() => {
      root.render(<MediaGenerationToolCard toolItem={createToolItem()} config={config} />);
    });

    const header = container.querySelector('.compact-tool-card') as HTMLElement;
    act(() => {
      header.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    });

    const asset = container.querySelector('.media-generation-card__asset') as HTMLElement;
    expect(asset).toBeTruthy();

    act(() => {
      asset.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    });

    expect(dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: 'void-media-preview-open',
      detail: expect.objectContaining({
        kind: 'image',
        url: 'https://cdn.example.com/generated-1.png',
      }),
    }));
  });

  it('opens expanded assets with the keyboard', () => {
    act(() => {
      root.render(<MediaGenerationToolCard toolItem={createToolItem()} config={config} />);
    });

    const header = container.querySelector('.compact-tool-card') as HTMLElement;
    act(() => {
      header.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    });

    const asset = container.querySelector('.media-generation-card__asset') as HTMLElement;
    act(() => {
      asset.dispatchEvent(new dom.window.KeyboardEvent('keydown', {
        bubbles: true,
        key: 'Enter',
      }));
    });

    expect(dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: 'void-media-preview-open',
      detail: expect.objectContaining({
        url: 'https://cdn.example.com/generated-1.png',
      }),
    }));
  });

  it('renders polling media jobs as a compact collapsed row by default', () => {
    act(() => {
      root.render(<MediaGenerationToolCard toolItem={createPollingToolItem()} config={config} />);
    });

    expect(container.textContent).toContain('生成中 0/1');
    expect(container.querySelector('.media-generation-card__generating')).toBeNull();
    expect(container.textContent).not.toContain('task-1');
  });

  it('uses a quiet accessible progress row when a polling job is expanded', () => {
    act(() => {
      root.render(<MediaGenerationToolCard toolItem={createPollingToolItem()} config={config} />);
    });

    const header = container.querySelector('.compact-tool-card') as HTMLElement;
    act(() => {
      header.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    });

    const progress = container.querySelector('[role="status"]');
    expect(progress).toBeTruthy();
    expect(progress?.textContent).toContain('生成中 0/1');
    expect(container.querySelector('.media-generation-card__progress-dot')).toBeTruthy();
    expect(container.querySelector('.media-generation-card__loader')).toBeNull();
  });

  it('records workspace media pending state from the polling tool card model', () => {
    const toolItem = createPollingToolItem();
    FlowChatStore.getInstance().setState(() => ({
      sessions: new Map([['session-1', createSessionWithTool(toolItem)]]),
      activeSessionId: 'session-1',
    }));

    act(() => {
      root.render(<MediaGenerationToolCard toolItem={toolItem} config={config} sessionId="session-1" />);
    });

    expect(useWorkspaceMediaRefreshStore.getState().lastSignal).toMatchObject({
      lifecycleStatus: 'polling',
      workspacePath: 'C:/work',
      toolId: 'tool-1',
      toolName: 'GenerateImage',
      batchId: 'batch-1',
      kind: 'image',
    });
  });

  it('records workspace media pending aspect ratio from polling result metadata', () => {
    const toolItem = createPollingToolItem();
    toolItem.toolResult = {
      success: true,
      result: {
        status: 'polling',
        kind: 'image',
        batch_id: 'batch-vertical',
        task_ids: ['task-vertical'],
        batch: {
          batch_id: 'batch-vertical',
          kind: 'image',
          status: 'polling',
          total_count: 1,
          completed_count: 0,
          failed_count: 0,
          pending_count: 1,
          requested_aspect_ratio: '9:16',
          placeholder_aspect_ratio: '9 / 16',
          items: [
            {
              item_index: 1,
              kind: 'image',
              task_id: 'task-vertical',
              status: 'polling',
            },
          ],
          assets: [],
        },
      },
    };
    FlowChatStore.getInstance().setState(() => ({
      sessions: new Map([['session-1', createSessionWithTool(toolItem)]]),
      activeSessionId: 'session-1',
    }));

    act(() => {
      root.render(<MediaGenerationToolCard toolItem={toolItem} config={config} sessionId="session-1" />);
    });

    expect(useWorkspaceMediaRefreshStore.getState().lastSignal).toMatchObject({
      lifecycleStatus: 'polling',
      workspacePath: 'C:/work',
      toolId: 'tool-1',
      toolName: 'GenerateImage',
      batchId: 'batch-vertical',
      kind: 'image',
      requestedAspectRatio: '9:16',
      placeholderAspectRatio: '9 / 16',
    });
  });

  it('keeps completed polling results collapsed with one inline representative preview', () => {
    act(() => {
      root.render(<MediaGenerationToolCard toolItem={createPollingToolItem()} config={config} />);
    });
    expect(container.querySelector('.media-generation-card__asset')).toBeNull();

    act(() => {
      root.render(<MediaGenerationToolCard toolItem={createToolItem()} config={config} />);
    });

    expect(container.querySelector('.media-generation-card__asset')).toBeNull();
    expect(container.querySelector('.media-generation-card__inline-preview')).toBeTruthy();
    expect(container.querySelector('.media-generation-card__preview-strip')).toBeNull();
  });

  it('keeps completed batches in one compact result row', () => {
    act(() => {
      root.render(<MediaGenerationToolCard toolItem={createManyImageToolItem(100)} config={config} />);
    });

    expect(container.textContent).toContain('生成完成 100/100');
    expect(container.querySelector('.media-generation-card__grid')).toBeNull();
    expect(container.querySelectorAll('.media-generation-card__inline-preview')).toHaveLength(1);
    expect(container.querySelector('.media-generation-card__preview-strip')).toBeNull();
    expect(container.textContent).not.toContain('+99');
  });

  it('opens the representative preview without expanding the completed batch', () => {
    act(() => {
      root.render(<MediaGenerationToolCard toolItem={createManyImageToolItem(100)} config={config} />);
    });

    const preview = container.querySelector('.media-generation-card__inline-preview') as HTMLButtonElement;
    expect(preview).toBeTruthy();

    act(() => {
      preview.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    });

    expect(container.querySelector('.media-generation-card__grid')).toBeNull();
    expect(container.querySelectorAll('.media-generation-card__inline-preview')).toHaveLength(1);
    expect(dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: 'void-media-preview-open',
      detail: expect.objectContaining({
        kind: 'image',
        url: 'https://cdn.example.com/generated-1.png',
      }),
    }));
  });

  it('renders expanded media grids in fixed-size pages', () => {
    act(() => {
      root.render(<MediaGenerationToolCard toolItem={createManyImageToolItem(100)} config={config} />);
    });

    const header = container.querySelector('.compact-tool-card') as HTMLElement;
    expect(header).toBeTruthy();

    act(() => {
      header.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    });

    expect(container.querySelectorAll('.media-generation-card__asset')).toHaveLength(24);
    expect(container.textContent).toContain('显示更多');

    const loadMore = Array.from(container.querySelectorAll('button'))
      .find(button => button.textContent?.includes('显示更多')) as HTMLButtonElement | undefined;
    expect(loadMore).toBeTruthy();

    act(() => {
      loadMore?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    });

    expect(container.querySelectorAll('.media-generation-card__asset')).toHaveLength(48);
  });

  it('falls back to the remote thumbnail URL when the local thumbnail cannot load', () => {
    Object.defineProperty(dom.window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {
        convertFileSrc: vi.fn((path: string, protocol = 'asset') => `${protocol}://local/${encodeURIComponent(path)}`),
      },
    });

    act(() => {
      root.render(<MediaGenerationToolCard toolItem={createLocalImageToolItem()} config={config} />);
    });

    const image = container.querySelector('.media-generation-card__inline-preview img') as HTMLImageElement;
    expect(image.src).toBe('asset://local/C%3A%2Frepo%2Fmedia%2Fgenerated%2Fimage-001.png');

    act(() => {
      image.dispatchEvent(new dom.window.Event('error', { bubbles: false }));
    });

    expect((container.querySelector('.media-generation-card__inline-preview img') as HTMLImageElement).src)
      .toBe('https://cdn.example.com/generated-local.png');
  });

  it('dispatches a media reference event from the reference action', () => {
    act(() => {
      root.render(<MediaGenerationToolCard toolItem={createToolItem()} config={config} />);
    });

    const header = container.querySelector('.compact-tool-card') as HTMLElement;
    act(() => {
      header.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    });

    const referenceButton = Array.from(container.querySelectorAll('button'))
      .find(button => button.textContent?.includes('引用')) as HTMLButtonElement | undefined;
    expect(referenceButton).toBeTruthy();
    expect(container.querySelector('.media-generation-card__asset-preview-hint')).toBeNull();
    expect(container.querySelectorAll('.media-generation-card__asset-actions')).toHaveLength(1);

    act(() => {
      referenceButton?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    });

    expect(dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: 'void-media-reference-selected',
      detail: expect.objectContaining({
        context: expect.objectContaining({
          imagePath: 'https://cdn.example.com/generated-1.png',
          source: 'url',
        }),
      }),
    }));
  });

  it('does not show image reference actions for video assets', () => {
    act(() => {
      root.render(<MediaGenerationToolCard toolItem={createVideoToolItem()} config={{ ...config, toolName: 'GenerateVideo' }} />);
    });

    const referenceButton = Array.from(container.querySelectorAll('button'))
      .find(button => button.textContent?.includes('引用'));
    expect(referenceButton).toBeUndefined();
  });

  it('renders grouped running image tools as one aggregate card', () => {
    const group = createMediaToolGroup(
      Array.from({ length: 5 }, (_, index) => createPollingToolItemWithId(`image-${index + 1}`))
    );

    act(() => {
      root.render(<MediaGenerationToolGroupCard group={group} />);
    });

    expect(container.textContent).toContain('Generate Image');
    expect(container.textContent).toContain('生成中 0/5');
    expect(container.querySelectorAll('.compact-tool-card')).toHaveLength(1);
  });

  it('renders grouped completed images with aggregate thumbnails', () => {
    const group = createMediaToolGroup([
      createToolItem(),
      {
        ...createToolItem(),
        id: 'tool-2',
        toolCall: {
          id: 'call-2',
          input: { prompt: 'make another image' },
        },
        toolResult: {
          success: true,
          result: {
            status: 'completed',
            kind: 'image',
            batch: {
              batch_id: 'batch-2',
              kind: 'image',
              status: 'completed',
              total_count: 1,
              completed_count: 1,
              failed_count: 0,
              pending_count: 0,
              assets: [
                {
                  kind: 'image',
                  url: 'https://cdn.example.com/generated-2.png',
                  item_index: 1,
                  task_id: 'task-2',
                },
              ],
            },
          },
        },
      },
    ]);

    act(() => {
      root.render(<MediaGenerationToolGroupCard group={group} />);
    });

    expect(container.textContent).toContain('生成完成 2/2');
    expect(container.querySelectorAll('.media-generation-card__inline-preview')).toHaveLength(1);
    expect(container.textContent).not.toContain('+1');
  });

  it('renders grouped video tools without image reference actions', () => {
    const group = createMediaToolGroup([
      createVideoToolItem(),
      createVideoToolItemWithId('video-2'),
    ]);

    act(() => {
      root.render(<MediaGenerationToolGroupCard group={group} />);
    });

    expect(container.textContent).toContain('Generate Video');
    expect(container.textContent).toContain('生成完成 2/2');
    const referenceButton = Array.from(container.querySelectorAll('button'))
      .find(button => button.textContent?.includes('引用'));
    expect(referenceButton).toBeUndefined();
  });
});
