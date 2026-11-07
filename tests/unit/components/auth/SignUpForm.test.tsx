// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { SignUpForm } from '@/components/auth/SignUpForm';

// delay: null skips user-event's timer between simulated actions, which took most of each test's
// time and left it exposed to machine pauses. Every keystroke and event still fires, in order.
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

describe('SignUpForm', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders Email (Required), Password (Required), and Name (Optional) fields', () => {
    render(<SignUpForm />);
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
    expect(screen.getAllByText('(Required)').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('(Optional)')).toBeInTheDocument();
  });

  it('shows validation error for invalid email format', async () => {
    const user = userEvent.setup({ delay: null });
    render(<SignUpForm />);
    await user.type(screen.getByLabelText(/email/i), 'not-an-email');
    await user.type(screen.getByLabelText(/password/i), 'password123');
    await user.click(screen.getByRole('button', { name: /create account|sign up/i }));
    expect(await screen.findByText(/valid email/i)).toBeInTheDocument();
  });

  it('shows validation error for a password that is too short', async () => {
    const user = userEvent.setup({ delay: null });
    render(<SignUpForm />);
    await user.type(screen.getByLabelText(/email/i), 'user@example.com');
    await user.type(screen.getByLabelText(/password/i), 'short');
    await user.click(screen.getByRole('button', { name: /create account|sign up/i }));
    expect(await screen.findByText(/at least 8 characters/i)).toBeInTheDocument();
  });

  it('shows a field error for a name over 100 characters, without calling the API', async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy;
    const user = userEvent.setup({ delay: null });
    render(<SignUpForm />);
    await user.click(screen.getByLabelText(/name/i));
    await user.paste('x'.repeat(101));
    await user.type(screen.getByLabelText(/email/i), 'user@example.com');
    await user.type(screen.getByLabelText(/password/i), 'password123');
    await user.click(screen.getByRole('button', { name: /create account|sign up/i }));

    expect(await screen.findByText('Name must be 100 characters or fewer')).toBeInTheDocument();
    expect(screen.getByLabelText(/name/i)).toHaveFocus();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('shows conflict message on 409 response', async () => {
    const user = userEvent.setup({ delay: null });
    mockFetch(409, { error: 'Email already exists' });
    render(<SignUpForm />);
    await user.type(screen.getByLabelText(/email/i), 'existing@example.com');
    await user.type(screen.getByLabelText(/password/i), 'password123');
    await user.click(screen.getByRole('button', { name: /create account|sign up/i }));
    expect(
      await screen.findByText(/an account with this email already exists/i),
    ).toBeInTheDocument();
  });

  it('shows service-unavailable message on 503 response', async () => {
    const user = userEvent.setup({ delay: null });
    mockFetch(503, { error: 'Service unavailable' });
    render(<SignUpForm />);
    await user.type(screen.getByLabelText(/email/i), 'user@example.com');
    await user.type(screen.getByLabelText(/password/i), 'password123');
    await user.click(screen.getByRole('button', { name: /create account|sign up/i }));
    expect(await screen.findByText(/service temporarily unavailable/i)).toBeInTheDocument();
  });

  it('preserves email and name values after a failed registration', async () => {
    const user = userEvent.setup({ delay: null });
    mockFetch(503, { error: 'Service unavailable' });
    render(<SignUpForm />);
    await user.type(screen.getByLabelText(/name/i), 'Alice');
    await user.type(screen.getByLabelText(/email/i), 'alice@example.com');
    await user.type(screen.getByLabelText(/password/i), 'password123');
    await user.click(screen.getByRole('button', { name: /create account|sign up/i }));
    await screen.findByText(/service temporarily unavailable/i);
    expect(screen.getByDisplayValue('Alice')).toBeInTheDocument();
    expect(screen.getByDisplayValue('alice@example.com')).toBeInTheDocument();
  });

  it('calls POST /api/auth/register with the correct payload', async () => {
    const user = userEvent.setup({ delay: null });
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ user: { id: '1', email: 'user@example.com' } }),
    } as Response);
    render(<SignUpForm />);
    await user.type(screen.getByLabelText(/name/i), 'Alice');
    await user.type(screen.getByLabelText(/email/i), 'user@example.com');
    await user.type(screen.getByLabelText(/password/i), 'password123');
    await user.click(screen.getByRole('button', { name: /create account|sign up/i }));
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/auth/register',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            email: 'user@example.com',
            password: 'password123',
            name: 'Alice',
          }),
        }),
      );
    });
  });

  it('shows a loading state during submission', async () => {
    const user = userEvent.setup({ delay: null });
    global.fetch = vi.fn().mockReturnValueOnce(new Promise(() => {}));
    render(<SignUpForm />);
    await user.type(screen.getByLabelText(/email/i), 'user@example.com');
    await user.type(screen.getByLabelText(/password/i), 'password123');
    await user.click(screen.getByRole('button', { name: /create account|sign up/i }));
    expect(await screen.findByText(/loading/i)).toBeInTheDocument();
  });

  describe('error mapping', () => {
    async function submit() {
      const user = userEvent.setup({ delay: null });
      render(<SignUpForm />);
      await user.type(screen.getByLabelText(/email/i), 'user@example.com');
      await user.type(screen.getByLabelText(/password/i), 'password123');
      await user.click(screen.getByRole('button', { name: /create account|sign up/i }));
      return screen.findByRole('alert');
    }

    it('asks the user to check their details on 400', async () => {
      mockFetch(400, { error: 'Email is required' });
      expect(await submit()).toHaveTextContent(/check your details/i);
    });

    it('asks for a refresh on a 403 security rejection', async () => {
      mockFetch(403, { error: 'CSRF validation failed' });
      expect(await submit()).toHaveTextContent(/refresh the page and try again/i);
    });

    it('explains the rate limit on 429', async () => {
      mockFetch(429, { error: 'Too many requests' });
      expect(await submit()).toHaveTextContent(/too many attempts/i);
    });

    it('distinguishes a 500 server error from an outage', async () => {
      mockFetch(500, { error: 'An unexpected error occurred' });
      const alert = await submit();
      expect(alert).toHaveTextContent(/something went wrong on our end/i);
      expect(alert).not.toHaveTextContent(/temporarily unavailable/i);
    });

    it('tells the user to sign in when the account exists but auto sign-in failed', async () => {
      mockFetch(500, { code: 'ACCOUNT_CREATED_SESSION_FAILED', error: 'server text' });
      const alert = await submit();

      expect(alert).toHaveTextContent(/your account was created/i);
      expect(alert).toHaveTextContent(/please sign in/i);
      expect(alert).not.toHaveTextContent(/something went wrong/i);
      expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/sign-in');
    });

    it('invites a retry when registration was rolled back', async () => {
      mockFetch(500, { code: 'REGISTRATION_SESSION_FAILED', error: 'server text' });
      const alert = await submit();

      expect(alert).toHaveTextContent(/something went wrong on our end/i);
      expect(alert).not.toHaveTextContent(/your account was created/i);
    });

    it('falls back to the status message when the error body cannot be parsed', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => {
          throw new SyntaxError('Unexpected end of JSON input');
        },
      } as unknown as Response);

      expect(await submit()).toHaveTextContent(/something went wrong on our end/i);
    });

    it('does not show server-provided text', async () => {
      mockFetch(500, { error: 'duplicate key in collection users' });
      expect(await submit()).not.toHaveTextContent(/duplicate key/i);
    });

    it('reports a network failure separately from a server response', async () => {
      global.fetch = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch'));
      expect(await submit()).toHaveTextContent(/couldn't reach the server/i);
    });
  });

  it('contains a link to the sign-in page', () => {
    render(<SignUpForm />);
    const signInLink = screen.getByRole('link', { name: /sign in|log in|already have an account/i });
    expect(signInLink).toHaveAttribute('href', '/sign-in');
  });
});
