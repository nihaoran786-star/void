// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  exploreGroupStates: new Map<string, boolean>(),
  onExploreGroupToggle: vi.fn(),
}));

vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  useTranslation: () => ({
    t: (key: string, values?: { count?: number }) => (
      `${key}:${values?.count ?? ''}`
    ),
  }),
}));

vi.mock('./FlowChatContext', () => ({
  useFlowChatContext: () => mocks,
}));

vi.mock('./FlowChatPresentationActivity', () => ({
  useFlowChatPresentationActive: () => true,
}));

vi.mock('@/component-library/components/BeautifulUI', () => ({
  BeautifulUIStage: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/component-library/preview/beautiful-ui-original/components/loading-state', () => ({
  default: ({ label }: { label: string }) => <span className="explore-region__summary">{label}</span>,
}));

vi.mock('../FlowTextBlock', () => ({
  FlowTextBlock: () => null,
}));

vi.mock('../FlowToolCard', () => ({
  FlowToolCard: () => null,
}));

vi.mock('../../tool-cards/ModelThinkingDisplay', () => ({
  ModelThinkingDisplay: () => null,
}));

import { ExploreGroupRenderer } from './ExploreGroupRenderer';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const data = {
  groupId: 'explore-1',
  rounds: [],
  allItems: [],
  stats: { readCount: 2, searchCount: 1, commandCount: 0 },
  isGroupStreaming: true,
  isLastGroupInTurn: true,
  wasCutByCritical: false,
};

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() { /* jsdom stub */ }
    unobserve() { /* jsdom stub */ }
    disconnect() { /* jsdom stub */ }
  } as unknown as typeof globalThis.ResizeObserver;
}

describe('ExploreGroupRenderer activity summary', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    mocks.exploreGroupStates = new Map<string, boolean>();
    mocks.onExploreGroupToggle.mockReset();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('reads as one counted summary line until the reader opens it', () => {
    act(() => {
      root.render(<ExploreGroupRenderer data={data} turnId="turn-1" />);
    });

    const toggle = container.querySelector('.explore-region__toggle');
    expect(toggle?.tagName).toBe('BUTTON');
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelector('.explore-region__summary')?.textContent)
      .toContain('exploreRegion.readFiles');
    expect(container.querySelector('.explore-region__content')).toBeNull();
  });

  it('asks its owner to expand when the summary is activated', () => {
    act(() => {
      root.render(<ExploreGroupRenderer data={data} turnId="turn-1" />);
    });

    act(() => {
      container
        .querySelector('.explore-region__toggle')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(mocks.onExploreGroupToggle).toHaveBeenCalledWith('explore-1');
  });

  it('shows the rows once the group is expanded', () => {
    mocks.exploreGroupStates = new Map([['explore-1', true]]);

    act(() => {
      root.render(<ExploreGroupRenderer data={data} turnId="turn-1" />);
    });

    expect(container.querySelector('.explore-region__toggle')?.getAttribute('aria-expanded'))
      .toBe('true');
    expect(container.querySelector('.explore-region__content')).not.toBeNull();
  });

  it('does not duplicate the thinking header for a thinking-only group', () => {
    act(() => {
      root.render(
        <ExploreGroupRenderer
          data={{
            ...data,
            stats: { readCount: 0, searchCount: 0, commandCount: 0 },
            allItems: [{
              id: 'thinking-1',
              type: 'thinking',
              status: 'completed',
              timestamp: 1,
              content: 'reasoning',
              isStreaming: false,
              isCollapsed: true,
            }],
          }}
          turnId="turn-1"
        />,
      );
    });

    expect(container.querySelector('.explore-region__header')).toBeNull();
  });

  it('does not present live progress for defensive Explore data containing a running tool', () => {
    act(() => {
      root.render(
        <ExploreGroupRenderer
          data={{
            ...data,
            allItems: [
              {
                id: 'tool-1',
                type: 'tool',
                toolName: 'Read',
                status: 'completed',
                timestamp: 1,
                toolCall: { id: 'call-1', input: {} },
              },
              {
                id: 'tool-2',
                type: 'tool',
                toolName: 'Grep',
                status: 'running',
                timestamp: 2,
                toolCall: { id: 'call-2', input: {} },
              },
            ],
          }}
          turnId="turn-1"
        />,
      );
    });

    expect(container.querySelector('.explore-region')?.classList)
      .not.toContain('explore-region--live');
    expect(container.querySelector('.explore-region__live')).toBeNull();
    expect(container.querySelector('.explore-region__live-count')).toBeNull();
    expect(container.querySelector('.explore-region__progress')).toBeNull();
  });

  it('stays quiet once every group tool has settled', () => {
    act(() => {
      root.render(
        <ExploreGroupRenderer
          data={{
            ...data,
            allItems: [
              {
                id: 'tool-1',
                type: 'tool',
                toolName: 'Read',
                status: 'completed',
                timestamp: 1,
                toolCall: { id: 'call-1', input: {} },
              },
              {
                id: 'tool-2',
                type: 'tool',
                toolName: 'Grep',
                status: 'completed',
                timestamp: 2,
                toolCall: { id: 'call-2', input: {} },
              },
            ],
          }}
          turnId="turn-1"
        />,
      );
    });

    expect(container.querySelector('.explore-region')?.classList)
      .not.toContain('explore-region--live');
    expect(container.querySelector('.explore-region__live')).toBeNull();
    expect(container.querySelector('.explore-region__progress')).toBeNull();
  });
});
