// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { FormField } from '@/components/ui/FormField';

describe('FormField', () => {
  it('renders a label with the field name', () => {
    render(<FormField id="email" label="Email" type="email" value="" onChange={() => {}} />);
    expect(screen.getByText('Email')).toBeInTheDocument();
  });

  it('associates help text with the input', () => {
    render(
      <FormField id="pw" label="Password" type="password" value="" onChange={() => {}} hint="8 or more" />,
    );
    expect(screen.getByLabelText('Password')).toHaveAccessibleDescription('8 or more');
  });

  it('replaces help text with the error, which then describes the input', () => {
    render(
      <FormField
        id="pw"
        label="Password"
        type="password"
        value=""
        onChange={() => {}}
        hint="8 or more"
        error="Too short"
      />,
    );
    expect(screen.queryByText('8 or more')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toHaveAccessibleDescription('Too short');
  });

  it('shows (Required) indicator when required prop is true', () => {
    render(
      <FormField id="email" label="Email" type="email" value="" onChange={() => {}} required />,
    );
    expect(screen.getByText('(Required)')).toBeInTheDocument();
  });

  it('shows (Optional) indicator when optional prop is true', () => {
    render(
      <FormField id="name" label="Name" type="text" value="" onChange={() => {}} optional />,
    );
    expect(screen.getByText('(Optional)')).toBeInTheDocument();
  });

  it('shows no indicator when neither required nor optional', () => {
    render(<FormField id="email" label="Email" type="email" value="" onChange={() => {}} />);
    expect(screen.queryByText('(Required)')).not.toBeInTheDocument();
    expect(screen.queryByText('(Optional)')).not.toBeInTheDocument();
  });

  it('renders an input with correct type', () => {
    render(
      <FormField id="password" label="Password" type="password" value="" onChange={() => {}} />,
    );
    const input = screen.getByLabelText('Password');
    expect(input).toHaveAttribute('type', 'password');
  });

  it('links label to input via htmlFor/id', () => {
    render(<FormField id="email" label="Email" type="email" value="" onChange={() => {}} />);
    const input = screen.getByLabelText('Email');
    expect(input).toHaveAttribute('id', 'email');
  });

  it('renders an inline error message below the input when error is set', () => {
    render(
      <FormField
        id="email"
        label="Email"
        type="email"
        value=""
        onChange={() => {}}
        error="Enter a valid email address."
      />,
    );
    expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('does not render an error element when error prop is absent', () => {
    render(<FormField id="email" label="Email" type="email" value="" onChange={() => {}} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('preserves the controlled input value', () => {
    render(
      <FormField
        id="email"
        label="Email"
        type="email"
        value="user@example.com"
        onChange={() => {}}
      />,
    );
    expect(screen.getByDisplayValue('user@example.com')).toBeInTheDocument();
  });

  it('applies min height of 44px on the input', () => {
    render(<FormField id="email" label="Email" type="email" value="" onChange={() => {}} />);
    const input = screen.getByLabelText('Email');
    // The class must include something that enforces min-h-[44px] or min-h-11
    expect(input.className).toMatch(/min-h/);
  });

  describe('warning state (US11)', () => {
    const props = { id: 'style', label: 'Style', type: 'text' as const, value: 'Jacket', onChange: () => {} };
    const HINT = 'Needs review. Confirm or change this suggestion.';

    it('keeps the default look when no warning is set', () => {
      render(<FormField {...props} hint={HINT} />);
      const input = screen.getByLabelText('Style');
      expect(input).toHaveClass('border-text-muted', 'bg-surface');
      expect(input.className).not.toMatch(/warning/);
      expect(screen.getByText(HINT)).toHaveClass('text-text-muted');
    });

    it('highlights the input and its hint in the warning colors, and keeps the hint as its description', () => {
      render(<FormField {...props} hint={HINT} warning />);
      const input = screen.getByLabelText('Style');
      expect(input).toHaveClass('border-warning', 'bg-warning-soft');
      expect(input).not.toHaveClass('border-text-muted');
      expect(input).not.toHaveClass('bg-surface');
      expect(input).not.toHaveAttribute('aria-invalid');
      expect(input).toHaveAccessibleDescription(HINT);
      expect(screen.getByText(HINT)).toHaveClass('text-warning');
    });

    it('shows a validation error instead of the warning', () => {
      render(<FormField {...props} hint={HINT} warning error="Confirm or change this value." />);
      const input = screen.getByLabelText('Style');
      expect(input).toHaveClass('border-danger');
      expect(input.className).not.toMatch(/warning/);
      expect(input).toHaveAttribute('aria-invalid', 'true');
      expect(input).toHaveAccessibleDescription('Confirm or change this value.');
    });
  });
});
