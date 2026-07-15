// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GenerativeWidgetFrame } from './GenerativeWidgetFrame';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const themeMock = vi.hoisted(() => ({
  unsubscribe: vi.fn(),
  on: vi.fn(() => themeMock.unsubscribe),
  payload: { colorScheme: 'dark', cssVariables: { '--color-text-primary': '#fff' } },
}));

vi.mock('@/infrastructure/theme', () => ({
  themeService: { on: themeMock.on },
}));

vi.mock('./themePayload', () => ({
  readWidgetThemePayload: () => themeMock.payload,
}));

function Harness({ isActive }: { isActive: boolean }) {
  return (
    <GenerativeWidgetFrame
      widgetId="widget-1"
      title="Widget"
      widgetCode="<button>Run</button><script>window.didRun = true</script>"
      executeScripts
      isActive={isActive}
    />
  );
}

function findUpdateCalls(postMessage: ReturnType<typeof vi.spyOn>) {
  return postMessage.mock.calls
    .map(([message]) => message as { type?: string; runScripts?: boolean; html?: string })
    .filter((message) => message.type === 'void-widget:update');
}

describe('GenerativeWidgetFrame presentation lifecycle', () => {
  let container: HTMLDivElement;
  let root: Root;
  let addEventListenerSpy: ReturnType<typeof vi.spyOn>;
  let removeEventListenerSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    themeMock.on.mockClear();
    themeMock.unsubscribe.mockClear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    addEventListenerSpy = vi.spyOn(window, 'addEventListener');
    removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it('keeps existing callers active when isActive is omitted', () => {
    act(() => root.render(
      <GenerativeWidgetFrame
        widgetId="widget-default-active"
        widgetCode="<div>Default active</div>"
      />,
    ));

    expect(container.querySelector('iframe')).not.toBeNull();
    expect(themeMock.on).toHaveBeenCalledTimes(1);
  });

  it('unmounts the iframe and listeners while hidden, then rebuilds and reruns scripts on resume', () => {
    act(() => root.render(<Harness isActive />));

    const firstIframe = container.querySelector('iframe');
    expect(firstIframe).not.toBeNull();
    expect(themeMock.on).toHaveBeenCalledTimes(1);
    const firstMessageListener = addEventListenerSpy.mock.calls
      .find(([eventName]) => eventName === 'message')?.[1];
    expect(firstMessageListener).toEqual(expect.any(Function));

    const firstPostMessage = vi.spyOn(firstIframe!.contentWindow!, 'postMessage');
    act(() => firstIframe!.dispatchEvent(new Event('load')));
    expect(findUpdateCalls(firstPostMessage)).toEqual([
      expect.objectContaining({
        html: expect.stringContaining('<button>Run</button>'),
        runScripts: true,
      }),
    ]);

    act(() => root.render(<Harness isActive={false} />));
    expect(container.querySelector('iframe')).toBeNull();
    expect(themeMock.unsubscribe).toHaveBeenCalledTimes(1);
    expect(removeEventListenerSpy).toHaveBeenCalledWith('message', firstMessageListener);

    act(() => root.render(<Harness isActive />));
    const resumedIframe = container.querySelector('iframe');
    expect(resumedIframe).not.toBeNull();
    expect(resumedIframe).not.toBe(firstIframe);
    expect(themeMock.on).toHaveBeenCalledTimes(2);

    const resumedPostMessage = vi.spyOn(resumedIframe!.contentWindow!, 'postMessage');
    act(() => resumedIframe!.dispatchEvent(new Event('load')));
    expect(findUpdateCalls(resumedPostMessage)).toEqual([
      expect.objectContaining({
        html: expect.stringContaining('<button>Run</button>'),
        runScripts: true,
      }),
    ]);
  });
});
