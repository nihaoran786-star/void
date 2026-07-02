import { describe, expect, it } from 'vitest';

import {
  resolveShortDramaEpisodeTargetId,
  shouldUpdateShortDramaEpisodeFromScroll,
} from './ShortDramaEpisodeNavigationState';

describe('resolveShortDramaEpisodeTargetId', () => {
  it('keeps the ref episode ahead of stale React state when switching stages', () => {
    expect(resolveShortDramaEpisodeTargetId({
      refEpisodeId: 'episode-02',
      stateEpisodeId: 'episode-01',
      fallbackEpisodeId: 'episode-01',
    })).toBe('episode-02');
  });

  it('falls back to state and then the selected project episode', () => {
    expect(resolveShortDramaEpisodeTargetId({
      stateEpisodeId: 'episode-02',
      fallbackEpisodeId: 'episode-01',
    })).toBe('episode-02');

    expect(resolveShortDramaEpisodeTargetId({
      fallbackEpisodeId: 'episode-01',
    })).toBe('episode-01');
  });
});

describe('shouldUpdateShortDramaEpisodeFromScroll', () => {
  it('ignores scroll-derived episode updates while a programmatic stage jump is pending', () => {
    expect(shouldUpdateShortDramaEpisodeFromScroll({
      isProgrammaticScrollPending: true,
    })).toBe(false);
  });

  it('allows scroll-derived episode updates during normal user scrolling', () => {
    expect(shouldUpdateShortDramaEpisodeFromScroll({
      isProgrammaticScrollPending: false,
    })).toBe(true);
  });
});
