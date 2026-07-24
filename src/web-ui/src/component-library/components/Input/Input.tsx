/**
 * Input component
 */

import React, { forwardRef } from 'react';
import './Input.scss';

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size' | 'prefix'> {
  variant?: 'default' | 'filled' | 'outlined';
  inputSize?: 'small' | 'medium' | 'large';
  size?: 'small' | 'medium' | 'large';
  error?: boolean;
  errorMessage?: string;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  label?: string;
  hint?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(({
  variant = 'default',
  inputSize = 'medium',
  size,
  error = false,
  errorMessage,
  prefix,
  suffix,
  label,
  hint,
  className = '',
  id,
  disabled,
  ...props
}, ref) => {
  const generatedId = React.useId();
  const inputId = id ?? generatedId;
  const resolvedInputSize = size ?? inputSize;
  const classNames = [
    'void-input-wrapper',
    `void-input-wrapper--${variant}`,
    `void-input-wrapper--${resolvedInputSize}`,
    error && 'void-input-wrapper--error',
    disabled && 'void-input-wrapper--disabled',
    className
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classNames}>
      {label && <label className="void-input-label" htmlFor={inputId}>{label}</label>}
      <div className="void-input-container">
        {prefix && <span className="void-input-prefix">{prefix}</span>}
        <input
          ref={ref}
          id={inputId}
          className="void-input"
          disabled={disabled}
          {...props}
        />
        {suffix && <span className="void-input-suffix">{suffix}</span>}
      </div>
      {!error && hint && (
        <span className="void-input-error-message">{hint}</span>
      )}
      {error && errorMessage && (
        <span className="void-input-error-message">{errorMessage}</span>
      )}
    </div>
  );
});

Input.displayName = 'Input';
