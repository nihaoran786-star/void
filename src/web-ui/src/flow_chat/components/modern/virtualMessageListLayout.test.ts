import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  HISTORICAL_SESSION_DEFAULT_ITEM_HEIGHT_PX,
  HISTORICAL_SESSION_MODEL_ROUND_DEFAULT_ITEM_HEIGHT_PX,
  LIVE_SESSION_DEFAULT_ITEM_HEIGHT_PX,
  MAX_COLLAPSE_RESERVATION_VIEWPORT_RATIO,
  UNSIGNALLED_TAIL_OSCILLATION_DEAD_BAND_PX,
  shouldProtectUnsignalledShrink,
  computeCollapseReservationPx,
  computeReaderAnchorCorrection,
  estimateTextHeightFromLength,
  estimateVirtualMessageItemHeight,
  getVirtualMessageDefaultItemHeight,
  getVirtualMessageDefaultItemHeightForSession,
  hasCompactHistoricalProjection,
  hasInitialHistoryModelRoundProjection,
  mapInitialHistoryExpansionScrollTop,
  selectInitialHistoryRenderWindow,
} from './virtualMessageListLayout';
import type { FlowTextItem, FlowToolItem } from '../../types/flow-chat';
import type { VirtualItem } from '../../store/modernFlowChatStore';

function makeUserMessage(content = 'short prompt'): VirtualItem {
  return {
    type: 'user-message',
    turnId: 'turn-user',
    data: {
      id: 'user-1',
      content,
      timestamp: 1,
    },
  };
}

function makeTextItem(content: string): FlowTextItem {
  return {
    id: 'text-1',
    type: 'text',
    content,
    isStreaming: false,
    isMarkdown: true,
    timestamp: 1,
    status: 'completed',
  };
}

function makeToolItem(): FlowToolItem {
  return {
    id: 'tool-1',
    type: 'tool',
    toolName: 'Read',
    timestamp: 2,
    status: 'completed',
    toolCall: {
      id: 'tool-1',
      input: { file_path: 'src/main.ts' },
    },
    toolResult: {
      success: true,
      result: 'file contents',
    },
  };
}

function makeModelRound(items = [makeTextItem('assistant text')]): VirtualItem {
  return {
    type: 'model-round',
    turnId: 'turn-model',
    isLastRound: true,
    isTurnComplete: true,
    data: {
      id: 'round-1',
      index: 0,
      items,
      isStreaming: false,
      isComplete: true,
      status: 'completed',
      startTime: 1,
    },
  };
}

function makeExploreGroup(count = 3): VirtualItem {
  return {
    type: 'explore-group',
    turnId: 'turn-explore',
    data: {
      groupId: 'explore-1',
      rounds: [],
      allItems: Array.from({ length: count }, (_, index) => makeToolItemWithId(`tool-${index}`)),
      stats: {
        readCount: count,
        searchCount: 0,
        commandCount: 0,
      },
      isGroupStreaming: false,
      isLastGroupInTurn: true,
      wasCutByCritical: false,
    },
  };
}

function makeUserMessageForTurn(turnIndex: number): VirtualItem {
  const turnId = `turn-${turnIndex}`;
  return {
    type: 'user-message',
    turnId,
    data: {
      id: `user-${turnId}`,
      content: `prompt ${turnIndex}`,
      timestamp: turnIndex,
    },
  };
}

function makeModelRoundForTurn(turnIndex: number, textLength = 2000): VirtualItem {
  const turnId = `turn-${turnIndex}`;
  return {
    type: 'model-round',
    turnId,
    isLastRound: true,
    isTurnComplete: true,
    data: {
      id: `round-${turnId}`,
      index: 0,
      status: 'completed',
      isStreaming: false,
      isComplete: true,
      startTime: turnIndex,
      items: [makeTextItem('x'.repeat(textLength))],
    },
  };
}

function makeExploreGroupForTurn(turnIndex: number): VirtualItem {
  return {
    ...makeExploreGroup(1),
    turnId: `turn-${turnIndex}`,
    data: {
      ...makeExploreGroup(1).data,
      groupId: `explore-turn-${turnIndex}`,
    },
  };
}

function makeToolItemWithId(id: string): FlowToolItem {
  return {
    ...makeToolItem(),
    id,
    toolCall: {
      id,
      input: { file_path: `${id}.ts` },
    },
  };
}

describe('getVirtualMessageDefaultItemHeight', () => {
  it('keeps live sessions on the legacy item height', () => {
    expect(getVirtualMessageDefaultItemHeight({
      isHistorical: false,
      hasCompactHistoricalProjection: false,
      hasInitialHistoryModelRoundProjection: false,
    })).toBe(LIVE_SESSION_DEFAULT_ITEM_HEIGHT_PX);
  });

  it('keeps live sessions on the legacy item height even if projection flags are present', () => {
    expect(getVirtualMessageDefaultItemHeight({
      isHistorical: false,
      hasCompactHistoricalProjection: true,
      hasInitialHistoryModelRoundProjection: true,
    })).toBe(LIVE_SESSION_DEFAULT_ITEM_HEIGHT_PX);
  });

  it('uses compact historical height for historical user/explore projections', () => {
    expect(getVirtualMessageDefaultItemHeight({
      isHistorical: true,
      hasCompactHistoricalProjection: true,
      hasInitialHistoryModelRoundProjection: false,
    })).toBe(HISTORICAL_SESSION_DEFAULT_ITEM_HEIGHT_PX);
  });

  it('uses tall historical model-round height when projected history contains model rounds', () => {
    expect(getVirtualMessageDefaultItemHeight({
      isHistorical: true,
      hasCompactHistoricalProjection: false,
      hasInitialHistoryModelRoundProjection: true,
    })).toBe(HISTORICAL_SESSION_MODEL_ROUND_DEFAULT_ITEM_HEIGHT_PX);
  });
});

describe('estimateVirtualMessageItemHeight', () => {
  it('estimates text height directly from length', () => {
    expect(estimateTextHeightFromLength(0, 72, 30)).toBe(102);
    expect(estimateTextHeightFromLength(60, 72, 30)).toBe(102);
    expect(estimateTextHeightFromLength(61, 72, 30)).toBe(132);
  });

  it('keeps compact user rows below the legacy live estimate', () => {
    expect(estimateVirtualMessageItemHeight(makeUserMessage())).toBeLessThan(LIVE_SESSION_DEFAULT_ITEM_HEIGHT_PX);
  });

  it('uses content-aware estimates for large model rounds', () => {
    expect(estimateVirtualMessageItemHeight(
      makeModelRound([makeTextItem('x'.repeat(3600)), makeToolItem()]),
    )).toBeGreaterThan(1000);
  });

  it('estimates explore groups from every row, since the region no longer clips', () => {
    expect(estimateVirtualMessageItemHeight(makeExploreGroup(12))).toBe(384);
    expect(estimateVirtualMessageItemHeight(makeExploreGroup(30))).toBe(816);
  });

  it('bounds the explore group estimate for pathological groups', () => {
    expect(estimateVirtualMessageItemHeight(makeExploreGroup(400))).toBe(1200);
  });

  it('keeps image-analyzing items on the live legacy estimate', () => {
    expect(estimateVirtualMessageItemHeight({
      type: 'image-analyzing',
      turnId: 'turn-image',
    })).toBe(LIVE_SESSION_DEFAULT_ITEM_HEIGHT_PX);
  });
});

describe('historical projection classification', () => {
  it('detects compact historical tails made of user and explore rows', () => {
    const items = [
      makeUserMessage('1'),
      makeExploreGroup(1),
      makeUserMessage('2'),
      makeExploreGroup(2),
      makeUserMessage('3'),
      makeExploreGroup(3),
    ];

    expect(hasCompactHistoricalProjection(items)).toBe(true);
    expect(hasInitialHistoryModelRoundProjection(items)).toBe(false);
  });

  it('does not classify tails with model rounds as compact', () => {
    const items = [
      makeUserMessage('1'),
      makeExploreGroup(1),
      makeUserMessage('2'),
      makeExploreGroup(2),
      makeUserMessage('3'),
      makeModelRound(),
    ];

    expect(hasCompactHistoricalProjection(items)).toBe(false);
    expect(hasInitialHistoryModelRoundProjection(items)).toBe(true);
  });
});

describe('getVirtualMessageDefaultItemHeightForSession', () => {
  it('keeps live sessions on the legacy estimate even when model rounds are present', () => {
    expect(getVirtualMessageDefaultItemHeightForSession({
      isHistorical: false,
      items: [makeUserMessage(), makeModelRound()],
    })).toBe(LIVE_SESSION_DEFAULT_ITEM_HEIGHT_PX);
  });

  it('uses compact estimates for historical user/explore tails', () => {
    expect(getVirtualMessageDefaultItemHeightForSession({
      isHistorical: true,
      items: [
        makeUserMessage('1'),
        makeExploreGroup(1),
        makeUserMessage('2'),
        makeExploreGroup(2),
        makeUserMessage('3'),
        makeExploreGroup(3),
      ],
    })).toBe(HISTORICAL_SESSION_DEFAULT_ITEM_HEIGHT_PX);
  });

  it('uses tall model-round estimates for historical model-round tails', () => {
    expect(getVirtualMessageDefaultItemHeightForSession({
      isHistorical: true,
      items: [makeUserMessage(), makeModelRound()],
    })).toBe(HISTORICAL_SESSION_MODEL_ROUND_DEFAULT_ITEM_HEIGHT_PX);
  });
});

describe('selectInitialHistoryRenderWindow', () => {
  it('keeps only the latest render window on large historical tails', () => {
    const items = Array.from({ length: 8 }, (_, index) => [
      makeUserMessageForTurn(index),
      makeModelRoundForTurn(index),
    ]).flat();

    const window = selectInitialHistoryRenderWindow(items);

    expect(window.startIndex).toBeGreaterThan(0);
    expect(window.items.length).toBeLessThan(items.length);
    expect(window.items[0]?.turnId).toBe('turn-6');
    expect(window.items.at(-1)?.turnId).toBe('turn-7');
    expect(window.omittedEstimatedHeightPx).toBeGreaterThan(0);
    expect(window.trailingOmittedEstimatedHeightPx).toBe(0);
    expect(window.renderedEstimatedHeightPx).toBeGreaterThan(0);
    expect(window.totalEstimatedHeightPx).toBeGreaterThan(window.renderedEstimatedHeightPx);
    expect(window.isWindowed).toBe(true);
  });

  it('keeps an extra previous turn when the latest turn is user-only', () => {
    const items = [
      ...Array.from({ length: 7 }, (_, index) => [
        makeUserMessageForTurn(index),
        makeExploreGroupForTurn(index),
        makeModelRoundForTurn(index),
      ]).flat(),
      makeUserMessageForTurn(7),
    ];

    const window = selectInitialHistoryRenderWindow(items);
    const renderedTurnIds = Array.from(new Set(window.items.map(item => item.turnId)));

    expect(renderedTurnIds).toEqual(['turn-5', 'turn-6', 'turn-7']);
    expect(window.items[0]?.turnId).toBe('turn-5');
    expect(window.omittedEstimatedHeightPx).toBeGreaterThan(0);
  });

  it('keeps all items when the historical tail is already small', () => {
    const items = [
      makeUserMessageForTurn(0),
      makeModelRoundForTurn(0),
      makeUserMessageForTurn(1),
      makeModelRoundForTurn(1),
    ];

    const window = selectInitialHistoryRenderWindow(items);

    expect(window.startIndex).toBe(0);
    expect(window.items).toHaveLength(items.length);
    expect(window.omittedEstimatedHeightPx).toBe(0);
    expect(window.trailingOmittedEstimatedHeightPx).toBe(0);
    expect(window.isWindowed).toBe(false);
  });
});

describe('mapInitialHistoryExpansionScrollTop', () => {
  const base = {
    previousScrollHeight: 5000,
    nextScrollHeight: 5600,
    omittedEstimatedHeightPx: 3000,
    clientHeight: 1000,
  };

  it('keeps a direct jump to the omitted history top at the real top', () => {
    expect(mapInitialHistoryExpansionScrollTop({
      ...base,
      previousScrollTop: 0,
      wasAtBottom: false,
    })).toBe(0);
  });

  it('maps positions inside the omitted history spacer by ratio', () => {
    expect(mapInitialHistoryExpansionScrollTop({
      ...base,
      previousScrollTop: 1500,
      wasAtBottom: false,
    })).toBe(1800);
  });

  it('keeps visible tail content stable after the omitted spacer boundary', () => {
    expect(mapInitialHistoryExpansionScrollTop({
      ...base,
      previousScrollTop: 3400,
      wasAtBottom: false,
    })).toBe(4000);
  });

  it('keeps bottom-pinned sessions at the new physical bottom', () => {
    expect(mapInitialHistoryExpansionScrollTop({
      ...base,
      previousScrollTop: 4000,
      wasAtBottom: true,
    })).toBe(4600);
  });
});

describe('VirtualMessageList integration boundary', () => {
  it('gates the initial history window UI without upstream high-risk virtualization shortcuts', () => {
    const currentDir = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(join(currentDir, 'VirtualMessageList.tsx'), 'utf8');

    expect(source).toContain('getVirtualMessageDefaultItemHeightForSession');
    expect(source).toContain('defaultItemHeight={defaultItemHeight}');
    expect(source).toContain('selectInitialHistoryRenderWindow');
    expect(source).toContain('virtual-message-list__static-scroller');
    expect(source).toContain('initial-history-spacer');
    expect(source).not.toContain('heightEstimates=');
    expect(source).not.toContain('firstItemIndex=');
    expect(source).toContain('history-projection-handoff-overlay');
  });
});

describe('computeReaderAnchorCorrection', () => {
  const base = {
    currentScrollTop: 4000,
    scrollHeight: 20000,
    clientHeight: 800,
    anchoredOffsetTop: 120,
  };

  it('pulls the anchored line back down when content above it shrank', () => {
    // The line the reader is on moved up by 300px, so the viewport has to
    // follow it up by the same amount to leave it visually untouched.
    expect(computeReaderAnchorCorrection({ ...base, currentOffsetTop: -180 }))
      .toBe(3700);
  });

  it('pushes the anchored line back up when content above it grew', () => {
    expect(computeReaderAnchorCorrection({ ...base, currentOffsetTop: 420 }))
      .toBe(4300);
  });

  it('ignores sub-pixel drift rather than writing a fighting scroll', () => {
    expect(computeReaderAnchorCorrection({ ...base, currentOffsetTop: 120.4 }))
      .toBeNull();
    expect(computeReaderAnchorCorrection({ ...base, currentOffsetTop: 120 }))
      .toBeNull();
  });

  it('clamps to the scrollable range instead of overshooting', () => {
    expect(computeReaderAnchorCorrection({
      ...base,
      currentScrollTop: 100,
      currentOffsetTop: -900,
    })).toBe(0);

    expect(computeReaderAnchorCorrection({
      ...base,
      currentScrollTop: 19000,
      currentOffsetTop: 1500,
    })).toBe(19200);
  });

  it('refuses a correction bigger than the viewport', () => {
    // A drift this large means the anchored item is no longer what it was —
    // most often because the virtualizer recycled its wrapper. Acting on it
    // would throw the reader somewhere they never asked to be.
    expect(computeReaderAnchorCorrection({
      ...base,
      currentOffsetTop: 3200,
      maxCorrectionPx: 800,
    })).toBeNull();

    // Just inside the limit still corrects.
    expect(computeReaderAnchorCorrection({
      ...base,
      currentOffsetTop: 820,
      maxCorrectionPx: 800,
    })).toBe(4700);
  });

  it('is independent of total content height', () => {
    // Virtuoso swapping an estimated item height for a real one changes
    // scrollHeight without moving anything on screen. That must not produce a
    // correction.
    const unchangedOffset = { ...base, currentOffsetTop: base.anchoredOffsetTop };
    expect(computeReaderAnchorCorrection({ ...unchangedOffset, scrollHeight: 20000 }))
      .toBeNull();
    expect(computeReaderAnchorCorrection({ ...unchangedOffset, scrollHeight: 14000 }))
      .toBeNull();
  });
});

describe('computeCollapseReservationPx', () => {
  const VIEWPORT_PX = 800;
  const CAP_PX = VIEWPORT_PX * MAX_COLLAPSE_RESERVATION_VIEWPORT_RATIO;

  const base = {
    currentPx: 0,
    requestedPx: 0,
    viewportHeightPx: VIEWPORT_PX,
    hasCollapseIntent: false,
    isFollowingOutput: false,
  };

  it('grants a modest signalled reservation in full', () => {
    expect(computeCollapseReservationPx({
      ...base,
      requestedPx: 120,
      hasCollapseIntent: true,
    })).toBe(120);
  });

  it('never reserves more than half a viewport', () => {
    // A markdown table that streamed in as ~2000px of raw text and then laid
    // out as a compact table asks for its whole shrink back. Granting it is
    // what parks a screen-sized blank region under the newest message.
    expect(computeCollapseReservationPx({
      ...base,
      requestedPx: 2000,
      hasCollapseIntent: true,
    })).toBe(CAP_PX);

    expect(computeCollapseReservationPx({
      ...base,
      currentPx: 300,
      requestedPx: 2000,
      isFollowingOutput: false,
    })).toBe(CAP_PX);
  });

  it('does not grow for an unsignalled shrink while following output', () => {
    // Follow mode's contract is "the tail stays at the bottom of the viewport",
    // so an unsignalled shrink there needs no upper-anchor protection.
    expect(computeCollapseReservationPx({
      ...base,
      currentPx: 0,
      requestedPx: 900,
      isFollowingOutput: true,
    })).toBe(0);

    // An existing reservation is kept (capped), never extended.
    expect(computeCollapseReservationPx({
      ...base,
      currentPx: 120,
      requestedPx: 900,
      isFollowingOutput: true,
    })).toBe(120);
    expect(computeCollapseReservationPx({
      ...base,
      currentPx: 1200,
      requestedPx: 1600,
      isFollowingOutput: true,
    })).toBe(CAP_PX);
  });

  it('keeps signalled collapse protection intact while following output', () => {
    // Auto-collapsing a tool card above the viewport during streaming must
    // still be compensated, otherwise the conversation visibly sinks down.
    expect(computeCollapseReservationPx({
      ...base,
      requestedPx: 240,
      hasCollapseIntent: true,
      isFollowingOutput: true,
    })).toBe(240);
  });

  it('never returns a negative or non-finite reservation', () => {
    expect(computeCollapseReservationPx({ ...base, requestedPx: -50 })).toBe(0);
    expect(computeCollapseReservationPx({
      ...base,
      requestedPx: 100,
      viewportHeightPx: 0,
    })).toBe(0);
    expect(computeCollapseReservationPx({
      ...base,
      currentPx: -10,
      requestedPx: 100,
      isFollowingOutput: true,
    })).toBe(0);
  });
});

describe('tail oscillation while the model is thinking', () => {
  // While the model thinks, the last item in the transcript wobbles by a pixel
  // or two several times a second: a shimmering label re-rasterises, the live
  // elapsed counter changes digit count, a bottom-anchored reasoning preview
  // re-wraps. None of it is content moving under the reader's eyes.
  const OSCILLATION_SEQUENCE_PX = [1, -1, 2, -2, 0.75, -0.75, 6, -6, 3, -3];

  it('protects no unsignalled shrink inside the dead band, at the bottom', () => {
    // Following output: the reader is pinned to the tail, distance 0. Every one
    // of these used to clear COMPENSATION_EPSILON_PX and run the anchor lock.
    const protectedShrinks = OSCILLATION_SEQUENCE_PX
      .filter(delta => delta < 0)
      .filter(delta => shouldProtectUnsignalledShrink({
        shrinkPx: -delta,
        distanceFromBottomPx: 0,
      }));

    expect(protectedShrinks).toEqual([]);
  });

  it('protects no unsignalled shrink inside the dead band while reading history', () => {
    // Reader is 900px up the transcript. Nothing at the tail can justify moving
    // the line they are looking at.
    const protectedShrinks = OSCILLATION_SEQUENCE_PX
      .filter(delta => delta < 0)
      .filter(delta => shouldProtectUnsignalledShrink({
        shrinkPx: -delta,
        distanceFromBottomPx: 900,
      }));

    expect(protectedShrinks).toEqual([]);
  });

  it('issues no reader-anchor correction for a tail-only oscillation', () => {
    // The anchored item is above the tail, so its offset inside the scroller
    // does not move at all — only total content height does. Zero corrections.
    const corrections = OSCILLATION_SEQUENCE_PX.map(delta => computeReaderAnchorCorrection({
      currentScrollTop: 4200,
      scrollHeight: 18000 + delta,
      clientHeight: 900,
      anchoredOffsetTop: 120,
      currentOffsetTop: 120,
      maxCorrectionPx: 900,
    }));

    expect(corrections.every(correction => correction === null)).toBe(true);
  });

  it('still protects a real shrink beyond the dead band', () => {
    expect(shouldProtectUnsignalledShrink({
      shrinkPx: 240,
      distanceFromBottomPx: 0,
    })).toBe(true);

    // Exactly at the band is still wobble.
    expect(shouldProtectUnsignalledShrink({
      shrinkPx: UNSIGNALLED_TAIL_OSCILLATION_DEAD_BAND_PX,
      distanceFromBottomPx: 0,
    })).toBe(false);
  });

  it('does not protect a shrink the reader is already far enough from', () => {
    // 240px of shrink but the reader is 900px from the bottom: nothing they can
    // see moves, so there is nothing to compensate.
    expect(shouldProtectUnsignalledShrink({
      shrinkPx: 240,
      distanceFromBottomPx: 900,
    })).toBe(false);
  });
});

describe('estimateVirtualMessageItemHeight for deferred thinking items', () => {
  function thinkingItem(overrides: Record<string, unknown>) {
    return {
      id: 'think-1',
      type: 'thinking' as const,
      content: 'x'.repeat(4000),
      timestamp: 0,
      ...overrides,
    };
  }

  function modelRound(items: unknown[]) {
    return {
      type: 'model-round' as const,
      id: 'round-1',
      turnId: 'turn-1',
      data: { items },
    };
  }

  it('estimates a still-streaming thinking item as zero height', () => {
    // `ModelThinkingDisplay` renders null while the pinned activity bar is
    // reporting the work, so the DOM box is zero. Estimating 3200px against it
    // guarantees a large mis-measure at the tail.
    const streaming = estimateVirtualMessageItemHeight(
      modelRound([thinkingItem({ isStreaming: true })]) as never,
    );
    const settled = estimateVirtualMessageItemHeight(
      modelRound([thinkingItem({ isStreaming: false })]) as never,
    );

    expect(streaming).toBeLessThan(settled);
    expect(streaming).toBe(LIVE_SESSION_DEFAULT_ITEM_HEIGHT_PX);
  });

  it('treats a "streaming" status the same as the isStreaming flag', () => {
    expect(estimateVirtualMessageItemHeight(
      modelRound([thinkingItem({ status: 'streaming' })]) as never,
    )).toBe(LIVE_SESSION_DEFAULT_ITEM_HEIGHT_PX);
  });
});
