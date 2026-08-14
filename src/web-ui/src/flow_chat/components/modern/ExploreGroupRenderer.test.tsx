// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({}));

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

describe('ExploreGroupRenderer always-visible activity', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('keeps the active tail visible without a second disclosure control', () => {
    act(() => {
      root.render(<ExploreGroupRenderer data={data} turnId="turn-1" />);
    });

    expect(container.querySelector('.explore-region__header')?.tagName).not.toBe('BUTTON');
    expect(container.querySelector('.explore-region')?.classList)
      .toContain('explore-region--always-visible');
    expect(container.querySelector('.explore-region__content')).not.toBeNull();
  });

  it('ignores stale collapse state and keeps details mounted', () => {
    act(() => {
      root.render(
        <ExploreGroupRenderer data={{ ...data }} turnId="turn-1" />,
      );
    });

    expect(container.querySelector('.explore-region--collapsed')).toBeNull();
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
