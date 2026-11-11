// @vitest-environment jsdom
import React, { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { FilterBar } from '@/components/wardrobe/FilterBar';
import { EMPTY_FILTERS, type WardrobeFilters } from '@/services/filterWardrobeItems';
import { CATEGORIES, COLORS, FORMALITIES, SEASONS } from '@/types/wardrobe';

afterEach(cleanup);

/** Holds the filters the way WardrobeGrid does, reporting each change. */
function ControlledFilterBar({ onChange }: { onChange: (filters: WardrobeFilters) => void }) {
  const [filters, setFilters] = useState<WardrobeFilters>(EMPTY_FILTERS);
  return (
    <FilterBar
      filters={filters}
      onChange={(next) => {
        setFilters(next);
        onChange(next);
      }}
    />
  );
}

// The search and filter row of wireframe 03 (US5).
describe('FilterBar', () => {
  it('shows a labelled search field and the four attribute filters, each starting at All', () => {
    render(<FilterBar filters={EMPTY_FILTERS} onChange={() => {}} />);

    const search = screen.getByRole('searchbox', { name: 'Search' });
    expect(search).toHaveValue('');
    expect(search).toHaveAttribute('placeholder', 'Search names and attributes...');

    for (const name of ['Category', 'Color', 'Season', 'Formality']) {
      const select = screen.getByRole('combobox', { name });
      expect(select).toHaveValue('');
      expect(select).toHaveDisplayValue('All');
    }
  });

  it.each([
    ['Category', CATEGORIES],
    ['Color', COLORS],
    ['Season', SEASONS],
    ['Formality', FORMALITIES],
  ])('offers All and every allowed %s', (name, values) => {
    render(<FilterBar filters={EMPTY_FILTERS} onChange={() => {}} />);

    const options = screen.getByRole('combobox', { name }).querySelectorAll('option');
    expect(Array.from(options, (option) => option.textContent)).toEqual(['All', ...values]);
  });

  it('shows the filters it is given', () => {
    render(
      <FilterBar
        filters={{
          query: 'shirt',
          category: 'Top',
          color: 'White',
          season: 'Winter',
          formality: 'Formal',
        }}
        onChange={() => {}}
      />,
    );

    expect(screen.getByRole('searchbox', { name: 'Search' })).toHaveValue('shirt');
    expect(screen.getByRole('combobox', { name: 'Category' })).toHaveValue('Top');
    expect(screen.getByRole('combobox', { name: 'Color' })).toHaveValue('White');
    expect(screen.getByRole('combobox', { name: 'Season' })).toHaveValue('Winter');
    expect(screen.getByRole('combobox', { name: 'Formality' })).toHaveValue('Formal');
  });

  it('reports typing and selections, keeping the other filters', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ControlledFilterBar onChange={onChange} />);

    await user.type(screen.getByRole('searchbox', { name: 'Search' }), 'knit');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Season' }), 'Winter');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Category' }), 'Top');

    expect(onChange).toHaveBeenLastCalledWith({
      ...EMPTY_FILTERS,
      query: 'knit',
      season: 'Winter',
      category: 'Top',
    });
  });

  it('reports choosing All again as clearing that filter', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ControlledFilterBar onChange={onChange} />);

    await user.selectOptions(screen.getByRole('combobox', { name: 'Color' }), 'Black');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Color' }), 'All');

    expect(onChange).toHaveBeenLastCalledWith(EMPTY_FILTERS);
  });
});
