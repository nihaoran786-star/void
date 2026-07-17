import { describe, expect, it } from 'vitest';

import { getNextShortDramaRovingTabIndex } from './ShortDramaKeyboardNavigation';

describe('getNextShortDramaRovingTabIndex', () => {
  it('moves through the rail and wraps at both ends', () => {
    expect(getNextShortDramaRovingTabIndex(0, 'ArrowRight', 3)).toBe(1);
    expect(getNextShortDramaRovingTabIndex(2, 'ArrowRight', 3)).toBe(0);
    expect(getNextShortDramaRovingTabIndex(2, 'ArrowLeft', 3)).toBe(1);
    expect(getNextShortDramaRovingTabIndex(0, 'ArrowLeft', 3)).toBe(2);
  });

  it('supports Home and End without changing unrelated keys', () => {
    expect(getNextShortDramaRovingTabIndex(1, 'Home', 3)).toBe(0);
    expect(getNextShortDramaRovingTabIndex(1, 'End', 3)).toBe(2);
    expect(getNextShortDramaRovingTabIndex(1, 'Enter', 3)).toBeNull();
  });

  it('ignores invalid or empty collections', () => {
    expect(getNextShortDramaRovingTabIndex(-1, 'ArrowRight', 3)).toBeNull();
    expect(getNextShortDramaRovingTabIndex(0, 'ArrowRight', 0)).toBeNull();
  });
});
