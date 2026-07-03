import { describe, expect, it } from 'vitest';
import { createResizeRepaintGuard, isStandaloneCursorPosition } from './resizeRepaintGuard';

describe('resizeRepaintGuard', () => {
  it('identifies only standalone absolute cursor-position output', () => {
    expect(isStandaloneCursorPosition('\x1b[12;34H')).toBe(true);
    expect(isStandaloneCursorPosition('prefix\x1b[12;34H')).toBe(false);
    expect(isStandaloneCursorPosition('\x1b[12;34Hsuffix')).toBe(false);
    expect(isStandaloneCursorPosition('\x1b[12;34f')).toBe(true);
  });

  it('filters standalone cursor-position repaint after resize', () => {
    const guard = createResizeRepaintGuard({ maxArtifacts: 2 });

    guard.markResize();

    expect(guard.shouldSkipOutput('\x1b[10;2H')).toBe(true);
    expect(guard.shouldSkipOutput('\x1b[11;2H')).toBe(true);
    expect(guard.shouldSkipOutput('\x1b[12;2H')).toBe(false);
  });

  it('keeps the default repaint guard window narrow', () => {
    const guard = createResizeRepaintGuard();

    guard.markResize();

    expect(guard.shouldSkipOutput('\x1b[10;2H')).toBe(true);
    expect(guard.shouldSkipOutput('\x1b[11;2H')).toBe(true);
    expect(guard.shouldSkipOutput('\x1b[12;2H')).toBe(false);
  });

  it('does not filter cursor movement when no resize was observed', () => {
    const guard = createResizeRepaintGuard();

    expect(guard.shouldSkipOutput('\x1b[10;2H')).toBe(false);
  });

  it('allows normal live output after resize and clears the guard', () => {
    const guard = createResizeRepaintGuard();

    guard.markResize();

    expect(guard.shouldSkipOutput('build complete\r\n')).toBe(false);
    expect(guard.shouldSkipOutput('\x1b[10;2H')).toBe(false);
  });

  it('allows cursor movement after the repaint window expires', () => {
    let now = 1000;
    const guard = createResizeRepaintGuard({
      maxArtifacts: 2,
      now: () => now,
      windowMs: 50,
    });

    guard.markResize();
    now = 1051;

    expect(guard.shouldSkipOutput('\x1b[10;2H')).toBe(false);
  });

  it('allows cursor movement after the guard is cleared', () => {
    const guard = createResizeRepaintGuard({ maxArtifacts: 2 });

    guard.markResize();
    guard.clear();

    expect(guard.shouldSkipOutput('\x1b[10;2H')).toBe(false);
  });

  it('does not filter mixed content containing cursor movement', () => {
    const guard = createResizeRepaintGuard();

    guard.markResize();

    expect(guard.shouldSkipOutput('progress \x1b[10;2Hdone')).toBe(false);
    expect(guard.shouldSkipOutput('\x1b[11;2H')).toBe(false);
  });
});
