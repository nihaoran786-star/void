export function getNextShortDramaRovingTabIndex(
  currentIndex: number,
  key: string,
  itemCount: number,
): number | null {
  if (itemCount <= 0 || currentIndex < 0 || currentIndex >= itemCount) {
    return null;
  }

  if (key === 'Home') {
    return 0;
  }

  if (key === 'End') {
    return itemCount - 1;
  }

  if (key === 'ArrowRight') {
    return (currentIndex + 1) % itemCount;
  }

  if (key === 'ArrowLeft') {
    return (currentIndex - 1 + itemCount) % itemCount;
  }

  return null;
}
