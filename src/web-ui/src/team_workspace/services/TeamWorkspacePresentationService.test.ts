import { beforeEach, describe, expect, it } from 'vitest';
import {
  openTeamMemberByAgentId,
  openTeamMemberByChildSession,
  resolveTeamCanvasCapability,
  useTeamWorkspacePresentationStore,
} from './TeamWorkspacePresentationService';
import type { TeamWorkspaceSnapshot } from '../types';

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

  it('语义相同的快照不重复发布成员展示状态', () => {
    const snapshot = {
      parentSessionId: 'parent-1',
      activeTeam: {
        members: [{
          definition: { memberId: 'member-1', agentId: 'ScriptAI' },
          childSessionId: 'child-1',
        }],
      },
    } as TeamWorkspaceSnapshot;
    const store = useTeamWorkspacePresentationStore.getState();
    store.activateBinding('parent-1', 'binding-1', snapshot);
    const initialPresentation = useTeamWorkspacePresentationStore
      .getState().sessions['parent-1'];
    let publications = 0;
    const unsubscribe = useTeamWorkspacePresentationStore.subscribe(() => {
      publications += 1;
    });

    store.activateBinding(
      'parent-1',
      'binding-1',
      structuredClone(snapshot),
    );
    store.registerSnapshot(structuredClone(snapshot));

    unsubscribe();
    expect(publications).toBe(0);
    expect(useTeamWorkspacePresentationStore.getState().sessions['parent-1'])
      .toBe(initialPresentation);
  });

  it('关闭重开和重复选择不丢成员路由且不发布同值状态', () => {
    const store = useTeamWorkspacePresentationStore.getState();
    store.activateBinding('parent-1', 'binding-1');
    store.selectMember('parent-1', 'member-1');
    store.close('parent-1');
    let publications = 0;
    const unsubscribe = useTeamWorkspacePresentationStore.subscribe(() => {
      publications += 1;
    });

    store.close('parent-1');
    expect(publications).toBe(0);
    store.open('parent-1');
    expect(publications).toBe(1);
    store.open('parent-1');
    store.selectMember('parent-1', 'member-1');
    expect(publications).toBe(1);

    unsubscribe();
    expect(useTeamWorkspacePresentationStore.getState().sessions['parent-1'])
      .toMatchObject({ isOpen: true, selectedMemberId: 'member-1' });
  });

  it('同一会话切换团队时重置成员路由，不影响其他会话的团队展示', () => {
    const store = useTeamWorkspacePresentationStore.getState();
    store.activateBinding('parent-1', 'binding-1');
    store.selectMember('parent-1', 'member-1');
    store.close('parent-1');
    store.activateBinding('parent-2', 'binding-2');
    store.selectMember('parent-2', 'member-2');

    store.activateBinding('parent-1', 'binding-next');

    expect(useTeamWorkspacePresentationStore.getState().sessions).toMatchObject({
      'parent-1': {
        bindingKey: 'binding-next',
        isOpen: true,
        selectedMemberId: null,
      },
      'parent-2': {
        bindingKey: 'binding-2',
        isOpen: true,
        selectedMemberId: 'member-2',
      },
    });
  });
});
