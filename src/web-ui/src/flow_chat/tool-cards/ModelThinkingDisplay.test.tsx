// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelThinkingDisplay } from './ModelThinkingDisplay';
import type { FlowThinkingItem } from '../types/flow-chat';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const labels: Record<string, string> = {
        'toolCards.think.thinking': '正在思考',
        'toolCards.think.thinkingProcess': '思考过程',
      };
      return labels[key] ?? key;
    },
  }),
}));

vi.mock('@/component-library/components/BeautifulUI', () => ({
  BeautifulUIStage: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

function thinkingItem(content: string, streaming = false): FlowThinkingItem {
  return {
    id: 'thinking-1',
    type: 'thinking',
    timestamp: 1,
    status: streaming ? 'streaming' : 'completed',
    content,
    isStreaming: streaming,
    isCollapsed: false,
  };
}

describe('ModelThinkingDisplay disclosure', () => {
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

  function readToggle(): HTMLButtonElement {
    const toggle = container.querySelector<HTMLButtonElement>('button[aria-expanded]');
    if (!toggle) throw new Error('thinking disclosure toggle was not rendered');
    return toggle;
  }

  function readTraceRegion(): HTMLElement {
    const region = readToggle().nextElementSibling as HTMLElement | null;
    if (!region) throw new Error('thinking trace region was not rendered');
    return region;
  }

  it('starts condensed and opens the reasoning on click', () => {
    act(() => {
      root.render(<ModelThinkingDisplay thinkingItem={thinkingItem('Weighing two designs.')} />);
    });

    expect(readToggle().getAttribute('aria-expanded')).toBe('false');
    expect(readTraceRegion().style.gridTemplateRows).toBe('0fr');
    expect(readTraceRegion().style.opacity).toBe('0');

    act(() => {
      readToggle().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(readToggle().getAttribute('aria-expanded')).toBe('true');
    expect(readTraceRegion().style.gridTemplateRows).toBe('1fr');
    expect(container.textContent).toContain('Weighing two designs.');
  });

  it('names the phase in the condensed line', () => {
    act(() => {
      root.render(<ModelThinkingDisplay thinkingItem={thinkingItem('Still reasoning.', true)} />);
    });
    expect(readToggle().textContent).toContain('正在思考');

    act(() => {
      root.render(<ModelThinkingDisplay thinkingItem={thinkingItem('Done reasoning.')} />);
    });
    expect(readToggle().textContent).toContain('思考过程');
  });

  it('shows a raw live tail below the header only while streaming', () => {
    act(() => {
      root.render(
        <ModelThinkingDisplay thinkingItem={thinkingItem('First step.\n**Second** step.', true)} />,
      );
    });

    const tail = container.querySelector<HTMLElement>('[data-thinking-live-tail]');
    if (!tail) throw new Error('live tail was not rendered while streaming');
    expect(tail.textContent).toContain('**Second** step.');

    act(() => {
      root.render(
        <ModelThinkingDisplay thinkingItem={thinkingItem('First step.\n**Second** step.')} />,
      );
    });
    expect(container.querySelector('[data-thinking-live-tail]')).toBeNull();
  });

  it('renders the summary as plain text without markdown markers', () => {
    act(() => {
      root.render(
        <ModelThinkingDisplay thinkingItem={thinkingItem('## Heading\n**bold** and `code`')} />,
      );
    });

    act(() => {
      readToggle().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const text = container.textContent ?? '';
    expect(text).toContain('Heading');
    expect(text).toContain('bold and code');
    expect(text).not.toContain('**');
    expect(text).not.toContain('`');
  });
});
