import { describe, expect, it, vi } from 'vitest';
import type {
  CanvasTab,
  EditorGroupState,
} from '@/app/components/panels/content-canvas/types';
import { removeDuplicateTeamMemberCanvasTabs } from './TeamMemberCanvasPresentation';

describe('TeamMemberCanvasPresentation', () => {
  it('removes old short-drama member conversations while preserving business and ordinary BTW tabs', () => {
    const closeTab = vi.fn();
    const gateway = {
      primaryGroup: group([tab('short-drama-center', 'short-drama-center')]),
      secondaryGroup: group([
        tab('legacy-script', 'btw-session', {
          shortDramaStage: 'script',
          shortDramaWorkspacePath: 'C:/work',
        }),
        tab('ordinary-btw', 'btw-session', { parentSessionId: 'team-session' }),
      ]),
      tertiaryGroup: group([
        tab('other-workspace-stage', 'btw-session', {
          shortDramaStage: 'assets',
          shortDramaWorkspacePath: 'C:/other',
        }),
      ]),
      closeTab,
    };

    expect(removeDuplicateTeamMemberCanvasTabs(gateway, {
      parentSessionId: 'team-session',
      workspacePath: 'C:/work',
      removeShortDramaWorkspaceTabs: true,
    })).toBe(1);
    expect(closeTab).toHaveBeenCalledWith('legacy-script', 'secondary', {
      forceRemove: true,
    });
  });

  it('removes a formal Team member by child session id without short-drama metadata', () => {
    const closeTab = vi.fn();
    const gateway = {
      primaryGroup: group([]),
      secondaryGroup: group([
        tab('formal-member', 'btw-session', {}, { childSessionId: 'member-child' }),
      ]),
      tertiaryGroup: group([]),
      closeTab,
    };

    expect(removeDuplicateTeamMemberCanvasTabs(gateway, {
      parentSessionId: 'team-session',
      memberChildSessionIds: ['member-child'],
    })).toBe(1);
    expect(closeTab).toHaveBeenCalledWith('formal-member', 'secondary', {
      forceRemove: true,
    });
  });

  it('cleans another Team without removing short-drama compatibility tabs', () => {
    const closeTab = vi.fn();
    const gateway = {
      primaryGroup: group([]),
      secondaryGroup: group([
        tab('formal-member', 'btw-session', {}, { childSessionId: 'member-child' }),
        tab('short-drama-compat', 'btw-session', {
          shortDramaStage: 'script',
          shortDramaWorkspacePath: 'C:/work',
        }),
      ]),
      tertiaryGroup: group([]),
      closeTab,
    };

    expect(removeDuplicateTeamMemberCanvasTabs(gateway, {
      parentSessionId: 'team-session',
      workspacePath: 'C:/work',
      memberChildSessionIds: ['member-child'],
    })).toBe(1);
    expect(closeTab).not.toHaveBeenCalledWith(
      'short-drama-compat',
      expect.anything(),
      expect.anything(),
    );
  });
});

function group(tabs: CanvasTab[]): EditorGroupState {
  return { tabs, activeTabId: tabs[0]?.id ?? null };
}

function tab(
  id: string,
  type: CanvasTab['content']['type'],
  metadata: Record<string, unknown> = {},
  data: Record<string, unknown> = {},
): CanvasTab {
  return {
    id,
    title: id,
    content: { type, title: id, metadata, data },
    state: 'active',
    isDirty: false,
    createdAt: 0,
    lastAccessedAt: 0,
  };
}
