import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import type {
  CustomizationRuntimeCapabilityReader,
  SkillAuthoringGateway,
} from '@/shared/services/customization';

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: vi.fn() },
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/infrastructure/hooks/useWorkspaceManagerSync', () => ({
  useWorkspaceManagerSync: () => ({
    workspacePath: 'D:/workspace',
    hasWorkspace: true,
    isRemoteWorkspace: false,
  }),
}));

vi.mock('@/shared/notification-system', () => ({
  useNotification: () => ({
    success: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('@/component-library', () => ({
  Button: ({ children, onClick }: React.PropsWithChildren<{ onClick?: () => void }>) => (
    <button type="button" onClick={onClick}>{children}</button>
  ),
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
  Textarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
    <textarea {...props} />
  ),
}));

let JSDOMCtor: (new (
  html?: string,
  options?: { pretendToBeVisual?: boolean; url?: string }
) => { window: Window & typeof globalThis }) | null = null;

try {
  const jsdom = await import('jsdom');
  JSDOMCtor = jsdom.JSDOM as typeof JSDOMCtor;
} catch {
  JSDOMCtor = null;
}

const describeWithJsdom = JSDOMCtor ? describe : describe.skip;

describeWithJsdom('SkillAuthoringPage runtime gate', () => {
  let dom: { window: Window & typeof globalThis };
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    dom = new JSDOMCtor!('<!doctype html><html><body></body></html>', {
      pretendToBeVisual: true,
      url: 'http://localhost',
    });
    Object.defineProperty(dom.window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('navigator', dom.window.navigator);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    dom.window.close();
    vi.unstubAllGlobals();
  });

  it('不支持运行时不读取详情也不写入技能', async () => {
    const gateway: SkillAuthoringGateway = {
      getDetail: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    };
    const capabilityService: CustomizationRuntimeCapabilityReader = {
      getCapability: () => ({
        status: 'unsupported',
        transport: 'websocket',
        reason: 'server_runtime_deferred',
      }),
    };
    const { default: SkillAuthoringPage } = await import('./SkillAuthoringPage');

    await act(async () => {
      root.render(
        <SkillAuthoringPage
          mode="edit"
          skillKey="user::void::custom-0123456789abcdef0123456789abcdef"
          onBack={vi.fn()}
          onSaved={vi.fn()}
          gateway={gateway}
          capabilityService={capabilityService}
        />,
      );
    });

    expect(container.querySelector(
      '[data-testid="skill-authoring-runtime-unsupported"]',
    )).toBeTruthy();
    expect(gateway.getDetail).not.toHaveBeenCalled();
    expect(gateway.create).not.toHaveBeenCalled();
    expect(gateway.update).not.toHaveBeenCalled();
  }, 10_000);
});
