import React from 'react';
import './RippleCellLoader.scss';

const rippleCellDelays = ['', 'd-1', 'd-2', 'd-1', 'd-2', 'd-3', 'd-2', 'd-3', 'd-4'] as const;

interface RippleCellLoaderProps {
  className?: string;
}

export const RippleCellLoader: React.FC<RippleCellLoaderProps> = ({ className = '' }) => (
  <span className={`ripple-cell-loader ${className}`.trim()} aria-hidden="true">
    {rippleCellDelays.map((delayClass, index) => (
      <span
        key={index}
        className={`ripple-cell-loader__cell${delayClass ? ` ${delayClass}` : ''}`}
      />
    ))}
  </span>
);

RippleCellLoader.displayName = 'RippleCellLoader';
