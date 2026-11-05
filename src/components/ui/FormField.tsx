import React from 'react';

export interface FormFieldProps {
  id: string;
  label: string;
  type: 'text' | 'email' | 'password';
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  required?: boolean;
  optional?: boolean;
  error?: string;
  autoComplete?: string;
  disabled?: boolean;
  placeholder?: string;
}

/**
 * Accessible form field with label, Required/Optional indicator,
 * and an inline error message beneath the input.
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
  autoComplete,
  disabled,
  placeholder,
}: FormFieldProps) {
  const errorId = `${id}-error`;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="flex gap-1 items-baseline text-sm font-medium text-[#202A25]">
        {label}
        {required && (
          <span className="text-xs text-[#58655E] font-normal">(Required)</span>
        )}
        {optional && (
          <span className="text-xs text-[#58655E] font-normal">(Optional)</span>
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
        aria-describedby={error ? errorId : undefined}
        className={[
          'w-full min-h-[44px] rounded-lg border px-3 py-2 text-sm',
          'bg-white text-[#202A25] placeholder:text-[#58655E]',
          'focus:outline-none focus:ring-2 focus:ring-[#245B45] focus:border-[#245B45]',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          error
            ? 'border-[#A12828] focus:ring-[#A12828]'
            : 'border-[#D7DED8]',
        ].join(' ')}
      />

      {error && (
        <p id={errorId} role="alert" className="text-xs text-[#A12828] mt-0.5">
          {error}
        </p>
      )}
    </div>
  );
}
