import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import type { CustomizationRuntimeCapabilityReader } from '@/shared/services/customization';

const fixture = vi.hoisted(() => ({
  installedHookCalls: 0,
}));

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: vi.fn() },
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@/app/scenes/customization/CustomizationTopNav', () => ({
  default: () => <nav data-testid="customization-top-nav" />,
}));

vi.mock('@/component-library', () => ({
  Badge: () => null,
  Button: () => null,
  ConfirmDialog: () => null,
  Input: () => null,
  Modal: () => null,
  Search: () => null,
  Select: () => null,
}));

vi.mock('@/app/components', () => ({
  GalleryDetailModal: () => null,
}));

vi.mock('@/app/hooks/useGallerySceneAutoRefresh', () => ({
  useGallerySceneAutoRefresh: () => undefined,
}));

vi.mock('@/infrastructure/api', () => ({
  workspaceAPI: {},
}));

vi.mock('@/infrastructure/services/business/workspaceManager', () => ({
  workspaceManager: {},
}));

vi.mock('@/shared/notification-system', () => ({
  useNotification: () => {
    throw new Error('notification hook must not mount in an unsupported browser runtime');
  },
}));

vi.mock('@/shared/types', () => ({
  isRemoteWorkspace: () => false,
}));

vi.mock('@/shared/utils/logger', () => ({
  createLogger: () => ({
    error: vi.fn(),
  }),
}));

vi.mock('@/shared/utils/cardGradients', () => ({
  getCardGradient: () => '',
}));

vi.mock('@/shared/services/customization', () => ({
  isMarketSkillInstalled: () => false,
  localizeCatalogPresentation: (value: unknown) => value,
  presentationForInstalledSkill: () => ({
    displayName: '',
    description: '',
    aliases: [],
  }),
  presentationForMarketSkill: () => ({
    displayName: '',
    description: '',
    aliases: [],
  }),
}));

vi.mock('@/shared/services/customization/CustomizationRuntimeCapabilityService', () => ({
  customizationRuntimeCapabilityService: {
    getCapability: () => ({
      status: 'unsupported',
      transport: 'websocket',
      reason: 'server_runtime_deferred',
    }),
  },
}));

vi.mock('./hooks/useInstalledSkills', () => ({
  useInstalledSkills: () => {
    fixture.installedHookCalls += 1;
    throw new Error('installed hook must not mount in an unsupported browser runtime');
  },
}));

vi.mock('./hooks/useSkillMarket', () => ({
  useSkillMarket: () => {
    throw new Error('market hook must not mount in an unsupported browser runtime');
  },
}));

vi.mock('./components/SkillAuthoringPage', () => ({
  default: () => null,
}));

vi.mock('./components/SkillCard', () => ({
  default: () => null,
}));

vi.mock('./components/SkillsSuiteView', () => ({
  default: () => null,
}));

vi.mock('./skillsSceneStore', () => ({
  useSkillsSceneStore: () => {
    throw new Error('skills store must not mount in an unsupported browser runtime');
  },
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

describeWithJsdom('SkillsScene runtime gate', () => {
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
    vi.stubGlobal('MutationObserver', dom.window.MutationObserver);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    fixture.installedHookCalls = 0;
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

  it('浏览器只渲染明确不支持状态且完全不挂载技能数据 hooks', async () => {
    const capabilityService: CustomizationRuntimeCapabilityReader = {
      getCapability: () => ({
        status: 'unsupported',
        transport: 'websocket',
        reason: 'server_runtime_deferred',
      }),
    };
    const { default: SkillsScene } = await import('./SkillsScene');

    await act(async () => {
      root.render(<SkillsScene capabilityService={capabilityService} />);
    });

    expect(container.querySelector('[data-testid="skills-runtime-unsupported"]'))
      .toBeTruthy();
    expect(container.textContent).toContain('runtimeUnsupported.description');
    expect(fixture.installedHookCalls).toBe(0);
  });
});
