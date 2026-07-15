// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolCardProps } from '../types/flow-chat';
import { FlowChatPresentationActivityProvider } from '../components/modern/FlowChatPresentationActivity';
import { GenerativeWidgetToolCard } from './GenerativeWidgetToolCard';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const frameMock = vi.hoisted(() => ({
  latestProps: null as null | { isActive?: boolean },
}));

vi.mock('@/tools/generative-widget/GenerativeWidgetFrame', () => ({
  default: (props: { isActive?: boolean }) => {
    frameMock.latestProps = props;
    return <div data-testid="widget-frame" />;
  },
}));

vi.mock('@/tools/generative-widget/GenerativeWidgetStaticRenderer', () => ({
  default: () => null,
}));

vi.mock('@/tools/generative-widget/widgetInteraction', () => ({
  handleWidgetBridgeEvent: vi.fn(),
}));

vi.mock('@/tools/generative-widget/useGenerativeWidgetPromptMenu', () => ({
  useGenerativeWidgetPromptMenu: () => vi.fn(),
}));

vi.mock('@/shared/context-menu-system', () => ({
  useContextMenuStore: (selector: (state: { hideMenu: () => void }) => unknown) => (
    selector({ hideMenu: vi.fn() })
  ),
}));

vi.mock('../utils/captureElementToDownloadsPng', () => ({
  captureElementToDownloadsPng: vi.fn(),
}));

vi.mock('@/shared/utils/logger', () => ({
  createLogger: () => ({ error: vi.fn() }),
}));

vi.mock('@/shared/notification-system', () => ({
  notificationService: { error: vi.fn() },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../../component-library', () => ({
  CubeLoading: () => null,
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('./BaseToolCard', () => ({
  BaseToolCard: ({ expandedContent }: { expandedContent?: React.ReactNode }) => (
    <div>{expandedContent}</div>
  ),
  ToolCardHeader: () => null,
}));

const props = {
  toolItem: {
    id: 'tool-item-1',
    toolName: 'GenerativeUI',
    status: 'completed',
    toolCall: { id: 'tool-call-1', input: {} },
    toolResult: {
      success: true,
      result: JSON.stringify({
        widget_id: 'widget-1',
        title: 'Widget',
        widget_code: '<div>Widget</div>',
      }),
    },
  },
  config: { toolName: 'GenerativeUI' },
  sessionId: 'session-1',
} as unknown as ToolCardProps;

function Harness({ isActive }: { isActive: boolean }) {
  return (
    <FlowChatPresentationActivityProvider isActive={isActive}>
      <GenerativeWidgetToolCard {...props} />
    </FlowChatPresentationActivityProvider>
  );
}

describe('GenerativeWidgetToolCard presentation lifecycle', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    frameMock.latestProps = null;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('passes FlowChat presentation activity into the generic frame', () => {
    act(() => root.render(<Harness isActive={false} />));
    expect(frameMock.latestProps?.isActive).toBe(false);

    act(() => root.render(<Harness isActive />));
    expect(frameMock.latestProps?.isActive).toBe(true);
  });
});
