import React, { useEffect, useMemo, useRef } from 'react';
import { attachOrb, resolveOrbType, type OrbHandle } from './orbAvatarEngine';
import './AgentAvatar.scss';

/**
 * Orb avatar: a deterministic point-cloud motion form per agent identity.
 * AI agents never use human portraits — identity comes from the motion form.
 *
 * state:
 * - `idle`    static frame (enabled, not running)
 * - `off`     static frame, dimmed (disabled)
 * - `active`  animating (its row is selected)
 * - `running` animating (a dispatch/run is in flight)
 */
export type AgentAvatarState = 'idle' | 'off' | 'active' | 'running';

interface AgentAvatarProps {
  identity: string;
  name: string;
  size?: 'card' | 'detail';
  state?: AgentAvatarState;
  className?: string;
}

const AgentAvatar: React.FC<AgentAvatarProps> = ({
  identity,
  name,
  size = 'card',
  state = 'idle',
  className,
}) => {
  const orbType = useMemo(() => resolveOrbType(identity), [identity]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const handleRef = useRef<OrbHandle | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const handle = attachOrb(canvas, orbType);
    handleRef.current = handle;
    return () => {
      handle.dispose();
      if (handleRef.current === handle) {
        handleRef.current = null;
      }
    };
  }, [orbType]);

  useEffect(() => {
    handleRef.current?.setAnimating(state === 'active' || state === 'running');
  }, [orbType, state]);

  return (
    <span
      className={[
        'agent-avatar',
        'agent-avatar--orb',
        `agent-avatar--${size}`,
        className,
      ].filter(Boolean).join(' ')}
      data-state={state}
      data-orb={orbType}
      aria-hidden="true"
      title={name}
    >
      <canvas ref={canvasRef} className="agent-avatar__canvas" />
    </span>
  );
};

export default AgentAvatar;
