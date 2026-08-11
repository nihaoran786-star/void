// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  exploreGroupStates: new Map<string, boolean>(),
  onExploreGroupToggle: vi.fn(),
  onCollapseGroup: vi.fn(),
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

vi.mock('../../tool-cards/useToolCardHeightContract', () => ({
  useToolCardHeightContract: () => ({
    cardRootRef: { current: null },
    applyExpandedState: (
      _from: boolean,
      _to: boolean,
      apply: () => void,
    ) => apply(),
  }),
}));

vi.mock('./SmoothHeightCollapse', () => ({
  SmoothHeightCollapse: ({
    isOpen,
    children,
  }: {
    isOpen: boolean;
    children: React.ReactNode;
  }) => (
    <div data-testid="explore-details" data-open={String(isOpen)}>
      {isOpen ? children : null}
    </div>
  ),
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

describe('ExploreGroupRenderer compact disclosure', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    mocks.exploreGroupStates = new Map();
    mocks.onExploreGroupToggle.mockReset();
    mocks.onCollapseGroup.mockReset();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('keeps even the active tail collapsed until the user explicitly expands it', () => {
    act(() => {
      root.render(<ExploreGroupRenderer data={data} turnId="turn-1" />);
    });

    const toggle = container.querySelector<HTMLButtonElement>(
      '.explore-region__header',
    );
    expect(toggle?.tagName).toBe('BUTTON');
    expect(toggle?.type).toBe('button');
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelector('.explore-region')?.classList)
      .toContain('explore-region--collapsed');
    expect(container.querySelector('[data-testid="explore-details"]')
      ?.getAttribute('data-open')).toBe('false');

    act(() => toggle?.click());
    expect(mocks.onExploreGroupToggle).toHaveBeenCalledWith('explore-1');
  });

  it('honors an explicit expanded state and exposes details on demand', () => {
    mocks.exploreGroupStates = new Map([['explore-1', true]]);
    act(() => {
      root.render(
        <ExploreGroupRenderer data={{ ...data }} turnId="turn-1" />,
      );
    });

    expect(container.querySelector('.explore-region__header')
      ?.getAttribute('aria-expanded')).toBe('true');
    expect(container.querySelector('[data-testid="explore-details"]')
      ?.getAttribute('data-open')).toBe('true');
  });

  it('labels a thinking-only disclosure as reasoning instead of zero explorations', () => {
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

    expect(container.querySelector('.explore-region__summary')?.textContent)
      .toBe('toolCards.think.thinkingProcess:');
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
