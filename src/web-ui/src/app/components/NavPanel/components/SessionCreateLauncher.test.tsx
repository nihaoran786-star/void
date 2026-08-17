// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/component-library', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { SessionCreateLauncher } from './SessionCreateLauncher';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const MODE_LABELS = {
  code: {
    create: '创建编码会话',
    mode: '编码',
    short: '编码会话',
  },
  cowork: {
    create: '创建办公会话',
    mode: '办公',
    short: '办公会话',
  },
  media: {
    create: '创建媒体会话',
    mode: '媒体',
    short: '媒体会话',
  },
} as const;

describe('SessionCreateLauncher', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0);
      return 1;
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it('renders the minimal launcher as one new-task action and search control', async () => {
    const onCreate = vi.fn();
    const onSelectMode = vi.fn();

    await act(async () => {
      root.render(
        <SessionCreateLauncher
          presentation="minimal"
          selectedMode="code"
          groupLabel="新建任务"
          modeLabels={MODE_LABELS}
          onSelectMode={onSelectMode}
          onCreate={onCreate}
        />,
      );
    });

    const radios = container.querySelectorAll<HTMLButtonElement>('[role="radio"]');
    const createButton = container.querySelector<HTMLButtonElement>(
      '.void-nav-panel__session-create-action',
    );

    expect(container.querySelector('[role="radiogroup"]')).toBeNull();
    expect(radios).toHaveLength(0);
    expect(container.querySelector('.void-nav-panel__session-mode-menu-trigger'))
      .toBeNull();
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(createButton?.textContent).toContain('新建任务');
    expect(createButton?.getAttribute('aria-label')).toBe('新建任务');
    expect(onSelectMode).not.toHaveBeenCalled();

    act(() => createButton?.click());
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it('keeps the minimal new-task entry independent from the previous session mode', async () => {
    await act(async () => {
      root.render(
        <SessionCreateLauncher
          presentation="minimal"
          selectedMode="media"
          groupLabel="新建任务"
          modeLabels={MODE_LABELS}
          onSelectMode={vi.fn()}
          onCreate={vi.fn()}
        />,
      );
    });

    const createButton = container.querySelector<HTMLButtonElement>(
      '.void-nav-panel__session-create-action',
    );

    expect(container.querySelector('[role="radiogroup"]')).toBeNull();
    expect(container.querySelectorAll('[role="radio"]')).toHaveLength(0);
    expect(createButton?.textContent).toContain('新建任务');
    expect(createButton?.getAttribute('aria-label')).toBe('新建任务');
    expect(container.querySelectorAll('button')).toHaveLength(1);
  });

  it('preserves the Classic three-option selector and create action', async () => {
    const onCreate = vi.fn();
    const onSelectMode = vi.fn();

    await act(async () => {
      root.render(
        <SessionCreateLauncher
          presentation="classic"
          selectedMode="cowork"
          groupLabel="新建会话"
          modeLabels={MODE_LABELS}
          onSelectMode={onSelectMode}
          onCreate={onCreate}
        />,
      );
    });

    const radios = container.querySelectorAll<HTMLButtonElement>('[role="radio"]');
    expect(radios).toHaveLength(3);
    expect(radios[1]?.getAttribute('aria-checked')).toBe('true');
    expect(Array.from(radios).every(radio => radio.querySelector('svg'))).toBe(true);
    expect(container.querySelector('.void-nav-panel__session-mode-menu-trigger'))
      .toBeNull();

    act(() => radios[2]?.click());
    expect(onSelectMode).toHaveBeenCalledWith('media');
    expect(onCreate).not.toHaveBeenCalled();

    act(() => {
      container.querySelector<HTMLButtonElement>(
        '.void-nav-panel__session-create-action',
      )?.click();
    });
    expect(onCreate).toHaveBeenCalledTimes(1);
  });
});
