// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { Alert } from '@/components/ui/Alert';

describe('Alert', () => {
  it('renders error variant with the message', () => {
    render(<Alert variant="error" message="Something went wrong." />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Something went wrong.')).toBeInTheDocument();
  });

  it('renders warning variant', () => {
    render(<Alert variant="warning" message="This is a warning." />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('This is a warning.')).toBeInTheDocument();
  });

  it('renders success variant', () => {
    render(<Alert variant="success" message="Done!" />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Done!')).toBeInTheDocument();
  });

  it('calls onDismiss when dismiss button is clicked', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(<Alert variant="error" message="Error!" onDismiss={onDismiss} />);
    const dismissBtn = screen.getByRole('button', { name: /dismiss/i });
    await user.click(dismissBtn);
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('does not render dismiss button when onDismiss is not provided', () => {
    render(<Alert variant="error" message="Error!" />);
    expect(screen.queryByRole('button', { name: /dismiss/i })).not.toBeInTheDocument();
  });

  it('applies danger background class for error variant', () => {
    render(<Alert variant="error" message="Error!" />);
    const alertEl = screen.getByRole('alert');
    // Check the element's class list references danger styling
    expect(alertEl.className).toMatch(/danger/);
  });
});
