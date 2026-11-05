import React from 'react';

export interface PrimaryButtonProps {
  children: React.ReactNode;
  type?: 'submit' | 'button' | 'reset';
  onClick?: () => void;
  isLoading?: boolean;
  disabled?: boolean;
  className?: string;
}

/**
 * Primary action button following the ReWear AI green brand.
 * Min-height 44 px for touch accessibility.
 */
export function PrimaryButton({
  children,
  type = 'submit',
  onClick,
  isLoading = false,
  disabled = false,
  className = '',
}: PrimaryButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || isLoading}
      className={[
        'flex items-center justify-center gap-2',
        'w-full min-h-[44px] rounded-lg px-4 py-2',
        'bg-[#245B45] hover:bg-[#194733] active:bg-[#194733]',
        'text-white text-sm font-semibold',
        'transition-colors duration-150',
        'focus:outline-none focus:ring-2 focus:ring-[#245B45] focus:ring-offset-2',
        'disabled:opacity-60 disabled:cursor-not-allowed',
        className,
      ].join(' ')}
    >
      {isLoading ? (
        <>
          <svg
            className="animate-spin h-4 w-4 text-white"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          <span>Loading…</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}
