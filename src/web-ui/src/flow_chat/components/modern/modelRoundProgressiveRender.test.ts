import { describe, expect, it } from 'vitest';

import {
  MODEL_ROUND_GROUP_RENDER_CHUNK_SIZE,
  MODEL_ROUND_INITIAL_GROUP_RENDER_LIMIT,
  getInitialModelRoundGroupRenderCount,
  getNextModelRoundGroupRenderCount,
  getSynchronizedModelRoundGroupRenderCount,
  getVisibleModelRoundGroupEndIndex,
  getVisibleModelRoundGroupStartIndex,
} from './modelRoundProgressiveRender';

describe('modelRoundProgressiveRender', () => {
  it('renders completed large model rounds in a bounded initial tail', () => {
    expect(getInitialModelRoundGroupRenderCount({
      groupCount: MODEL_ROUND_INITIAL_GROUP_RENDER_LIMIT + 25,
      isStreaming: false,
    })).toBe(MODEL_ROUND_INITIAL_GROUP_RENDER_LIMIT);
  });

  it('keeps streaming model rounds fully rendered', () => {
    expect(getInitialModelRoundGroupRenderCount({
      groupCount: MODEL_ROUND_INITIAL_GROUP_RENDER_LIMIT + 25,
      isStreaming: true,
    })).toBe(MODEL_ROUND_INITIAL_GROUP_RENDER_LIMIT + 25);
  });

  it('advances completed model round rendering in bounded chunks', () => {
    expect(getNextModelRoundGroupRenderCount({
      currentCount: MODEL_ROUND_INITIAL_GROUP_RENDER_LIMIT,
      groupCount: MODEL_ROUND_INITIAL_GROUP_RENDER_LIMIT + MODEL_ROUND_GROUP_RENDER_CHUNK_SIZE + 5,
    })).toBe(MODEL_ROUND_INITIAL_GROUP_RENDER_LIMIT + MODEL_ROUND_GROUP_RENDER_CHUNK_SIZE);

    expect(getNextModelRoundGroupRenderCount({
      currentCount: MODEL_ROUND_INITIAL_GROUP_RENDER_LIMIT + MODEL_ROUND_GROUP_RENDER_CHUNK_SIZE,
      groupCount: MODEL_ROUND_INITIAL_GROUP_RENDER_LIMIT + MODEL_ROUND_GROUP_RENDER_CHUNK_SIZE + 5,
    })).toBe(MODEL_ROUND_INITIAL_GROUP_RENDER_LIMIT + MODEL_ROUND_GROUP_RENDER_CHUNK_SIZE + 5);
  });

  it('does not shrink a round that was fully visible while streaming', () => {
    expect(getSynchronizedModelRoundGroupRenderCount({
      currentCount: MODEL_ROUND_INITIAL_GROUP_RENDER_LIMIT + 120,
      groupCount: MODEL_ROUND_INITIAL_GROUP_RENDER_LIMIT + 120,
      initialCount: MODEL_ROUND_INITIAL_GROUP_RENDER_LIMIT,
      isStreaming: false,
    })).toBe(MODEL_ROUND_INITIAL_GROUP_RENDER_LIMIT + 120);
  });

  it('starts completed partial rendering from the newest groups', () => {
    expect(getVisibleModelRoundGroupStartIndex({
      renderedCount: MODEL_ROUND_INITIAL_GROUP_RENDER_LIMIT,
      groupCount: MODEL_ROUND_INITIAL_GROUP_RENDER_LIMIT + 25,
      isStreaming: false,
    })).toBe(25);
  });

  it('keeps streaming rendering anchored at the beginning', () => {
    expect(getVisibleModelRoundGroupStartIndex({
      renderedCount: MODEL_ROUND_INITIAL_GROUP_RENDER_LIMIT,
      groupCount: MODEL_ROUND_INITIAL_GROUP_RENDER_LIMIT + 25,
      isStreaming: true,
    })).toBe(0);

    expect(getVisibleModelRoundGroupEndIndex({
      renderedCount: MODEL_ROUND_INITIAL_GROUP_RENDER_LIMIT,
      groupCount: MODEL_ROUND_INITIAL_GROUP_RENDER_LIMIT + 25,
      startIndex: 0,
    })).toBe(MODEL_ROUND_INITIAL_GROUP_RENDER_LIMIT);
  });

  it('limits completed tail rendering to the requested visible count', () => {
    const startIndex = getVisibleModelRoundGroupStartIndex({
      renderedCount: MODEL_ROUND_INITIAL_GROUP_RENDER_LIMIT,
      groupCount: MODEL_ROUND_INITIAL_GROUP_RENDER_LIMIT + 25,
      isStreaming: false,
    });

    expect(getVisibleModelRoundGroupEndIndex({
      renderedCount: MODEL_ROUND_INITIAL_GROUP_RENDER_LIMIT,
      groupCount: MODEL_ROUND_INITIAL_GROUP_RENDER_LIMIT + 25,
      startIndex,
    })).toBe(MODEL_ROUND_INITIAL_GROUP_RENDER_LIMIT + 25);
  });
});
