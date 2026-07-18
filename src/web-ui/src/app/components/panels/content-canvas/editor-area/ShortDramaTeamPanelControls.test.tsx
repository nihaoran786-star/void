// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/component-library', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { ShortDramaTeamPanelControls } from './ShortDramaTeamPanelControls';
import type { CanvasTab } from '../types';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const stageTab: CanvasTab = {
  id: 'asset-agent',
  title: 'AssetAI',
  content: {
    type: 'btw-session',
    title: 'AssetAI',
    data: {},
    metadata: { shortDramaStage: 'assets' },
  },
  state: 'active',
  isDirty: false,
  createdAt: 1,
  lastAccessedAt: 1,
};

const makeStageTab = (id: string, title: string, stage: string): CanvasTab => ({
  ...stageTab,
  id,
  title,
  content: {
    ...stageTab.content,
    title,
    metadata: { shortDramaStage: stage },
  },
});

describe('ShortDramaTeamPanelControls', () => {
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

  it('shows a non-interactive preparing state while the team is empty', async () => {
    await act(async () => {
      root.render(
        <ShortDramaTeamPanelControls
          mode="rail"
          tabs={[]}
          activeTabId=""
          statuses={[]}
          onToggle={vi.fn()}
          onSelectTab={vi.fn()}
        />,
      );
    });

    expect(container.querySelector('[role="status"]')?.getAttribute('aria-label'))
      .toBe('canvas.shortDramaTeamStatus.waiting');
    expect(container.querySelector('[data-testid="short-drama-team-panel-toggle"]'))
      .toBeNull();
  });

  it('renders one native team summary button with agent count and full status counts', async () => {
    const tabs = [
      makeStageTab('script-agent', 'ScriptAI', 'script'),
      makeStageTab('asset-agent', 'AssetAI', 'assets'),
      makeStageTab('storyboard-agent', 'StoryboardAI', 'storyboards'),
      makeStageTab('video-agent', 'VideoAI', 'video'),
      makeStageTab('post-agent', 'PostAI', 'post'),
    ];

    await act(async () => {
      root.render(
        <ShortDramaTeamPanelControls
          mode="rail"
          tabs={tabs}
          activeTabId=""
          statuses={[
            { tabId: 'script-agent', status: 'completed' },
            { tabId: 'asset-agent', status: 'live', activity: 'streaming' },
            { tabId: 'storyboard-agent', status: 'failed' },
            { tabId: 'video-agent', status: 'attention' },
          ]}
          onToggle={vi.fn()}
          onSelectTab={vi.fn()}
        />,
      );
    });

    const buttons = container.querySelectorAll('button');
    const toggle = buttons[0] as HTMLButtonElement;
    const ariaLabel = toggle.getAttribute('aria-label') ?? '';

    expect(buttons).toHaveLength(1);
    expect(toggle.type).toBe('button');
    expect(toggle.dataset.shortDramaTeamSummaryStatus).toBe('failed');
    expect(toggle.textContent).toContain('canvas.shortDramaTeamCompact');
    expect(toggle.textContent).toContain('5');
    expect(ariaLabel).toContain('canvas.shortDramaTeamStatus.failed 1');
    expect(ariaLabel).toContain('canvas.shortDramaTeamStatus.attention 1');
    expect(ariaLabel).toContain('canvas.shortDramaTeamStatus.live 1');
    expect(ariaLabel).toContain('canvas.shortDramaTeamStatus.completed 1');
    expect(ariaLabel).toContain('canvas.shortDramaTeamStatus.waiting 1');
    expect(ariaLabel).toContain('canvas.shortDramaTeamStatus.cancelled 0');
    expect(ariaLabel).toContain(
      'AssetAI · canvas.shortDramaTeamStatus.live · canvas.shortDramaTeamActivity.streaming',
    );
    expect(container.querySelector('[data-testid="short-drama-team-agent"]'))
      .toBeNull();

    act(() => toggle.focus());
    expect(document.activeElement).toBe(toggle);
  });

  it('uses the required status priority for the visible summary dot', async () => {
    const tabs = [
      makeStageTab('script-agent', 'ScriptAI', 'script'),
      makeStageTab('asset-agent', 'AssetAI', 'assets'),
      makeStageTab('video-agent', 'VideoAI', 'video'),
    ];
    await act(async () => {
      root.render(
        <ShortDramaTeamPanelControls
          mode="rail"
          tabs={tabs}
          activeTabId="script-agent"
          statuses={[
            { tabId: 'script-agent', status: 'completed' },
            { tabId: 'asset-agent', status: 'live' },
            { tabId: 'video-agent', status: 'attention' },
          ]}
          onToggle={vi.fn()}
          onSelectTab={vi.fn()}
        />,
      );
    });

    expect(
      (container.querySelector(
        '[data-testid="short-drama-team-panel-toggle"]',
      ) as HTMLButtonElement).dataset.shortDramaTeamSummaryStatus,
    ).toBe('attention');
  });

  it('delegates rail expansion to the existing toggle handler', async () => {
    const onToggle = vi.fn();
    await act(async () => {
      root.render(
        <ShortDramaTeamPanelControls
          mode="rail"
          tabs={[stageTab]}
          activeTabId=""
          statuses={[]}
          onToggle={onToggle}
          onSelectTab={vi.fn()}
        />,
      );
    });

    const toggle = container.querySelector(
      '[data-testid="short-drama-team-panel-toggle"]',
    ) as HTMLButtonElement;
    act(() => toggle.click());
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('keeps only the same collapse button open and leaves agent selection to the real tab bar', async () => {
    const onToggle = vi.fn();
    const onSelectTab = vi.fn();
    await act(async () => {
      root.render(
        <ShortDramaTeamPanelControls
          mode="open"
          tabs={[stageTab]}
          activeTabId="asset-agent"
          statuses={[{ tabId: 'asset-agent', status: 'live' }]}
          onToggle={onToggle}
          onSelectTab={onSelectTab}
        />,
      );
    });

    const toggle = container.querySelector(
      '[data-testid="short-drama-team-panel-toggle"]',
    ) as HTMLButtonElement;
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.querySelector(
      '.short-drama-team-panel-controls__summary-label',
    )).toBeNull();
    expect(container.querySelector('[data-testid="short-drama-team-agent"]'))
      .toBeNull();

    act(() => toggle.click());
    expect(onToggle).toHaveBeenCalledOnce();
    expect(onSelectTab).not.toHaveBeenCalled();
  });
});
