/**
 * PixelSquares — the shared "the model is working" mark.
 *
 * One 3x3 grid of square cells with a chevron wavefront running left to right.
 * The grid is the project's existing loading square; the only thing added here
 * is colour, so live activity reads as one recognisable mark instead of the
 * quiet grey dot that looked identical to a disabled bullet.
 *
 * Rendered inside the Beautiful UI shadow stage, so every value is either an
 * inline style or a palette variable that site.css already publishes on
 * `:host`. The `pixel-on` keyframes also come from site.css.
 */

import React from 'react';

/** Distance of each cell from the top-left corner, as an animation delay. */
const CHEVRON_DELAYS = Array.from({ length: 9 }, (_, i) => {
  const row = Math.floor(i / 3);
  const column = i % 3;
  return (column + Math.abs(row - 1)) * 90;
});

/**
 * Diagonal colour bands. Cells on the same wavefront share a colour, so the
 * sweep reads as a moving band rather than nine unrelated dots.
 */
const BAND_COLORS = ['var(--accent)', 'var(--green)', 'var(--orange)', 'var(--red)'];

const CELL_COLORS = Array.from({ length: 9 }, (_, i) => {
  const row = Math.floor(i / 3);
  const column = i % 3;
  return BAND_COLORS[(row + column) % BAND_COLORS.length];
});

export interface PixelSquaresProps {
  /** Cell edge in px. @default 4 */
  cell?: number;
  /** Gap between cells in px. @default 1.5 */
  gap?: number;
  /** Freeze the grid at its dim state (settled / non-working). */
  still?: boolean;
  className?: string;
}

export const PixelSquares: React.FC<PixelSquaresProps> = ({
  cell = 4,
  gap = 1.5,
  still = false,
  className = '',
}) => (
  <span
    aria-hidden
    data-pixel-squares
    className={`shrink-0 ${className}`.trim()}
    style={{
      display: 'grid',
      gridTemplateColumns: `repeat(3, ${cell}px)`,
      gap: `${gap}px`,
    }}
  >
    {CHEVRON_DELAYS.map((delay, i) => (
      <span
        key={i}
        style={{
          width: cell,
          height: cell,
          borderRadius: 1,
          backgroundColor: CELL_COLORS[i],
          opacity: still ? 0.34 : 0.18,
          animation: still ? 'none' : `pixel-on 650ms ease-in-out ${delay}ms infinite`,
        }}
      />
    ))}
  </span>
);

export default PixelSquares;
