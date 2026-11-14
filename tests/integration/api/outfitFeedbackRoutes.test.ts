import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import {
  handleClearOutfitFeedback,
  handleRateOutfit,
  type OutfitFeedbackHandlerDeps,
} from '@/lib/outfits/outfitFeedbackHandlers';
import { handleGenerateOutfit } from '@/lib/outfits/outfitHandlers';
import { PUT as rateOutfitRoute } from '@/app/api/outfits/feedback/route';
import { DELETE as clearFeedbackRoute } from '@/app/api/outfits/feedback/[outfitId]/route';
import { SESSION_COOKIE_NAME } from '@/lib/auth/cookieConfig';
import { RepositoryUnavailableError } from '@/lib/repositories/repositoryErrors';
import { AuthService } from '@/services/authService';
import { OutfitFeedbackService } from '@/services/outfitFeedbackService';
import { OutfitRecommendationService } from '@/services/outfitRecommendationService';
import type { Category } from '@/types/wardrobe';
import { itemFor } from '../../contracts/wardrobeItemRepositoryContract';
import { MemoryOutfitFeedbackRepository } from '../../mocks/memoryOutfitFeedbackRepository';
import { MemoryOutfitHistoryRepository } from '../../mocks/memoryOutfitHistoryRepository';
import { MemorySessionRepository } from '../../mocks/memorySessionRepository';
import { MemoryUserRepository } from '../../mocks/memoryUserRepository';
import { MemoryWardrobeItemRepository } from '../../mocks/memoryWardrobeItemRepository';

const ORIGIN = 'http://localhost:3000';
const PASSWORD = 'Password123!';
const UNAVAILABLE = 'The outfit service is temporarily unavailable. Please try again later.';

interface RequestOptions {
  cookie?: string;
  origin?: string | null;
  body?: unknown;
}

function apiRequest(method: string, path: string, options: RequestOptions = {}) {
  const origin = options.origin === undefined ? ORIGIN : options.origin;
  return new Request(`${ORIGIN}${path}`, {
    method,
    headers: {
      host: 'localhost:3000',
      ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(origin ? { origin } : {}),
      ...(options.cookie ? { cookie: options.cookie } : {}),
    },
    ...(options.body === undefined
      ? {}
      : { body: typeof options.body === 'string' ? options.body : JSON.stringify(options.body) }),
  });
}

describe('recommendation feedback API (US14)', () => {
  let authService: AuthService;
  let items: MemoryWardrobeItemRepository;
  let feedback: MemoryOutfitFeedbackRepository;
  let deps: OutfitFeedbackHandlerDeps;
  let alex: { id: string; cookie: string };
  let sam: { id: string; cookie: string };
  let consoleError: MockInstance;
  let nextImage = 1;

  async function signUp(email: string) {
    const result = await authService.register({ email, password: PASSWORD });
    return { id: result.user.id, cookie: `${SESSION_COOKIE_NAME}=${result.sessionToken}` };
  }

  async function addItem(ownerId: string, category: Category) {
    return items.create({ ...itemFor(ownerId, `fb/${nextImage++}`), category, formality: 'Casual', season: 'All-season' });
  }

  function rateAs(user: { cookie: string }, body: unknown) {
    return handleRateOutfit(apiRequest('PUT', '/api/outfits/feedback', { cookie: user.cookie, body }), deps);
  }

  function clearAs(user: { cookie: string }, outfitId: string) {
    return handleClearOutfitFeedback(
      apiRequest('DELETE', `/api/outfits/feedback/${outfitId}`, { cookie: user.cookie }),
      outfitId,
      deps,
    );
  }

  function generateAs(user: { cookie: string }, body: unknown) {
    return handleGenerateOutfit(apiRequest('POST', '/api/outfits/generate', { cookie: user.cookie, body }), {
      authService,
      outfitService: new OutfitRecommendationService(items, feedback),
    });
  }

  async function outfitOf(user: { id: string }) {
    return { top: await addItem(user.id, 'Top'), bottom: await addItem(user.id, 'Bottom') };
  }

  beforeEach(async () => {
    authService = new AuthService(new MemoryUserRepository(), new MemorySessionRepository());
    items = new MemoryWardrobeItemRepository();
    const outfits = new MemoryOutfitHistoryRepository();
    feedback = new MemoryOutfitFeedbackRepository(outfits);
    deps = { authService, outfitFeedbackService: new OutfitFeedbackService(outfits, feedback, items) };
    alex = await signUp('alex@example.com');
    sam = await signUp('sam@example.com');
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  describe('PUT /api/outfits/feedback', () => {
    it('saves the rating and answers 200 with the outfit ID and rating', async () => {
      const { top, bottom } = await outfitOf(alex);

      const res = await rateAs(alex, { occasion: 'casual', itemIds: [top.id, bottom.id], rating: 'positive' });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        success: true,
        data: { outfitId: expect.any(String), rating: 'positive' },
      });
    });

    it('changes the rating on the same outfit', async () => {
      const { top, bottom } = await outfitOf(alex);
      const first = await (await rateAs(alex, { occasion: 'casual', itemIds: [top.id, bottom.id], rating: 'positive' })).json();

      const res = await rateAs(alex, { occasion: 'casual', itemIds: [bottom.id, top.id], rating: 'negative' });

      expect((await res.json()).data).toEqual({ outfitId: first.data.outfitId, rating: 'negative' });
      await expect(feedback.listRatedByOccasion(alex.id, 'casual')).resolves.toHaveLength(1);
    });

    it("refuses another user's item with 404 and a fixed message, storing nothing", async () => {
      const mine = await addItem(alex.id, 'Top');
      const theirs = await addItem(sam.id, 'Bottom');

      const res = await rateAs(alex, { occasion: 'casual', itemIds: [mine.id, theirs.id], rating: 'negative' });

      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({
        success: false,
        error: 'One or more of these items are not in your wardrobe.',
      });
      await expect(feedback.listRatedByOccasion(alex.id, 'casual')).resolves.toEqual([]);
    });

    it.each([
      ['a malformed body', '{not json'],
      ['a missing rating', { occasion: 'casual', itemIds: ['item_1'] }],
      ['an unknown rating', { occasion: 'casual', itemIds: ['item_1'], rating: 'meh' }],
      ['an owner ID', { occasion: 'casual', itemIds: ['item_1'], rating: 'positive', ownerId: 'someone' }],
    ])('rejects %s with 400 before storing anything', async (_label, body) => {
      const setRating = vi.spyOn(feedback, 'setRating');

      const res = await rateAs(alex, body);

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ success: false, error: 'Invalid request payload' });
      expect(setRating).not.toHaveBeenCalled();
    });

    it('rejects a cross-site request with 403 before storing anything', async () => {
      const setRating = vi.spyOn(feedback, 'setRating');

      const res = await handleRateOutfit(
        apiRequest('PUT', '/api/outfits/feedback', {
          cookie: alex.cookie,
          origin: 'https://evil.example',
          body: { occasion: 'casual', itemIds: ['item_1'], rating: 'positive' },
        }),
        deps,
      );

      expect(res.status).toBe(403);
      expect(setRating).not.toHaveBeenCalled();
    });

    it('returns 401 without a session', async () => {
      const res = await handleRateOutfit(
        apiRequest('PUT', '/api/outfits/feedback', { body: { occasion: 'casual', itemIds: ['i'], rating: 'positive' } }),
        deps,
      );

      expect(res.status).toBe(401);
    });

    it('returns 503 with a safe message when the database is unavailable', async () => {
      const { top, bottom } = await outfitOf(alex);
      vi.spyOn(feedback, 'setRating').mockRejectedValue(new RepositoryUnavailableError());

      const res = await rateAs(alex, { occasion: 'casual', itemIds: [top.id, bottom.id], rating: 'positive' });

      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({ success: false, error: UNAVAILABLE });
    });

    it('returns 500 with a generic message for an unexpected failure, logging no details', async () => {
      const { top, bottom } = await outfitOf(alex);
      vi.spyOn(feedback, 'setRating').mockRejectedValue(new Error('driver detail 10.0.0.5 s3cr3t'));

      const res = await rateAs(alex, { occasion: 'casual', itemIds: [top.id, bottom.id], rating: 'positive' });

      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ success: false, error: 'Internal server error' });
      expect(JSON.stringify(consoleError.mock.calls)).not.toMatch(/10\.0\.0\.5|s3cr3t/);
    });

    it('is wired to the route: the PUT export checks the origin first', async () => {
      const res = await rateOutfitRoute(
        apiRequest('PUT', '/api/outfits/feedback', {
          origin: 'https://evil.example',
          body: { occasion: 'casual', itemIds: ['i'], rating: 'positive' },
        }),
      );

      expect(res.status).toBe(403);
    });
  });

  describe('DELETE /api/outfits/feedback/[outfitId]', () => {
    it('clears the rating and answers 200', async () => {
      const { top, bottom } = await outfitOf(alex);
      const rated = await (await rateAs(alex, { occasion: 'casual', itemIds: [top.id, bottom.id], rating: 'negative' })).json();

      const res = await clearAs(alex, rated.data.outfitId);

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ success: true, data: { outfitId: rated.data.outfitId } });
      await expect(feedback.listRatedByOccasion(alex.id, 'casual')).resolves.toEqual([]);
    });

    it('answers a retried clear with 200', async () => {
      const { top, bottom } = await outfitOf(alex);
      const rated = await (await rateAs(alex, { occasion: 'casual', itemIds: [top.id, bottom.id], rating: 'negative' })).json();
      await clearAs(alex, rated.data.outfitId);

      const res = await clearAs(alex, rated.data.outfitId);

      expect(res.status).toBe(200);
    });

    it("answers 404 for another user's outfit and keeps their rating", async () => {
      const { top, bottom } = await outfitOf(alex);
      const rated = await (await rateAs(alex, { occasion: 'casual', itemIds: [top.id, bottom.id], rating: 'negative' })).json();

      const res = await clearAs(sam, rated.data.outfitId);

      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ success: false, error: "We couldn't find that outfit." });
      await expect(feedback.listRatedByOccasion(alex.id, 'casual')).resolves.toHaveLength(1);
    });

    it('rejects a cross-site request with 403, and a request without a session with 401', async () => {
      const crossSite = await handleClearOutfitFeedback(
        apiRequest('DELETE', '/api/outfits/feedback/outfit_1', { cookie: alex.cookie, origin: 'https://evil.example' }),
        'outfit_1',
        deps,
      );
      const signedOut = await handleClearOutfitFeedback(
        apiRequest('DELETE', '/api/outfits/feedback/outfit_1'),
        'outfit_1',
        deps,
      );

      expect(crossSite.status).toBe(403);
      expect(signedOut.status).toBe(401);
    });

    it('is wired to the route: the DELETE export reads the outfit ID and checks the origin first', async () => {
      const res = await clearFeedbackRoute(
        apiRequest('DELETE', '/api/outfits/feedback/outfit_1', { origin: 'https://evil.example' }),
        { params: Promise.resolve({ outfitId: 'outfit_1' }) },
      );

      expect(res.status).toBe(403);
    });
  });

  describe('with POST /api/outfits/generate', () => {
    it('shows the saved rating on the outfit, then avoids it once marked Not helpful', async () => {
      const tee = await addItem(alex.id, 'Top');
      const jeans = await addItem(alex.id, 'Bottom');
      const polo = await addItem(alex.id, 'Top');
      const first = (await (await generateAs(alex, { occasion: 'casual' })).json()).data;
      expect(first.feedback).toBeNull();
      const firstIds: string[] = first.items.map((item: { id: string }) => item.id);

      const rated = await (await rateAs(alex, { occasion: 'casual', itemIds: firstIds, rating: 'negative' })).json();
      const next = (await (await generateAs(alex, { occasion: 'casual' })).json()).data;

      expect(next.items.map((item: { id: string }) => item.id)).not.toEqual(firstIds);
      expect([tee.id, polo.id]).toContain(next.items[0].id);
      expect(next.items[1].id).toBe(jeans.id);
      expect(next.feedback).toBeNull();

      await rateAs(alex, { occasion: 'casual', itemIds: firstIds, rating: 'positive' });
      const liked = (await (await generateAs(alex, { occasion: 'casual' })).json()).data;
      expect(liked.items.map((item: { id: string }) => item.id)).toEqual(firstIds);
      expect(liked.feedback).toEqual({ outfitId: rated.data.outfitId, rating: 'positive' });
    });

    it("never uses another user's feedback", async () => {
      await outfitOf(alex);
      await addItem(alex.id, 'Top');
      const first = (await (await generateAs(alex, { occasion: 'casual' })).json()).data;
      const theirTop = await addItem(sam.id, 'Top');
      const theirBottom = await addItem(sam.id, 'Bottom');
      await rateAs(sam, { occasion: 'casual', itemIds: [theirTop.id, theirBottom.id], rating: 'negative' });

      const again = (await (await generateAs(alex, { occasion: 'casual' })).json()).data;

      expect(again.items).toEqual(first.items);
      expect(again.feedback).toBeNull();
    });
  });
});
