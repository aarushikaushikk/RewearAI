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
});
