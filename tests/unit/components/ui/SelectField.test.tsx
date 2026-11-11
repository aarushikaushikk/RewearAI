// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { SelectField } from '@/components/ui/SelectField';

const SEASONS = ['Spring', 'Summer'] as const;

describe('SelectField', () => {
  it('labels the select and starts on a prompt with no value', () => {
    render(<SelectField id="season" label="Season" value="" options={SEASONS} onChange={() => {}} />);

    expect(screen.getByLabelText('Season')).toHaveValue('');
    expect(screen.getByRole('option', { name: 'Choose…' })).toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(3);
  });

  it('shows (Required) when required', () => {
    render(
      <SelectField id="season" label="Season" value="" options={SEASONS} onChange={() => {}} required />,
    );

    expect(screen.getByText('(Required)')).toBeInTheDocument();
  });

  it('reports the chosen value', async () => {
    const onChange = vi.fn();
    render(<SelectField id="season" label="Season" value="" options={SEASONS} onChange={onChange} />);

    await userEvent.selectOptions(screen.getByLabelText('Season'), 'Summer');

    expect(onChange).toHaveBeenCalledWith('Summer');
  });

  it('marks the select invalid and describes it with the error', () => {
    render(
      <SelectField
        id="season"
        label="Season"
        value=""
        options={SEASONS}
        onChange={() => {}}
        error="Choose a season."
      />,
    );

    const select = screen.getByLabelText('Season');
    expect(select).toHaveAttribute('aria-invalid', 'true');
    expect(select).toHaveAccessibleDescription('Choose a season.');
  });

  it('describes the select with a hint, which an error replaces', () => {
    const props = { id: 'season', label: 'Season', value: '', options: SEASONS, onChange: () => {} };
    const { rerender } = render(<SelectField {...props} hint="Suggested from your photo." />);
    expect(screen.getByLabelText('Season')).toHaveAccessibleDescription('Suggested from your photo.');

    rerender(<SelectField {...props} hint="Suggested from your photo." error="Choose a season." />);
    expect(screen.getByLabelText('Season')).toHaveAccessibleDescription('Choose a season.');
    expect(screen.queryByText('Suggested from your photo.')).not.toBeInTheDocument();
  });

  describe('warning state (US11)', () => {
    const props = { id: 'season', label: 'Season', value: 'Summer', options: SEASONS, onChange: () => {} };
    const HINT = 'Needs review. Confirm or change this suggestion.';

    it('keeps the default look when no warning is set', () => {
      render(<SelectField {...props} hint={HINT} />);
      const select = screen.getByLabelText('Season');
      expect(select).toHaveClass('border-text-muted', 'bg-surface');
      expect(select.className).not.toMatch(/warning/);
      expect(screen.getByText(HINT)).toHaveClass('text-text-muted');
    });

    it('highlights the select and its hint in the warning colors, and keeps the hint as its description', () => {
      render(<SelectField {...props} hint={HINT} warning />);
      const select = screen.getByLabelText('Season');
      expect(select).toHaveClass('border-warning', 'bg-warning-soft');
      expect(select).not.toHaveClass('border-text-muted');
      expect(select).not.toHaveClass('bg-surface');
      expect(select).not.toHaveAttribute('aria-invalid');
      expect(select).toHaveAccessibleDescription(HINT);
      expect(screen.getByText(HINT)).toHaveClass('text-warning');
    });

    it('shows a validation error instead of the warning', () => {
      render(<SelectField {...props} hint={HINT} warning error="Confirm or change this value." />);
      const select = screen.getByLabelText('Season');
      expect(select).toHaveClass('border-danger');
      expect(select.className).not.toMatch(/warning/);
      expect(select).toHaveAttribute('aria-invalid', 'true');
      expect(select).toHaveAccessibleDescription('Confirm or change this value.');
    });
  });
});
