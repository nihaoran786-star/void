import { describe, expect, it } from 'vitest';
import {
  teamLinkPath,
  teamMemberSlotHeight,
  teamNodePort,
  teamTopologyLayout,
  TEAM_COLUMN_GAP,
  TEAM_MEMBER_PITCH,
  TEAM_NODE_HEIGHT,
  TEAM_NODE_WIDTH,
  TEAM_WORKER_COLUMN_GAP,
  TEAM_WORKER_PITCH,
} from './teamTopologyLayout';

const node = (memberId: string, workerCount = 0, isExpanded = false) => ({
  memberId,
  workerCount,
  isExpanded,
});

const overlaps = (
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
) => a.x < b.x + b.width
  && b.x < a.x + a.width
  && a.y < b.y + b.height
  && b.y < a.y + a.height;

describe('teamTopologyLayout', () => {
  it('flows left to right: lead, then members, then their workers', () => {
    const layout = teamTopologyLayout([
      { memberId: 'a', workerCount: 2, isExpanded: true },
      node('b'),
    ]);
    const member = layout.members[0]!;

    expect(member.x - (layout.lead.x + layout.lead.width)).toBe(TEAM_COLUMN_GAP);
    member.workers.forEach(worker => {
      expect(worker.x - (member.x + member.width)).toBe(TEAM_WORKER_COLUMN_GAP);
    });
  });

  it('keeps every member on one column in roster order', () => {
    const layout = teamTopologyLayout([node('a'), node('b'), node('c')]);

    expect(layout.members.map(member => member.memberId)).toEqual(['a', 'b', 'c']);
    expect(new Set(layout.members.map(member => member.x)).size).toBe(1);
    layout.members.forEach((member, index) => {
      const next = layout.members[index + 1];
      if (next) expect(next.y).toBeGreaterThan(member.y);
    });
  });

  it('spaces collapsed members evenly and centres the lead on the column', () => {
    const layout = teamTopologyLayout([node('a'), node('b'), node('c')]);
    const [first, second, third] = layout.members;

    expect(second!.y - first!.y).toBe(TEAM_MEMBER_PITCH);
    expect(third!.y - second!.y).toBe(TEAM_MEMBER_PITCH);
    expect(layout.lead.y + layout.lead.height / 2).toBe(0);
    expect(Math.abs((first!.y + third!.y + TEAM_NODE_HEIGHT) / 2)).toBeLessThan(0.001);
  });

  it('never overlaps two nodes, including a member with workers revealed', () => {
    const layout = teamTopologyLayout([
      { memberId: 'a', workerCount: 4, isExpanded: true },
      node('b'),
      node('c'),
    ]);
    const all = [layout.lead, ...layout.members, ...layout.members.flatMap(m => m.workers)];

    all.forEach((entry, index) => {
      all.slice(index + 1).forEach(other => {
        expect(overlaps(entry, other)).toBe(false);
      });
    });
  });

  it('claims no room for the worker column until workers are revealed', () => {
    const hidden = teamTopologyLayout([node('a', 5), node('b')]);
    const shown = teamTopologyLayout([
      { memberId: 'a', workerCount: 5, isExpanded: true },
      node('b'),
    ]);

    expect(hidden.members[0]!.workers).toEqual([]);
    expect(shown.members[0]!.workers).toHaveLength(5);
    expect(shown.width).toBeGreaterThan(hidden.width);
    expect(shown.height).toBeGreaterThan(hidden.height);
  });

  it('centres a member on its own workers', () => {
    const layout = teamTopologyLayout([
      { memberId: 'a', workerCount: 3, isExpanded: true },
    ]);
    const member = layout.members[0]!;
    const centre = member.y + member.height / 2;

    expect(member.workers[1]!.y + member.workers[1]!.height / 2).toBe(centre);
    expect(member.workers[2]!.y - member.workers[0]!.y).toBe(TEAM_WORKER_PITCH * 2);
  });

  it('grows a member slot only once its workers are revealed', () => {
    expect(teamMemberSlotHeight(node('a', 9))).toBe(TEAM_MEMBER_PITCH);
    expect(teamMemberSlotHeight(node('a', 1, true))).toBe(TEAM_MEMBER_PITCH);
    expect(teamMemberSlotHeight(node('a', 4, true))).toBe(4 * TEAM_WORKER_PITCH);
  });

  it('puts ports on the middle of a node edge', () => {
    const layout = teamTopologyLayout([node('a')]);

    expect(teamNodePort(layout.lead, 'right'))
      .toEqual({ x: layout.lead.x + TEAM_NODE_WIDTH, y: 0 });
    expect(teamNodePort(layout.lead, 'left'))
      .toEqual({ x: layout.lead.x, y: 0 });
  });

  it('links two ports with a curve that leaves and arrives horizontally', () => {
    const path = teamLinkPath({ x: 0, y: 0 }, { x: 96, y: 40 });

    expect(path).toBe('M 0 0 C 48 0, 48 40, 96 40');
    expect(path).toContain('C');
    expect(path).not.toMatch(/[VHL]/);
  });

  it('handles an empty roster without producing a negative frame', () => {
    const layout = teamTopologyLayout([]);

    expect(layout.members).toEqual([]);
    expect(layout.width).toBeGreaterThan(0);
    expect(layout.height).toBeGreaterThan(0);
  });
});
