import React from 'react';
import { resolveLinkPath, type ConnectorLinkState } from './linkGlyph';
import './ConnectorCatalogAvatar.scss';

/**
 * Connector link avatar: two endpoints joined by a deterministic route per
 * connector identity. Connectors are channels, not living agents — the route
 * never animates except while connecting, when a single pulse travels along
 * the path. Ink comes from `currentColor`, so theme tokens stay authoritative
 * in both light and dark themes.
 */
interface ConnectorCatalogAvatarProps {
  identity: string;
  name: string;
  /** Kept for API compatibility; link glyphs are transport-agnostic. */
  transport?: string;
  /** Connection state; defaults to a broken idle route. */
  state?: ConnectorLinkState;
  size?: 'card' | 'detail';
  className?: string;
}

const ConnectorCatalogAvatar: React.FC<ConnectorCatalogAvatarProps> = ({
  identity,
  name,
  state = 'idle',
  size = 'card',
  className,
}) => {
  const path = resolveLinkPath(identity);
  return (
    <span
      className={[
        'connector-link',
        `connector-link--${size}`,
        `is-${state}`,
        className,
      ].filter(Boolean).join(' ')}
      aria-hidden="true"
      title={name}
    >
      <svg
        className="connector-link__mark"
        viewBox="0 0 20 20"
        fill="currentColor"
        focusable="false"
      >
        <path
          d={path}
          fill="none"
          stroke="currentColor"
          strokeWidth={state === 'connecting' ? 1 : 1.4}
          strokeDasharray={state === 'idle'
            ? '4 3'
            : state === 'error'
              ? '2 3'
              : undefined}
          opacity={state === 'connecting'
            ? 0.35
            : state === 'idle'
              ? 0.7
              : undefined}
        />
        <circle cx={3} cy={10} r={2} />
        <circle cx={17} cy={10} r={2} />
        {state === 'connecting' && (
          <circle className="connector-link__pulse" r={1.8}>
            <animateMotion dur="1.4s" repeatCount="indefinite" path={path} />
          </circle>
        )}
      </svg>
    </span>
  );
};

export default ConnectorCatalogAvatar;
