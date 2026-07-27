import { describe, expect, it } from 'vitest';

import { shouldRouteComposerEvent } from './composerEventRouting';

describe('shouldRouteComposerEvent', () => {
  it('routes targeted events only to the exact session composer', () => {
    expect(shouldRouteComposerEvent({
      composerSessionId: 'child-a',
      targetSessionId: 'child-a',
      isPrimary: false,
    })).toBe(true);
    expect(shouldRouteComposerEvent({
      composerSessionId: 'main',
      targetSessionId: 'child-a',
      isPrimary: true,
    })).toBe(false);
    expect(shouldRouteComposerEvent({
      composerSessionId: 'child-b',
      targetSessionId: 'child-a',
      isPrimary: false,
    })).toBe(false);
  });

  it('routes untargeted legacy events only to the primary composer', () => {
    expect(shouldRouteComposerEvent({
      composerSessionId: 'main',
      isPrimary: true,
    })).toBe(true);
    expect(shouldRouteComposerEvent({
      composerSessionId: 'child-a',
      isPrimary: false,
    })).toBe(false);
  });
});
