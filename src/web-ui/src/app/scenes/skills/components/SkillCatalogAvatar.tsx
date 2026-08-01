import React from 'react';
import { CatalogIconAvatar } from '@/component-library/components/CatalogIconAvatar';
import { resolveSkillCatalogIcon } from './skillCatalogIcons';

interface SkillCatalogAvatarProps {
  identity: string;
  name: string;
  kind?: 'skill' | 'market';
  size?: 'card' | 'detail';
  className?: string;
}

const SkillCatalogAvatar: React.FC<SkillCatalogAvatarProps> = ({
  identity,
  name,
  kind = 'skill',
  size = 'card',
  className,
}) => {
  const Icon = resolveSkillCatalogIcon(identity, name, kind);
  return (
    <CatalogIconAvatar
      identity={`skill:${identity}`}
      icon={<Icon strokeWidth={1.7} />}
      label={name}
      size={size}
      className={className}
    />
  );
};

export default SkillCatalogAvatar;
