import React, { useEffect, useMemo, useState } from 'react';
import { Bot } from 'lucide-react';
import { resolveEmployeeAvatarUrl } from './employeeAvatar';
import './AgentAvatar.scss';

interface AgentAvatarProps {
  identity: string;
  name: string;
  size?: 'card' | 'detail';
  className?: string;
}

const AgentAvatar: React.FC<AgentAvatarProps> = ({
  identity,
  name,
  size = 'card',
  className,
}) => {
  const src = useMemo(() => resolveEmployeeAvatarUrl(identity), [identity]);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [src]);

  return (
    <span
      className={[
        'agent-avatar',
        `agent-avatar--${size}`,
        imageFailed && 'agent-avatar--fallback',
        className,
      ].filter(Boolean).join(' ')}
      aria-hidden="true"
      title={name}
    >
      {imageFailed ? (
        <Bot className="agent-avatar__fallback-icon" strokeWidth={1.6} />
      ) : (
        <img
          className="agent-avatar__image"
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setImageFailed(true)}
        />
      )}
    </span>
  );
};

export default AgentAvatar;
