import React from 'react';

export type AlertVariant = 'error' | 'warning' | 'success';

export interface AlertProps {
  variant: AlertVariant;
  message: string;
  onDismiss?: () => void;
}

const VARIANT_STYLES: Record<
  AlertVariant,
  { container: string; text: string; icon: string }
> = {
  error: {
    container: 'bg-[#FFF0EF] border-[#A12828] text-danger',
    text: 'text-[#A12828]',
    icon: '✕',
  },
  warning: {
    container: 'bg-[#FFF5DE] border-[#865A13] text-warning',
    text: 'text-[#865A13]',
    icon: '⚠',
  },
  success: {
    container: 'bg-[#E8F1EB] border-[#245B45] text-success',
    text: 'text-[#245B45]',
    icon: '✓',
  },
};

/**
 * Page-level alert for server or network errors.
 */
export function Alert({ variant, message, onDismiss }: AlertProps) {
  const styles = VARIANT_STYLES[variant];

  return (
    <div
      role="alert"
      className={[
        'flex items-start gap-2 rounded-lg border px-4 py-3 text-sm',
        styles.container,
      ].join(' ')}
    >
      <span aria-hidden="true" className="mt-0.5 shrink-0">
        {styles.icon}
      </span>
      <p className={['flex-1', styles.text].join(' ')}>{message}</p>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className={[
            'shrink-0 ml-2 text-xs underline hover:no-underline',
            styles.text,
          ].join(' ')}
        >
          Dismiss
        </button>
      )}
    </div>
  );
}
