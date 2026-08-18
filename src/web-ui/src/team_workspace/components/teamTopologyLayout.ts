/**
 * Pure geometry for the Team topology.
 *
 * The map is a left-to-right flow graph: the lead on the left, every
 * specialist in a column to its right, and each member's delegated workers in
 * a further column to theirs. Nodes are rectangular cards with a port on each
 * side; links leave and arrive horizontally.
 *
 * Keeping the maths here means the layout contract — reading order, even
 * spacing, no overlap — can be tested without a DOM.
 */

export const TEAM_NODE_WIDTH = 132;
export const TEAM_NODE_HEIGHT = 52;
export const TEAM_WORKER_NODE_WIDTH = 108;
export const TEAM_WORKER_NODE_HEIGHT = 36;
/** Gap between the lead column and the member column. */
export const TEAM_COLUMN_GAP = 96;
/** Gap between the member column and the worker column. */
export const TEAM_WORKER_COLUMN_GAP = 76;
/** Vertical pitch between two member nodes, label included. */
export const TEAM_MEMBER_PITCH = 84;
/** Vertical pitch between a member's workers. */
export const TEAM_WORKER_PITCH = 46;

export interface TeamTopologyInput {
  memberId: string;
  workerCount: number;
  isExpanded: boolean;
}

export interface TeamTopologyNode {
  /** Top-left corner. */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TeamTopologyMemberNode extends TeamTopologyNode {
  memberId: string;
  workers: TeamTopologyNode[];
}

export interface TeamTopologyLayout {
  lead: TeamTopologyNode;
  members: TeamTopologyMemberNode[];
  width: number;
  height: number;
}

/** The vertical room one member needs, including any revealed workers. */
export function teamMemberSlotHeight(input: TeamTopologyInput): number {
  const workers = input.isExpanded ? input.workerCount : 0;
  return Math.max(TEAM_MEMBER_PITCH, workers * TEAM_WORKER_PITCH);
}

/** The port a link leaves from or arrives at, on a node's vertical middle. */
export function teamNodePort(
  node: TeamTopologyNode,
  side: 'left' | 'right',
): { x: number; y: number } {
  return {
    x: side === 'left' ? node.x : node.x + node.width,
    y: node.y + node.height / 2,
  };
}

export function teamTopologyLayout(inputs: TeamTopologyInput[]): TeamTopologyLayout {
  const slots = inputs.map(teamMemberSlotHeight);
  const stackHeight = slots.reduce((total, slot) => total + slot, 0);
  const hasVisibleWorkers = inputs.some(
    input => input.isExpanded && input.workerCount > 0,
  );

  const width = TEAM_NODE_WIDTH
    + TEAM_COLUMN_GAP
    + TEAM_NODE_WIDTH
    + (hasVisibleWorkers ? TEAM_WORKER_COLUMN_GAP + TEAM_WORKER_NODE_WIDTH : 0);

  const leadX = -width / 2;
  const memberX = leadX + TEAM_NODE_WIDTH + TEAM_COLUMN_GAP;
  const workerX = memberX + TEAM_NODE_WIDTH + TEAM_WORKER_COLUMN_GAP;

  const members: TeamTopologyMemberNode[] = [];
  let cursor = -stackHeight / 2;
  inputs.forEach((input, index) => {
    const slot = slots[index]!;
    const centre = cursor + slot / 2;
    const workerCount = input.isExpanded ? input.workerCount : 0;
    const workers: TeamTopologyNode[] = Array.from(
      { length: workerCount },
      (_unused, workerIndex) => ({
        x: workerX,
        y: centre
          + (workerIndex - (workerCount - 1) / 2) * TEAM_WORKER_PITCH
          - TEAM_WORKER_NODE_HEIGHT / 2,
        width: TEAM_WORKER_NODE_WIDTH,
        height: TEAM_WORKER_NODE_HEIGHT,
      }),
    );
    members.push({
      memberId: input.memberId,
      x: memberX,
      y: centre - TEAM_NODE_HEIGHT / 2,
      width: TEAM_NODE_WIDTH,
      height: TEAM_NODE_HEIGHT,
      workers,
    });
    cursor += slot;
  });

  return {
    lead: {
      x: leadX,
      y: -TEAM_NODE_HEIGHT / 2,
      width: TEAM_NODE_WIDTH,
      height: TEAM_NODE_HEIGHT,
    },
    members,
    width,
    height: Math.max(stackHeight, TEAM_MEMBER_PITCH),
  };
}

/**
 * A smooth link between two ports: horizontal where it leaves and where it
 * arrives, so the graph reads as flow rather than as arrows.
 */
export function teamLinkPath(
  from: { x: number; y: number },
  to: { x: number; y: number },
): string {
  const control = Math.max(24, (to.x - from.x) / 2);
  return `M ${from.x} ${from.y} C ${from.x + control} ${from.y}, ${to.x - control} ${to.y}, ${to.x} ${to.y}`;
}
