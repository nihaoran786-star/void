import React from 'react';
import './CatalogIconAvatar.scss';
import { resolveCatalogIconTone } from './catalogIconTone';

export interface CatalogIconAvatarProps {
  identity: string;
  icon: React.ReactNode;
  label: string;
  size?: 'card' | 'detail';
  className?: string;
}

export const CatalogIconAvatar: React.FC<CatalogIconAvatarProps> = ({
  identity,
  icon,
  label,
  size = 'card',
  className,
}) => {
  const tone = resolveCatalogIconTone(identity);

  return (
    <span
      className={[
        'catalog-icon-avatar',
        `catalog-icon-avatar--${size}`,
        `catalog-icon-avatar--tone-${tone}`,
        className,
      ].filter(Boolean).join(' ')}
      aria-hidden="true"
      title={label}
    >
      {icon}
    </span>
  );
};

CatalogIconAvatar.displayName = 'CatalogIconAvatar';
