import type { AnyFlowItem } from '../../types/flow-chat';
import type { VirtualItem } from '../../store/modernFlowChatStore';

export const LIVE_SESSION_DEFAULT_ITEM_HEIGHT_PX = 200;
export const HISTORICAL_SESSION_DEFAULT_ITEM_HEIGHT_PX = 72;
export const HISTORICAL_SESSION_MODEL_ROUND_DEFAULT_ITEM_HEIGHT_PX = 960;
export const INITIAL_HISTORY_RENDER_MIN_TURN_COUNT = 2;
export const INITIAL_HISTORY_RENDER_MIN_ESTIMATED_HEIGHT_PX = 1400;

const INITIAL_HISTORY_RENDER_USER_ONLY_LATEST_MIN_TURN_COUNT = 3;
const USER_MESSAGE_BASE_HEIGHT_PX = 96;
const USER_MESSAGE_LINE_HEIGHT_PX = 22;
const MODEL_ROUND_BASE_HEIGHT_PX = 80;
const MODEL_ROUND_TEXT_BASE_HEIGHT_PX = 72;
const MODEL_ROUND_TEXT_LINE_HEIGHT_PX = 30;
const TOOL_CARD_ESTIMATE_HEIGHT_PX = 88;
const EXPLORE_GROUP_BASE_HEIGHT_PX = 96;
const ESTIMATED_TEXT_CHARS_PER_LINE = 60;
const COMPACT_HISTORICAL_PROJECTION_MIN_ITEM_COUNT = 6;
const HISTORICAL_PROJECTION_LOOKBACK_COUNT = 16;

export function getVirtualMessageDefaultItemHeight(params: {
  isHistorical: boolean;
  hasCompactHistoricalProjection: boolean;
  hasInitialHistoryModelRoundProjection: boolean;
}): number {
  if (!params.isHistorical) {
    return LIVE_SESSION_DEFAULT_ITEM_HEIGHT_PX;
  }

  if (params.hasCompactHistoricalProjection) {
    return HISTORICAL_SESSION_DEFAULT_ITEM_HEIGHT_PX;
  }

  if (params.hasInitialHistoryModelRoundProjection) {
    return HISTORICAL_SESSION_MODEL_ROUND_DEFAULT_ITEM_HEIGHT_PX;
  }

  return HISTORICAL_SESSION_DEFAULT_ITEM_HEIGHT_PX;
}

export function estimateTextHeightFromLength(textLength: number, basePx: number, lineHeightPx: number): number {
  const lineCount = Math.max(1, Math.ceil(textLength / ESTIMATED_TEXT_CHARS_PER_LINE));
  return basePx + lineCount * lineHeightPx;
}

function estimateTextHeight(content: string, basePx: number, lineHeightPx: number): number {
  return estimateTextHeightFromLength(content.length, basePx, lineHeightPx);
}

function getFlowItemTextLength(item: AnyFlowItem): number {
  if (item.type === 'text' || item.type === 'thinking' || item.type === 'user-steering') {
    return item.content.length;
  }
  return 0;
}

function estimateFlowItemHeight(item: AnyFlowItem): number {
  const textLength = getFlowItemTextLength(item);
  if (textLength > 0) {
    return Math.min(
      3200,
      estimateTextHeightFromLength(
        textLength,
        MODEL_ROUND_TEXT_BASE_HEIGHT_PX,
        MODEL_ROUND_TEXT_LINE_HEIGHT_PX,
      ),
    );
  }

  if (item.type === 'tool') {
    return TOOL_CARD_ESTIMATE_HEIGHT_PX;
  }

  if (item.type === 'image-analysis') {
    return 320;
  }

  return HISTORICAL_SESSION_DEFAULT_ITEM_HEIGHT_PX;
}

function estimateModelRoundHeight(item: Extract<VirtualItem, { type: 'model-round' }>): number {
  const flowItems = item.data.items ?? [];
  if (flowItems.length === 0) {
    return LIVE_SESSION_DEFAULT_ITEM_HEIGHT_PX;
  }

  const contentHeight = flowItems.reduce(
    (total, flowItem) => total + estimateFlowItemHeight(flowItem),
    0,
  );
  return Math.min(3600, Math.max(LIVE_SESSION_DEFAULT_ITEM_HEIGHT_PX, MODEL_ROUND_BASE_HEIGHT_PX + contentHeight));
}

function estimateUserMessageHeight(content: string | undefined): number {
  return Math.min(
    320,
    estimateTextHeight(content ?? '', USER_MESSAGE_BASE_HEIGHT_PX, USER_MESSAGE_LINE_HEIGHT_PX),
  );
}

/**
 * The activity region no longer clips to its own 400px scroller, so every row
 * contributes height. Rows stay compact — tool rows and condensed model
 * summaries are one line each — and the bound only guards pathological groups.
 */
function estimateExploreGroupHeight(item: Extract<VirtualItem, { type: 'explore-group' }>): number {
  return Math.min(1200, EXPLORE_GROUP_BASE_HEIGHT_PX + item.data.allItems.length * 24);
}

export function estimateVirtualMessageItemHeight(item: VirtualItem): number {
  switch (item.type) {
    case 'user-message':
    case 'user-steering-message':
      return estimateUserMessageHeight(item.data.content);
    case 'model-round':
      return estimateModelRoundHeight(item);
    case 'explore-group':
      return estimateExploreGroupHeight(item);
    case 'image-analyzing':
      return LIVE_SESSION_DEFAULT_ITEM_HEIGHT_PX;
    case 'turn-failure-notice':
      return 160;
  }
}

function isCompactHistoricalProjectionItem(item: VirtualItem): boolean {
  return (
    item.type === 'user-message' ||
    item.type === 'user-steering-message' ||
    item.type === 'explore-group'
  );
}

export function hasCompactHistoricalProjection(items: VirtualItem[]): boolean {
  if (items.length < COMPACT_HISTORICAL_PROJECTION_MIN_ITEM_COUNT) {
    return false;
  }

  return items
    .slice(-HISTORICAL_PROJECTION_LOOKBACK_COUNT)
    .every(isCompactHistoricalProjectionItem);
}

export function hasInitialHistoryModelRoundProjection(items: VirtualItem[]): boolean {
  return items
    .slice(-HISTORICAL_PROJECTION_LOOKBACK_COUNT)
    .some(item => item.type === 'model-round');
}

export function getVirtualMessageDefaultItemHeightForSession(params: {
  isHistorical: boolean;
  items: VirtualItem[];
}): number {
  const { isHistorical, items } = params;
  return getVirtualMessageDefaultItemHeight({
    isHistorical,
    hasCompactHistoricalProjection: isHistorical && hasCompactHistoricalProjection(items),
    hasInitialHistoryModelRoundProjection: isHistorical && hasInitialHistoryModelRoundProjection(items),
  });
}

export interface InitialHistoryRenderWindow {
  items: VirtualItem[];
  startIndex: number;
  omittedEstimatedHeightPx: number;
  trailingOmittedEstimatedHeightPx: number;
  renderedEstimatedHeightPx: number;
  totalEstimatedHeightPx: number;
  isWindowed: boolean;
}

export function mapInitialHistoryExpansionScrollTop(params: {
  previousScrollTop: number;
  previousScrollHeight: number;
  nextScrollHeight: number;
  omittedEstimatedHeightPx: number;
  wasAtBottom: boolean;
  clientHeight: number;
}): number {
  const nextMaxScrollTop = Math.max(0, params.nextScrollHeight - params.clientHeight);
  if (params.wasAtBottom) {
    return nextMaxScrollTop;
  }

  const heightDelta = params.nextScrollHeight - params.previousScrollHeight;
  const omittedEstimatedHeightPx = Math.max(0, params.omittedEstimatedHeightPx);
  if (omittedEstimatedHeightPx > 0 && params.previousScrollTop <= omittedEstimatedHeightPx) {
    const actualOmittedHeightPx = Math.max(0, omittedEstimatedHeightPx + heightDelta);
    const omittedRatio = Math.max(0, Math.min(1, params.previousScrollTop / omittedEstimatedHeightPx));
    return Math.min(nextMaxScrollTop, actualOmittedHeightPx * omittedRatio);
  }

  return Math.min(nextMaxScrollTop, Math.max(0, params.previousScrollTop + heightDelta));
}

function uniqueTurnCount(items: VirtualItem[]): number {
  const turnIds = new Set<string>();
  items.forEach(item => {
    if (item.turnId) {
      turnIds.add(item.turnId);
    }
  });
  return turnIds.size;
}

function getLatestTurnId(items: VirtualItem[]): string | null {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const turnId = items[index]?.turnId;
    if (turnId) {
      return turnId;
    }
  }
  return null;
}

function latestTurnHasModelRound(items: VirtualItem[]): boolean {
  const latestTurnId = getLatestTurnId(items);
  if (!latestTurnId) {
    return true;
  }

  return items.some(item => item.turnId === latestTurnId && item.type === 'model-round');
}

function getInitialHistoryRenderMinTurnCount(items: VirtualItem[]): number {
  return latestTurnHasModelRound(items)
    ? INITIAL_HISTORY_RENDER_MIN_TURN_COUNT
    : INITIAL_HISTORY_RENDER_USER_ONLY_LATEST_MIN_TURN_COUNT;
}

export function selectInitialHistoryRenderWindow(
  items: VirtualItem[],
  options: {
    minTurnCount?: number;
    minEstimatedHeightPx?: number;
  } = {},
): InitialHistoryRenderWindow {
  const minTurnCount = Math.max(1, Math.floor(options.minTurnCount ?? getInitialHistoryRenderMinTurnCount(items)));
  const minEstimatedHeightPx = Math.max(0, options.minEstimatedHeightPx ?? INITIAL_HISTORY_RENDER_MIN_ESTIMATED_HEIGHT_PX);
  const totalEstimatedHeightPx = items.reduce(
    (total, item) => total + estimateVirtualMessageItemHeight(item),
    0,
  );

  if (items.length === 0 || uniqueTurnCount(items) <= minTurnCount) {
    return {
      items,
      startIndex: 0,
      omittedEstimatedHeightPx: 0,
      trailingOmittedEstimatedHeightPx: 0,
      renderedEstimatedHeightPx: totalEstimatedHeightPx,
      totalEstimatedHeightPx,
      isWindowed: false,
    };
  }

  let startIndex = items.length;
  let renderedEstimatedHeightPx = 0;
  const includedTurnIds = new Set<string>();

  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    startIndex = index;
    renderedEstimatedHeightPx += estimateVirtualMessageItemHeight(item);
    if (item.turnId) {
      includedTurnIds.add(item.turnId);
    }

    const previousItem = items[index - 1];
    const stillInsideSameTurn = Boolean(item.turnId) && previousItem?.turnId === item.turnId;
    if (
      !stillInsideSameTurn &&
      includedTurnIds.size >= minTurnCount &&
      renderedEstimatedHeightPx >= minEstimatedHeightPx
    ) {
      break;
    }
  }

  const omittedEstimatedHeightPx = items
    .slice(0, startIndex)
    .reduce((total, item) => total + estimateVirtualMessageItemHeight(item), 0);

  return {
    items: items.slice(startIndex),
    startIndex,
    omittedEstimatedHeightPx,
    trailingOmittedEstimatedHeightPx: 0,
    renderedEstimatedHeightPx,
    totalEstimatedHeightPx,
    isWindowed: startIndex > 0,
  };
}

/** Sub-pixel drift is not worth a scroll write, and writing one would fight smooth scrolling. */
export const READER_ANCHOR_MIN_DRIFT_PX = 1;

/**
 * Where `scrollTop` has to go to put the reader's anchored line back exactly
 * where it was.
 *
 * Deliberately expressed against an element's offset inside the viewport rather
 * than against total content height: the dominant source of drift while reading
 * back through a conversation is `react-virtuoso` replacing an estimated item
 * height with the real one, which changes total height without anything
 * visually happening. Height-delta compensation reads that as content shrinking
 * and moves the viewport; offset compensation simply does not care.
 *
 * Returns `null` when nothing needs to move.
 */
export function computeReaderAnchorCorrection(params: {
  currentScrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  /** The anchored element's offset from the scroller's top edge, when captured. */
  anchoredOffsetTop: number;
  /** The same offset, measured now. */
  currentOffsetTop: number;
  /**
   * Refuse corrections larger than this. A drift bigger than a viewport is not
   * a layout shift under the reader's eyes — it means the anchor no longer
   * describes what it did, and acting on it would throw the viewport somewhere
   * the reader never asked to be. Doing nothing is always the safer failure.
   */
  maxCorrectionPx?: number;
}): number | null {
  const drift = params.currentOffsetTop - params.anchoredOffsetTop;
  if (Math.abs(drift) <= READER_ANCHOR_MIN_DRIFT_PX) return null;
  if (params.maxCorrectionPx !== undefined && Math.abs(drift) > params.maxCorrectionPx) return null;

  const maxScrollTop = Math.max(0, params.scrollHeight - params.clientHeight);
  const nextScrollTop = Math.min(maxScrollTop, Math.max(0, params.currentScrollTop + drift));
  if (Math.abs(nextScrollTop - params.currentScrollTop) <= READER_ANCHOR_MIN_DRIFT_PX) return null;

  return nextScrollTop;
}
