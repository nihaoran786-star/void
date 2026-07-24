import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { createInstance, type i18n as I18nInstance } from 'i18next';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { FlowChatPresentationActivityProvider } from '../components/modern/FlowChatPresentationActivity';
import { ToolTimeoutIndicator } from './ToolTimeoutIndicator';

const setSubagentTimeoutMock = vi.hoisted(() => vi.fn());

vi.mock('@/infrastructure/api/service-api/AgentAPI', () => ({
  agentAPI: {
    setSubagentTimeout: setSubagentTimeoutMock,
  },
}));

let i18n: I18nInstance;
let JSDOMCtor: (new (
  html?: string,
  options?: { pretendToBeVisual?: boolean; url?: string }
) => { window: Window & typeof globalThis }) | null = null;

beforeAll(async () => {
  i18n = createInstance();
  await i18n.use(initReactI18next).init({
    lng: 'en-US',
    fallbackLng: 'en-US',
    resources: {
      'en-US': {
        'flow-chat': {
          toolCards: {
            timeout: {
              completedDurationTooltip: 'Completed in {{duration}}',
              failedDurationTooltip: 'Failed after {{duration}}',
              failedDurationTooltipWithReason: 'Failed after {{duration}}: {{reason}}',
              cancelledDurationTooltip: 'Cancelled after {{duration}}',
              durationTooltip: 'Duration {{duration}}',
              disableTooltip: 'Disable timeout',
              disableLabel: 'Ignore timeout',
            },
          },
        },
      },
    },
    interpolation: { escapeValue: false },
  });

  const jsdom = await import('jsdom');
  JSDOMCtor = jsdom.JSDOM as typeof JSDOMCtor;
}, 30_000);

function withI18n(element: React.ReactElement): React.ReactElement {
  return (
    <I18nextProvider i18n={i18n}>
      {element}
    </I18nextProvider>
  );
}

function renderIndicator(element: React.ReactElement): string {
  return renderToStaticMarkup(withI18n(element));
}

describe('ToolTimeoutIndicator', () => {
  let dom: { window: Window & typeof globalThis } | null = null;
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    dom = new JSDOMCtor!('<!doctype html><html><body></body></html>', {
      pretendToBeVisual: true,
      url: 'http://localhost',
    }) as unknown as { window: Window & typeof globalThis };

    const { window } = dom;
    vi.stubGlobal('window', window);
    vi.stubGlobal('document', window.document);
    vi.stubGlobal('navigator', window.navigator);
    vi.stubGlobal('HTMLElement', window.HTMLElement);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    setSubagentTimeoutMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root!.unmount();
      });
    }
    container?.remove();
    dom?.window.close();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    vi.restoreAllMocks();
    root = null;
    container = null;
    dom = null;
  });

  it('uses a success affordance for completed subagent durations', () => {
    const html = renderIndicator(
      <ToolTimeoutIndicator
        isRunning={false}
        completedDurationMs={1250}
        completedStatus="success"
      />,
    );

    expect(html).toContain('duration-text--completed-success');
    expect(html).toContain('Completed in 1.3s');
    expect(html).toContain('1.3s');
  });

  it('uses an error affordance with the failure reason in the hover text', () => {
    const html = renderIndicator(
      <ToolTimeoutIndicator
        isRunning={false}
        completedDurationMs={2400}
        completedStatus="error"
        completedFailureReason="provider timed out"
      />,
    );

    expect(html).toContain('duration-text--completed-error');
    expect(html).toContain('Failed after 2.4s: provider timed out');
    expect(html).toContain('2.4s');
  });

  it('does not render an ignore-timeout control before the subagent session is known', () => {
    const html = renderIndicator(
      <ToolTimeoutIndicator
        startTime={Date.now() - 10_000}
        isRunning
        timeoutMs={60_000}
        showControls
      />,
    );

    expect(html).not.toContain('timeout-ignore-btn');
    expect(html).not.toContain('Ignore timeout');
  });

  it('disables the running subagent timeout when the ignore control is clicked', async () => {
    await act(async () => {
      root!.render(withI18n(
        <ToolTimeoutIndicator
          startTime={Date.now() - 10_000}
          isRunning
          timeoutMs={60_000}
          showControls
          subagentSessionId="subagent-session"
        />,
      ));
    });

    const button = container!.querySelector<HTMLButtonElement>('.timeout-ignore-btn');
    expect(button).toBeTruthy();

    await act(async () => {
      button!.dispatchEvent(new dom!.window.MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(setSubagentTimeoutMock).toHaveBeenCalledWith('subagent-session', { type: 'disable' });
  });

  it('uses the FlowChat presentation signal to suspend and resume its live interval', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(20_000);

    const renderAtActivity = async (isActive: boolean) => {
      await act(async () => {
        root!.render(withI18n(
          <FlowChatPresentationActivityProvider isActive={isActive}>
            <ToolTimeoutIndicator
              startTime={10_000}
              isRunning
              timeoutMs={60_000}
            />
          </FlowChatPresentationActivityProvider>,
        ));
      });
    };

    await renderAtActivity(false);
    expect(vi.getTimerCount()).toBe(0);

    await renderAtActivity(true);
    expect(vi.getTimerCount()).toBe(1);
    expect(container!.querySelector('.duration-elapsed')?.textContent).toBe('10s');

    await renderAtActivity(false);
    expect(vi.getTimerCount()).toBe(0);

    vi.setSystemTime(25_000);
    await renderAtActivity(true);
    expect(vi.getTimerCount()).toBe(1);
    expect(container!.querySelector('.duration-elapsed')?.textContent).toBe('15s');

    await renderAtActivity(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('adopts a goal-mode timeout default that becomes known after mount', async () => {
    const renderWithDefault = async (defaultTimeoutDisabled: boolean) => {
      await act(async () => {
        root!.render(withI18n(
          <ToolTimeoutIndicator
            startTime={10_000}
            isRunning
            timeoutMs={60_000}
            showControls
            subagentSessionId="subagent-session"
            defaultTimeoutDisabled={defaultTimeoutDisabled}
          />,
        ));
      });
    };

    await renderWithDefault(false);
    expect(container!.querySelector('.timeout-ignore-btn')?.classList.contains('is-active')).toBe(false);

    await renderWithDefault(true);
    expect(container!.querySelector('.timeout-ignore-btn')?.classList.contains('is-active')).toBe(true);
    expect(setSubagentTimeoutMock).not.toHaveBeenCalled();
  });

  it('removes timeout popover document listeners while presentation is inactive', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(20_000);
    const addEventListener = vi.spyOn(document, 'addEventListener');
    const removeEventListener = vi.spyOn(document, 'removeEventListener');

    await act(async () => {
      root!.render(withI18n(
        <FlowChatPresentationActivityProvider isActive>
          <ToolTimeoutIndicator
            startTime={10_000}
            isRunning
            timeoutMs={60_000}
            showControls
            subagentSessionId="subagent-session"
            defaultTimeoutDisabled
          />
        </FlowChatPresentationActivityProvider>,
      ));
    });

    const button = container!.querySelector<HTMLButtonElement>('.timeout-ignore-btn');
    await act(async () => {
      button!.click();
    });

    expect(addEventListener).toHaveBeenCalledWith('mousedown', expect.any(Function));
    expect(addEventListener).toHaveBeenCalledWith('keydown', expect.any(Function));

    await act(async () => {
      root!.render(withI18n(
        <FlowChatPresentationActivityProvider isActive={false}>
          <ToolTimeoutIndicator
            startTime={10_000}
            isRunning
            timeoutMs={60_000}
            showControls
            subagentSessionId="subagent-session"
            defaultTimeoutDisabled
          />
        </FlowChatPresentationActivityProvider>,
      ));
    });

    expect(removeEventListener).toHaveBeenCalledWith('mousedown', expect.any(Function));
    expect(removeEventListener).toHaveBeenCalledWith('keydown', expect.any(Function));

    addEventListener.mockRestore();
    removeEventListener.mockRestore();
  });
});
