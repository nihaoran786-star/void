import React from 'react';
import { CatalogIconAvatar } from '@/component-library/components/CatalogIconAvatar';
import { resolveConnectorCatalogIcon } from './connectorCatalogIcons';

interface ConnectorCatalogAvatarProps {
  identity: string;
  name: string;
  transport?: string;
  size?: 'card' | 'detail';
  className?: string;
}

const ConnectorCatalogAvatar: React.FC<ConnectorCatalogAvatarProps> = ({
  identity,
  name,
  transport = '',
  size = 'card',
  className,
}) => {
  const Icon = resolveConnectorCatalogIcon(identity, name, transport);
  return (
    <CatalogIconAvatar
      identity={`connector:${identity}`}
      icon={<Icon strokeWidth={1.7} />}
      label={name}
      size={size}
      className={className}
    />
  );
};

export default ConnectorCatalogAvatar;
