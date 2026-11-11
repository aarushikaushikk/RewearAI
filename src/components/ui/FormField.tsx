import React from 'react';

export interface FormFieldProps {
  id: string;
  label: string;
  type: 'text' | 'email' | 'password' | 'search';
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  required?: boolean;
  optional?: boolean;
  error?: string;
  hint?: string;
  /** Highlights the input and hint in the warning colors; an error takes precedence. */
  warning?: boolean;
  autoComplete?: string;
  disabled?: boolean;
  placeholder?: string;
}

/**
 * Accessible form field with label, Required/Optional indicator, and either
 * help text or an inline error message beneath the input.
 */
export function FormField({
  id,
  label,
  type,
  value,
  onChange,
  required,
  optional,
  error,
  hint,
  warning,
  autoComplete,
  disabled,
  placeholder,
}: FormFieldProps) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = error ? errorId : hint ? hintId : undefined;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="flex gap-1 items-baseline text-sm font-medium text-text">
        {label}
        {required && (
          <span className="text-sm text-text-muted font-normal">(Required)</span>
        )}
        {optional && (
          <span className="text-sm text-text-muted font-normal">(Optional)</span>
        )}
      </label>

      <input
        id={id}
        type={type}
        value={value}
        onChange={onChange}
        required={required}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete={autoComplete}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={describedBy}
        className={[
          'w-full min-h-11 rounded-xl border px-3 py-2 text-base',
          'text-text placeholder:text-text-muted',
          'focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          // The muted text color keeps input boundaries at 3:1 contrast or better.
          error
            ? 'bg-surface border-danger focus:ring-danger'
            : warning
              ? 'bg-warning-soft border-warning'
              : 'bg-surface border-text-muted',
        ].join(' ')}
      />

      {error ? (
        <p id={errorId} role="alert" className="text-sm text-danger mt-0.5">
          {error}
        </p>
      ) : (
        hint && (
          <p id={hintId} className={`text-sm mt-0.5 ${warning ? 'text-warning' : 'text-text-muted'}`}>
            {hint}
          </p>
        )
      )}
    </div>
  );
}
