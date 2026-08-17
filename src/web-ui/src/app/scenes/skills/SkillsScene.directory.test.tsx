import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import type { CustomizationRuntimeCapabilityReader } from '@/shared/services/customization';

// Rendering guard for the approved directory presentation: one top bar owns the
// catalog switch, the filter chips and the single primary action, and every card
// states its own status explicitly instead of leaving it to be inferred.

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: vi.fn() },
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@/component-library', () => ({
  Badge: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
  Button: () => null,
  ConfirmDialog: () => null,
  Input: () => null,
  Modal: () => null,
  Search: ({ placeholder }: { placeholder?: string }) => (
    <input type="search" aria-label={placeholder} />
  ),
  Select: () => null,
}));

vi.mock('@/app/components', () => ({
  GalleryDetailModal: () => null,
}));

vi.mock('@/app/hooks/useGallerySceneAutoRefresh', () => ({
  useGallerySceneAutoRefresh: () => undefined,
}));

vi.mock('@/infrastructure/api', () => ({
  workspaceAPI: { revealInExplorer: vi.fn() },
}));

vi.mock('@/infrastructure/services/business/workspaceManager', () => ({
  workspaceManager: { getState: () => ({ currentWorkspace: null }) },
}));

vi.mock('@/shared/notification-system', () => ({
  useNotification: () => ({ error: vi.fn() }),
}));

vi.mock('@/shared/types', () => ({
  isRemoteWorkspace: () => false,
}));

vi.mock('@/shared/utils/logger', () => ({
  createLogger: () => ({ error: vi.fn() }),
}));

vi.mock('@/shared/services/customization', () => ({
  isMarketSkillInstalled: () => false,
  localizeCatalogPresentation: (value: unknown) => value,
  presentationForInstalledSkill: (skill: { name: string }) => ({
    displayName: skill.name,
    description: `${skill.name} description`,
    aliases: [],
  }),
  presentationForMarketSkill: () => ({
    displayName: '',
    description: '',
    aliases: [],
  }),
}));

const installedSkills = [
  {
    key: 'alpha',
    name: 'alpha',
    level: 'user',
    path: '/skills/alpha',
    isBuiltin: false,
    isShadowed: false,
    isAuthorable: true,
  },
  {
    key: 'beta',
    name: 'beta',
    level: 'project',
    path: '/skills/beta',
    isBuiltin: true,
    isShadowed: true,
    isAuthorable: false,
  },
];

vi.mock('./hooks/useInstalledSkills', () => ({
  useInstalledSkills: () => ({
    skills: installedSkills,
    filteredSkills: installedSkills,
    counts: { all: 2, builtin: 1, user: 1, project: 1, suite: 0 },
    loading: false,
    error: null,
    loadSkills: vi.fn(),
    handleDelete: vi.fn(),
    formLevel: 'user',
    setFormLevel: vi.fn(),
    formPath: '',
    setFormPath: vi.fn(),
    validationResult: null,
    isValidating: false,
    isAdding: false,
    handleBrowse: vi.fn(),
    handleAdd: vi.fn(),
    resetForm: vi.fn(),
    workspacePath: '',
    hasWorkspace: true,
    isRemoteWorkspace: false,
  }),
}));

vi.mock('./hooks/useSkillMarket', () => ({
  useSkillMarket: () => ({
    marketSkills: [],
    marketLoading: false,
    loadingMore: false,
    marketError: null,
    downloadingPackage: null,
    hasMore: false,
    currentPage: 0,
    totalPages: 1,
    refresh: vi.fn(),
    goToPrevPage: vi.fn(),
    goToNextPage: vi.fn(),
    handleDownload: vi.fn(),
    hasWorkspace: true,
    isRemoteWorkspace: false,
    totalLoaded: 7,
  }),
}));

vi.mock('./components/SkillAuthoringPage', () => ({ default: () => null }));
vi.mock('./components/SkillCard', () => ({ default: () => null }));
vi.mock('./components/SkillsSuiteView', () => ({ default: () => null }));
vi.mock('./components/SkillCatalogAvatar', () => ({
  default: () => <span data-testid="skill-glyph" />,
}));

vi.mock('./skillsSceneStore', () => ({
  useSkillsSceneStore: () => ({
    searchDraft: '',
    marketQuery: '',
    installedFilter: 'all',
    hideDuplicates: false,
    isAddFormOpen: false,
    setSearchDraft: vi.fn(),
    submitMarketQuery: vi.fn(),
    setInstalledFilter: vi.fn(),
    setHideDuplicates: vi.fn(),
    setAddFormOpen: vi.fn(),
    toggleAddForm: vi.fn(),
  }),
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

const supported: CustomizationRuntimeCapabilityReader = {
  getCapability: () => ({
    status: 'supported',
    transport: 'tauri',
  }),
};

describeWithJsdom('SkillsScene directory presentation', () => {
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

  const render = async () => {
    const { default: SkillsScene } = await import('./SkillsScene');
    await act(async () => {
      root.render(<SkillsScene capabilityService={supported} />);
    });
  };

  it('目录上栏只提供一个搜索框和一个主动作，两个目录切换仍是 tab', async () => {
    await render();

    const tabs = Array.from(container.querySelectorAll('[role="tab"]'));
    expect(tabs).toHaveLength(2);
    expect(tabs[0]?.getAttribute('aria-selected')).toBe('true');
    expect(tabs[1]?.getAttribute('aria-selected')).toBe('false');

    expect(container.querySelectorAll('input[type="search"]')).toHaveLength(1);

    const primary = Array.from(
      container.querySelectorAll('button'),
    ).filter(button => button.textContent?.includes('toolbar.createTooltip'));
    expect(primary).toHaveLength(1);
  });

  it('每张卡片显式说明自己的状态，被覆盖的技能可被区分', async () => {
    await render();

    const cards = Array.from(container.querySelectorAll('article'));
    expect(cards).toHaveLength(2);

    for (const card of cards) {
      expect(card.querySelector('[data-testid="skill-glyph"]')).toBeTruthy();
      expect(card.getAttribute('data-state')).toBeTruthy();
    }

    expect(cards[0]?.getAttribute('data-state')).toBe('active');
    expect(cards[0]?.textContent).toContain('list.item.statusActive');
    expect(cards[1]?.getAttribute('data-state')).toBe('shadowed');
    expect(cards[1]?.textContent).toContain('list.item.statusShadowed');
  });
});
