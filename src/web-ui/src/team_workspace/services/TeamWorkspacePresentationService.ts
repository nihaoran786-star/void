import { create } from 'zustand';
import { SHORT_DRAMA_TEAM_CATALOG_ID } from '@/shared/services/customization/fixedTeamIds';
import type { TeamWorkspaceSnapshot } from '../types';

interface TeamMemberPresentationIndex {
  memberId: string;
  childSessionId?: string;
  agentId?: string;
}

interface TeamWorkspacePresentation {
  bindingKey: string;
  isOpen: boolean;
  selectedMemberId: string | null;
  members: TeamMemberPresentationIndex[];
}

interface TeamWorkspacePresentationState {
  sessions: Record<string, TeamWorkspacePresentation>;
  activateBinding: (
    sessionId: string,
    bindingKey: string,
    snapshot?: TeamWorkspaceSnapshot,
  ) => void;
  registerSnapshot: (snapshot: TeamWorkspaceSnapshot) => void;
  open: (sessionId: string, memberId?: string) => void;
  close: (sessionId: string) => void;
  selectMember: (sessionId: string, memberId: string | null) => void;
}

const membersFromSnapshot = (
  snapshot?: TeamWorkspaceSnapshot,
): TeamMemberPresentationIndex[] => snapshot?.activeTeam?.members.map(member => ({
  memberId: member.definition.memberId,
  childSessionId: member.childSessionId,
  agentId: member.definition.agentId,
})) ?? [];

const membersAreEqual = (
  left: readonly TeamMemberPresentationIndex[],
  right: readonly TeamMemberPresentationIndex[],
): boolean => left.length === right.length && left.every((member, index) => {
  const candidate = right[index];
  return member.memberId === candidate?.memberId
    && member.childSessionId === candidate.childSessionId
    && member.agentId === candidate.agentId;
});

export const useTeamWorkspacePresentationStore =
  create<TeamWorkspacePresentationState>((set) => ({
    sessions: {},
    activateBinding: (sessionId, bindingKey, snapshot) => set(state => {
      const current = state.sessions[sessionId];
      if (current?.bindingKey === bindingKey) {
        if (!snapshot) return state;
        const members = membersFromSnapshot(snapshot);
        if (membersAreEqual(current.members, members)) return state;
        return {
          sessions: {
            ...state.sessions,
            [sessionId]: {
              ...current,
              members,
            },
          },
        };
      }
      return {
        sessions: {
          ...state.sessions,
          [sessionId]: {
            bindingKey,
            isOpen: true,
            selectedMemberId: null,
            members: membersFromSnapshot(snapshot),
          },
        },
      };
    }),
    registerSnapshot: snapshot => set(state => {
      const current = state.sessions[snapshot.parentSessionId];
      if (!current) return state;
      const members = membersFromSnapshot(snapshot);
      if (membersAreEqual(current.members, members)) return state;
      return {
        sessions: {
          ...state.sessions,
          [snapshot.parentSessionId]: {
            ...current,
            members,
          },
        },
      };
    }),
    open: (sessionId, memberId) => set(state => {
      const current = state.sessions[sessionId];
      if (!current) return state;
      const selectedMemberId = memberId ?? current.selectedMemberId;
      if (current.isOpen && current.selectedMemberId === selectedMemberId) {
        return state;
      }
      return {
        sessions: {
          ...state.sessions,
          [sessionId]: {
            ...current,
            isOpen: true,
            selectedMemberId,
          },
        },
      };
    }),
    close: sessionId => set(state => {
      const current = state.sessions[sessionId];
      if (!current || !current.isOpen) return state;
      return {
        sessions: {
          ...state.sessions,
          [sessionId]: { ...current, isOpen: false },
        },
      };
    }),
    selectMember: (sessionId, memberId) => set(state => {
      const current = state.sessions[sessionId];
      if (!current) return state;
      if (current.isOpen && current.selectedMemberId === memberId) return state;
      return {
        sessions: {
          ...state.sessions,
          [sessionId]: {
            ...current,
            isOpen: true,
            selectedMemberId: memberId,
          },
        },
      };
    }),
  }));

export function openTeamMemberByChildSession(
  parentSessionId: string,
  childSessionId: string,
): boolean {
  const store = useTeamWorkspacePresentationStore.getState();
  const presentation = store.sessions[parentSessionId];
  const member = presentation?.members.find(
    candidate => candidate.childSessionId === childSessionId,
  );
  if (!member) return false;
  store.open(parentSessionId, member.memberId);
  return true;
}

export function openTeamMemberByAgentId(
  parentSessionId: string,
  agentId: string,
): boolean {
  const store = useTeamWorkspacePresentationStore.getState();
  const presentation = store.sessions[parentSessionId];
  const member = presentation?.members.find(
    candidate => candidate.agentId === agentId,
  );
  if (!member) return false;
  store.open(parentSessionId, member.memberId);
  return true;
}

export type TeamCanvasCapability = 'short-drama' | null;

export function resolveTeamCanvasCapability(
  teamDefinitionId?: string | null,
): TeamCanvasCapability {
  return teamDefinitionId === SHORT_DRAMA_TEAM_CATALOG_ID
    ? 'short-drama'
    : null;
}
