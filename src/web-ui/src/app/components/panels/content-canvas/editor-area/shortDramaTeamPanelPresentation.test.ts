import { describe, expect, it } from 'vitest';
import type { CanvasTab, EditorGroupState } from '../types';
import {
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
      primarySurfaceKey: 'short-drama:short-drama-center',
      teamIdentity: '["short-drama:short-drama-center","asset-agent","script-agent"]',
    });
  });

  it('keeps the same real tabs and active session when the presentation expands', () => {
    expect(selectShortDramaTeamPanelPresentation({
      presentation: 'minimal',
      splitMode: 'horizontal',
      primaryGroup: shortDramaGroup,
      secondaryGroup: createGroup(stageAgentTabs, 'asset-agent'),
      expandedPrimarySurfaceKey: 'short-drama:short-drama-center',
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

  it('uses the compact team rail while the short-drama media wall is active', () => {
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
      expandedPrimarySurfaceKey: 'short-drama:short-drama-center',
    })).toMatchObject({
      status: 'ready',
      mode: 'rail',
      activeTabId: 'script-agent',
      primarySurfaceKey: 'short-drama-media:workspace-media-gallery',
    });
  });

  it('scopes an explicit expansion to the active primary workspace surface', () => {
    const mediaGroup = createGroup([
      createTab(
        'short-drama-media',
        'workspace-media-gallery',
        undefined,
        { workspacePath: 'C:/work' },
      ),
    ]);
    const mediaSurfaceKey = 'short-drama-media:workspace-media-gallery';

    expect(selectShortDramaTeamPanelPresentation({
      presentation: 'minimal',
      splitMode: 'horizontal',
      primaryGroup: mediaGroup,
      secondaryGroup: createGroup(stageAgentTabs),
      expandedPrimarySurfaceKey: mediaSurfaceKey,
    })).toMatchObject({
      status: 'ready',
      mode: 'open',
      primarySurfaceKey: mediaSurfaceKey,
    });
    expect(selectShortDramaTeamPanelPresentation({
      presentation: 'minimal',
      splitMode: 'horizontal',
      primaryGroup: shortDramaGroup,
      secondaryGroup: createGroup(stageAgentTabs),
      expandedPrimarySurfaceKey: mediaSurfaceKey,
    })).toMatchObject({
      status: 'ready',
      mode: 'rail',
      primarySurfaceKey: 'short-drama:short-drama-center',
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
      expandedPrimarySurfaceKey: 'short-drama:short-drama-center',
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
