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

  it('keeps the real stage tab selectable without inventing an active tab', async () => {
    const onSelectTab = vi.fn();
    await act(async () => {
      root.render(
        <ShortDramaTeamPanelControls
          mode="rail"
          tabs={[stageTab]}
          activeTabId=""
          statuses={[]}
          onToggle={vi.fn()}
          onSelectTab={onSelectTab}
        />,
      );
    });

    const agentButton = container.querySelector(
      '[data-testid="short-drama-team-agent"]',
    ) as HTMLButtonElement;
    expect(agentButton.getAttribute('aria-pressed')).toBe('false');

    act(() => agentButton.click());
    expect(onSelectTab).toHaveBeenCalledOnce();
    expect(onSelectTab).toHaveBeenCalledWith('asset-agent');
  });
});
