import React from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

const DEFAULT_VIEWPORT_WIDTH = 720;
const DEFAULT_VIEWPORT_HEIGHT = 720;
const MIN_LANE_WIDTH = 160;

interface MasonryLayout {
  horizontalPadding: number;
  verticalPaddingStart: number;
  verticalPaddingEnd: number;
  itemGap: number;
}

const CLASSIC_LAYOUT: MasonryLayout = {
  horizontalPadding: 14,
  verticalPaddingStart: 10,
  verticalPaddingEnd: 14,
  itemGap: 10,
};

const MINIMAL_LAYOUT: MasonryLayout = {
  horizontalPadding: 8,
  verticalPaddingStart: 8,
  verticalPaddingEnd: 12,
  itemGap: 8,
};

interface WorkspaceMediaVirtualMasonryProps<Item> {
  items: readonly Item[];
  getItemKey: (item: Item) => React.Key;
  estimateAspectRatio: (item: Item) => number;
  renderItem: (item: Item) => React.ReactNode;
  resetKey: string;
}

function layoutForElement(element: HTMLElement): MasonryLayout {
  const appLayout = element.closest('.void-app-layout');
  return appLayout?.classList.contains('void-ui--minimal')
    || element.closest('.void-ui--minimal')
    ? MINIMAL_LAYOUT
    : CLASSIC_LAYOUT;
}

function laneCountForWidth(width: number, layout: MasonryLayout): number {
  const availableWidth = Math.max(
    1,
    width - layout.horizontalPadding * 2,
  );
  return Math.max(
    1,
    Math.floor(
      (availableWidth + layout.itemGap) / (MIN_LANE_WIDTH + layout.itemGap),
    ),
  );
}

export function WorkspaceMediaVirtualMasonry<Item>({
  items,
  getItemKey,
  estimateAspectRatio,
  renderItem,
  resetKey,
}: WorkspaceMediaVirtualMasonryProps<Item>): React.ReactElement {
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const [viewportWidth, setViewportWidth] = React.useState(
    DEFAULT_VIEWPORT_WIDTH,
  );
  const [layout, setLayout] = React.useState<MasonryLayout>(CLASSIC_LAYOUT);
  const lanes = laneCountForWidth(viewportWidth, layout);
  const availableWidth = Math.max(
    1,
    viewportWidth - layout.horizontalPadding * 2,
  );
  const laneWidth = Math.max(
    1,
    (availableWidth - layout.itemGap * (lanes - 1)) / lanes,
  );
  const itemsRef = React.useRef(items);
  itemsRef.current = items;
  const getItemKeyRef = React.useRef(getItemKey);
  getItemKeyRef.current = getItemKey;
  const estimateAspectRatioRef = React.useRef(estimateAspectRatio);
  estimateAspectRatioRef.current = estimateAspectRatio;
  const laneWidthRef = React.useRef(laneWidth);
  laneWidthRef.current = laneWidth;
  const itemKeySignature = React.useMemo(
    () => items.map(item => String(getItemKey(item))).join('\u0000'),
    [getItemKey, items],
  );

  React.useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element) {
      return;
    }
    const updateWidth = (width: number) => {
      if (Number.isFinite(width) && width > 0) {
        setViewportWidth(current => (
          Math.abs(current - width) < 0.5 ? current : width
        ));
      }
    };
    updateWidth(element.clientWidth);
    setLayout(layoutForElement(element));

    const ownerWindow = element.ownerDocument.defaultView;
    const ResizeObserverConstructor = ownerWindow?.ResizeObserver;
    const resizeObserver = typeof ResizeObserverConstructor === 'function'
      ? new ResizeObserverConstructor(entries => {
          const entry = entries[0];
          updateWidth(entry?.contentRect.width ?? element.clientWidth);
        })
      : null;
    resizeObserver?.observe(element);
    return () => resizeObserver?.disconnect();
  }, []);

  const stableGetItemKey = React.useCallback(
    (index: number) => getItemKeyRef.current(itemsRef.current[index]),
    [],
  );
  const stableEstimateSize = React.useCallback((index: number) => {
    const aspectRatio = estimateAspectRatioRef.current(itemsRef.current[index]);
    return laneWidthRef.current / (
      Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 1
    );
  }, []);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    getItemKey: stableGetItemKey,
    estimateSize: stableEstimateSize,
    lanes,
    laneAssignmentMode: 'estimate',
    gap: layout.itemGap,
    paddingStart: layout.verticalPaddingStart,
    paddingEnd: layout.verticalPaddingEnd,
    overscan: lanes * 2,
    initialRect: {
      width: DEFAULT_VIEWPORT_WIDTH,
      height: DEFAULT_VIEWPORT_HEIGHT,
    },
  });

  React.useLayoutEffect(() => {
    virtualizer.measure();
  }, [itemKeySignature, laneWidth, layout, resetKey, virtualizer]);

  React.useEffect(() => {
    virtualizer.scrollToOffset(0);
  }, [resetKey, virtualizer]);

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div
      ref={scrollRef}
      className="workspace-media-gallery__masonry workspace-media-gallery__masonry--virtual"
      data-testid="workspace-media-virtual-masonry"
      data-horizontal-padding={layout.horizontalPadding}
      data-item-gap={layout.itemGap}
    >
      <div
        className="workspace-media-gallery__virtual-canvas"
        style={{ height: `${virtualizer.getTotalSize()}px` }}
      >
        {virtualItems.map(virtualItem => {
          const item = items[virtualItem.index];
          return (
            <span
              key={virtualItem.key}
              ref={virtualizer.measureElement}
              className="workspace-media-gallery__masonry-item workspace-media-gallery__masonry-item--virtual"
              data-index={virtualItem.index}
              data-testid="workspace-media-virtual-item"
              style={{
                width: `${laneWidth}px`,
                transform: `translate3d(${
                  layout.horizontalPadding
                  + virtualItem.lane * (laneWidth + layout.itemGap)
                }px, ${virtualItem.start}px, 0)`,
              }}
            >
              {renderItem(item)}
            </span>
          );
        })}
      </div>
    </div>
  );
}
