import React, { useMemo } from 'react';
import { resolveSigilCells, SIGIL_GRID_SIZE } from './skillSigil';
import './SkillCatalogAvatar.scss';

/**
 * Skill sigil avatar: a deterministic static dot-rune per skill identity.
 * Skills are tools, not living agents — the sigil never animates; enabled
 * shows at full ink, disabled dims via CSS. Ink comes from `currentColor`,
 * so theme tokens stay authoritative in both light and dark themes.
 */
interface SkillCatalogAvatarProps {
  identity: string;
  name: string;
  /** Kept for API compatibility; sigils are source-agnostic. */
  kind?: 'skill' | 'market';
  size?: 'card' | 'detail';
  className?: string;
}

const CELL_RADIUS = 0.32;

const SkillCatalogAvatar: React.FC<SkillCatalogAvatarProps> = ({
  identity,
  name,
  size = 'card',
  className,
}) => {
  const dots = useMemo(() => {
    const cells = resolveSigilCells(identity);
    const points: Array<readonly [number, number]> = [];
    for (let row = 0; row < SIGIL_GRID_SIZE; row += 1) {
      for (let col = 0; col < 2; col += 1) {
        if (!cells[row * 2 + col]) continue;
        const y = row + 0.5;
        points.push([col + 0.5, y], [SIGIL_GRID_SIZE - col - 0.5, y]);
      }
    }
    return points;
  }, [identity]);

  return (
    <span
      className={[
        'skill-sigil',
        `skill-sigil--${size}`,
        className,
      ].filter(Boolean).join(' ')}
      aria-hidden="true"
      title={name}
    >
      <svg
        className="skill-sigil__mark"
        viewBox={`0 0 ${SIGIL_GRID_SIZE} ${SIGIL_GRID_SIZE}`}
        fill="currentColor"
        focusable="false"
      >
        {dots.map(([cx, cy]) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={CELL_RADIUS} />
        ))}
      </svg>
    </span>
  );
};

export default SkillCatalogAvatar;
