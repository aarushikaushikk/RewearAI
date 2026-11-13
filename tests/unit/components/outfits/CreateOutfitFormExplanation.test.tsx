// @vitest-environment jsdom
// US13: the explanation on the Create Outfit page. Kept apart from CreateOutfitForm.test.tsx.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { CreateOutfitForm } from '@/components/outfits/CreateOutfitForm';
import type { OutfitExplanationDto, OutfitItemDto } from '@/types/outfit';
import { mockRoutes, type Reply } from '../../../helpers/fetchMock';

// The photo model is never downloaded in these tests.
vi.mock('@/services/classification/browser/modelCache', () => ({ isClassifierModelCached: async () => false }));

const GENERATE = 'POST /api/outfits/generate';

function outfitItem(overrides: Partial<OutfitItemDto>): OutfitItemDto {
  return {
    role: 'top',
    id: 'item_shirt',
    name: 'Oxford shirt',
    image: { url: 'https://res.cloudinary.com/test/image/upload/v1/shirt.jpg' },
    category: 'Top',
    color: 'White',
    style: 'Classic',
    season: 'All-season',
    formality: 'Smart casual',
    ...overrides,
  };
}

const SHIRT = outfitItem({});
const CHINOS = outfitItem({ id: 'item_chinos', role: 'bottom', name: 'Navy chinos', category: 'Bottom', color: 'Navy', style: 'Tailored' });
const JACKET = outfitItem({ id: 'item_jacket', role: 'outerwear', name: 'Suede jacket', category: 'Outerwear', color: 'Brown', style: 'Western' });
const BOOTS = outfitItem({ id: 'item_boots', role: 'shoes', name: 'Hiking boots', category: 'Shoes', color: 'Brown', style: 'Outdoor' });
const FACTS: OutfitExplanationDto = { formalities: ['Smart casual'], seasons: ['All-season'], palette: 'neutral', alternative: false };

const OMIT = Symbol('no explanation');
const generated = (items: OutfitItemDto[], explanation: unknown = FACTS): Reply => ({
  status: 200,
  body: {
    success: true,
    data: { status: 'ok', occasion: 'work', season: 'All-season', items, ...(explanation === OMIT ? {} : { explanation }) },
  },
});

async function generateWork(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(screen.getByLabelText(/^occasion/i), 'Work');
  await user.click(screen.getByRole('button', { name: 'Generate Outfit' }));
  await screen.findByRole('heading', { name: 'Your outfit for Work' });
}

const panel = () => screen.queryByRole('region', { name: 'Why these items?' });

afterEach(() => {
  cleanup();
});

describe('CreateOutfitForm explanation (US13)', () => {
  it('explains the outfit below its items', async () => {
    const user = userEvent.setup();
    mockRoutes({ [GENERATE]: [generated([SHIRT, CHINOS, JACKET])] });
    render(<CreateOutfitForm />);

    await generateWork(user);

    const region = panel();
    expect(region).toBeInTheDocument();
    expect(within(region!).getByText(/^Picked because every piece is Smart casual for Work/)).toBeInTheDocument();
    expect(within(region!).getByText('The Suede jacket can add a rugged edge.')).toBeInTheDocument();
    const items = screen.getByRole('list', { name: 'Items in this outfit' });
    expect(items.compareDocumentPosition(region!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it.each([
    ['missing', OMIT],
    ['null', null],
    ['malformed', { formalities: 'Formal', seasons: [], palette: 'loud', alternative: 'yes' }],
    ['with an unknown palette', { ...FACTS, palette: 'toString' }],
    ['with two specific seasons', { ...FACTS, seasons: ['Summer', 'Winter'] }],
  ])('still shows an outfit whose explanation is %s, without the panel', async (_label, explanation) => {
    const user = userEvent.setup();
    mockRoutes({ [GENERATE]: [generated([SHIRT, CHINOS], explanation)] });
    render(<CreateOutfitForm />);

    await generateWork(user);

    expect(screen.getByText('Oxford shirt')).toBeInTheDocument();
    expect(panel()).not.toBeInTheDocument();
  });

  it('shows no panel when the wardrobe is insufficient', async () => {
    const user = userEvent.setup();
    mockRoutes({
      [GENERATE]: [{ status: 200, body: { success: true, data: { status: 'insufficient', occasion: 'work', reason: 'no_complete_outfit' } } }],
    });
    render(<CreateOutfitForm />);

    await user.selectOptions(screen.getByLabelText(/^occasion/i), 'Work');
    await user.click(screen.getByRole('button', { name: 'Generate Outfit' }));
    await screen.findByText(/aren't enough available items/);

    expect(panel()).not.toBeInTheDocument();
  });

  it('features a different piece after Try another, and says it is a new combination', async () => {
    const user = userEvent.setup();
    mockRoutes({
      [GENERATE]: [
        generated([SHIRT, CHINOS, JACKET, BOOTS]),
        generated([SHIRT, CHINOS, JACKET, outfitItem({ ...BOOTS, id: 'item_boots_2', name: 'Trail boots' })], {
          ...FACTS,
          alternative: true,
        }),
      ],
    });
    render(<CreateOutfitForm />);
    await generateWork(user);
    expect(within(panel()!).getByText(/^The Suede jacket /)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Try another' }));
    await screen.findByText('Trail boots');

    expect(within(panel()!).queryByText(/^The Suede jacket /)).not.toBeInTheDocument();
    expect(within(panel()!).getByText(/^The Trail boots /)).toBeInTheDocument();
    expect(within(panel()!).getByText(/different combination from the ones you've already seen/)).toBeInTheDocument();
  });

  it('keeps the current explanation when there is no other combination', async () => {
    const user = userEvent.setup();
    mockRoutes({
      [GENERATE]: [generated([SHIRT, CHINOS, JACKET]), { status: 200, body: { success: true, data: { status: 'no_alternative', occasion: 'work' } } }],
    });
    render(<CreateOutfitForm />);
    await generateWork(user);

    await user.click(screen.getByRole('button', { name: 'Try another' }));
    await screen.findByText("There isn't another suitable combination right now.");

    expect(within(panel()!).getByText('The Suede jacket can add a rugged edge.')).toBeInTheDocument();
  });
});
