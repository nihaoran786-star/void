import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/infrastructure/contexts/WorkspaceContext', () => ({
  useWorkspaceContext: () => ({
    currentWorkspace: null,
    recentWorkspaces: [{
      id: 'recent-workspace',
      name: 'Recent workspace',
      rootPath: 'D:\\recent-workspace',
      workspaceType: 'singleProject',
      workspaceKind: 'normal',
      languages: [],
      openedAt: '2026-07-18T00:00:00.000Z',
      lastAccessed: '2026-07-18T00:00:00.000Z',
      tags: [],
    }],
    assistantWorkspacesList: [],
    loading: false,
    error: null,
    switchWorkspace: vi.fn(),
    closeWorkspace: vi.fn(),
    scanWorkspaceInfo: vi.fn(),
  }),
}));

vi.mock('@/infrastructure/i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
  i18nService: {
    formatDate: () => 'localized date',
  },
}));

vi.mock('@/component-library', () => ({
  Modal: ({
    children,
    overlayClassName,
    title,
  }: {
    children: React.ReactNode;
    overlayClassName?: string;
    title?: string;
  }) => (
    <section className={overlayClassName} data-title={title}>
      {children}
    </section>
  ),
}));

import WorkspaceManager from './WorkspaceManager';

describe('WorkspaceManager presentation contract', () => {
  it('projects minimal presentation onto the portal and keeps recent workspaces keyboard-native', () => {
    const markup = renderToStaticMarkup(
      <WorkspaceManager
        isVisible
        onClose={vi.fn()}
        presentation="minimal"
      />,
    );

    expect(markup).toContain('class="void-ui--minimal"');
    expect(markup).toContain('data-title="workspaceManager.title"');
    expect(markup).toMatch(/<button[^>]*class="workspace-card recent"[^>]*type="button"/);
    expect(markup).toContain('workspaceManager.recentWorkspaces');
    expect(markup).toContain('workspaceManager.types.singleProject');
    expect(markup).not.toContain('>singleProject<');
  });

  it('preserves classic as the component default', () => {
    const markup = renderToStaticMarkup(
      <WorkspaceManager isVisible onClose={vi.fn()} />,
    );

    expect(markup).toContain('class="void-ui--classic"');
  });
});
