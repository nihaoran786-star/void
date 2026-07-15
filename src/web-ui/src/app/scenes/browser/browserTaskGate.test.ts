import { describe, expect, it } from 'vitest';
import { createLatestBrowserTaskGate } from './browserTaskGate';

describe('createLatestBrowserTaskGate', () => {
  it('invalidates an older token when a newer task starts', () => {
    const gate = createLatestBrowserTaskGate();

    const olderToken = gate.start();
    const newerToken = gate.start();

    expect(gate.isCurrent(olderToken)).toBe(false);
    expect(gate.isCurrent(newerToken)).toBe(true);
  });

  it('invalidates the current token and allows the next task to start', () => {
    const gate = createLatestBrowserTaskGate();

    const invalidatedToken = gate.start();
    gate.invalidate();
    const nextToken = gate.start();

    expect(gate.isCurrent(invalidatedToken)).toBe(false);
    expect(gate.isCurrent(nextToken)).toBe(true);
  });

  it('allows repeated invalidation without restoring a token', () => {
    const gate = createLatestBrowserTaskGate();
    const token = gate.start();

    gate.invalidate();
    gate.invalidate();

    expect(gate.isCurrent(token)).toBe(false);
  });
});
