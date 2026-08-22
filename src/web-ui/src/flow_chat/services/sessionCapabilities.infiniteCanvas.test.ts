import { describe, expect, it } from 'vitest';

import { deriveSessionCapabilities } from './sessionCapabilities';

function session(overrides: Record<string, unknown> = {}) {
  return {
    dialogTurns: [],
    ...overrides,
  } as never;
}

describe('infinite-canvas session capability', () => {
  it('is offered for a media parent session', () => {
    const ids = deriveSessionCapabilities(session({
      mode: 'media', sessionKind: 'normal',
    })).map(capability => capability.id);

    expect(ids).toContain('infinite-canvas');
  });

  it('is not offered outside media mode in phase 1', () => {
    const ids = deriveSessionCapabilities(session({
      mode: 'chat', sessionKind: 'normal',
    })).map(capability => capability.id);

    expect(ids).not.toContain('infinite-canvas');
  });

  it('is not offered in a subagent conversation', () => {
    const ids = deriveSessionCapabilities(session({
      mode: 'media', sessionKind: 'subagent',
    })).map(capability => capability.id);

    expect(ids).not.toContain('infinite-canvas');
  });

  it('keeps a stable rail order between the media capabilities', () => {
    const ids = deriveSessionCapabilities(session({
      mode: 'media', sessionKind: 'normal',
    })).map(capability => capability.id);

    expect(ids).toEqual(['workspace-media', 'infinite-canvas']);
  });
});
