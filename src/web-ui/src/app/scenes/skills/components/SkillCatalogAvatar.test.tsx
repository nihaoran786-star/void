import { describe, expect, it } from 'vitest';
import { resolveSigilCells } from './skillSigil';

describe('resolveSigilCells', () => {
  it('uses immutable skill identity to produce a stable rune', () => {
    expect(resolveSigilCells('user::home.codex::arrange'))
      .toEqual(resolveSigilCells('user::home.codex::arrange'));
    expect(resolveSigilCells('user::home.codex::arrange'))
      .not.toEqual(resolveSigilCells('user::home.codex::agent-app-architecture'));
  });

  it('never returns an empty or solid rune', () => {
    for (const identity of ['', 'market::unknown-package', 'builtin::xlsx']) {
      const filled = resolveSigilCells(identity).filter(Boolean).length;
      expect(filled).toBeGreaterThan(0);
      expect(filled).toBeLessThan(8);
    }
  });
});
