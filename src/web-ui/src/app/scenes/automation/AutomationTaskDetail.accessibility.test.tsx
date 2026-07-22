// @vitest-environment jsdom

import React, { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AutomationProvider, useAutomation } from './automation-context';
import { AutomationHeader } from './AutomationHeader';
import { ListView } from './ListView';
import { TaskCard, type TaskCardVariant } from './TaskCard';
import { TaskDetailPanel } from './TaskDetailPanel';
import type { Agent, AutomationTask } from './automation-types';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('@/infrastructure/i18n', () => ({
  useI18n: () => ({
    currentLanguage: 'zh-CN',
    t: (key: string, values?: { count?: number }) => (
      values?.count === undefined ? key : `${key}:${values.count}`
    ),
  }),
}));

const agents: Agent[] = [
  {
    id: 'agent-one',
    name: 'Agent One',
    type: 'general',
  },
];

const baseTask: AutomationTask = {
  id: 'queued-task',
  name: '排队任务',
  description: '任务描述',
  prompt: '第一个任务提示词',
  agentId: 'agent-one',
  scheduleType: 'daily',
  scheduledAt: '2026-07-20T09:30:00',
  duration: 15,
  priority: 'P0',
  status: 'pending',
  runStatus: 'queued',
  enabled: true,
  createdAt: '2026-07-19T08:00:00',
  artifacts: [
    {
      id: 'document',
      name: 'report.md',
      type: 'document',
      size: '2 KB',
    },
  ],
  conversation: [
    {
      id: 'message',
      role: 'assistant',
      content: '完成',
      timestamp: '2026-07-20T09:31:00',
    },
  ],
};

const secondTask: AutomationTask = {
  ...baseTask,
  id: 'second-task',
  name: '第二个任务',
  description: '第二个任务描述',
  prompt: '第二个任务提示词',
  scheduledAt: '2026-07-20T10:30:00',
  runStatus: 'ok',
  status: 'completed',
};

function nextFrame(): Promise<void> {
  return new Promise(resolve => requestAnimationFrame(() => resolve()));
}

function dispatchKey(
  target: Element,
  key: string,
  options: { shiftKey?: boolean } = {},
): void {
  target.dispatchEvent(new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    key,
    shiftKey: options.shiftKey,
  }));
}

function DetailHarness(props: { removeOriginOnOpen?: boolean }) {
  const { setSelectedTaskId, selectedTaskId } = useAutomation();
  const [showOrigin, setShowOrigin] = useState(true);

  return (
    <>
      {showOrigin && (
        <TaskCard
          task={baseTask}
          onClick={() => {
            setSelectedTaskId(baseTask.id);
            if (props.removeOriginOnOpen) setShowOrigin(false);
          }}
        />
      )}
      <button
        type="button"
        data-testid="select-second-task"
        onClick={() => setSelectedTaskId(secondTask.id)}
      >
        switch
      </button>
      <output data-testid="selected-task">{selectedTaskId ?? 'none'}</output>
      <TaskDetailPanel />
    </>
  );
}

describe('automation task detail accessibility contract', () => {
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

  async function renderDetailHarness(
    removeOriginOnOpen = false,
  ): Promise<void> {
    await act(async () => {
      root.render(
        <AutomationProvider tasks={[baseTask, secondTask]} agents={agents}>
          <DetailHarness removeOriginOnOpen={removeOriginOnOpen} />
        </AutomationProvider>,
      );
    });
  }

  async function openFirstTask(): Promise<HTMLButtonElement> {
    const origin = container.querySelector(
      '.task-card',
    ) as HTMLButtonElement;
    origin.focus();
    await act(async () => origin.click());
    await act(async () => nextFrame());
    return origin;
  }

  it('names all card variants with the derived queued status, agent and time', async () => {
    const variants: TaskCardVariant[] = ['default', 'compact', 'month'];
    await act(async () => {
      root.render(
        <AutomationProvider tasks={[baseTask]} agents={agents}>
          {variants.map(variant => (
            <TaskCard key={variant} task={baseTask} variant={variant} />
          ))}
        </AutomationProvider>,
      );
    });

    const cards = Array.from(
      container.querySelectorAll<HTMLButtonElement>('.task-card'),
    );
    expect(cards).toHaveLength(3);
    for (const card of cards) {
      expect(card.getAttribute('aria-label')).toBe(
        '排队任务 · P0 priority.P0 · status.queued · Agent One · 09:30',
      );
      expect(
        Array.from(card.querySelectorAll('svg, .task-card__bar, .task-card__dot'))
          .every(node => node.getAttribute('aria-hidden') === 'true'),
      ).toBe(true);
    }
  });

  it('exposes one selected calendar view and names flattened list rows', async () => {
    await act(async () => {
      root.render(
        <AutomationProvider
          tasks={[baseTask, secondTask]}
          agents={agents}
          initialView="list"
        >
          <AutomationHeader />
          <ListView />
        </AutomationProvider>,
      );
    });

    const viewButtons = Array.from(
      container.querySelectorAll<HTMLButtonElement>(
        '.automation-header__view-btn',
      ),
    );
    expect(viewButtons).toHaveLength(4);
    expect(viewButtons.map(button => button.getAttribute('aria-pressed')))
      .toEqual(['false', 'false', 'false', 'true']);

    const queuedRow = Array.from(
      container.querySelectorAll<HTMLButtonElement>('.list-view__row'),
    ).find(row => row.textContent?.includes(baseTask.name));
    expect(queuedRow?.getAttribute('aria-label')).toBe(
      '排队任务 · P0 priority.P0 · status.queued · Agent One · 09:30',
    );
    expect(
      Array.from(queuedRow?.querySelectorAll('svg, .list-view__bar') ?? [])
        .every(node => node.getAttribute('aria-hidden') === 'true'),
    ).toBe(true);
  });

  it('labels the dialog, traps focus and implements automatic tab activation', async () => {
    await renderDetailHarness();
    await openFirstTask();

    const dialog = container.querySelector(
      '[role="dialog"]',
    ) as HTMLDivElement;
    const close = container.querySelector(
      '.task-detail-panel__close',
    ) as HTMLButtonElement;
    const labelledBy = dialog.getAttribute('aria-labelledby') ?? '';
    const describedBy = dialog.getAttribute('aria-describedby') ?? '';

    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(document.getElementById(labelledBy)?.textContent)
      .toBe(baseTask.name);
    expect(document.getElementById(describedBy)?.textContent)
      .toBe(baseTask.description);
    expect(document.activeElement).toBe(close);

    const tabs = Array.from(
      dialog.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
    );
    expect(
      dialog.querySelector('[role="tablist"]')?.getAttribute('aria-labelledby'),
    ).toBe(labelledBy);
    expect(tabs).toHaveLength(3);
    expect(tabs.map(tab => tab.getAttribute('aria-selected')))
      .toEqual(['true', 'false', 'false']);
    expect(tabs.map(tab => tab.tabIndex)).toEqual([0, -1, -1]);

    await act(async () => dispatchKey(tabs[0], 'ArrowRight'));
    expect(document.activeElement).toBe(tabs[1]);
    expect(tabs[1].getAttribute('aria-selected')).toBe('true');
    expect(dialog.querySelector('[role="tabpanel"]')?.textContent)
      .toContain('report.md');

    await act(async () => dispatchKey(tabs[1], 'End'));
    expect(document.activeElement).toBe(tabs[2]);
    expect(tabs[2].getAttribute('aria-selected')).toBe('true');

    await act(async () => dispatchKey(tabs[2], 'Home'));
    expect(document.activeElement).toBe(tabs[0]);
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    expect(dialog.querySelector('[role="tabpanel"]')?.textContent)
      .toContain(baseTask.prompt);

    close.focus();
    await act(async () => dispatchKey(close, 'Tab', { shiftKey: true }));
    expect(document.activeElement).toBe(
      dialog.querySelector('[role="tabpanel"]'),
    );
    await act(async () => dispatchKey(document.activeElement!, 'Tab'));
    expect(document.activeElement).toBe(close);
  });

  it('resets to prompt when the selected task changes and returns focus on Escape', async () => {
    await renderDetailHarness();
    const origin = await openFirstTask();
    const firstArtifactTab = container.querySelectorAll<HTMLButtonElement>(
      '[role="tab"]',
    )[1];
    await act(async () => firstArtifactTab.click());
    expect(firstArtifactTab.getAttribute('aria-selected')).toBe('true');

    const switchTask = container.querySelector(
      '[data-testid="select-second-task"]',
    ) as HTMLButtonElement;
    await act(async () => switchTask.click());
    const activeTab = container.querySelector<HTMLButtonElement>(
      '[role="tab"][aria-selected="true"]',
    );
    expect(activeTab?.textContent).toContain('detail.tabs.prompt');
    expect(container.querySelector('[role="tabpanel"]')?.textContent)
      .toContain(secondTask.prompt);

    await act(async () => {
      dispatchKey(container.querySelector('[role="dialog"]')!, 'Escape');
    });
    await act(async () => nextFrame());
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(origin);
  });

  it('closes from the backdrop without throwing or stealing focus when the origin unmounts', async () => {
    await renderDetailHarness(true);
    await openFirstTask();

    const overlay = container.querySelector(
      '.task-detail-panel__overlay',
    ) as HTMLDivElement;
    await act(async () => overlay.click());
    await act(async () => nextFrame());

    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(container.querySelector('.task-card')).toBeNull();
    expect(document.activeElement?.isConnected).toBe(true);
  });
});
