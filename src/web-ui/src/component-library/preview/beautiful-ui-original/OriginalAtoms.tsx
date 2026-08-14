import React, { useEffect, useRef, useState } from 'react';

export const Shimmer: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => (
  <span
    className={`inline-block bg-clip-text text-transparent ${className}`}
    style={{
      backgroundImage:
        'linear-gradient(90deg, var(--ink-3) 35%, var(--ink) 50%, var(--ink-3) 65%)',
      backgroundSize: '200% 100%',
      animation: 'shimmer-text 1.8s linear infinite',
    }}
  >
    {children}
  </span>
);

interface StreamTextProps {
  text: string;
  charsPerTick?: number;
  tickMs?: number;
  blurTail?: number;
  caret?: boolean;
  className?: string;
  onProgress?: () => void;
  onDone?: () => void;
}

export const StreamText: React.FC<StreamTextProps> = ({
  text,
  charsPerTick = 2,
  tickMs = 9,
  blurTail = 6,
  caret = true,
  className,
  onProgress,
  onDone,
}) => {
  const [visible, setVisible] = useState(0);
  const progressRef = useRef(onProgress);
  const doneRef = useRef(onDone);
  progressRef.current = onProgress;
  doneRef.current = onDone;

  useEffect(() => {
    setVisible(0);
    let next = 0;
    const timer = window.setInterval(() => {
      next = Math.min(next + charsPerTick, text.length);
      setVisible(next);
      progressRef.current?.();
      if (next >= text.length) {
        window.clearInterval(timer);
        doneRef.current?.();
      }
    }, tickMs);
    return () => window.clearInterval(timer);
  }, [charsPerTick, text, tickMs]);

  const streaming = visible < text.length;
  const shown = text.slice(0, visible);
  const sharpEnd = streaming ? Math.max(0, shown.length - blurTail) : shown.length;

  return (
    <span className={className}>
      {shown.slice(0, sharpEnd)}
      {sharpEnd < shown.length && <span className="stream-tail">{shown.slice(sharpEnd)}</span>}
      {caret && <span aria-hidden="true" className={`stream-caret${streaming ? ' is-streaming' : ''}`} />}
    </span>
  );
};
