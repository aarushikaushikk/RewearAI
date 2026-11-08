import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import {
  handleCleanupUploads,
  handleCreateItem,
  handleUploadImage,
} from '@/lib/wardrobe/wardrobeHandlers';
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
