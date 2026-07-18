import React from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

const DEFAULT_VIEWPORT_WIDTH = 720;
const DEFAULT_VIEWPORT_HEIGHT = 720;
const HORIZONTAL_PADDING = 14;
const VERTICAL_PADDING_START = 10;
const VERTICAL_PADDING_END = 14;
const ITEM_GAP = 10;
const MIN_LANE_WIDTH = 160;

interface WorkspaceMediaVirtualMasonryProps<Item> {
  items: readonly Item[];
  getItemKey: (item: Item) => React.Key;
  estimateAspectRatio: (item: Item) => number;
  renderItem: (item: Item) => React.ReactNode;
  resetKey: string;
}

function laneCountForWidth(width: number): number {
  const availableWidth = Math.max(1, width - HORIZONTAL_PADDING * 2);
  return Math.max(
    1,
    Math.floor((availableWidth + ITEM_GAP) / (MIN_LANE_WIDTH + ITEM_GAP)),
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
  const lanes = laneCountForWidth(viewportWidth);
  const availableWidth = Math.max(
    1,
    viewportWidth - HORIZONTAL_PADDING * 2,
  );
  const laneWidth = Math.max(
    1,
    (availableWidth - ITEM_GAP * (lanes - 1)) / lanes,
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

    const ResizeObserverConstructor = element.ownerDocument.defaultView
      ?.ResizeObserver;
    if (typeof ResizeObserverConstructor !== 'function') {
      return;
    }
    const observer = new ResizeObserverConstructor(entries => {
      const entry = entries[0];
      updateWidth(entry?.contentRect.width ?? element.clientWidth);
    });
    observer.observe(element);
    return () => observer.disconnect();
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
    gap: ITEM_GAP,
    paddingStart: VERTICAL_PADDING_START,
    paddingEnd: VERTICAL_PADDING_END,
    overscan: lanes * 2,
    initialRect: {
      width: DEFAULT_VIEWPORT_WIDTH,
      height: DEFAULT_VIEWPORT_HEIGHT,
    },
  });

  React.useLayoutEffect(() => {
    virtualizer.measure();
  }, [itemKeySignature, laneWidth, resetKey, virtualizer]);

  React.useEffect(() => {
    virtualizer.scrollToOffset(0);
  }, [resetKey, virtualizer]);

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div
      ref={scrollRef}
      className="workspace-media-gallery__masonry workspace-media-gallery__masonry--virtual"
      data-testid="workspace-media-virtual-masonry"
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
                  HORIZONTAL_PADDING
                  + virtualItem.lane * (laneWidth + ITEM_GAP)
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
