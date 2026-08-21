import React, { useMemo } from 'react';
import './AgentAvatar.scss';

/**
 * Static identity mark: a deterministic per-agent colour behind the first
 * letter of the agent's name. AI agents never use human portraits — identity
 * comes from the stable colour + letter pair. No animation, ever.
 *
 * state:
 * - `idle` / `active` / `running`  normal mark
 * - `off`                          dimmed (disabled)
 */
export type AgentAvatarState = 'idle' | 'off' | 'active' | 'running';

interface AgentAvatarProps {
  identity: string;
  name: string;
  size?: 'card' | 'detail';
  state?: AgentAvatarState;
  className?: string;
}

/** FNV-1a hash — stable identity -> hue assignment. */
function hashIdentity(identity: string): number {
  let hash = 2166136261;
  for (let index = 0; index < identity.length; index += 1) {
    hash ^= identity.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Deterministic per-agent accent; theme tokens temper it via color-mix. */
function resolveAvatarAccent(identity: string): string {
  const hue = hashIdentity(identity) % 360;
  return `oklch(0.62 0.11 ${hue})`;
}

function resolveInitial(name: string, identity: string): string {
  const source = name.trim() || identity.trim();
  const first = Array.from(source)[0];
  return first ? first.toLocaleUpperCase() : '·';
}

const AgentAvatar: React.FC<AgentAvatarProps> = ({
  identity,
  name,
  size = 'card',
  state = 'idle',
  className,
}) => {
  const accent = useMemo(() => resolveAvatarAccent(identity), [identity]);
  const initial = useMemo(() => resolveInitial(name, identity), [name, identity]);

  return (
    <span
      className={[
        'agent-avatar',
        `agent-avatar--${size}`,
        className,
      ].filter(Boolean).join(' ')}
      data-state={state}
      style={{ '--agent-avatar-accent': accent } as React.CSSProperties}
      aria-hidden="true"
      title={name}
    >
      <span className="agent-avatar__mark">{initial}</span>
    </span>
  );
};

export default AgentAvatar;
