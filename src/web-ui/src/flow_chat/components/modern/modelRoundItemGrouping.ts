import type { FlowItem, FlowToolItem } from '../../types/flow-chat';

export const COMPLETED_TOOL_TRANSIENT_MS = 1000;

export type ModelRoundItemGroup =
  | { type: 'explore'; items: FlowItem[]; isLast: boolean }
  | { type: 'critical'; item: FlowItem };

interface BuildModelRoundItemGroupsInput {
  items: FlowItem[];
  isStreaming: boolean;
  disableExploreGrouping: boolean;
  isCollapsibleToolItem: (item: FlowToolItem) => boolean;
  nowMs?: number;
}

function hasActiveStreamingNarrative(items: FlowItem[]): boolean {
  return items.some(item => {
    if (item.type !== 'text' && item.type !== 'thinking') return false;
    const maybeStreaming = item as { isStreaming?: boolean; status?: string };
    return maybeStreaming.isStreaming === true &&
      (maybeStreaming.status === 'streaming' || maybeStreaming.status === 'running');
  });
}

function isActiveToolItem(item: FlowItem): boolean {
  if (item.type !== 'tool') return false;
  return item.status !== 'completed' && item.status !== 'cancelled' && item.status !== 'error';
}

function isRecentlyCompletedToolItem(item: FlowItem, nowMs: number): boolean {
  if (item.type !== 'tool' || item.status !== 'completed') return false;
  const endTime = (item as FlowToolItem).endTime;
  return typeof endTime === 'number' && nowMs - endTime < COMPLETED_TOOL_TRANSIENT_MS;
}

export function buildModelRoundItemGroups({
  items,
  isStreaming,
  disableExploreGrouping,
  isCollapsibleToolItem,
  nowMs = Date.now(),
}: BuildModelRoundItemGroupsInput): ModelRoundItemGroup[] {
  const deferExploreGrouping = disableExploreGrouping || (isStreaming && hasActiveStreamingNarrative(items));

  const finalGroups: ModelRoundItemGroup[] = [];
  /*
   * Routine tool calls and any reasoning that landed between them, in the order
   * they arrived.
   *
   * Reasoning is kept in the buffer rather than emitted immediately because a
   * turn that thinks between every call used to cut its own calls into runs of
   * one, and a run of one never folds — so the reader got
   * `command / think / command / command / think` as five separate rows of
   * chrome instead of a summary.
   */
  let pendingRun: FlowItem[] = [];

  /*
   * A run of routine tool calls only becomes a summary when there is more than
   * one of them. One call is one line either way, so folding it hid a step of
   * the turn and bought nothing; batching starts where the repetition starts.
   *
   * Interleaved reasoning is only lifted above the summary when a fold actually
   * happens — that reordering is the price of the summary, so it is not worth
   * paying when there is no summary to show for it.
   */
  const flushToolRun = (isLast: boolean) => {
    if (pendingRun.length === 0) return;

    const toolItems = pendingRun.filter(item => item.type === 'tool');

    if (toolItems.length < 2) {
      for (const item of pendingRun) {
        finalGroups.push({ type: 'critical', item });
      }
      pendingRun = [];
      return;
    }

    for (const item of pendingRun) {
      if (item.type !== 'tool') {
        finalGroups.push({ type: 'critical', item });
      }
    }
    finalGroups.push({ type: 'explore', items: toolItems, isLast });
    pendingRun = [];
  };

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const isLastItem = i === items.length - 1;

    /*
     * Reasoning and prose are the spine of the turn and always stay at the top
     * level: think -> call -> think -> call -> answer reads as one sequence.
     * They used to be swallowed into the same collapsed region as the tools,
     * which nested the model's reasoning one level underneath its own tool
     * calls and moved it around as a turn settled.
     *
     * Prose is the answer itself, so it always cuts a run at exactly the point
     * it appeared. Reasoning only gets held back (see `pendingRun`).
     */
    if (item.type === 'thinking') {
      pendingRun.push(item);
      if (isLastItem) flushToolRun(true);
      continue;
    }

    if (item.type !== 'tool') {
      flushToolRun(false);
      finalGroups.push({ type: 'critical', item });
      continue;
    }

    const isRoutineTool = isCollapsibleToolItem(item as FlowToolItem);
    const keepTransientlyCritical =
      deferExploreGrouping ||
      isActiveToolItem(item) ||
      (isStreaming && isRecentlyCompletedToolItem(item, nowMs));

    if (!isRoutineTool || keepTransientlyCritical) {
      flushToolRun(false);
      finalGroups.push({ type: 'critical', item });
      continue;
    }

    pendingRun.push(item);
    if (isLastItem) flushToolRun(true);
  }

  flushToolRun(true);

  return finalGroups;
}
