import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';

import { FlowChatContext } from './FlowChatContext';
import { ModelRoundItem } from './ModelRoundItem';
import {
  MODEL_ROUND_GROUP_RENDER_CHUNK_DELAY_MS,
  MODEL_ROUND_INITIAL_GROUP_RENDER_LIMIT,
} from './modelRoundProgressiveRender';
import type { FlowTextItem, FlowToolItem, ModelRound } from '../../types/flow-chat';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-i18next', () => ({
  initReactI18next: {
    type: '3rdParty',
    init: () => undefined,
  },
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}));

vi.mock('../FlowTextBlock', () => ({
  FlowTextBlock: ({ textItem }: { textItem: FlowTextItem }) => (
    <div className="mock-flow-text-block" data-flow-text-id={textItem.id}>
      {textItem.content}
    </div>
  ),
}));

vi.mock('../FlowToolCard', () => ({
  FlowToolCard: ({ toolItem }: { toolItem: FlowToolItem }) => (
    <div className="mock-flow-tool-card" data-tool-name={toolItem.toolName} />
  ),
}));

vi.mock('../../tool-cards/ModelThinkingDisplay', () => ({
  ModelThinkingDisplay: () => <div className="mock-model-thinking-display" />,
}));

vi.mock('../../tool-cards/toolCardClassification', () => ({
  isCollapsibleTool: (toolName: string) => toolName === 'GetToolSpec',
  isCollapsibleToolItem: (item: FlowToolItem) => (
    item.toolName === 'GetToolSpec' && item.status === 'completed'
  ),
  READ_TOOL_NAMES: new Set(['Read', 'LS']),
  SEARCH_TOOL_NAMES: new Set(['Grep', 'Glob', 'WebSearch']),
  COMMAND_TOOL_NAMES: new Set(['Bash', 'Git']),
}));

vi.mock('./ExploreGroupRenderer', () => ({
  ExploreGroupRenderer: ({ data }: { data: { allItems: Array<{ type: string }> } }) => (
    <button
      type="button"
      className="mock-explore-group"
      aria-expanded="false"
      data-tool-count={data.allItems.filter(item => item.type === 'tool').length}
    />
  ),
}));

vi.mock('../../tool-cards/MediaGenerationToolGroupCard', () => ({
  MediaGenerationToolGroupCard: ({ group }: { group: { totalCount: number } }) => (
    <div
      className="mock-media-generation-tool-group-card"
      data-media-total-count={group.totalCount}
    />
  ),
}));

vi.mock('../subagent/SubagentProjectionView', () => ({
  SubagentProjectionView: () => <div className="mock-subagent-projection-view" />,
}));

vi.mock('./ExportImageButton', () => ({
  ExportImageButton: () => <button type="button" className="mock-export-image-button" />,
}));

vi.mock('./ForkSessionButton', () => ({
  ForkSessionButton: () => <button type="button" className="mock-fork-session-button" />,
}));

vi.mock('@/component-library', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../../store/FlowChatStore', () => ({
  FlowChatStore: {
    getInstance: () => ({
      getState: () => ({
        sessions: new Map(),
      }),
    }),
  },
}));

function makeTextItem(index: number): FlowTextItem {
  return {
    id: `text-${index}`,
    type: 'text',
    content: `assistant text ${index}`,
    isStreaming: false,
    isMarkdown: true,
    timestamp: 1000 + index,
    status: 'completed',
  };
}

function makeGenerateImageTool(index: number): FlowToolItem {
  return {
    id: `image-${index}`,
    type: 'tool',
    toolName: 'GenerateImage',
    timestamp: 2000 + index,
    status: 'completed',
    toolCall: {
      id: `image-${index}`,
      input: {
        prompt: `image prompt ${index}`,
      },
    },
    toolResult: {
      success: true,
      result: {
        status: 'completed',
        task_id: `task-${index}`,
        result_url: `https://example.com/image-${index}.png`,
      },
    },
  };
}

function makeTaskTool(index: number): FlowToolItem {
  return {
    id: `task-${index}`,
    type: 'tool',
    toolName: 'Task',
    timestamp: 3000 + index,
    status: 'completed',
    subagentSessionId: `subagent-${index}`,
    toolCall: {
      id: `task-${index}`,
      input: {
        prompt: `delegate task ${index}`,
      },
    },
    toolResult: {
      success: true,
      result: `task result ${index}`,
    },
  };
}

function makeRoutineTool(index: number): FlowToolItem {
  return {
    id: `spec-${index}`,
    type: 'tool',
    toolName: 'GetToolSpec',
    timestamp: 2500 + index,
    status: 'completed',
    toolCall: {
      id: `spec-${index}`,
      input: { name: 'catalog_generation' },
    },
    toolResult: {
      success: true,
      result: 'tool specification',
    },
  };
}

function makeThinkingItem(index: number): ModelRound['items'][number] {
  return {
    id: `thinking-${index}`,
    type: 'thinking',
    content: `reasoning ${index}`,
    isStreaming: false,
    isCollapsed: true,
    timestamp: 2400 + index,
    status: 'completed',
  };
}

function makeRoundWithItems(items: ModelRound['items'], isStreaming: boolean): ModelRound {
  return {
    id: isStreaming ? 'round-streaming' : 'round-completed',
    index: 0,
    items,
    isStreaming,
    isComplete: !isStreaming,
    status: isStreaming ? 'streaming' : 'completed',
    startTime: 1000,
  };
}

function makeRound(groupCount: number, isStreaming: boolean): ModelRound {
  return makeRoundWithItems(
    Array.from({ length: groupCount }, (_, index) => makeTextItem(index)),
    isStreaming,
  );
}

describe('ModelRoundItem progressive rendering', () => {
  let dom: JSDOM;
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
      pretendToBeVisual: true,
    });
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    vi.stubGlobal('navigator', {
      clipboard: {
        writeText: vi.fn(),
      },
    });

    container = dom.window.document.getElementById('root') as HTMLDivElement;
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('initially renders only the newest groups for completed large rounds', () => {
    act(() => {
      root.render(
        <FlowChatContext.Provider value={{ sessionId: 'session-1' }}>
          <ModelRoundItem
            round={makeRound(MODEL_ROUND_INITIAL_GROUP_RENDER_LIMIT + 25, false)}
            turnId="turn-1"
          />
        </FlowChatContext.Provider>,
      );
    });

    const renderedItems = Array.from(container.querySelectorAll('.mock-flow-text-block'));

    expect(renderedItems).toHaveLength(MODEL_ROUND_INITIAL_GROUP_RENDER_LIMIT);
    expect(renderedItems[0]?.textContent).toBe('assistant text 25');
  });

  it('renders all groups while the round is streaming', () => {
    act(() => {
      root.render(
        <FlowChatContext.Provider value={{ sessionId: 'session-1' }}>
          <ModelRoundItem
            round={makeRound(MODEL_ROUND_INITIAL_GROUP_RENDER_LIMIT + 25, true)}
            turnId="turn-1"
          />
        </FlowChatContext.Provider>,
      );
    });

    const renderedItems = Array.from(container.querySelectorAll('.mock-flow-text-block'));

    expect(renderedItems).toHaveLength(MODEL_ROUND_INITIAL_GROUP_RENDER_LIMIT + 25);
    expect(renderedItems[0]?.textContent).toBe('assistant text 0');
  });

  it('reveals deferred completed groups on the progressive timer', () => {
    act(() => {
      root.render(
        <FlowChatContext.Provider value={{ sessionId: 'session-1' }}>
          <ModelRoundItem
            round={makeRound(MODEL_ROUND_INITIAL_GROUP_RENDER_LIMIT + 25, false)}
            turnId="turn-1"
          />
        </FlowChatContext.Provider>,
      );
    });

    expect(container.querySelectorAll('.mock-flow-text-block')).toHaveLength(
      MODEL_ROUND_INITIAL_GROUP_RENDER_LIMIT,
    );

    act(() => {
      vi.advanceTimersByTime(MODEL_ROUND_GROUP_RENDER_CHUNK_DELAY_MS);
    });

    const renderedItems = Array.from(container.querySelectorAll('.mock-flow-text-block'));

    expect(renderedItems).toHaveLength(MODEL_ROUND_INITIAL_GROUP_RENDER_LIMIT + 25);
    expect(renderedItems[0]?.textContent).toBe('assistant text 0');
  });

  it('keeps media tool groups visible by rendering media rounds fully', async () => {
    await act(async () => {
      root.render(
        <FlowChatContext.Provider value={{ sessionId: 'session-1' }}>
          <ModelRoundItem
            round={makeRoundWithItems(
              [
                makeGenerateImageTool(1),
                makeGenerateImageTool(2),
                ...Array.from({ length: MODEL_ROUND_INITIAL_GROUP_RENDER_LIMIT + 24 }, (_, index) => makeTextItem(index)),
              ],
              false,
            )}
            turnId="turn-1"
          />
        </FlowChatContext.Provider>,
      );
      await Promise.resolve();
    });

    const renderedTextItems = Array.from(container.querySelectorAll('.mock-flow-text-block'));
    const mediaGroup = container.querySelector('.mock-media-generation-tool-group-card');

    expect(mediaGroup?.getAttribute('data-media-total-count')).toBe('2');
    expect(renderedTextItems).toHaveLength(MODEL_ROUND_INITIAL_GROUP_RENDER_LIMIT + 24);
    expect(renderedTextItems[0]?.textContent).toBe('assistant text 0');
  });

  it('keeps task subagent projection visible by rendering task rounds fully', () => {
    act(() => {
      root.render(
        <FlowChatContext.Provider value={{ sessionId: 'session-1' }}>
          <ModelRoundItem
            round={makeRoundWithItems(
              [
                makeTaskTool(1),
                ...Array.from({ length: MODEL_ROUND_INITIAL_GROUP_RENDER_LIMIT + 24 }, (_, index) => makeTextItem(index)),
              ],
              false,
            )}
            turnId="turn-1"
          />
        </FlowChatContext.Provider>,
      );
    });

    const renderedTextItems = Array.from(container.querySelectorAll('.mock-flow-text-block'));
    const subagentProjection = container.querySelector('.mock-subagent-projection-view');

    expect(subagentProjection).not.toBeNull();
    expect(renderedTextItems).toHaveLength(MODEL_ROUND_INITIAL_GROUP_RENDER_LIMIT + 24);
    expect(renderedTextItems[0]?.textContent).toBe('assistant text 0');
  });

  it('renders routine tools as one collapsed disclosure inside a mixed critical round', () => {
    act(() => {
      root.render(
        <FlowChatContext.Provider value={{ sessionId: 'session-1' }}>
          <ModelRoundItem
            round={makeRoundWithItems(
              [
                makeThinkingItem(1),
                makeRoutineTool(1),
                makeThinkingItem(2),
                makeTaskTool(1),
              ],
              false,
            )}
            turnId="turn-1"
          />
        </FlowChatContext.Provider>,
      );
    });

    const aggregate = container.querySelector('.mock-explore-group');
    expect(aggregate?.getAttribute('aria-expanded')).toBe('false');
    expect(aggregate?.getAttribute('data-tool-count')).toBe('1');
    expect(container.querySelectorAll('.mock-model-thinking-display')).toHaveLength(0);
    expect(container.querySelector('[data-tool-name="GetToolSpec"]')).toBeNull();
    expect(container.querySelector('.mock-subagent-projection-view')).not.toBeNull();
  });
});
