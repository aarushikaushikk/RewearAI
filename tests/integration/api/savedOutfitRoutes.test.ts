import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import {
  handleListSavedOutfits,
  handleSaveOutfit,
  handleUnsaveOutfit,
  type SavedOutfitHandlerDeps,
} from '@/lib/outfits/savedOutfitHandlers';
import { POST as saveOutfitRoute } from '@/app/api/outfits/saved/route';
import { DELETE as unsaveOutfitRoute } from '@/app/api/outfits/saved/[outfitId]/route';
import { SESSION_COOKIE_NAME } from '@/lib/auth/cookieConfig';
import { RepositoryUnavailableError } from '@/lib/repositories/repositoryErrors';
import { AuthService } from '@/services/authService';
import { SavedOutfitService } from '@/services/savedOutfitService';
import type { Category } from '@/types/wardrobe';
import { itemFor } from '../../contracts/wardrobeItemRepositoryContract';
import { MemorySavedOutfitRepository } from '../../mocks/memorySavedOutfitRepository';
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

describe('saved outfit API (US9)', () => {
  let authService: AuthService;
  let items: MemoryWardrobeItemRepository;
  let outfits: MemorySavedOutfitRepository;
  let deps: SavedOutfitHandlerDeps;
  let alex: { id: string; cookie: string };
  let sam: { id: string; cookie: string };
  let consoleError: MockInstance;
  let nextImage = 1;

  async function signUp(email: string) {
    const result = await authService.register({ email, password: PASSWORD });
    return { id: result.user.id, cookie: `${SESSION_COOKIE_NAME}=${result.sessionToken}` };
  }

  async function addItem(ownerId: string, category: Category) {
    return items.create({ ...itemFor(ownerId, `u/${nextImage++}`), category });
  }

  function saveAs(user: { cookie: string }, body: unknown) {
    return handleSaveOutfit(apiRequest('POST', '/api/outfits/saved', { cookie: user.cookie, body }), deps);
  }

  function listAs(user: { cookie: string }) {
    return handleListSavedOutfits(apiRequest('GET', '/api/outfits/saved', { cookie: user.cookie }), deps);
  }

  function unsaveAs(user: { cookie: string }, outfitId: string) {
    return handleUnsaveOutfit(
      apiRequest('DELETE', `/api/outfits/saved/${outfitId}`, { cookie: user.cookie }),
      outfitId,
      deps,
    );
  }

  async function savedOutfitOf(user: { id: string; cookie: string }) {
    const top = await addItem(user.id, 'Top');
    const bottom = await addItem(user.id, 'Bottom');
    const res = await saveAs(user, { occasion: 'work', itemIds: [top.id, bottom.id] });
    return { top, bottom, outfit: (await res.json()).data };
  }

  beforeEach(async () => {
    authService = new AuthService(new MemoryUserRepository(), new MemorySessionRepository());
    items = new MemoryWardrobeItemRepository();
    outfits = new MemorySavedOutfitRepository();
    deps = { authService, savedOutfitService: new SavedOutfitService(outfits, items) };
    alex = await signUp('alex@example.com');
    sam = await signUp('sam@example.com');
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  describe('POST /api/outfits/saved', () => {
    it('saves the outfit and answers 201 with it', async () => {
      const top = await addItem(alex.id, 'Top');
      const bottom = await addItem(alex.id, 'Bottom');

      const res = await saveAs(alex, { occasion: 'work', itemIds: [top.id, bottom.id] });

      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data).toMatchObject({
        occasion: 'work',
        items: [
          { status: 'present', id: top.id, image: { url: top.image.url } },
          { status: 'present', id: bottom.id },
        ],
      });
    });

    it('answers a retried save with 200 and the same outfit, adding no duplicate', async () => {
      const { top, bottom, outfit } = await savedOutfitOf(alex);

      const res = await saveAs(alex, { occasion: 'work', itemIds: [top.id, bottom.id] });

      expect(res.status).toBe(200);
      expect((await res.json()).data.id).toBe(outfit.id);
      await expect(outfits.listSavedByOwner(alex.id)).resolves.toHaveLength(1);
    });

    it("refuses another user's item with 400 and a fixed message", async () => {
      const mine = await addItem(alex.id, 'Top');
      const theirs = await addItem(sam.id, 'Bottom');

      const res = await saveAs(alex, { occasion: 'work', itemIds: [mine.id, theirs.id] });

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({
        success: false,
        error: 'Some of these items are no longer in your wardrobe. Generate a new outfit.',
      });
      await expect(outfits.listSavedByOwner(alex.id)).resolves.toEqual([]);
    });

    it.each([
      ['a malformed body', '{not json'],
      ['an owner ID', { occasion: 'work', itemIds: ['item_1'], userId: 'someone' }],
      ['no items', { occasion: 'work', itemIds: [] }],
      ['an unknown occasion', { occasion: 'party', itemIds: ['item_1'] }],
    ])('rejects %s with 400 before saving anything', async (_label, body) => {
      const save = vi.spyOn(outfits, 'save');

      const res = await saveAs(alex, body);

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ success: false, error: 'Invalid request payload' });
      expect(save).not.toHaveBeenCalled();
    });

    it('rejects a cross-site request with 403 before saving anything', async () => {
      const save = vi.spyOn(outfits, 'save');

      const res = await handleSaveOutfit(
        apiRequest('POST', '/api/outfits/saved', {
          cookie: alex.cookie,
          origin: 'https://evil.example',
          body: { occasion: 'work', itemIds: ['item_1'] },
        }),
        deps,
      );

      expect(res.status).toBe(403);
      expect(save).not.toHaveBeenCalled();
    });

    it('returns 401 without a session', async () => {
      const res = await handleSaveOutfit(
        apiRequest('POST', '/api/outfits/saved', { body: { occasion: 'work', itemIds: ['item_1'] } }),
        deps,
      );

      expect(res.status).toBe(401);
    });

    it('returns 503 with a safe message when the database is unavailable', async () => {
      const top = await addItem(alex.id, 'Top');
      vi.spyOn(outfits, 'save').mockRejectedValue(new RepositoryUnavailableError());

      const res = await saveAs(alex, { occasion: 'work', itemIds: [top.id] });

      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({ success: false, error: UNAVAILABLE });
    });

    it('returns 500 with a generic message for an unexpected failure, logging no details', async () => {
      const top = await addItem(alex.id, 'Top');
      vi.spyOn(outfits, 'save').mockRejectedValue(new Error('driver detail 10.0.0.5 s3cr3t'));

      const res = await saveAs(alex, { occasion: 'work', itemIds: [top.id] });

      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ success: false, error: 'Internal server error' });
      expect(JSON.stringify(consoleError.mock.calls)).not.toMatch(/10\.0\.0\.5|s3cr3t/);
    });

    it('is wired to the route: the POST export checks the origin first', async () => {
      const res = await saveOutfitRoute(
        apiRequest('POST', '/api/outfits/saved', {
          origin: 'https://evil.example',
          body: { occasion: 'work', itemIds: ['item_1'] },
        }),
      );

      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/outfits/saved', () => {
    it("lists only the signed-in user's saved outfits", async () => {
      const { outfit } = await savedOutfitOf(alex);
      await savedOutfitOf(sam);

      const res = await listAs(alex);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.map((saved: { id: string }) => saved.id)).toEqual([outfit.id]);
    });

    it('marks an item deleted since saving as removed', async () => {
      const { top } = await savedOutfitOf(alex);
      await items.deleteForOwner(alex.id, top.id);

      const json = await (await listAs(alex)).json();

      expect(json.data[0].items).toContainEqual({ status: 'removed', id: top.id });
    });

    it('answers an empty list when nothing is saved', async () => {
      expect(await (await listAs(alex)).json()).toEqual({ success: true, data: [] });
    });

    it('returns 401 without a session', async () => {
      const res = await handleListSavedOutfits(apiRequest('GET', '/api/outfits/saved'), deps);

      expect(res.status).toBe(401);
    });

    it('returns 503 with a safe message when the database is unavailable', async () => {
      vi.spyOn(outfits, 'listSavedByOwner').mockRejectedValue(new RepositoryUnavailableError());

      const res = await listAs(alex);

      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({ success: false, error: UNAVAILABLE });
    });
  });

  describe('DELETE /api/outfits/saved/[outfitId]', () => {
    it('removes the outfit from the saved list', async () => {
      const { outfit } = await savedOutfitOf(alex);

      const res = await unsaveAs(alex, outfit.id);

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ success: true, data: { id: outfit.id } });
      expect((await (await listAs(alex)).json()).data).toEqual([]);
    });

    it('succeeds again when the removal is retried', async () => {
      const { outfit } = await savedOutfitOf(alex);
      await unsaveAs(alex, outfit.id);

      expect((await unsaveAs(alex, outfit.id)).status).toBe(200);
    });

    it("answers 404 for another user's outfit and leaves it saved", async () => {
      const { outfit } = await savedOutfitOf(sam);

      const res = await unsaveAs(alex, outfit.id);

      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ success: false, error: "We couldn't find that saved outfit." });
      expect((await (await listAs(sam)).json()).data).toHaveLength(1);
    });

    it('rejects a cross-site request with 403 and keeps the outfit', async () => {
      const { outfit } = await savedOutfitOf(alex);

      const res = await handleUnsaveOutfit(
        apiRequest('DELETE', `/api/outfits/saved/${outfit.id}`, {
          cookie: alex.cookie,
          origin: 'https://evil.example',
        }),
        outfit.id,
        deps,
      );

      expect(res.status).toBe(403);
      expect((await (await listAs(alex)).json()).data).toHaveLength(1);
    });

    it('returns 401 without a session', async () => {
      const res = await handleUnsaveOutfit(
        apiRequest('DELETE', '/api/outfits/saved/outfit_1'),
        'outfit_1',
        deps,
      );

      expect(res.status).toBe(401);
    });

    it('is wired to the route: the DELETE export checks the origin first', async () => {
      const res = await unsaveOutfitRoute(
        apiRequest('DELETE', '/api/outfits/saved/outfit_1', { origin: 'https://evil.example' }),
        { params: Promise.resolve({ outfitId: 'outfit_1' }) },
      );

      expect(res.status).toBe(403);
    });
  });
});
