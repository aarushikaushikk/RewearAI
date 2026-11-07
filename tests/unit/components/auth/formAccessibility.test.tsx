// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { SignInForm } from '@/components/auth/SignInForm';
import { SignUpForm } from '@/components/auth/SignUpForm';

// delay: null skips user-event's timer between simulated actions, which took most of each test's
// time and left it exposed to machine pauses. Every keystroke and event still fires, in order.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

function mockResponse(status: number, body: object = {}) {
  global.fetch = vi.fn().mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response);
}

const FORMS = [
  { name: 'SignInForm', Form: SignInForm, submit: /sign in/i },
  { name: 'SignUpForm', Form: SignUpForm, submit: /create account/i },
];

describe.each(FORMS)('$name accessibility', ({ Form, submit }) => {
  async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByLabelText(/email/i), 'user@example.com');
    await user.type(screen.getByLabelText(/password/i), 'password123');
    await user.click(screen.getByRole('button', { name: submit }));
  }

  it('moves focus to the first invalid field after failed validation', async () => {
    const user = userEvent.setup({ delay: null });
    render(<Form />);

    await user.click(screen.getByRole('button', { name: submit }));

    expect(screen.getByLabelText(/email/i)).toHaveFocus();
  });

  it('moves focus to the password field when only the password is invalid', async () => {
    const user = userEvent.setup({ delay: null });
    render(<Form />);

    await user.type(screen.getByLabelText(/email/i), 'user@example.com');
    await user.click(screen.getByRole('button', { name: submit }));

    expect(screen.getByLabelText(/password/i)).toHaveFocus();
  });

  it('associates each validation message with its field', async () => {
    const user = userEvent.setup({ delay: null });
    render(<Form />);

    await user.click(screen.getByRole('button', { name: submit }));

    const email = screen.getByLabelText(/email/i);
    expect(email).toHaveAttribute('aria-invalid', 'true');
    expect(email).toHaveAccessibleDescription(/email is required/i);
  });

  it('moves focus to the message after a server failure', async () => {
    const user = userEvent.setup({ delay: null });
    mockResponse(503);
    render(<Form />);

    await fillAndSubmit(user);

    expect(await screen.findByRole('alert')).toHaveFocus();
  });

  it('returns focus to the email field when the message is dismissed', async () => {
    const user = userEvent.setup({ delay: null });
    mockResponse(503);
    render(<Form />);
    await fillAndSubmit(user);
    await screen.findByRole('alert');

    await user.click(screen.getByRole('button', { name: /dismiss/i }));

    expect(screen.getByLabelText(/email/i)).toHaveFocus();
  });

  it('stays busy after success so the form cannot be submitted twice while leaving', async () => {
    const user = userEvent.setup({ delay: null });
    mockResponse(200);
    render(<Form />);

    await fillAndSubmit(user);

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole('status')).toHaveTextContent(/loading/i);
    expect(screen.getByRole('button', { name: /loading/i })).toBeDisabled();
  });

  it('is usable again after a failure', async () => {
    const user = userEvent.setup({ delay: null });
    mockResponse(503);
    render(<Form />);
    await fillAndSubmit(user);
    await screen.findByRole('alert');

    expect(screen.getByRole('button', { name: submit })).toBeEnabled();
    expect(screen.getByLabelText(/email/i)).toBeEnabled();
  });
});

describe('SignUpForm password guidance', () => {
  it('states the password rule before the user submits', () => {
    render(<SignUpForm />);

    expect(screen.getByLabelText(/password/i)).toHaveAccessibleDescription(/at least 8 characters/i);
  });
});
