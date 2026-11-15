import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import {
  handleCleanupUploads,
  handleCreateItem,
  handleDeleteItem,
  handleGetItem,
  handleListItems,
  handleSetAvailability,
  handleUpdateItem,
  handleUploadImage,
} from '@/lib/wardrobe/wardrobeHandlers';
import { PATCH as patchAvailabilityRoute } from '@/app/api/wardrobe/[itemId]/availability/route';
import { AuthService } from '@/services/authService';
import { WardrobeItemService } from '@/services/wardrobeItemService';
import { SESSION_COOKIE_NAME } from '@/lib/auth/cookieConfig';
import { RepositoryUnavailableError } from '@/lib/repositories/repositoryErrors';
import { MemoryUserRepository } from '../../mocks/memoryUserRepository';
import { MemorySessionRepository } from '../../mocks/memorySessionRepository';
import { MemoryWardrobeItemRepository } from '../../mocks/memoryWardrobeItemRepository';
import { MemoryImageStore } from '../../mocks/memoryImageStore';
import { GIF_BYTES, JPEG_BYTES } from '../../helpers/imageBytes';

const ORIGIN = 'http://localhost:3000';
const PASSWORD = 'Password123!';

const DETAILS = {
  name: 'Linen shirt',
  category: 'Top',
  color: 'White',
  style: 'Button-down',
  season: 'Summer',
  formality: 'Smart casual',
};

function headers(cookie?: string, origin: string | null = ORIGIN): Record<string, string> {
  return {
    host: 'localhost:3000',
    ...(origin ? { origin } : {}),
    ...(cookie ? { cookie } : {}),
  };
}

function uploadRequest(options: { cookie?: string; origin?: string | null; file?: File | null } = {}) {
  const form = new FormData();
  const file =
    options.file === undefined
      ? new File([JPEG_BYTES], 'shirt.jpg', { type: 'image/jpeg' })
      : options.file;
  if (file) {
    form.set('image', file);
  }
  return new Request(`${ORIGIN}/api/uploads`, {
    method: 'POST',
    headers: headers(options.cookie, options.origin),
    body: form,
  });
}

function createRequest(body: unknown, options: { cookie?: string; origin?: string | null } = {}) {
  return new Request(`${ORIGIN}/api/wardrobe`, {
    method: 'POST',
    headers: { ...headers(options.cookie, options.origin), 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function availabilityRequest(
  itemId: string,
  body: unknown,
  options: { cookie?: string; origin?: string | null } = {},
) {
  return new Request(`${ORIGIN}/api/wardrobe/${itemId}/availability`, {
    method: 'PATCH',
    headers: { ...headers(options.cookie, options.origin), 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function itemRequest(
  method: 'GET' | 'PATCH' | 'DELETE',
  path: string,
  options: { cookie?: string; origin?: string | null; body?: unknown } = {},
) {
  const hasBody = options.body !== undefined;
  return new Request(`${ORIGIN}${path}`, {
    method,
    headers: {
      ...headers(options.cookie, options.origin),
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(hasBody
      ? { body: typeof options.body === 'string' ? options.body : JSON.stringify(options.body) }
      : {}),
  });
}

const EDITS = {
  name: 'White Oxford Shirt',
  category: 'Top',
  color: 'Blue',
  style: 'Oxford',
  season: 'All-season',
  formality: 'Formal',
};

describe('Wardrobe API routes', () => {
  let authService: AuthService;
  let itemRepo: MemoryWardrobeItemRepository;
  let imageStore: MemoryImageStore;
  let wardrobeService: WardrobeItemService;
  let deps: { authService: AuthService; wardrobeService: WardrobeItemService };
  let alex: { id: string; cookie: string };
  let sam: { id: string; cookie: string };
  let consoleError: MockInstance;

  async function signUp(email: string) {
    const result = await authService.register({ email, password: PASSWORD });
    return { id: result.user.id, cookie: `${SESSION_COOKIE_NAME}=${result.sessionToken}` };
  }

  async function uploadAs(user: { cookie: string }) {
    const res = await handleUploadImage(uploadRequest({ cookie: user.cookie }), deps);
    return (await res.json()).data as { url: string; publicId: string };
  }

  async function saveItemAs(user: { cookie: string }, name = 'Linen shirt') {
    const image = await uploadAs(user);
    const res = await handleCreateItem(
      createRequest({ ...DETAILS, name, publicId: image.publicId }, { cookie: user.cookie }),
      deps,
    );
    return (await res.json()).data as { id: string; image: { url: string; publicId: string } };
  }

  beforeEach(async () => {
    authService = new AuthService(new MemoryUserRepository(), new MemorySessionRepository());
    itemRepo = new MemoryWardrobeItemRepository();
    imageStore = new MemoryImageStore();
    wardrobeService = new WardrobeItemService(itemRepo, imageStore);
    deps = { authService, wardrobeService };
    alex = await signUp('alex@example.com');
    sam = await signUp('sam@example.com');
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
    vi.unstubAllEnvs();
  });

  describe('POST /api/uploads', () => {
    it("uploads the image into the signed-in user's folder and returns 201", async () => {
      const res = await handleUploadImage(uploadRequest({ cookie: alex.cookie }), deps);

      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.publicId.startsWith(`rewear/users/${alex.id}/`)).toBe(true);
      expect(json.data.url).toMatch(/^https:\/\//);
    });

    it('rejects a cross-site request with 403 before reading the session', async () => {
      const validate = vi.spyOn(authService, 'validateSession');

      const res = await handleUploadImage(
        uploadRequest({ cookie: alex.cookie, origin: 'https://evil.example' }),
        deps,
      );

      expect(res.status).toBe(403);
      expect((await res.json()).success).toBe(false);
      expect(validate).not.toHaveBeenCalled();
      expect(imageStore.uploads).toHaveLength(0);
    });

    it('rejects a request with neither Origin nor Referer', async () => {
      const res = await handleUploadImage(uploadRequest({ cookie: alex.cookie, origin: null }), deps);

      expect(res.status).toBe(403);
    });

    it('returns 401 without a session, and uploads nothing', async () => {
      const res = await handleUploadImage(uploadRequest(), deps);

      expect(res.status).toBe(401);
      expect(imageStore.uploads).toHaveLength(0);
    });

    it('returns 401 for a session that has been signed out', async () => {
      await authService.logout(alex.cookie.split('=')[1]);

      const res = await handleUploadImage(uploadRequest({ cookie: alex.cookie }), deps);

      expect(res.status).toBe(401);
    });

    it('asks for an image when none is attached', async () => {
      const res = await handleUploadImage(uploadRequest({ cookie: alex.cookie, file: null }), deps);

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ success: false, error: 'Choose an image to upload.' });
    });

    it('rejects an unsupported file with 415', async () => {
      const file = new File([GIF_BYTES], 'shirt.jpg', { type: 'image/jpeg' });

      const res = await handleUploadImage(uploadRequest({ cookie: alex.cookie, file }), deps);

      expect(res.status).toBe(415);
      expect(imageStore.uploads).toHaveLength(0);
    });

    it('returns 502 with a safe message when the image store fails', async () => {
      imageStore.failing = true;

      const res = await handleUploadImage(uploadRequest({ cookie: alex.cookie }), deps);

      expect(res.status).toBe(502);
      expect((await res.json()).error).toBe("Your image didn't upload. Please try again.");
    });

    it('returns 503 when sessions cannot be checked', async () => {
      vi.spyOn(authService, 'validateSession').mockRejectedValue(new RepositoryUnavailableError());

      const res = await handleUploadImage(uploadRequest({ cookie: alex.cookie }), deps);

      expect(res.status).toBe(503);
    });
  });

  describe('POST /api/wardrobe', () => {
    it('saves the item for the signed-in user and returns 201', async () => {
      const image = await uploadAs(alex);

      const res = await handleCreateItem(
        createRequest({ ...DETAILS, publicId: image.publicId }, { cookie: alex.cookie }),
        deps,
      );

      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data).toMatchObject({ ...DETAILS, image, isAvailable: true });
      expect(json.data.ownerId).toBeUndefined();
    });

    it('ignores an owner supplied by the client', async () => {
      const image = await uploadAs(alex);

      await handleCreateItem(
        createRequest(
          { ...DETAILS, publicId: image.publicId, owner: sam.id, ownerId: sam.id },
          { cookie: alex.cookie },
        ),
        deps,
      );

      expect(await itemRepo.findByImage(alex.id, image.publicId)).not.toBeNull();
      expect(await itemRepo.findByImage(sam.id, image.publicId)).toBeNull();
    });

    it('answers a retried save with the existing item and 200', async () => {
      const image = await uploadAs(alex);
      const body = { ...DETAILS, publicId: image.publicId };
      const first = await (await handleCreateItem(createRequest(body, { cookie: alex.cookie }), deps)).json();

      const res = await handleCreateItem(createRequest(body, { cookie: alex.cookie }), deps);

      expect(res.status).toBe(200);
      expect((await res.json()).data.id).toBe(first.data.id);
    });

    it("returns 404 for another user's image, and saves nothing", async () => {
      const samsImage = await uploadAs(sam);

      const res = await handleCreateItem(
        createRequest({ ...DETAILS, publicId: samsImage.publicId }, { cookie: alex.cookie }),
        deps,
      );

      expect(res.status).toBe(404);
      expect(await itemRepo.findUsedImageIds([samsImage.publicId])).toEqual([]);
    });

    it('returns 400 with the first field error for invalid details', async () => {
      const image = await uploadAs(alex);

      const res = await handleCreateItem(
        createRequest({ ...DETAILS, publicId: image.publicId, color: '' }, { cookie: alex.cookie }),
        deps,
      );

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ success: false, error: 'Choose a color.' });
    });

    it.each(['not json', '"a string"', '[]'])('returns 400 for the malformed body %s', async (body) => {
      const res = await handleCreateItem(createRequest(body, { cookie: alex.cookie }), deps);

      expect(res.status).toBe(400);
    });

    it('rejects a cross-site request with 403', async () => {
      const res = await handleCreateItem(
        createRequest(DETAILS, { cookie: alex.cookie, origin: 'https://evil.example' }),
        deps,
      );

      expect(res.status).toBe(403);
    });

    it('returns 401 without a session', async () => {
      const res = await handleCreateItem(createRequest(DETAILS), deps);

      expect(res.status).toBe(401);
    });

    it('returns 503 with a safe message when the database is unavailable', async () => {
      const image = await uploadAs(alex);
      vi.spyOn(itemRepo, 'create').mockRejectedValue(new RepositoryUnavailableError());

      const res = await handleCreateItem(
        createRequest({ ...DETAILS, publicId: image.publicId }, { cookie: alex.cookie }),
        deps,
      );

      expect(res.status).toBe(503);
      expect(JSON.stringify(await res.json())).not.toMatch(/mongo|repository/i);
    });

    it('returns 500 with a generic message for an unexpected failure', async () => {
      const image = await uploadAs(alex);
      vi.spyOn(itemRepo, 'create').mockRejectedValue(new TypeError('secret detail'));

      const res = await handleCreateItem(
        createRequest({ ...DETAILS, publicId: image.publicId }, { cookie: alex.cookie }),
        deps,
      );

      expect(res.status).toBe(500);
      expect(JSON.stringify(await res.json())).not.toContain('secret detail');
      expect(JSON.stringify(consoleError.mock.calls)).not.toContain('secret detail');
    });
  });

  describe('failure recovery (US15)', () => {
    it('leaves no wardrobe item behind when the upload fails, and a retry then succeeds', async () => {
      imageStore.failing = true;
      const failed = await handleUploadImage(uploadRequest({ cookie: alex.cookie }), deps);
      expect(failed.status).toBe(502);
      expect(await itemRepo.listByOwner(alex.id)).toEqual([]);

      imageStore.failing = false;
      const retried = await handleUploadImage(uploadRequest({ cookie: alex.cookie }), deps);

      expect(retried.status).toBe(201);
      expect(await itemRepo.listByOwner(alex.id)).toEqual([]);
    });

    it('keeps exactly one item when a failed save is retried', async () => {
      const image = await uploadAs(alex);
      const body = { ...DETAILS, publicId: image.publicId };
      vi.spyOn(itemRepo, 'create').mockRejectedValueOnce(new RepositoryUnavailableError());

      const failed = await handleCreateItem(createRequest(body, { cookie: alex.cookie }), deps);
      expect(failed.status).toBe(503);
      expect(await itemRepo.listByOwner(alex.id)).toEqual([]);

      const retried = await handleCreateItem(createRequest(body, { cookie: alex.cookie }), deps);
      const again = await handleCreateItem(createRequest(body, { cookie: alex.cookie }), deps);

      expect(retried.status).toBe(201);
      expect(again.status).toBe(200);
      expect(await itemRepo.listByOwner(alex.id)).toHaveLength(1);
    });

    it('returns 502 and saves nothing when the image cannot be checked', async () => {
      const image = await uploadAs(alex);
      imageStore.failing = true;

      const res = await handleCreateItem(
        createRequest({ ...DETAILS, publicId: image.publicId }, { cookie: alex.cookie }),
        deps,
      );

      expect(res.status).toBe(502);
      expect((await res.json()).error).toBe("We couldn't save this item. Try again.");
      expect(await itemRepo.listByOwner(alex.id)).toEqual([]);
    });

    it('refuses a save whose image is gone, then saves once after the photo is uploaded again', async () => {
      const lost = await uploadAs(alex);
      await imageStore.delete([lost.publicId]);

      const refused = await handleCreateItem(
        createRequest({ ...DETAILS, publicId: lost.publicId }, { cookie: alex.cookie }),
        deps,
      );
      expect(refused.status).toBe(404);
      expect((await refused.json()).error).toBe("We couldn't find that image. Please upload it again.");
      expect(await itemRepo.listByOwner(alex.id)).toEqual([]);

      const replacement = await uploadAs(alex);
      const saved = await handleCreateItem(
        createRequest({ ...DETAILS, publicId: replacement.publicId }, { cookie: alex.cookie }),
        deps,
      );

      expect(saved.status).toBe(201);
      const items = await itemRepo.listByOwner(alex.id);
      expect(items).toHaveLength(1);
      expect(items[0].image.publicId).toBe(replacement.publicId);
    });
  });

  // US4 (#9): view, edit and delete saved items.
  describe('GET /api/wardrobe', () => {
    it("lists only the signed-in user's items, newest first", async () => {
      const older = await saveItemAs(alex, 'Older');
      await saveItemAs(sam);
      await new Promise((resolve) => setTimeout(resolve, 5));
      const newer = await saveItemAs(alex, 'Newer');

      const res = await handleListItems(itemRequest('GET', '/api/wardrobe', { cookie: alex.cookie }), deps);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.map((item: { id: string }) => item.id)).toEqual([newer.id, older.id]);
      expect(json.data[0].ownerId).toBeUndefined();
    });

    it('returns an empty list for an empty wardrobe', async () => {
      const res = await handleListItems(itemRequest('GET', '/api/wardrobe', { cookie: alex.cookie }), deps);

      expect(await res.json()).toEqual({ success: true, data: [] });
    });

    it('returns 401 without a session', async () => {
      const res = await handleListItems(itemRequest('GET', '/api/wardrobe'), deps);

      expect(res.status).toBe(401);
    });

    it('returns 503 with a safe message when the database is unavailable', async () => {
      vi.spyOn(itemRepo, 'listByOwner').mockRejectedValue(new RepositoryUnavailableError());

      const res = await handleListItems(itemRequest('GET', '/api/wardrobe', { cookie: alex.cookie }), deps);

      expect(res.status).toBe(503);
      expect(JSON.stringify(await res.json())).not.toMatch(/mongo|repository/i);
    });
  });

  describe('GET /api/wardrobe/[itemId]', () => {
    it("returns the signed-in user's item", async () => {
      const item = await saveItemAs(alex);

      const res = await handleGetItem(
        itemRequest('GET', `/api/wardrobe/${item.id}`, { cookie: alex.cookie }),
        item.id,
        deps,
      );

      expect(res.status).toBe(200);
      expect((await res.json()).data).toMatchObject({ id: item.id, name: 'Linen shirt' });
    });

    it("returns 404 for another user's item, the same as for a missing one", async () => {
      const samsItem = await saveItemAs(sam);

      const other = await handleGetItem(
        itemRequest('GET', `/api/wardrobe/${samsItem.id}`, { cookie: alex.cookie }),
        samsItem.id,
        deps,
      );
      const missing = await handleGetItem(
        itemRequest('GET', '/api/wardrobe/item_999', { cookie: alex.cookie }),
        'item_999',
        deps,
      );

      expect(other.status).toBe(404);
      expect(missing.status).toBe(404);
      expect(await other.json()).toEqual(await missing.json());
    });

    it('returns 401 without a session', async () => {
      const item = await saveItemAs(alex);

      const res = await handleGetItem(itemRequest('GET', `/api/wardrobe/${item.id}`), item.id, deps);

      expect(res.status).toBe(401);
    });
  });

  describe('PATCH /api/wardrobe/[itemId]', () => {
    it('saves the edits and returns the updated item', async () => {
      const item = await saveItemAs(alex);

      const res = await handleUpdateItem(
        itemRequest('PATCH', `/api/wardrobe/${item.id}`, { cookie: alex.cookie, body: EDITS }),
        item.id,
        deps,
      );

      expect(res.status).toBe(200);
      expect((await res.json()).data).toMatchObject({ ...EDITS, id: item.id, image: item.image });
      expect(await itemRepo.findByIdForOwner(alex.id, item.id)).toMatchObject(EDITS);
    });

    it('ignores an image, owner or availability supplied by the client', async () => {
      const item = await saveItemAs(alex);

      await handleUpdateItem(
        itemRequest('PATCH', `/api/wardrobe/${item.id}`, {
          cookie: alex.cookie,
          body: {
            ...EDITS,
            owner: sam.id,
            ownerId: sam.id,
            isAvailable: false,
            image: { url: 'https://evil.example/x.jpg', publicId: 'x' },
          },
        }),
        item.id,
        deps,
      );

      expect(await itemRepo.findByIdForOwner(alex.id, item.id)).toMatchObject({
        ownerId: alex.id,
        image: item.image,
        isAvailable: true,
      });
    });

    it("returns 404 for another user's item, and changes nothing", async () => {
      const samsItem = await saveItemAs(sam);

      const res = await handleUpdateItem(
        itemRequest('PATCH', `/api/wardrobe/${samsItem.id}`, { cookie: alex.cookie, body: EDITS }),
        samsItem.id,
        deps,
      );

      expect(res.status).toBe(404);
      expect(await itemRepo.findByIdForOwner(sam.id, samsItem.id)).toMatchObject({
        name: 'Linen shirt',
      });
    });

    it('returns 400 with the first field error for invalid details', async () => {
      const item = await saveItemAs(alex);

      const res = await handleUpdateItem(
        itemRequest('PATCH', `/api/wardrobe/${item.id}`, {
          cookie: alex.cookie,
          body: { ...EDITS, color: '' },
        }),
        item.id,
        deps,
      );

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ success: false, error: 'Choose a color.' });
    });

    it.each(['not json', '"a string"', '[]'])('returns 400 for the malformed body %s', async (body) => {
      const item = await saveItemAs(alex);

      const res = await handleUpdateItem(
        itemRequest('PATCH', `/api/wardrobe/${item.id}`, { cookie: alex.cookie, body }),
        item.id,
        deps,
      );

      expect(res.status).toBe(400);
    });

    it('rejects a cross-site request with 403, before reading the session', async () => {
      const item = await saveItemAs(alex);
      const validate = vi.spyOn(authService, 'validateSession');

      const res = await handleUpdateItem(
        itemRequest('PATCH', `/api/wardrobe/${item.id}`, {
          cookie: alex.cookie,
          origin: 'https://evil.example',
          body: EDITS,
        }),
        item.id,
        deps,
      );

      expect(res.status).toBe(403);
      expect(validate).not.toHaveBeenCalled();
    });

    it('returns 401 without a session', async () => {
      const item = await saveItemAs(alex);

      const res = await handleUpdateItem(
        itemRequest('PATCH', `/api/wardrobe/${item.id}`, { body: EDITS }),
        item.id,
        deps,
      );

      expect(res.status).toBe(401);
    });

    it('returns 503 with a safe message when the database is unavailable', async () => {
      const item = await saveItemAs(alex);
      vi.spyOn(itemRepo, 'updateForOwner').mockRejectedValue(new RepositoryUnavailableError());

      const res = await handleUpdateItem(
        itemRequest('PATCH', `/api/wardrobe/${item.id}`, { cookie: alex.cookie, body: EDITS }),
        item.id,
        deps,
      );

      expect(res.status).toBe(503);
    });
  });

  describe('DELETE /api/wardrobe/[itemId]', () => {
    it('deletes the item and its Cloudinary image', async () => {
      const item = await saveItemAs(alex);

      const res = await handleDeleteItem(
        itemRequest('DELETE', `/api/wardrobe/${item.id}`, { cookie: alex.cookie }),
        item.id,
        deps,
      );

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ success: true, data: { id: item.id } });
      expect(await itemRepo.findByIdForOwner(alex.id, item.id)).toBeNull();
      expect(imageStore.has(item.image.publicId)).toBe(false);
    });

    it("returns 404 for another user's item, and deletes neither it nor its image", async () => {
      const samsItem = await saveItemAs(sam);

      const res = await handleDeleteItem(
        itemRequest('DELETE', `/api/wardrobe/${samsItem.id}`, { cookie: alex.cookie }),
        samsItem.id,
        deps,
      );

      expect(res.status).toBe(404);
      expect(await itemRepo.findByIdForOwner(sam.id, samsItem.id)).not.toBeNull();
      expect(imageStore.has(samsItem.image.publicId)).toBe(true);
    });

    it('returns 502 and keeps the item when Cloudinary fails', async () => {
      const item = await saveItemAs(alex);
      imageStore.failing = true;

      const res = await handleDeleteItem(
        itemRequest('DELETE', `/api/wardrobe/${item.id}`, { cookie: alex.cookie }),
        item.id,
        deps,
      );

      expect(res.status).toBe(502);
      expect(await res.json()).toEqual({
        success: false,
        error: "We couldn't delete this item. Try again.",
      });
      expect(await itemRepo.findByIdForOwner(alex.id, item.id)).not.toBeNull();
    });

    it('rejects a cross-site request with 403, and deletes nothing', async () => {
      const item = await saveItemAs(alex);

      const res = await handleDeleteItem(
        itemRequest('DELETE', `/api/wardrobe/${item.id}`, {
          cookie: alex.cookie,
          origin: 'https://evil.example',
        }),
        item.id,
        deps,
      );

      expect(res.status).toBe(403);
      expect(await itemRepo.findByIdForOwner(alex.id, item.id)).not.toBeNull();
    });

    it('returns 401 without a session', async () => {
      const item = await saveItemAs(alex);

      const res = await handleDeleteItem(itemRequest('DELETE', `/api/wardrobe/${item.id}`), item.id, deps);

      expect(res.status).toBe(401);
      expect(imageStore.has(item.image.publicId)).toBe(true);
    });
  });

  describe('PATCH /api/wardrobe/[itemId]/availability', () => {
    async function savedItemId(user: { cookie: string }): Promise<string> {
      return (await saveItemAs(user)).id;
    }

    async function setAvailability(user: { cookie: string }, itemId: string, body: unknown) {
      return handleSetAvailability(availabilityRequest(itemId, body, { cookie: user.cookie }), itemId, deps);
    }

    async function storedAvailability(ownerId: string): Promise<boolean[]> {
      return (await itemRepo.listByOwner(ownerId)).map((item) => item.isAvailable);
    }

    it('marks the item unavailable and back to available, answering 200 with the item', async () => {
      const itemId = await savedItemId(alex);

      const off = await setAvailability(alex, itemId, { isAvailable: false });
      expect(off.status).toBe(200);
      expect(await off.json()).toMatchObject({ success: true, data: { id: itemId, isAvailable: false } });
      expect(await storedAvailability(alex.id)).toEqual([false]);

      const on = await setAvailability(alex, itemId, { isAvailable: true });
      expect(on.status).toBe(200);
      expect((await on.json()).data.isAvailable).toBe(true);
      expect(await storedAvailability(alex.id)).toEqual([true]);
    });

    it('answers a repeated update with the same result', async () => {
      const itemId = await savedItemId(alex);

      await setAvailability(alex, itemId, { isAvailable: false });
      const repeated = await setAvailability(alex, itemId, { isAvailable: false });

      expect(repeated.status).toBe(200);
      expect((await repeated.json()).data.isAvailable).toBe(false);
    });

    it("returns 404 for another user's item, and leaves it unchanged", async () => {
      const samsItem = await savedItemId(sam);

      const res = await setAvailability(alex, samsItem, { isAvailable: false });

      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ success: false, error: "We couldn't find that clothing item." });
      expect(await storedAvailability(sam.id)).toEqual([true]);
    });

    it('returns the same 404 for an item that does not exist', async () => {
      const res = await setAvailability(alex, 'item_999', { isAvailable: false });

      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ success: false, error: "We couldn't find that clothing item." });
    });

    it.each([
      ['not json'],
      ['{}'],
      ['{"isAvailable":"false"}'],
      ['{"isAvailable":false,"owner":"someone-else"}'],
    ])('returns 400 for the invalid body %s, and changes nothing', async (body) => {
      const itemId = await savedItemId(alex);

      const res = await setAvailability(alex, itemId, body);

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ success: false, error: 'Invalid request payload' });
      expect(await storedAvailability(alex.id)).toEqual([true]);
    });

    it('rejects a cross-site request with 403, and changes nothing', async () => {
      const itemId = await savedItemId(alex);

      const res = await handleSetAvailability(
        availabilityRequest(itemId, { isAvailable: false }, { cookie: alex.cookie, origin: 'https://evil.example' }),
        itemId,
        deps,
      );

      expect(res.status).toBe(403);
      expect(await storedAvailability(alex.id)).toEqual([true]);
    });

    it('returns 401 without a session, and changes nothing', async () => {
      const itemId = await savedItemId(alex);

      const res = await handleSetAvailability(availabilityRequest(itemId, { isAvailable: false }), itemId, deps);

      expect(res.status).toBe(401);
      expect(await storedAvailability(alex.id)).toEqual([true]);
    });

    it('returns 503 with a safe message when the database is unavailable', async () => {
      const itemId = await savedItemId(alex);
      vi.spyOn(itemRepo, 'setAvailability').mockRejectedValue(new RepositoryUnavailableError());

      const res = await setAvailability(alex, itemId, { isAvailable: false });

      expect(res.status).toBe(503);
      expect(JSON.stringify(await res.json())).not.toMatch(/mongo|repository/i);
    });

    it('returns 500 with a generic message for an unexpected failure', async () => {
      const itemId = await savedItemId(alex);
      vi.spyOn(itemRepo, 'setAvailability').mockRejectedValue(new Error('driver detail 10.0.0.5'));

      const res = await setAvailability(alex, itemId, { isAvailable: false });

      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ success: false, error: 'Internal server error' });
      expect(JSON.stringify(consoleError.mock.calls)).not.toContain('10.0.0.5');
    });

    it('is wired to the route: the PATCH export checks the origin before anything else', async () => {
      const res = await patchAvailabilityRoute(
        availabilityRequest('item_1', { isAvailable: false }, { origin: 'https://evil.example' }),
        { params: Promise.resolve({ itemId: 'item_1' }) },
      );

      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/cron/cleanup-uploads', () => {
    function cronRequest(authorization?: string) {
      return new Request(`${ORIGIN}/api/cron/cleanup-uploads`, {
        headers: authorization ? { authorization } : {},
      });
    }

    it('runs the cleanup when called with the cron secret', async () => {
      vi.stubEnv('CRON_SECRET', 'cron-test-secret');

      const res = await handleCleanupUploads(cronRequest('Bearer cron-test-secret'), deps);

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ success: true, data: { deleted: 0, confirmed: 0 } });
    });

    it.each([undefined, 'Bearer wrong-secret'])(
      'refuses a request with authorization %s',
      async (authorization) => {
        vi.stubEnv('CRON_SECRET', 'cron-test-secret');
        const cleanup = vi.spyOn(wardrobeService, 'cleanupAbandonedUploads');

        const res = await handleCleanupUploads(cronRequest(authorization), deps);

        expect(res.status).toBe(401);
        expect(cleanup).not.toHaveBeenCalled();
      },
    );

    it('refuses every request when CRON_SECRET is not set', async () => {
      vi.stubEnv('CRON_SECRET', '');

      const res = await handleCleanupUploads(cronRequest('Bearer '), deps);

      expect(res.status).toBe(401);
    });
  });
});
