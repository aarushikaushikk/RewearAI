'use client';

import React, { useEffect, useRef } from 'react';

export type AlertVariant = 'error' | 'warning' | 'success';

export interface AlertProps {
  variant: AlertVariant;
  message: string;
  onDismiss?: () => void;
  /** Moves focus here on appearing. Use for messages that follow a user action. */
  focusOnMount?: boolean;
}

const VARIANT_STYLES: Record<
  AlertVariant,
  { container: string; text: string; icon: string }
> = {
  error: {
    container: 'bg-danger-soft border-danger',
    text: 'text-danger',
    icon: '✕',
  },
  warning: {
    container: 'bg-warning-soft border-warning',
    text: 'text-warning',
    icon: '⚠',
  },
  success: {
    container: 'bg-primary-soft border-primary',
    text: 'text-primary',
    icon: '✓',
  },
};

/**
 * Page-level alert for server or network errors.
 */
export function Alert({ variant, message, onDismiss, focusOnMount = false }: AlertProps) {
  const styles = VARIANT_STYLES[variant];
  const alertRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (focusOnMount) {
      alertRef.current?.focus();
    }
  }, [focusOnMount]);

  return (
    <div
      ref={alertRef}
      role="alert"
      tabIndex={focusOnMount ? -1 : undefined}
      className={[
        'flex items-start gap-2 rounded-xl border px-4 py-3 text-sm',
        styles.container,
      ].join(' ')}
    >
      <span aria-hidden="true" className={['mt-0.5 shrink-0', styles.text].join(' ')}>
        {styles.icon}
      </span>
      <p className={['flex-1', styles.text].join(' ')}>{message}</p>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className={[
            '-my-3 -mr-2 shrink-0 min-h-11 min-w-11 px-2 text-sm underline hover:no-underline',
            styles.text,
          ].join(' ')}
        >
          Dismiss
        </button>
      )}
    </div>
  );
}
