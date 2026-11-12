// @vitest-environment jsdom
// US10: Mark as worn on the Create Outfit page. Kept apart from CreateOutfitForm.test.tsx.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { CreateOutfitForm } from '@/components/outfits/CreateOutfitForm';
import { MARK_WORN_MESSAGES } from '@/components/outfits/MarkAsWornButton';
import { todayLocalDate } from '@/lib/dates/localDate';
import type { OutfitItemDto, OutfitRecommendationDto } from '@/types/outfit';
import { mockRoutes, pending, type Reply } from '../../../helpers/fetchMock';

const GENERATE = 'POST /api/outfits/generate';
const HISTORY = 'POST /api/outfits/history';

function outfitItem(overrides: Partial<OutfitItemDto>): OutfitItemDto {
  return {
    role: 'top',
    id: 'item_shirt',
    name: 'Linen shirt',
    image: { url: 'https://res.cloudinary.com/test/image/upload/v1/shirt.jpg' },
    category: 'Top',
    color: 'White',
    style: 'Button-down',
    season: 'All-season',
    formality: 'Smart casual',
    ...overrides,
  };
}

const SHIRT = outfitItem({});
const CHINOS = outfitItem({ id: 'item_chinos', role: 'bottom', name: 'Navy chinos', category: 'Bottom' });
const DRESS = outfitItem({ id: 'item_dress', role: 'dress', name: 'Wrap dress', category: 'Dress' });

const generated = (occasion: string, items: OutfitItemDto[]): Reply => ({
  status: 200,
  body: { success: true, data: { status: 'ok', occasion, season: 'All-season', items } as OutfitRecommendationDto },
});
const recorded: Reply = {
  status: 201,
  body: {
    success: true,
    data: { created: true, entry: { id: 'h1', wornOn: todayLocalDate(), occasion: 'work', recordedAt: '', items: [] } },
  },
};

const historyBodies = (fetchMock: ReturnType<typeof mockRoutes>) =>
  fetchMock.mock.calls
    .filter((call) => call[0] === '/api/outfits/history')
    .map((call) => JSON.parse((call[1] as RequestInit).body as string));

async function generateFor(user: ReturnType<typeof userEvent.setup>, label: string) {
  await user.selectOptions(screen.getByLabelText(/^occasion/i), label);
  await user.click(screen.getByRole('button', { name: 'Generate Outfit' }));
  await screen.findByRole('heading', { name: `Your outfit for ${label}` });
}

afterEach(() => {
  cleanup();
});

describe('Create Outfit: Mark as worn (US10)', () => {
  it('records the generated items for the chosen occasion', async () => {
    const fetchMock = mockRoutes({ [GENERATE]: [generated('work', [SHIRT, CHINOS])], [HISTORY]: [recorded] });
    const user = userEvent.setup();
    render(<CreateOutfitForm />);

    await generateFor(user, 'Work');
    await user.click(screen.getByRole('button', { name: 'Mark as worn' }));

    expect(await screen.findByText(/Recorded as worn on/)).toBeInTheDocument();
    expect(historyBodies(fetchMock)).toEqual([
      { itemIds: ['item_shirt', 'item_chinos'], occasion: 'work', wornOn: todayLocalDate() },
    ]);
  });

  it('keeps the recommendation on screen after a failed attempt', async () => {
    mockRoutes({ [GENERATE]: [generated('work', [SHIRT, CHINOS])], [HISTORY]: [{ status: 503 }] });
    const user = userEvent.setup();
    render(<CreateOutfitForm />);

    await generateFor(user, 'Work');
    await user.click(screen.getByRole('button', { name: 'Mark as worn' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(MARK_WORN_MESSAGES.unavailable);
    expect(screen.getByRole('heading', { name: 'Your outfit for Work' })).toBeInTheDocument();
    expect(screen.getByText('Linen shirt')).toBeInTheDocument();
    expect(screen.getByText('Navy chinos')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('starts fresh for a newly generated outfit', async () => {
    const fetchMock = mockRoutes({
      [GENERATE]: [generated('work', [SHIRT, CHINOS]), generated('dinner', [DRESS])],
      [HISTORY]: [recorded, recorded],
    });
    const user = userEvent.setup();
    render(<CreateOutfitForm />);

    await generateFor(user, 'Work');
    await user.click(screen.getByRole('button', { name: 'Mark as worn' }));
    await screen.findByText(/Recorded as worn on/);

    await generateFor(user, 'Dinner');
    expect(screen.queryByText(/Recorded as worn on/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Mark as worn' }));
    await screen.findByText(/Recorded as worn on/);

    expect(historyBodies(fetchMock).map((b) => [b.itemIds, b.occasion])).toEqual([
      [['item_shirt', 'item_chinos'], 'work'],
      [['item_dress'], 'dinner'],
    ]);
  });

  it('offers no Mark as worn before an outfit is shown, or while generating', async () => {
    mockRoutes({ [GENERATE]: [pending()] });
    const user = userEvent.setup();
    render(<CreateOutfitForm />);

    expect(screen.queryByRole('button', { name: 'Mark as worn' })).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText(/^occasion/i), 'Work');
    await user.click(screen.getByRole('button', { name: 'Generate Outfit' }));

    expect(screen.queryByRole('button', { name: 'Mark as worn' })).not.toBeInTheDocument();
  });

  it('offers no Mark as worn when the wardrobe is insufficient', async () => {
    mockRoutes({
      [GENERATE]: [
        { status: 200, body: { success: true, data: { status: 'insufficient', occasion: 'formal', reason: 'no_suitable_items' } } },
      ],
    });
    const user = userEvent.setup();
    render(<CreateOutfitForm />);

    await user.selectOptions(screen.getByLabelText(/^occasion/i), 'Formal');
    await user.click(screen.getByRole('button', { name: 'Generate Outfit' }));
    await screen.findByText(/There aren.t enough available items/);

    expect(screen.queryByRole('button', { name: 'Mark as worn' })).not.toBeInTheDocument();
  });
});
