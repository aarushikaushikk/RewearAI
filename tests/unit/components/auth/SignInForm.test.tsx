// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { SignInForm } from '@/components/auth/SignInForm';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

function mockFetch(status: number, body: object) {
  global.fetch = vi.fn().mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response);
}

describe('SignInForm', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders Email (Required) and Password (Required) fields', () => {
    render(<SignInForm />);
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getAllByText('(Required)').length).toBeGreaterThanOrEqual(2);
  });

  it('shows inline validation errors on empty submit', async () => {
    const user = userEvent.setup();
    render(<SignInForm />);
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByText(/email is required/i)).toBeInTheDocument();
    expect(await screen.findByText(/password is required/i)).toBeInTheDocument();
  });

  it('shows generic error message on 401 response', async () => {
    const user = userEvent.setup();
    mockFetch(401, { error: 'Invalid credentials' });
    render(<SignInForm />);
    await user.type(screen.getByLabelText(/email/i), 'user@example.com');
    await user.type(screen.getByLabelText(/password/i), 'wrongpassword');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    expect(
      await screen.findByText(/sign-in failed\. check your details and try again/i),
    ).toBeInTheDocument();
  });

  it('shows service-unavailable message on 503 response', async () => {
    const user = userEvent.setup();
    mockFetch(503, { error: 'Service unavailable' });
    render(<SignInForm />);
    await user.type(screen.getByLabelText(/email/i), 'user@example.com');
    await user.type(screen.getByLabelText(/password/i), 'password123');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    expect(
      await screen.findByText(/service temporarily unavailable/i),
    ).toBeInTheDocument();
  });

  it('shows rate-limit message on 429 response', async () => {
    const user = userEvent.setup();
    mockFetch(429, { error: 'Too many requests' });
    render(<SignInForm />);
    await user.type(screen.getByLabelText(/email/i), 'user@example.com');
    await user.type(screen.getByLabelText(/password/i), 'password123');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByText(/too many attempts/i)).toBeInTheDocument();
  });

  it('preserves the email value after a failed login', async () => {
    const user = userEvent.setup();
    mockFetch(401, { error: 'Invalid credentials' });
    render(<SignInForm />);
    await user.type(screen.getByLabelText(/email/i), 'user@example.com');
    await user.type(screen.getByLabelText(/password/i), 'wrongpassword');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    await screen.findByText(/sign-in failed/i);
    expect(screen.getByDisplayValue('user@example.com')).toBeInTheDocument();
  });

  it('calls POST /api/auth/login with the correct payload', async () => {
    const user = userEvent.setup();
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ user: { id: '1', email: 'user@example.com' } }),
    } as Response);
    render(<SignInForm />);
    await user.type(screen.getByLabelText(/email/i), 'user@example.com');
    await user.type(screen.getByLabelText(/password/i), 'password123');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/auth/login',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ email: 'user@example.com', password: 'password123' }),
        }),
      );
    });
  });

  it('shows a loading state during submission', async () => {
    const user = userEvent.setup();
    // Never-resolving fetch to hold the loading state
    global.fetch = vi.fn().mockReturnValueOnce(new Promise(() => {}));
    render(<SignInForm />);
    await user.type(screen.getByLabelText(/email/i), 'user@example.com');
    await user.type(screen.getByLabelText(/password/i), 'password123');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByText(/loading/i)).toBeInTheDocument();
  });

  describe('error mapping', () => {
    async function submitWith(status: number, body: object = {}) {
      const user = userEvent.setup();
      mockFetch(status, body);
      render(<SignInForm />);
      await user.type(screen.getByLabelText(/email/i), 'user@example.com');
      await user.type(screen.getByLabelText(/password/i), 'password123');
      await user.click(screen.getByRole('button', { name: /sign in/i }));
      return screen.findByRole('alert');
    }

    it('asks the user to check their details on 400', async () => {
      expect(await submitWith(400)).toHaveTextContent(/check your details/i);
    });

    it('does not blame the credentials on a 403 security rejection', async () => {
      const alert = await submitWith(403);
      expect(alert).toHaveTextContent(/refresh the page and try again/i);
      expect(alert).not.toHaveTextContent(/check your details/i);
    });

    it('distinguishes a 500 server error from an outage', async () => {
      const alert = await submitWith(500);
      expect(alert).toHaveTextContent(/something went wrong on our end/i);
      expect(alert).not.toHaveTextContent(/temporarily unavailable/i);
    });

    it('does not reveal whether an account exists or show server text on 401', async () => {
      const alert = await submitWith(401, { error: 'No user alice in table users' });
      expect(alert).toHaveTextContent(/sign-in failed/i);
      expect(alert).not.toHaveTextContent(/alice/i);
    });

    it('reports a network failure separately from a server response', async () => {
      const user = userEvent.setup();
      global.fetch = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch'));
      render(<SignInForm />);
      await user.type(screen.getByLabelText(/email/i), 'user@example.com');
      await user.type(screen.getByLabelText(/password/i), 'password123');
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't reach the server/i);
    });
  });

  it('contains a link to the sign-up page', () => {
    render(<SignInForm />);
    const signUpLink = screen.getByRole('link', { name: /sign up|create an account|register/i });
    expect(signUpLink).toHaveAttribute('href', '/sign-up');
  });
});
