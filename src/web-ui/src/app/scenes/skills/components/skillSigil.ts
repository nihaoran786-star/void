/**
 * Skill sigil — a deterministic static dot-rune per skill identity.
 *
 * Agents get animated orb avatars (living things); skills get sigils
 * (tools) — same point-cloud vocabulary, but a sigil never moves.
 * Enabled renders at normal opacity, disabled dims to 28%, mirroring the
 * orb `off` state. The pattern derives from the identity hash with
 * left-right mirror symmetry, so every skill owns a unique, permanent
 * rune without a hand-maintained keyword/icon mapping.
 */

export const SIGIL_GRID_SIZE = 4;

function fnv1a(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Returns 8 cells (4 rows × 2 left columns). The right half is mirrored at
 * render time. Never all-empty or all-full, so the rune always reads as a
 * pattern rather than a blank or solid square.
 */
export function resolveSigilCells(identity: string): boolean[] {
  let seed = `sigil:${identity}`;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const hash = fnv1a(seed);
    const cells: boolean[] = [];
    let filled = 0;
    for (let index = 0; index < 8; index += 1) {
      const bit = ((hash >>> index) & 1) === 1;
      cells.push(bit);
      if (bit) filled += 1;
    }
    if (filled > 0 && filled < 8) {
      return cells;
    }
    seed = `${seed}!`;
  }
  /* Deterministic fallback (practically unreachable). */
  return [true, false, false, true, false, true, true, false];
}
