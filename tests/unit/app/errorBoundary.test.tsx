// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import ErrorBoundary from '@/app/error';

const sensitiveError = Object.assign(
  new Error('MongoServerError: auth failed for mongodb+srv://admin:hunter2@cluster/rewear'),
  { digest: '4050751477' },
);

describe('root error boundary', () => {
  afterEach(() => {
    cleanup();
  });

  it('announces a plain explanation', () => {
    render(<ErrorBoundary error={sensitiveError} retry={vi.fn()} />);

    expect(screen.getByRole('alert')).toHaveTextContent(/we couldn't load this page/i);
  });

  it('never shows the error message or digest', () => {
    render(<ErrorBoundary error={sensitiveError} retry={vi.fn()} />);

    expect(document.body).not.toHaveTextContent('hunter2');
    expect(document.body).not.toHaveTextContent('MongoServerError');
    expect(document.body).not.toHaveTextContent('4050751477');
  });

  it('does not claim the user was signed out', () => {
    render(<ErrorBoundary error={sensitiveError} retry={vi.fn()} />);

    expect(document.body).not.toHaveTextContent(/signed out|session has ended/i);
  });

  it('retries when asked', async () => {
    const retry = vi.fn();
    const user = userEvent.setup();
    render(<ErrorBoundary error={sensitiveError} retry={retry} />);

    await user.click(screen.getByRole('button', { name: /try again/i }));

    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('offers a way out to the sign-in page', () => {
    render(<ErrorBoundary error={sensitiveError} retry={vi.fn()} />);

    expect(screen.getByRole('link', { name: /go to sign in/i })).toHaveAttribute('href', '/sign-in');
  });
});
