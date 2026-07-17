export type ShortDramaTeamAgentStatus =
  | 'waiting'
  | 'live'
  | 'attention'
  | 'completed'
  | 'cancelled'
  | 'failed';

export type ShortDramaTeamAgentActivity =
  | 'waiting_model'
  | 'streaming'
  | 'waiting_tool'
  | 'running_tool'
  | 'waiting_permission'
  | 'saving'
  | 'recovering'
  | 'needs_attention';

export interface ShortDramaTeamAgentStatusTarget {
  tabId: string;
  sessionId?: string;
}

export interface ShortDramaTeamAgentStatusProjection {
  tabId: string;
  status: ShortDramaTeamAgentStatus;
  activity?: ShortDramaTeamAgentActivity;
}

export function areShortDramaTeamStatusProjectionsEqual(
  left: readonly ShortDramaTeamAgentStatusProjection[],
  right: readonly ShortDramaTeamAgentStatusProjection[],
): boolean {
  return (
    left.length === right.length
    && left.every((item, index) => {
      const other = right[index];
      return (
        item.tabId === other?.tabId
        && item.status === other.status
        && item.activity === other.activity
      );
    })
  );
}
