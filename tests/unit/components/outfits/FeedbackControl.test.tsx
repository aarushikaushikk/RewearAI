// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { NETWORK_ERROR_MESSAGE } from '@/components/auth/authFormErrors';
import { FEEDBACK_MESSAGES, FeedbackControl } from '@/components/outfits/FeedbackControl';
import { SIGN_IN_SESSION_ENDED_PATH } from '@/lib/auth/pageSession';
import type { OutfitFeedbackDto } from '@/types/outfit';
import { mockRoutes, pending, type Reply } from '../../../helpers/fetchMock';

const RATE = 'PUT /api/outfits/feedback';
const CLEAR = 'DELETE /api/outfits/feedback/outfit_1';
const ITEM_IDS = ['item_shirt', 'item_chinos'];

const rated = (rating: 'positive' | 'negative'): Reply => ({
  status: 200,
  body: { success: true, data: { outfitId: 'outfit_1', rating } },
});
const cleared: Reply = { status: 200, body: { success: true, data: { outfitId: 'outfit_1' } } };

const helpful = () => screen.getByRole('button', { name: 'Helpful' });
const notHelpful = () => screen.getByRole('button', { name: 'Not helpful' });
const clearButton = () => screen.queryByRole('button', { name: 'Clear feedback' });

function renderControl(initial: OutfitFeedbackDto | null = null) {
  render(<FeedbackControl occasion="work" itemIds={ITEM_IDS} initial={initial} />);
  return userEvent.setup();
}

const bodyOf = (fetchMock: ReturnType<typeof mockRoutes>, index = 0) =>
  JSON.parse((fetchMock.mock.calls[index][1] as RequestInit).body as string);

afterEach(() => {
  cleanup();
});

describe('FeedbackControl (US14)', () => {
  it('asks whether the recommendation was helpful, with nothing chosen yet', () => {
    renderControl();

    expect(screen.getByRole('group', { name: 'Was this recommendation helpful?' })).toBeInTheDocument();
    expect(helpful()).toHaveAttribute('aria-pressed', 'false');
    expect(notHelpful()).toHaveAttribute('aria-pressed', 'false');
    expect(clearButton()).not.toBeInTheDocument();
  });

  it('says what Not helpful does, without claiming more', () => {
    renderControl();

    expect(screen.getByText(FEEDBACK_MESSAGES.explainer)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/learn/i);
  });

  it.each([
    ['positive', 'Helpful'],
    ['negative', 'Not helpful'],
  ] as const)('shows a saved %s rating as chosen, with Clear feedback', (rating, label) => {
    renderControl({ outfitId: 'outfit_1', rating });

    expect(screen.getByRole('button', { name: label })).toHaveAttribute('aria-pressed', 'true');
    expect(clearButton()).toBeInTheDocument();
  });

  it('saves Helpful by occasion and item IDs, with the page origin, and shows it as chosen', async () => {
    const fetchMock = mockRoutes({ [RATE]: [rated('positive')] });
    const user = renderControl();

    await user.click(helpful());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((fetchMock.mock.calls[0][1] as RequestInit).headers).toMatchObject({
      'Content-Type': 'application/json',
      Origin: window.location.origin,
    });
    expect(bodyOf(fetchMock)).toEqual({ occasion: 'work', itemIds: ITEM_IDS, rating: 'positive' });
    expect(await screen.findByRole('status')).toHaveTextContent(FEEDBACK_MESSAGES.saved);
    expect(helpful()).toHaveAttribute('aria-pressed', 'true');
    expect(clearButton()).toBeInTheDocument();
  });

  it('changes the rating', async () => {
    const fetchMock = mockRoutes({ [RATE]: [rated('negative')] });
    const user = renderControl({ outfitId: 'outfit_1', rating: 'positive' });

    await user.click(notHelpful());

    expect(bodyOf(fetchMock).rating).toBe('negative');
    expect(await screen.findByRole('status')).toHaveTextContent(FEEDBACK_MESSAGES.saved);
    expect(notHelpful()).toHaveAttribute('aria-pressed', 'true');
    expect(helpful()).toHaveAttribute('aria-pressed', 'false');
  });

  it('sends nothing when the chosen rating is pressed again', async () => {
    const fetchMock = mockRoutes({});
    const user = renderControl({ outfitId: 'outfit_1', rating: 'positive' });

    await user.click(helpful());

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('clears the saved rating by its outfit ID', async () => {
    const fetchMock = mockRoutes({ [CLEAR]: [cleared] });
    const user = renderControl({ outfitId: 'outfit_1', rating: 'negative' });

    await user.click(clearButton()!);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((fetchMock.mock.calls[0][1] as RequestInit).headers).toMatchObject({ Origin: window.location.origin });
    expect(await screen.findByRole('status')).toHaveTextContent(FEEDBACK_MESSAGES.cleared);
    expect(notHelpful()).toHaveAttribute('aria-pressed', 'false');
    expect(clearButton()).not.toBeInTheDocument();
  });

  it('clears a rating given on this page, using the outfit ID it returned', async () => {
    const fetchMock = mockRoutes({ [RATE]: [rated('positive')], [CLEAR]: [cleared] });
    const user = renderControl();

    await user.click(helpful());
    await user.click(await screen.findByRole('button', { name: 'Clear feedback' }));

    expect(fetchMock.mock.calls.map((call) => `${(call[1] as RequestInit).method} ${call[0]}`)).toEqual([RATE, CLEAR]);
    expect(await screen.findByRole('status')).toHaveTextContent(FEEDBACK_MESSAGES.cleared);
  });

  it('disables every choice while saving, so only one request is sent', async () => {
    const fetchMock = mockRoutes({ [RATE]: [pending()] });
    const user = renderControl({ outfitId: 'outfit_1', rating: 'positive' });

    await user.click(notHelpful());

    expect(helpful()).toBeDisabled();
    expect(notHelpful()).toBeDisabled();
    expect(clearButton()).toBeDisabled();
    expect(notHelpful()).toHaveAttribute('aria-busy', 'true');
    await user.click(notHelpful());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps the saved choice after a failure, and Retry sends the same choice again', async () => {
    const fetchMock = mockRoutes({ [RATE]: [{ status: 500 }, rated('negative')] });
    const user = renderControl({ outfitId: 'outfit_1', rating: 'positive' });

    await user.click(notHelpful());

    expect(await screen.findByRole('alert')).toHaveTextContent(FEEDBACK_MESSAGES.failed);
    expect(helpful()).toHaveAttribute('aria-pressed', 'true');
    expect(notHelpful()).toHaveAttribute('aria-pressed', 'false');

    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(bodyOf(fetchMock, 1)).toEqual(bodyOf(fetchMock, 0));
    expect(await screen.findByRole('status')).toHaveTextContent(FEEDBACK_MESSAGES.saved);
    expect(notHelpful()).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('offers Retry after a failed clear, keeping the rating shown', async () => {
    mockRoutes({ [CLEAR]: ['network-error', cleared] });
    const user = renderControl({ outfitId: 'outfit_1', rating: 'negative' });

    await user.click(clearButton()!);

    expect(await screen.findByRole('alert')).toHaveTextContent(NETWORK_ERROR_MESSAGE);
    expect(notHelpful()).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('status')).toHaveTextContent(FEEDBACK_MESSAGES.cleared);
  });

  it('offers Sign in instead of Retry once the session has ended', async () => {
    mockRoutes({ [RATE]: [{ status: 401, body: { error: 'server text' } }] });
    const user = renderControl();

    await user.click(helpful());

    expect(await screen.findByRole('alert')).toHaveTextContent('Your session has ended. Sign in again to continue.');
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', SIGN_IN_SESSION_ENDED_PATH);
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain('server text');
  });

  it('explains that removed items cannot be rated, without offering a pointless Retry', async () => {
    mockRoutes({ [RATE]: [{ status: 404 }] });
    const user = renderControl();

    await user.click(helpful());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Some of these items are no longer in your wardrobe. Generate a new outfit.',
    );
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });
});
