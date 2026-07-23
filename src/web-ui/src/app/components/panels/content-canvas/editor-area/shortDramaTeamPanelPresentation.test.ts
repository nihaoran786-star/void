import { describe, expect, it } from 'vitest';
import type { CanvasTab, EditorGroupState } from '../types';
import {
  projectShortDramaTeamGroup,
  selectShortDramaTeamTabCloseAction,
  selectShortDramaTeamLayoutRecovery,
  selectShortDramaTeamPanelPresentation,
} from './shortDramaTeamPanelPresentation';

const createTab = (
  id: string,
  type: CanvasTab['content']['type'],
  metadata?: Record<string, unknown>,
  data: Record<string, unknown> = {},
): CanvasTab => ({
  id,
  title: id,
  content: { type, title: id, data, metadata },
  state: 'active',
  isDirty: false,
  createdAt: 1,
  lastAccessedAt: 1,
});

const createGroup = (tabs: CanvasTab[], activeTabId = tabs[0]?.id ?? null): EditorGroupState => ({
  tabs,
  activeTabId,
});

describe('selectShortDramaTeamPanelPresentation', () => {
  const shortDramaGroup = createGroup([
    createTab(
      'short-drama',
      'short-drama-center',
      undefined,
      { workspacePath: 'C:/work' },
    ),
  ]);
  const stageAgentTabs = [
    createTab('script-agent', 'btw-session', {
      shortDramaStage: 'script',
      shortDramaWorkspacePath: 'C:/work',
    }),
    createTab('asset-agent', 'btw-session', {
      shortDramaStage: 'assets',
      shortDramaWorkspacePath: 'C:/work',
    }),
  ];

  it('presents only a horizontal short-drama plus real stage-agent split as a team rail', () => {
    expect(selectShortDramaTeamPanelPresentation({
      presentation: 'minimal',
      splitMode: 'horizontal',
      primaryGroup: shortDramaGroup,
      secondaryGroup: createGroup(stageAgentTabs),
      expandedPrimarySurfaceKey: null,
    })).toMatchObject({
      status: 'ready',
      mode: 'rail',
      activeTabId: 'script-agent',
      tabs: stageAgentTabs,
      primarySurfaceKey: 'short-drama-workspace:C:/work',
      teamIdentity: '["short-drama-workspace:C:/work","asset-agent","script-agent"]',
    });
  });

  it('keeps the same real tabs and active session when the presentation expands', () => {
    expect(selectShortDramaTeamPanelPresentation({
      presentation: 'minimal',
      splitMode: 'horizontal',
      primaryGroup: shortDramaGroup,
      secondaryGroup: createGroup(stageAgentTabs, 'asset-agent'),
      expandedPrimarySurfaceKey: 'short-drama-workspace:C:/work',
    })).toMatchObject({
      status: 'ready',
      mode: 'open',
      activeTabId: 'asset-agent',
      tabs: stageAgentTabs,
    });
  });

  it('falls back to the unchanged editor layout when another secondary tool is present', () => {
    expect(selectShortDramaTeamPanelPresentation({
      presentation: 'minimal',
      splitMode: 'horizontal',
      primaryGroup: shortDramaGroup,
      secondaryGroup: createGroup([
        ...stageAgentTabs,
        createTab('browser', 'browser'),
      ]),
      expandedPrimarySurfaceKey: null,
    })).toEqual({
      status: 'inactive',
      mode: 'closed',
      reason: 'secondary-has-mixed-content',
      tabs: [],
    });
  });

  it('keeps an unrelated BTW thread out of the short-drama team without deleting it', () => {
    const unrelatedBtw = createTab('hello-thread', 'btw-session');
    const secondaryGroup = createGroup([
      unrelatedBtw,
      stageAgentTabs[1],
      stageAgentTabs[0],
    ], unrelatedBtw.id);

    const presentation = selectShortDramaTeamPanelPresentation({
      presentation: 'minimal',
      splitMode: 'horizontal',
      primaryGroup: shortDramaGroup,
      secondaryGroup,
      expandedPrimarySurfaceKey: 'short-drama-workspace:C:/work',
    });
    const projected = projectShortDramaTeamGroup(
      secondaryGroup,
      key => key,
    );

    expect(presentation).toMatchObject({
      status: 'ready',
      mode: 'open',
      activeTabId: '',
    });
    expect(presentation.status === 'ready'
      ? presentation.tabs.map(tab => tab.id)
      : []).toEqual(['script-agent', 'asset-agent']);
    expect(projected.tabs.map(tab => tab.id)).toEqual([
      'script-agent',
      'asset-agent',
    ]);
    expect(projected.activeTabId).toBe('script-agent');
    expect(secondaryGroup.tabs).toContain(unrelatedBtw);
  });

  it('does not reinterpret non-short-drama layouts', () => {
    expect(selectShortDramaTeamPanelPresentation({
      presentation: 'minimal',
      splitMode: 'horizontal',
      primaryGroup: createGroup([createTab('file', 'text-viewer')]),
      secondaryGroup: createGroup(stageAgentTabs),
      expandedPrimarySurfaceKey: null,
    })).toMatchObject({
      status: 'inactive',
      mode: 'closed',
      reason: 'primary-is-not-short-drama',
    });
  });

  it('keeps the short-drama team presentation while another canvas tool is active', () => {
    const browserTab = createTab('browser', 'browser');
    const primaryGroup = createGroup([
      browserTab,
      ...shortDramaGroup.tabs,
    ], browserTab.id);

    expect(selectShortDramaTeamPanelPresentation({
      presentation: 'minimal',
      splitMode: 'horizontal',
      primaryGroup,
      secondaryGroup: createGroup(stageAgentTabs),
      expandedPrimarySurfaceKey: 'short-drama-workspace:C:/work',
    })).toMatchObject({
      status: 'ready',
      mode: 'open',
      tabs: stageAgentTabs,
      primarySurfaceKey: 'short-drama-workspace:C:/work',
    });
  });

  it('leaves the classic presentation and its visible agent lifecycle unchanged', () => {
    expect(selectShortDramaTeamPanelPresentation({
      presentation: 'classic',
      splitMode: 'horizontal',
      primaryGroup: shortDramaGroup,
      secondaryGroup: createGroup(stageAgentTabs),
      expandedPrimarySurfaceKey: null,
    })).toEqual({
      status: 'inactive',
      mode: 'closed',
      reason: 'classic-presentation',
      tabs: [],
    });
  });

  it('keeps the team open while the same-workspace media wall is active', () => {
    const mediaGroup = createGroup([
      createTab(
        'short-drama-media',
        'workspace-media-gallery',
        undefined,
        { workspacePath: 'C:/work' },
      ),
    ]);

    expect(selectShortDramaTeamPanelPresentation({
      presentation: 'minimal',
      splitMode: 'horizontal',
      primaryGroup: mediaGroup,
      secondaryGroup: createGroup(stageAgentTabs),
      expandedPrimarySurfaceKey: 'short-drama-workspace:C:/work',
    })).toMatchObject({
      status: 'ready',
      mode: 'open',
      activeTabId: 'script-agent',
      primarySurfaceKey: 'short-drama-workspace:C:/work',
    });
  });

  it('shares one expansion across same-workspace surfaces and drops it across workspaces', () => {
    const mediaGroup = createGroup([
      createTab(
        'short-drama-media',
        'workspace-media-gallery',
        undefined,
        { workspacePath: 'C:/work' },
      ),
    ]);
    const workspaceSurfaceKey = 'short-drama-workspace:C:/work';

    expect(selectShortDramaTeamPanelPresentation({
      presentation: 'minimal',
      splitMode: 'horizontal',
      primaryGroup: mediaGroup,
      secondaryGroup: createGroup(stageAgentTabs),
      expandedPrimarySurfaceKey: workspaceSurfaceKey,
    })).toMatchObject({
      status: 'ready',
      mode: 'open',
      primarySurfaceKey: workspaceSurfaceKey,
    });
    expect(selectShortDramaTeamPanelPresentation({
      presentation: 'minimal',
      splitMode: 'horizontal',
      primaryGroup: shortDramaGroup,
      secondaryGroup: createGroup(stageAgentTabs),
      expandedPrimarySurfaceKey: workspaceSurfaceKey,
    })).toMatchObject({
      status: 'ready',
      mode: 'open',
      primarySurfaceKey: workspaceSurfaceKey,
    });
    expect(selectShortDramaTeamPanelPresentation({
      presentation: 'minimal',
      splitMode: 'horizontal',
      primaryGroup: createGroup([
        createTab(
          'other-short-drama',
          'short-drama-center',
          undefined,
          { workspacePath: 'C:/other-workspace' },
        ),
      ]),
      secondaryGroup: createGroup([
        createTab('other-script-agent', 'btw-session', {
          shortDramaStage: 'script',
          shortDramaWorkspacePath: 'C:/other-workspace',
        }),
      ]),
      expandedPrimarySurfaceKey: workspaceSurfaceKey,
    })).toMatchObject({
      status: 'ready',
      mode: 'rail',
      primarySurfaceKey: 'short-drama-workspace:C:/other-workspace',
    });
  });

  it('does not reserve half the canvas while stage-agent tabs are still empty', () => {
    expect(selectShortDramaTeamPanelPresentation({
      presentation: 'minimal',
      splitMode: 'horizontal',
      primaryGroup: shortDramaGroup,
      secondaryGroup: createGroup([]),
      expandedPrimarySurfaceKey: null,
    })).toMatchObject({
      status: 'ready',
      mode: 'rail',
      tabs: [],
      activeTabId: '',
    });
  });

  it('does not fake an active agent when the secondary active tab is missing', () => {
    expect(selectShortDramaTeamPanelPresentation({
      presentation: 'minimal',
      splitMode: 'horizontal',
      primaryGroup: shortDramaGroup,
      secondaryGroup: createGroup(stageAgentTabs, 'missing-agent'),
      expandedPrimarySurfaceKey: null,
    })).toMatchObject({
      status: 'ready',
      mode: 'rail',
      activeTabId: '',
    });
  });

  it('falls back to the native media layout before any stage-agent tab exists', () => {
    expect(selectShortDramaTeamPanelPresentation({
      presentation: 'minimal',
      splitMode: 'horizontal',
      primaryGroup: createGroup([
        createTab(
          'short-drama-media',
          'workspace-media-gallery',
          undefined,
          { workspacePath: 'C:/work' },
        ),
      ]),
      secondaryGroup: createGroup([]),
      expandedPrimarySurfaceKey: null,
    })).toEqual({
      status: 'inactive',
      mode: 'closed',
      reason: 'secondary-is-empty',
      tabs: [],
    });
  });

  it('does not compact stage agents from another workspace beside the media wall', () => {
    expect(selectShortDramaTeamPanelPresentation({
      presentation: 'minimal',
      splitMode: 'horizontal',
      primaryGroup: createGroup([
        createTab(
          'short-drama-media',
          'workspace-media-gallery',
          undefined,
          { workspacePath: 'C:/work' },
        ),
      ]),
      secondaryGroup: createGroup([
        createTab('foreign-agent', 'btw-session', {
          shortDramaStage: 'assets',
          shortDramaWorkspacePath: 'C:/other-workspace',
        }),
      ]),
      expandedPrimarySurfaceKey: null,
    })).toEqual({
      status: 'inactive',
      mode: 'closed',
      reason: 'secondary-workspace-mismatch',
      tabs: [],
    });
  });

  it('requires explicit workspace identity on both sides of a media team', () => {
    const mediaWithoutWorkspace = createGroup([
      createTab('short-drama-media', 'workspace-media-gallery'),
    ]);
    const agentWithoutWorkspace = createGroup([
      createTab('asset-agent', 'btw-session', {
        shortDramaStage: 'assets',
      }),
    ]);

    expect(selectShortDramaTeamPanelPresentation({
      presentation: 'minimal',
      splitMode: 'horizontal',
      primaryGroup: mediaWithoutWorkspace,
      secondaryGroup: createGroup([
        createTab('asset-agent', 'btw-session', {
          shortDramaStage: 'assets',
          shortDramaWorkspacePath: 'C:/work',
        }),
      ]),
      expandedPrimarySurfaceKey: null,
    })).toMatchObject({
      status: 'inactive',
      reason: 'secondary-workspace-mismatch',
    });
    expect(selectShortDramaTeamPanelPresentation({
      presentation: 'minimal',
      splitMode: 'horizontal',
      primaryGroup: createGroup([
        createTab(
          'short-drama-media',
          'workspace-media-gallery',
          undefined,
          { workspacePath: 'C:/work' },
        ),
      ]),
      secondaryGroup: agentWithoutWorkspace,
      expandedPrimarySurfaceKey: null,
    })).toMatchObject({
      status: 'inactive',
      reason: 'secondary-workspace-mismatch',
    });
  });

  it('keeps team identity stable when real stage tabs are only reordered', () => {
    const input = {
      presentation: 'minimal' as const,
      splitMode: 'horizontal' as const,
      primaryGroup: shortDramaGroup,
      expandedPrimarySurfaceKey: 'short-drama-workspace:C:/work',
    };
    const original = selectShortDramaTeamPanelPresentation({
      ...input,
      secondaryGroup: createGroup(stageAgentTabs),
    });
    const reordered = selectShortDramaTeamPanelPresentation({
      ...input,
      secondaryGroup: createGroup([...stageAgentTabs].reverse()),
    });

    expect(original).toMatchObject({ status: 'ready', mode: 'open' });
    expect(reordered).toMatchObject({ status: 'ready', mode: 'open' });
    expect(reordered.status === 'ready' && original.status === 'ready'
      ? reordered.teamIdentity
      : null).toBe(
      original.status === 'ready' ? original.teamIdentity : null,
    );
  });

  it('projects the shared BTW group into the fixed Chinese stage order', () => {
    const group = createGroup([
      createTab('post-agent', 'btw-session', { shortDramaStage: 'post' }),
      createTab('video-agent', 'btw-session', { shortDramaStage: 'video' }),
      createTab('storyboard-agent', 'btw-session', { shortDramaStage: 'storyboards' }),
      createTab('asset-agent', 'btw-session', { shortDramaStage: 'assets' }),
      createTab('script-agent', 'btw-session', { shortDramaStage: 'script' }),
    ]);
    const labels: Record<string, string> = {
      'shortDrama.tabs.script': '剧本',
      'shortDrama.tabs.assets': '资产',
      'shortDrama.tabs.storyboards': '分镜',
      'shortDrama.tabs.video': '视频',
      'shortDrama.tabs.post': '后期',
    };

    const projected = projectShortDramaTeamGroup(
      group,
      key => labels[key] ?? key,
    );

    expect(projected.tabs.map(tab => tab.id)).toEqual([
      'script-agent',
      'asset-agent',
      'storyboard-agent',
      'video-agent',
      'post-agent',
    ]);
    expect(projected.tabs.map(tab => tab.title)).toEqual([
      '剧本 AI',
      '资产 AI',
      '分镜 AI',
      '视频 AI',
      '后期 AI',
    ]);
    expect(projected.tabs.map(tab => tab.content.title)).toEqual([
      '剧本 AI',
      '资产 AI',
      '分镜 AI',
      '视频 AI',
      '后期 AI',
    ]);
    expect(projected.activeTabId).toBe(group.activeTabId);
  });
});

describe('selectShortDramaTeamLayoutRecovery', () => {
  const shortDramaTab = createTab(
    'short-drama',
    'short-drama-center',
    undefined,
    { workspacePath: 'C:/work' },
  );
  const misplacedScriptTab = createTab('script-agent', 'btw-session', {
    shortDramaStage: 'script',
    shortDramaWorkspacePath: 'C:/work',
  });
  const secondaryAssetTab = createTab('asset-agent', 'btw-session', {
    shortDramaStage: 'assets',
    shortDramaWorkspacePath: 'C:/work',
  });

  it('recovers the screenshot state by moving a misplaced primary stage agent into the existing team group', () => {
    expect(selectShortDramaTeamLayoutRecovery({
      presentation: 'minimal',
      splitMode: 'horizontal',
      primaryGroup: createGroup(
        [misplacedScriptTab, shortDramaTab],
        misplacedScriptTab.id,
      ),
      secondaryGroup: createGroup([secondaryAssetTab]),
    })).toEqual({
      status: 'recoverable',
      primarySurfaceTabId: shortDramaTab.id,
      misplacedTabs: [
        {
          tabId: misplacedScriptTab.id,
          fromGroupId: 'primary',
        },
      ],
    });
  });

  it('does not move sessions when the workspace identity differs or the team group contains unrelated content', () => {
    const foreignScriptTab = createTab('foreign-script-agent', 'btw-session', {
      shortDramaStage: 'script',
      shortDramaWorkspacePath: 'C:/other-workspace',
    });

    expect(selectShortDramaTeamLayoutRecovery({
      presentation: 'minimal',
      splitMode: 'horizontal',
      primaryGroup: createGroup([foreignScriptTab, shortDramaTab], foreignScriptTab.id),
      secondaryGroup: createGroup([secondaryAssetTab]),
    })).toEqual({ status: 'stable' });

    expect(selectShortDramaTeamLayoutRecovery({
      presentation: 'minimal',
      splitMode: 'horizontal',
      primaryGroup: createGroup(
        [misplacedScriptTab, shortDramaTab],
        misplacedScriptTab.id,
      ),
      secondaryGroup: createGroup([
        secondaryAssetTab,
        createTab('browser', 'browser'),
      ]),
    })).toEqual({ status: 'stable' });
  });

  it('leaves classic, non-horizontal, and already canonical layouts untouched', () => {
    const canonicalPrimary = createGroup([shortDramaTab]);
    const canonicalSecondary = createGroup([secondaryAssetTab]);

    expect(selectShortDramaTeamLayoutRecovery({
      presentation: 'classic',
      splitMode: 'horizontal',
      primaryGroup: createGroup(
        [misplacedScriptTab, shortDramaTab],
        misplacedScriptTab.id,
      ),
      secondaryGroup: canonicalSecondary,
    })).toEqual({ status: 'stable' });

    expect(selectShortDramaTeamLayoutRecovery({
      presentation: 'minimal',
      splitMode: 'grid',
      primaryGroup: createGroup(
        [misplacedScriptTab, shortDramaTab],
        misplacedScriptTab.id,
      ),
      secondaryGroup: canonicalSecondary,
    })).toEqual({ status: 'stable' });

    expect(selectShortDramaTeamLayoutRecovery({
      presentation: 'minimal',
      splitMode: 'horizontal',
      primaryGroup: canonicalPrimary,
      secondaryGroup: canonicalSecondary,
    })).toEqual({ status: 'stable' });
  });
});

describe('selectShortDramaTeamTabCloseAction', () => {
  const stageAgentTabs = [
    createTab('script-agent', 'btw-session', { shortDramaStage: 'script' }),
    createTab('asset-agent', 'btw-session', { shortDramaStage: 'assets' }),
  ];

  it('collapses instead of deleting the final visible team tab', () => {
    expect(selectShortDramaTeamTabCloseAction({
      groupId: 'secondary',
      tabId: 'script-agent',
      presentation: {
        status: 'ready',
        mode: 'open',
        tabs: [stageAgentTabs[0]],
        activeTabId: 'script-agent',
        primarySurfaceKey: 'short-drama-workspace:C:/work',
        teamIdentity: 'team',
      },
    })).toBe('collapse-team');
  });

  it('keeps ordinary close behavior when another team tab remains', () => {
    expect(selectShortDramaTeamTabCloseAction({
      groupId: 'secondary',
      tabId: 'script-agent',
      presentation: {
        status: 'ready',
        mode: 'open',
        tabs: stageAgentTabs,
        activeTabId: 'script-agent',
        primarySurfaceKey: 'short-drama-workspace:C:/work',
        teamIdentity: 'team',
      },
    })).toBe('close-tab');
  });

  it('never intercepts primary, classic, or unrelated tab closes', () => {
    const inactive = {
      status: 'inactive' as const,
      mode: 'closed' as const,
      reason: 'classic-presentation' as const,
      tabs: [] as const,
    };
    expect(selectShortDramaTeamTabCloseAction({
      groupId: 'primary',
      tabId: 'script-agent',
      presentation: inactive,
    })).toBe('close-tab');
    expect(selectShortDramaTeamTabCloseAction({
      groupId: 'secondary',
      tabId: 'ordinary-tab',
      presentation: inactive,
    })).toBe('close-tab');
  });
});
