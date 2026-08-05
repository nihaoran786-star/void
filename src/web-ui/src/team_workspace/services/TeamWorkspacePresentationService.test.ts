import { beforeEach, describe, expect, it } from 'vitest';
import {
  openTeamMemberByAgentId,
  openTeamMemberByChildSession,
  resolveTeamCanvasCapability,
  useTeamWorkspacePresentationStore,
} from './TeamWorkspacePresentationService';

describe('TeamWorkspacePresentationService', () => {
  beforeEach(() => {
    useTeamWorkspacePresentationStore.setState({ sessions: {} });
  });

  it('opens a newly bound Team by default and keeps one selected member route', () => {
    const store = useTeamWorkspacePresentationStore.getState();
    store.activateBinding('parent-1', 'binding-1');
    useTeamWorkspacePresentationStore.setState(state => ({
      sessions: {
        ...state.sessions,
        'parent-1': {
          ...state.sessions['parent-1']!,
          members: [{
            memberId: 'member-1',
            childSessionId: 'child-1',
            agentId: 'ScriptAI',
          }],
        },
      },
    }));

    expect(openTeamMemberByChildSession('parent-1', 'child-1')).toBe(true);
    expect(openTeamMemberByAgentId('parent-1', 'ScriptAI')).toBe(true);
    expect(useTeamWorkspacePresentationStore.getState().sessions['parent-1'])
      .toMatchObject({ isOpen: true, selectedMemberId: 'member-1' });
  });

  it('maps only the flagship short-drama Team to its dedicated canvas', () => {
    expect(resolveTeamCanvasCapability(
      'custom-00000000000000000000000000000001',
    )).toBe('short-drama');
    expect(resolveTeamCanvasCapability('custom-other')).toBeNull();
  });
});
