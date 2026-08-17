import React from 'react';
import { resolveSkillCatalogIcon } from './skillCatalogIcons';
import './SkillCatalogAvatar.scss';

/**
 * Skill glyph avatar: a deterministic open-source Lucide mark per skill
 * identity. Skills are tools, not living agents — the mark never animates;
 * disabled and overridden states dim via CSS. Ink comes from `currentColor`,
 * so theme tokens stay authoritative in both light and dark themes.
 */
interface SkillCatalogAvatarProps {
  identity: string;
  name: string;
  /** Kept for API compatibility; glyphs are source-agnostic. */
  kind?: 'skill' | 'market';
  size?: 'card' | 'detail';
  className?: string;
}

const STROKE_WIDTH = 1.4;

const SkillCatalogAvatar: React.FC<SkillCatalogAvatarProps> = ({
  identity,
  name,
  size = 'card',
  className,
}) => {
  const Glyph = resolveSkillCatalogIcon(identity, name);

  return (
    <span
      className={[
        'skill-glyph',
        `skill-glyph--${size}`,
        className,
      ].filter(Boolean).join(' ')}
      aria-hidden="true"
      title={name}
    >
      <Glyph
        className="skill-glyph__mark"
        strokeWidth={STROKE_WIDTH}
        absoluteStrokeWidth
        focusable="false"
      />
    </span>
  );
};

export default SkillCatalogAvatar;
