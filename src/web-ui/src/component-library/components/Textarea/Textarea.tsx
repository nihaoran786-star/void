import React, { forwardRef, useRef, useImperativeHandle, useCallback } from 'react';
import './Textarea.scss';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: boolean;
  errorMessage?: string;
  hint?: string;
  autoResize?: boolean;
  showCount?: boolean;
  maxLength?: number;
  variant?: 'default' | 'filled' | 'outlined';
  className?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      label,
      error = false,
      errorMessage,
      hint,
      autoResize = false,
      showCount = false,
      maxLength,
      variant = 'default',
      className = '',
      value,
      onChange,
      style,
      id,
      ...props
    },
    ref
  ) => {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const generatedId = React.useId();
    const textareaId = id ?? generatedId;
    const [charCount, setCharCount] = React.useState(0);

    useImperativeHandle(ref, () => textareaRef.current!);

    const adjustHeight = useCallback(() => {
      if (autoResize && textareaRef.current) {
        textareaRef.current.style.height = 'auto';
        textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
      }
    }, [autoResize]);

    React.useEffect(() => {
      adjustHeight();
    }, [value, adjustHeight]);

    React.useEffect(() => {
      const count = typeof value === 'string' ? value.length : 0;
      setCharCount(count);
    }, [value]);

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;
      setCharCount(newValue.length);
      adjustHeight();
      onChange?.(e);
    };

    const containerClass = [
      'void-textarea',
      `void-textarea--${variant}`,
      error && 'void-textarea--error',
      props.disabled && 'void-textarea--disabled',
      className
    ].filter(Boolean).join(' ');

    return (
      <div className={containerClass}>
        {label && (
          <label className="void-textarea__label" htmlFor={textareaId}>
            {label}
            {props.required && <span className="void-textarea__required">*</span>}
          </label>
        )}
        <div className="void-textarea__wrapper">
          <textarea
            ref={textareaRef}
            id={textareaId}
            className="void-textarea__field"
            value={value}
            onChange={handleChange}
            maxLength={maxLength}
            style={style}
            {...props}
          />
        </div>
        {(hint || errorMessage || showCount) && (
          <div className="void-textarea__footer">
            <div className="void-textarea__hint-wrapper">
              {error && errorMessage && (
                <span className="void-textarea__error-message">{errorMessage}</span>
              )}
              {!error && hint && (
                <span className="void-textarea__hint">{hint}</span>
              )}
            </div>
            {showCount && (
              <span className="void-textarea__count">
                {charCount}{maxLength && ` / ${maxLength}`}
              </span>
            )}
          </div>
        )}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';
