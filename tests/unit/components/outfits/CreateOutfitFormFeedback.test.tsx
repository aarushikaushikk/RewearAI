// @vitest-environment jsdom
// US14: recommendation feedback on the Create Outfit page. Kept apart from CreateOutfitForm.test.tsx.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { CreateOutfitForm } from '@/components/outfits/CreateOutfitForm';
import { FEEDBACK_MESSAGES } from '@/components/outfits/FeedbackControl';
import type { OutfitItemDto } from '@/types/outfit';
import { mockRoutes, pending, type Reply } from '../../../helpers/fetchMock';

const GENERATE = 'POST /api/outfits/generate';
const RATE = 'PUT /api/outfits/feedback';

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
const POLO = outfitItem({ id: 'item_polo', name: 'Polo' });

const generated = (items: OutfitItemDto[], feedback?: unknown): Reply => ({
  status: 200,
  body: {
    success: true,
    data: {
      status: 'ok',
      occasion: 'work',
      season: 'All-season',
      items,
      ...(feedback === undefined ? {} : { feedback }),
    },
  },
});

const helpful = () => screen.getByRole('button', { name: 'Helpful' });
const notHelpful = () => screen.getByRole('button', { name: 'Not helpful' });

async function generateWork(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(screen.getByLabelText(/^occasion/i), 'Work');
  await user.click(screen.getByRole('button', { name: 'Generate Outfit' }));
  await screen.findByRole('heading', { name: 'Your outfit for Work' });
}

afterEach(() => {
  cleanup();
});

describe('Create Outfit: recommendation feedback (US14)', () => {
  it('rates the generated items for the chosen occasion', async () => {
    const fetchMock = mockRoutes({
      [GENERATE]: [generated([SHIRT, CHINOS], null)],
      [RATE]: [{ status: 200, body: { success: true, data: { outfitId: 'outfit_1', rating: 'negative' } } }],
    });
    const user = userEvent.setup();
    render(<CreateOutfitForm />);

    await generateWork(user);
    await user.click(notHelpful());

    expect(await screen.findByText(FEEDBACK_MESSAGES.saved)).toBeInTheDocument();
    const rateCall = fetchMock.mock.calls.find((call) => call[0] === '/api/outfits/feedback');
    expect(JSON.parse((rateCall![1] as RequestInit).body as string)).toEqual({
      occasion: 'work',
      itemIds: ['item_shirt', 'item_chinos'],
      rating: 'negative',
    });
  });

  it('shows the rating saved for this outfit', async () => {
    mockRoutes({ [GENERATE]: [generated([SHIRT, CHINOS], { outfitId: 'outfit_9', rating: 'positive' })] });
    const user = userEvent.setup();
    render(<CreateOutfitForm />);

    await generateWork(user);

    expect(helpful()).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Clear feedback' })).toBeInTheDocument();
  });

  it.each([
    ['missing', undefined],
    ['an unknown rating', { outfitId: 'outfit_9', rating: 'love' }],
    ['no outfit ID', { rating: 'positive' }],
    ['a non-object', 'positive'],
  ])('treats %s feedback as none, still showing the outfit', async (_label, feedback) => {
    mockRoutes({ [GENERATE]: [generated([SHIRT, CHINOS], feedback)] });
    const user = userEvent.setup();
    render(<CreateOutfitForm />);

    await generateWork(user);

    expect(helpful()).toHaveAttribute('aria-pressed', 'false');
    expect(notHelpful()).toHaveAttribute('aria-pressed', 'false');
  });

  it('starts from the new outfit\'s own saved state after Try another', async () => {
    mockRoutes({
      [GENERATE]: [
        generated([SHIRT, CHINOS], { outfitId: 'outfit_1', rating: 'negative' }),
        generated([POLO, CHINOS], null),
      ],
    });
    const user = userEvent.setup();
    render(<CreateOutfitForm />);

    await generateWork(user);
    expect(notHelpful()).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Try another' }));
    await screen.findByText('Polo');

    expect(notHelpful()).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('button', { name: 'Clear feedback' })).not.toBeInTheDocument();
  });

  it('keeps the recommendation on screen when feedback fails to save', async () => {
    mockRoutes({ [GENERATE]: [generated([SHIRT, CHINOS], null)], [RATE]: [{ status: 503 }] });
    const user = userEvent.setup();
    render(<CreateOutfitForm />);

    await generateWork(user);
    await user.click(helpful());

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Your outfit for Work' })).toBeInTheDocument();
    expect(screen.getByText('Linen shirt')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('offers no feedback before an outfit is shown, or while generating', async () => {
    mockRoutes({ [GENERATE]: [pending()] });
    const user = userEvent.setup();
    render(<CreateOutfitForm />);

    expect(screen.queryByRole('button', { name: 'Helpful' })).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText(/^occasion/i), 'Work');
    await user.click(screen.getByRole('button', { name: 'Generate Outfit' }));

    expect(screen.queryByRole('button', { name: 'Helpful' })).not.toBeInTheDocument();
  });
});
