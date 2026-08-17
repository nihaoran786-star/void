import React from 'react';
import { resolveConnectorCatalogIcon } from './connectorCatalogIcons';
import type { ConnectorLinkState } from './linkGlyph';
import './ConnectorCatalogAvatar.scss';

/**
 * Connector glyph avatar: a deterministic open-source Lucide mark per
 * connector, chosen from what the connector actually is (docs, database,
 * browser, mail…). Connectors are channels, not living agents — the mark never
 * animates. State is still visual: the ink is the state ink, so connected,
 * connecting, failed and stopped read differently at a glance, and the card's
 * own status line states the same thing in words.
 */
interface ConnectorCatalogAvatarProps {
  identity: string;
  name: string;
  transport?: string;
  /** Connection state; defaults to a stopped channel. */
  state?: ConnectorLinkState;
  size?: 'card' | 'detail';
  className?: string;
}

const STROKE_WIDTH = 1.4;

const ConnectorCatalogAvatar: React.FC<ConnectorCatalogAvatarProps> = ({
  identity,
  name,
  transport = '',
  state = 'idle',
  size = 'card',
  className,
}) => {
  const Glyph = resolveConnectorCatalogIcon(identity, name, transport);

  return (
    <span
      className={[
        'connector-glyph',
        `connector-glyph--${size}`,
        `is-${state}`,
        className,
      ].filter(Boolean).join(' ')}
      aria-hidden="true"
      title={name}
    >
      <Glyph
        className="connector-glyph__mark"
        strokeWidth={STROKE_WIDTH}
        absoluteStrokeWidth
        focusable="false"
      />
    </span>
  );
};

export default ConnectorCatalogAvatar;
