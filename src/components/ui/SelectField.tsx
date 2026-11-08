import React from 'react';

export interface SelectFieldProps {
  id: string;
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
  required?: boolean;
  optional?: boolean;
  error?: string;
  /** Help text beneath the select; an error replaces it, as in FormField. */
  hint?: string;
  disabled?: boolean;
  /** Shown while no value is chosen. */
  placeholder?: string;
}

/**
 * Accessible select with label, Required/Optional indicator, and an inline error
 * message beneath it. Matches FormField.
 */
export function SelectField({
  id,
  label,
  value,
  options,
  onChange,
  required,
  optional,
  error,
  hint,
  disabled,
  placeholder = 'Choose…',
}: SelectFieldProps) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = error ? errorId : hint ? hintId : undefined;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="flex gap-1 items-baseline text-sm font-medium text-text">
        {label}
        {required && <span className="text-sm text-text-muted font-normal">(Required)</span>}
        {optional && <span className="text-sm text-text-muted font-normal">(Optional)</span>}
      </label>

      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        disabled={disabled}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={describedBy}
        className={[
          'w-full min-h-11 rounded-xl border px-3 py-2 text-base',
          'bg-surface text-text',
          'focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          // The muted text color keeps input boundaries at 3:1 contrast or better.
          error ? 'border-danger focus:ring-danger' : 'border-text-muted',
        ].join(' ')}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>

      {error ? (
        <p id={errorId} role="alert" className="text-sm text-danger mt-0.5">
          {error}
        </p>
      ) : (
        hint && (
          <p id={hintId} className="text-sm text-text-muted mt-0.5">
            {hint}
          </p>
        )
      )}
    </div>
  );
}
