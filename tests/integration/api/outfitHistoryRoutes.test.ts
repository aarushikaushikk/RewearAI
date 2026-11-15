import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { connection } from 'next/server';
import {
  handleListOutfitHistory,
  handleMarkOutfitWorn,
  type OutfitHistoryHandlerDeps,
} from '@/lib/outfits/outfitHistoryHandlers';
import { GET as historyGetRoute, POST as historyPostRoute } from '@/app/api/outfits/history/route';
import { SESSION_COOKIE_NAME } from '@/lib/auth/cookieConfig';
import { RepositoryError, RepositoryUnavailableError } from '@/lib/repositories/repositoryErrors';
import { INVALID_PAYLOAD_ERROR, INVALID_WORN_DATE_ERROR } from '@/lib/validation/outfitHistoryValidation';
import { AuthService } from '@/services/authService';
import {
  INVALID_COMBINATION_ERROR,
  ITEMS_NOT_FOUND_ERROR,
  OutfitHistoryService,
} from '@/services/outfitHistoryService';
import type { Category, WardrobeItemRecord } from '@/types/wardrobe';
import { MemoryOutfitHistoryRepository } from '../../mocks/memoryOutfitHistoryRepository';
import { MemorySessionRepository } from '../../mocks/memorySessionRepository';
import { MemoryUserRepository } from '../../mocks/memoryUserRepository';
import { MemoryWardrobeItemRepository } from '../../mocks/memoryWardrobeItemRepository';

// connection() needs a Next.js request scope; the route test only checks that GET calls it.
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: vi.fn(async () => undefined),
}));

const ORIGIN = 'http://localhost:3000';
const PASSWORD = 'Password123!';
const NOW = new Date('2026-11-11T18:00:00.000Z');
const TODAY = '2026-11-11';
const UNAVAILABLE_ERROR = 'The outfit history service is temporarily unavailable. Please try again later.';

interface TestUser {
  id: string;
  cookie: string;
}

function historyRequest(
  method: 'GET' | 'POST',
  options: { body?: unknown; cookie?: string; origin?: string | null } = {},
) {
  const origin = options.origin === undefined ? ORIGIN : options.origin;
  return new Request(`${ORIGIN}/api/outfits/history`, {
    method,
    headers: {
      host: 'localhost:3000',
      ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
      ...(origin ? { origin } : {}),
      ...(options.cookie ? { cookie: options.cookie } : {}),
    },
    ...(method === 'POST'
      ? { body: typeof options.body === 'string' ? options.body : JSON.stringify(options.body) }
      : {}),
  });
}

describe('/api/outfits/history', () => {
  let authService: AuthService;
  let items: MemoryWardrobeItemRepository;
  let history: MemoryOutfitHistoryRepository;
  let deps: OutfitHistoryHandlerDeps;
  let alex: TestUser;
  let sam: TestUser;
  let top: WardrobeItemRecord;
  let bottom: WardrobeItemRecord;
  let consoleError: MockInstance;
  let saved = 0;

  async function signUp(email: string): Promise<TestUser> {
    const result = await authService.register({ email, password: PASSWORD });
    return { id: result.user.id, cookie: `${SESSION_COOKIE_NAME}=${result.sessionToken}` };
  }

  function save(ownerId: string, category: Category) {
    saved += 1;
    const publicId = `rewear/users/${ownerId}/${saved}`;
    return items.create({
      ownerId,
      image: { url: `https://res.cloudinary.com/test/image/upload/v1/${publicId}.jpg`, publicId },
      name: `${category} ${saved}`,
      category,
      color: 'Black',
      style: 'Classic',
      season: 'All-season',
      formality: 'Casual',
    });
  }

  function markWorn(user: TestUser | null, body: unknown, origin?: string | null) {
    return handleMarkOutfitWorn(historyRequest('POST', { body, cookie: user?.cookie, origin }), deps);
  }

  function listHistory(user: TestUser | null) {
    return handleListOutfitHistory(historyRequest('GET', { cookie: user?.cookie }), deps);
  }

  const wornToday = (itemIds: string[], occasion = 'casual') => ({ itemIds, occasion, wornOn: TODAY });

  beforeEach(async () => {
    authService = new AuthService(new MemoryUserRepository(), new MemorySessionRepository());
    items = new MemoryWardrobeItemRepository();
    history = new MemoryOutfitHistoryRepository();
    deps = { authService, historyService: new OutfitHistoryService(history, items), now: () => NOW };
    alex = await signUp('alex@example.com');
    sam = await signUp('sam@example.com');
    top = await save(alex.id, 'Top');
    bottom = await save(alex.id, 'Bottom');
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  describe('POST (mark as worn)', () => {
    it('records the outfit and returns 201 with the new entry', async () => {
      const res = await markWorn(alex, wornToday([top.id, bottom.id]));
      const body = await res.json();

      expect(res.status).toBe(201);
      expect(body.success).toBe(true);
      expect(body.data.created).toBe(true);
      expect(body.data.entry).toMatchObject({ wornOn: TODAY, occasion: 'casual' });
      expect(body.data.entry.items.map((i: { id: string }) => i.id)).toEqual([top.id, bottom.id]);
    });

    it('returns 200 with the existing entry when the same clothes are marked again that day', async () => {
      const first = await (await markWorn(alex, wornToday([top.id, bottom.id]))).json();
      const res = await markWorn(alex, wornToday([bottom.id, top.id], 'weekend'));
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data).toEqual({ created: false, entry: first.data.entry });
      expect(await history.listByOwner(alex.id)).toHaveLength(1);
    });

    it('records the same clothes again on a different date', async () => {
      await markWorn(alex, { ...wornToday([top.id, bottom.id]), wornOn: '2026-11-12' });
      const res = await markWorn(alex, wornToday([top.id, bottom.id]));

      expect(res.status).toBe(201);
      expect(await history.listByOwner(alex.id)).toHaveLength(2);
    });

    it('keeps one record when 10 identical requests arrive at once', async () => {
      const responses = await Promise.all(
        Array.from({ length: 10 }, () => markWorn(alex, wornToday([top.id, bottom.id]))),
      );
      const bodies = await Promise.all(responses.map((r) => r.json()));

      expect(responses.map((r) => r.status).sort()).toEqual([200, 200, 200, 200, 200, 200, 200, 200, 200, 201]);
      expect(new Set(bodies.map((b) => b.data.entry.id)).size).toBe(1);
      expect(await history.listByOwner(alex.id)).toHaveLength(1);
    });

    it('keeps identical item lists of separate users apart', async () => {
      const samTop = await save(sam.id, 'Top');
      const samBottom = await save(sam.id, 'Bottom');

      expect((await markWorn(alex, wornToday([top.id, bottom.id]))).status).toBe(201);
      expect((await markWorn(sam, wornToday([samTop.id, samBottom.id]))).status).toBe(201);
      expect(await history.listByOwner(alex.id)).toHaveLength(1);
      expect(await history.listByOwner(sam.id)).toHaveLength(1);
    });

    it('returns 401 without a session, before reading the body', async () => {
      const res = await markWorn(null, 'not json');

      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ success: false, error: 'Authentication required' });
    });

    it.each([
      ['a foreign origin', 'https://evil.example'],
      ['no origin', null],
    ])('returns 403 for %s, and records nothing', async (_label, origin) => {
      const res = await markWorn(alex, wornToday([top.id, bottom.id]), origin);

      expect(res.status).toBe(403);
      expect(await history.listByOwner(alex.id)).toEqual([]);
    });

    it.each([
      ['malformed JSON', '{"itemIds": ['],
      ['an empty body', ''],
      ['a user ID field', { itemIds: ['item_1'], occasion: 'casual', wornOn: TODAY, userId: 'x' }],
      ['no items', { itemIds: [], occasion: 'casual', wornOn: TODAY }],
      ['a repeated item ID', { itemIds: ['item_1', 'item_1'], occasion: 'casual', wornOn: TODAY }],
      ['an unknown occasion', { itemIds: ['item_1'], occasion: 'party', wornOn: TODAY }],
    ])('returns 400 for %s', async (_label, body) => {
      const res = await markWorn(alex, body);

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ success: false, error: INVALID_PAYLOAD_ERROR });
    });

    it.each(['2026-02-30', '2026-11-01', '2026-11-14', 'today'])('returns 400 for the worn date %s', async (wornOn) => {
      const res = await markWorn(alex, { itemIds: [top.id, bottom.id], occasion: 'casual', wornOn });

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ success: false, error: INVALID_WORN_DATE_ERROR });
    });

    it("returns 404 for another user's item, and records nothing", async () => {
      const samBottom = await save(sam.id, 'Bottom');

      const res = await markWorn(alex, wornToday([top.id, samBottom.id]));

      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ success: false, error: ITEMS_NOT_FOUND_ERROR });
      expect(await history.listByOwner(alex.id)).toEqual([]);
      expect(await history.listByOwner(sam.id)).toEqual([]);
    });

    it('returns 404 for an unknown item', async () => {
      const res = await markWorn(alex, wornToday([top.id, 'item_999']));

      expect(res.status).toBe(404);
    });

    it('returns 400 for an invalid combination', async () => {
      const res = await markWorn(alex, wornToday([top.id]));

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ success: false, error: INVALID_COMBINATION_ERROR });
    });

    it('returns 503 with a safe message when the database is unavailable', async () => {
      vi.spyOn(history, 'recordWorn').mockRejectedValue(new RepositoryUnavailableError());

      const res = await markWorn(alex, wornToday([top.id, bottom.id]));

      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({ success: false, error: UNAVAILABLE_ERROR });
    });

    it('returns 500 without internal details when the database operation fails', async () => {
      vi.spyOn(history, 'findOrCreateOutfit').mockRejectedValue(new RepositoryError());

      const res = await markWorn(alex, wornToday([top.id, bottom.id]));

      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ success: false, error: 'Internal server error' });
    });

    it('logs only the error name for an unexpected failure', async () => {
      vi.spyOn(items, 'listByOwner').mockRejectedValue(new Error('driver detail 10.0.0.5 s3cr3t'));

      const res = await markWorn(alex, wornToday([top.id, bottom.id]));

      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ success: false, error: 'Internal server error' });
      expect(JSON.stringify(consoleError.mock.calls)).not.toMatch(/10\.0\.0\.5|s3cr3t/);
    });
  });

  describe('GET (history)', () => {
    it('returns an empty list for a user with no history', async () => {
      const res = await listHistory(alex);

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ success: true, data: { entries: [] } });
    });

    it('lists the signed-in user\'s worn outfits newest first', async () => {
      const dress = await save(alex.id, 'Dress');
      // At 18:00 UTC, 12 November is already the date east of UTC+6.
      expect((await markWorn(alex, { ...wornToday([top.id, bottom.id]), wornOn: '2026-11-12' })).status).toBe(201);
      expect((await markWorn(alex, wornToday([dress.id], 'dinner'))).status).toBe(201);

      const body = await (await listHistory(alex)).json();

      expect(body.data.entries.map((e: { wornOn: string; occasion: string }) => [e.wornOn, e.occasion])).toEqual([
        ['2026-11-12', 'casual'],
        [TODAY, 'dinner'],
      ]);
    });

    it('still lists an entry after one of its items is deleted', async () => {
      await markWorn(alex, wornToday([top.id, bottom.id]));
      await items.deleteForOwner(alex.id, bottom.id);

      const res = await listHistory(alex);
      const [entry] = (await res.json()).data.entries;

      expect(res.status).toBe(200);
      expect(entry.items[1]).toEqual({ status: 'missing', id: bottom.id });
    });

    it("never returns another user's history", async () => {
      await markWorn(alex, wornToday([top.id, bottom.id]));

      expect(await (await listHistory(sam)).json()).toEqual({ success: true, data: { entries: [] } });
    });

    it('returns 401 without a session', async () => {
      const res = await listHistory(null);

      expect(res.status).toBe(401);
    });

    it('returns 503 with a safe message when the database is unavailable', async () => {
      vi.spyOn(history, 'listByOwner').mockRejectedValue(new RepositoryUnavailableError());

      const res = await listHistory(alex);

      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({ success: false, error: UNAVAILABLE_ERROR });
    });
  });

  describe('route wiring', () => {
    it('the POST export checks the origin first', async () => {
      const res = await historyPostRoute(
        historyRequest('POST', { body: wornToday([top.id, bottom.id]), origin: 'https://evil.example' }),
      );

      expect(res.status).toBe(403);
    });

    it('the GET export opts out of prerendering, then requires a session', async () => {
      vi.mocked(connection).mockClear();

      const res = await historyGetRoute(historyRequest('GET'));

      expect(connection).toHaveBeenCalledTimes(1);
      expect(res.status).toBe(401);
    });
  });
});
