import type { CanvasTab } from '../types';
import type { ShortDramaStage } from '@/shared/services/short-drama';

const isShortDramaStage = (value: unknown): value is ShortDramaStage =>
  value === 'script'
  || value === 'assets'
  || value === 'storyboards'
  || value === 'video'
  || value === 'post';

const shortDramaStageOrder: Readonly<Record<ShortDramaStage, number>> = {
  script: 0,
  assets: 1,
  storyboards: 2,
  video: 3,
  post: 4,
};

export function getShortDramaStageForCanvasTab(
  tab: CanvasTab,
): ShortDramaStage | null {
  if (tab.content.type !== 'btw-session') {
    return null;
  }
  const stage = tab.content.metadata?.shortDramaStage;
  return isShortDramaStage(stage) ? stage : null;
}

export function isShortDramaStageCanvasTab(tab: CanvasTab): boolean {
  return getShortDramaStageForCanvasTab(tab) !== null;
}

export function getShortDramaStageDisplayTitle(
  stage: unknown,
  translate: (key: string) => string,
): string | null {
  return isShortDramaStage(stage)
    ? `${translate(`shortDrama.tabs.${stage}`)} AI`
    : null;
}

/**
 * Sorts stage-agent slots without moving ordinary canvas tools. This keeps a
 * mixed Browser + stage-agent group stable while presenting the fixed
 * script/assets/storyboards/video/post sequence.
 */
export function orderCanvasTabsForPresentation(
  tabs: readonly CanvasTab[],
): CanvasTab[] {
  const orderedStageTabs = tabs
    .filter(isShortDramaStageCanvasTab)
    .sort((left, right) => {
      const leftStage = getShortDramaStageForCanvasTab(left);
      const rightStage = getShortDramaStageForCanvasTab(right);
      return (
        (leftStage ? shortDramaStageOrder[leftStage] : Number.MAX_SAFE_INTEGER)
        - (rightStage ? shortDramaStageOrder[rightStage] : Number.MAX_SAFE_INTEGER)
      );
    });
  let stageIndex = 0;
  return tabs.map(tab => (
    isShortDramaStageCanvasTab(tab)
      ? orderedStageTabs[stageIndex++] ?? tab
      : tab
  ));
}

/**
 * Keeps persisted/runtime tab identity separate from its localized label.
 * Stage-agent titles remain stable in stores and adapters; only canvas chrome
 * receives the current locale projection.
 */
export function getCanvasTabDisplayTitle(
  tab: CanvasTab,
  translate: (key: string) => string,
): string {
  const stage = getShortDramaStageForCanvasTab(tab);
  return getShortDramaStageDisplayTitle(stage, translate) ?? tab.title;
}
