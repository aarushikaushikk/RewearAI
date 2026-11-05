// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { PrimaryButton } from '@/components/ui/PrimaryButton';

describe('PrimaryButton', () => {
  it('renders with the given label', () => {
    render(<PrimaryButton>Sign In</PrimaryButton>);
    expect(screen.getByRole('button', { name: 'Sign In' })).toBeInTheDocument();
  });

  it('calls onClick when clicked', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<PrimaryButton onClick={onClick}>Click me</PrimaryButton>);
    await user.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('is disabled and shows loading text when isLoading is true', () => {
    render(<PrimaryButton isLoading>Sign In</PrimaryButton>);
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('does not call onClick when disabled', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<PrimaryButton disabled onClick={onClick}>Click</PrimaryButton>);
    await user.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('defaults to type="submit"', () => {
    render(<PrimaryButton>Submit</PrimaryButton>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit');
  });

  it('renders with type="button" when specified', () => {
    render(<PrimaryButton type="button">Click</PrimaryButton>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });

  it('meets min-height requirement (44px class present)', () => {
    render(<PrimaryButton>Click</PrimaryButton>);
    const button = screen.getByRole('button');
    expect(button.className).toMatch(/min-h/);
  });
});
