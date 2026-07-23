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

const makeStageTab = (
  id: string,
  title: string,
  stage: string,
): CanvasTab => ({
  id,
  title,
  content: {
    type: 'btw-session',
    title,
    data: {},
    metadata: { shortDramaStage: stage },
  },
  state: 'active',
  isDirty: false,
  createdAt: 1,
  lastAccessedAt: 1,
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

  it('shows a non-interactive preparing state while the shared BTW team is empty', async () => {
    await act(async () => {
      root.render(
        <ShortDramaTeamPanelControls
          tabs={[]}
          statuses={[]}
          onToggle={vi.fn()}
        />,
      );
    });

    expect(container.querySelector('[role="status"]')?.getAttribute('aria-label'))
      .toBe('canvas.shortDramaTeamStatus.waiting');
    expect(container.querySelector('[data-testid="short-drama-team-panel-toggle"]'))
      .toBeNull();
  });

  it('renders one compact reopen control with localized stage summaries', async () => {
    const tabs = [
      makeStageTab('script-agent', 'ScriptAI', 'script'),
      makeStageTab('asset-agent', 'AssetAI', 'assets'),
      makeStageTab('storyboard-agent', 'SplitAI', 'storyboards'),
      makeStageTab('video-agent', 'VideoAI', 'video'),
      makeStageTab('post-agent', 'EditorAI', 'post'),
    ];

    await act(async () => {
      root.render(
        <ShortDramaTeamPanelControls
          tabs={tabs}
          statuses={[
            { tabId: 'script-agent', status: 'completed' },
            { tabId: 'asset-agent', status: 'live' },
            { tabId: 'storyboard-agent', status: 'failed' },
          ]}
          onToggle={vi.fn()}
        />,
      );
    });

    const toggle = container.querySelector(
      '[data-testid="short-drama-team-panel-toggle"]',
    ) as HTMLButtonElement;
    const ariaLabel = toggle.getAttribute('aria-label') ?? '';

    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(toggle.dataset.shortDramaTeamSummaryStatus).toBe('failed');
    expect(toggle.textContent).toContain('5');
    expect(ariaLabel).toContain('shortDrama.tabs.script AI');
    expect(ariaLabel).toContain('shortDrama.tabs.assets AI');
    expect(ariaLabel).not.toContain('ScriptAI');
    expect(ariaLabel).not.toContain('AssetAI');
  });

  it('delegates expansion to the existing shared BTW panel toggle', async () => {
    const onToggle = vi.fn();
    await act(async () => {
      root.render(
        <ShortDramaTeamPanelControls
          tabs={[makeStageTab('script-agent', 'ScriptAI', 'script')]}
          statuses={[]}
          onToggle={onToggle}
        />,
      );
    });

    const toggle = container.querySelector(
      '[data-testid="short-drama-team-panel-toggle"]',
    ) as HTMLButtonElement;
    act(() => toggle.click());
    expect(onToggle).toHaveBeenCalledOnce();
  });
});
