import { describe, expect, it } from 'vitest';
import type { CanvasTab, EditorGroupState } from '../types';
import { selectShortDramaTeamPanelPresentation } from './shortDramaTeamPanelPresentation';

const createTab = (
  id: string,
  type: CanvasTab['content']['type'],
  metadata?: Record<string, unknown>,
): CanvasTab => ({
  id,
  title: id,
  content: { type, title: id, data: {}, metadata },
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
  const shortDramaGroup = createGroup([createTab('short-drama', 'short-drama-center')]);
  const stageAgentTabs = [
    createTab('script-agent', 'btw-session', { shortDramaStage: 'script' }),
    createTab('asset-agent', 'btw-session', { shortDramaStage: 'assets' }),
  ];

  it('presents only a horizontal short-drama plus real stage-agent split as a team rail', () => {
    expect(selectShortDramaTeamPanelPresentation({
      splitMode: 'horizontal',
      primaryGroup: shortDramaGroup,
      secondaryGroup: createGroup(stageAgentTabs),
      expanded: false,
    })).toMatchObject({
      status: 'ready',
      mode: 'rail',
      activeTabId: 'script-agent',
      tabs: stageAgentTabs,
    });
  });

  it('keeps the same real tabs and active session when the presentation expands', () => {
    expect(selectShortDramaTeamPanelPresentation({
      splitMode: 'horizontal',
      primaryGroup: shortDramaGroup,
      secondaryGroup: createGroup(stageAgentTabs, 'asset-agent'),
      expanded: true,
    })).toMatchObject({
      status: 'ready',
      mode: 'open',
      activeTabId: 'asset-agent',
      tabs: stageAgentTabs,
    });
  });

  it('falls back to the unchanged editor layout when another secondary tool is present', () => {
    expect(selectShortDramaTeamPanelPresentation({
      splitMode: 'horizontal',
      primaryGroup: shortDramaGroup,
      secondaryGroup: createGroup([
        ...stageAgentTabs,
        createTab('browser', 'browser'),
      ]),
      expanded: false,
    })).toEqual({
      status: 'inactive',
      mode: 'closed',
      reason: 'secondary-has-mixed-content',
      tabs: [],
    });
  });

  it('does not reinterpret non-short-drama layouts', () => {
    expect(selectShortDramaTeamPanelPresentation({
      splitMode: 'horizontal',
      primaryGroup: createGroup([createTab('file', 'text-viewer')]),
      secondaryGroup: createGroup(stageAgentTabs),
      expanded: false,
    })).toMatchObject({
      status: 'inactive',
      mode: 'closed',
      reason: 'primary-is-not-short-drama',
    });
  });
});
