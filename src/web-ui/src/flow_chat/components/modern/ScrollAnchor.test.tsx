import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ScrollAnchor } from './ScrollAnchor';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  virtualItems: [] as any[],
}));

vi.mock('./useFlowChatPresentationStore', () => ({
  usePresentationVirtualItems: () => mocks.virtualItems,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      if (key === 'scroll.anchorNavigation') return '会话轮次导航';
      if (key === 'scroll.anchorTurn') return `第 ${options?.current} 轮，共 ${options?.total} 轮`;
      if (key === 'scroll.anchorJumpLabel') return `跳转到第 ${options?.current} 轮：${options?.content}`;
      if (key === 'scroll.anchorNoResponse') return '这一轮尚无助手回复';
      return key;
    },
  }),
}));

vi.mock('@/infrastructure/i18n', () => ({
  i18nService: {
    formatDate: () => '8月14日 15:30',
  },
}));

describe('ScrollAnchor', () => {
  let dom: JSDOM;
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
      pretendToBeVisual: true,
    });
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    vi.stubGlobal('MouseEvent', dom.window.MouseEvent);

    Object.defineProperty(dom.window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: false }),
    });

    container = dom.window.document.getElementById('root') as HTMLDivElement;
    root = createRoot(container);
    mocks.virtualItems = [
      {
        type: 'user-message',
        turnId: 'turn-1',
        data: { id: 'user-1', content: '帮我检查聊天布局', timestamp: 1 },
      },
      {
        type: 'model-round',
        turnId: 'turn-1',
        data: {
          items: [{ type: 'text', content: '已经检查聊天布局并整理了对齐关系。' }],
        },
      },
      {
        type: 'user-message',
        turnId: 'turn-2',
        data: { id: 'user-2', content: '把轮次导航改成安静刻度', timestamp: 2 },
      },
    ];
  });

  afterEach(() => {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  });

  it('renders an accessible tick rail and marks the visible turn', () => {
    act(() => {
      root.render(<ScrollAnchor activeTurnId="turn-2" onAnchorNavigate={vi.fn()} />);
    });

    const navigation = container.querySelector('nav[aria-label="会话轮次导航"]');
    const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>('.scroll-anchor__point'));

    expect(navigation).not.toBeNull();
    expect(buttons).toHaveLength(2);
    expect(buttons[0]?.tagName).toBe('BUTTON');
    expect(buttons[0]?.getAttribute('aria-current')).toBeNull();
    expect(buttons[1]?.getAttribute('aria-current')).toBe('step');
    expect(buttons[1]?.classList.contains('is-current')).toBe(true);
  });

  it('shows the prompt and assistant summary on hover or focus', () => {
    act(() => {
      root.render(<ScrollAnchor activeTurnId="turn-1" onAnchorNavigate={vi.fn()} />);
    });

    const firstButton = container.querySelector<HTMLButtonElement>('.scroll-anchor__point');
    act(() => firstButton?.focus());

    const tooltip = container.querySelector('[role="tooltip"]');
    expect(tooltip?.textContent).toContain('第 1 轮，共 2 轮');
    expect(tooltip?.textContent).toContain('帮我检查聊天布局');
    expect(tooltip?.textContent).toContain('已经检查聊天布局并整理了对齐关系。');
  });

  it('uses smooth navigation normally and disables it for reduced motion', () => {
    const onAnchorNavigate = vi.fn();
    act(() => {
      root.render(<ScrollAnchor activeTurnId="turn-2" onAnchorNavigate={onAnchorNavigate} />);
    });

    const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>('.scroll-anchor__point'));
    act(() => buttons[0]?.click());
    expect(onAnchorNavigate).toHaveBeenLastCalledWith('turn-1', 'smooth');

    Object.defineProperty(dom.window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: true }),
    });
    act(() => buttons[1]?.click());
    expect(onAnchorNavigate).toHaveBeenLastCalledWith('turn-2', 'auto');
  });
});
