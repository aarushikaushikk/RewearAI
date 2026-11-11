import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { handleGenerateOutfit } from '@/lib/outfits/outfitHandlers';
import { POST as generateOutfitRoute } from '@/app/api/outfits/generate/route';
import { SESSION_COOKIE_NAME } from '@/lib/auth/cookieConfig';
import { RepositoryUnavailableError } from '@/lib/repositories/repositoryErrors';
import { AuthService } from '@/services/authService';
import { OutfitRecommendationService } from '@/services/outfitRecommendationService';
import { OCCASIONS, type Occasion } from '@/types/outfit';
import type { Formality } from '@/types/wardrobe';
import { MemoryUserRepository } from '../../mocks/memoryUserRepository';
import { MemorySessionRepository } from '../../mocks/memorySessionRepository';
import { MemoryAvailableWardrobeItems, wardrobeRecord } from '../../mocks/memoryAvailableWardrobeItems';

const ORIGIN = 'http://localhost:3000';
const PASSWORD = 'Password123!';

const FORMALITY_FOR: Record<Occasion, Formality> = {
  work: 'Smart casual',
  dinner: 'Formal',
  weekend: 'Smart casual',
  casual: 'Casual',
  formal: 'Formal',
};

function generateRequest(body: unknown, options: { cookie?: string; origin?: string | null } = {}) {
  const origin = options.origin === undefined ? ORIGIN : options.origin;
  return new Request(`${ORIGIN}/api/outfits/generate`, {
    method: 'POST',
    headers: {
      host: 'localhost:3000',
      'Content-Type': 'application/json',
      ...(origin ? { origin } : {}),
      ...(options.cookie ? { cookie: options.cookie } : {}),
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('POST /api/outfits/generate', () => {
  let authService: AuthService;
  let source: MemoryAvailableWardrobeItems;
  let deps: { authService: AuthService; outfitService: OutfitRecommendationService };
  let alex: { id: string; cookie: string };
  let sam: { id: string; cookie: string };
  let consoleError: MockInstance;

  async function signUp(email: string) {
    const result = await authService.register({ email, password: PASSWORD });
    return { id: result.user.id, cookie: `${SESSION_COOKIE_NAME}=${result.sessionToken}` };
  }

  function generateAs(user: { cookie: string }, body: unknown) {
    return handleGenerateOutfit(generateRequest(body, { cookie: user.cookie }), deps);
  }

  beforeEach(async () => {
    authService = new AuthService(new MemoryUserRepository(), new MemorySessionRepository());
    source = new MemoryAvailableWardrobeItems();
    deps = { authService, outfitService: new OutfitRecommendationService(source) };
    alex = await signUp('alex@example.com');
    sam = await signUp('sam@example.com');
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it.each(OCCASIONS)('generates a %s outfit from the signed-in user\'s wardrobe', async (occasion) => {
    const formality = FORMALITY_FOR[occasion];
    const top = wardrobeRecord(alex.id, 'Top', { formality, name: 'Oxford shirt' });
    const bottom = wardrobeRecord(alex.id, 'Bottom', { formality });
    source.items.push(top, bottom);

    const res = await generateAs(alex, { occasion });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data).toMatchObject({ status: 'ok', occasion });
    expect(json.data.items.map((i: { id: string }) => i.id)).toEqual([top.id, bottom.id]);
    expect(json.data.items[0]).toMatchObject({
      role: 'top',
      name: 'Oxford shirt',
      image: { url: top.image.url },
      category: 'Top',
      formality,
    });
  });

  it('answers 200 with an explicit insufficient result when no outfit can be made', async () => {
    source.items.push(wardrobeRecord(alex.id, 'Top'));

    const res = await generateAs(alex, { occasion: 'casual' });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      data: { status: 'insufficient', occasion: 'casual', reason: 'no_complete_outfit' },
    });
  });

  it("never exposes or uses another user's wardrobe", async () => {
    const samsDress = wardrobeRecord(sam.id, 'Dress');
    source.items.push(wardrobeRecord(alex.id, 'Top'), wardrobeRecord(sam.id, 'Bottom'), samsDress);

    const res = await generateAs(alex, { occasion: 'casual' });

    const json = await res.json();
    expect(json.data).toMatchObject({ status: 'insufficient', reason: 'no_complete_outfit' });
    expect(JSON.stringify(json)).not.toContain(samsDress.id);
  });

  it('leaves out unavailable clothing', async () => {
    source.items.push(
      wardrobeRecord(alex.id, 'Dress', { isAvailable: false }),
      wardrobeRecord(alex.id, 'Top'),
      wardrobeRecord(alex.id, 'Bottom'),
    );

    const json = await (await generateAs(alex, { occasion: 'casual' })).json();

    expect(json.data.items.map((i: { role: string }) => i.role)).toEqual(['top', 'bottom']);
  });

  it('derives the owner from the session, never from the request', async () => {
    const list = vi.spyOn(source, 'listAvailableByOwner');

    const res = await generateAs(alex, { occasion: 'casual', userId: sam.id });

    expect(res.status).toBe(400);
    expect(list).not.toHaveBeenCalled();

    await generateAs(alex, { occasion: 'casual' });
    expect(list).toHaveBeenCalledExactlyOnceWith(alex.id);
  });

  it.each([
    [{}],
    [{ occasion: '' }],
    [{ occasion: 'Work' }],
    [{ occasion: 'party' }],
    [{ occasion: 3 }],
  ])('returns 400 asking for an occasion for %j', async (body) => {
    const res = await generateAs(alex, body);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ success: false, error: 'Choose an occasion to continue.' });
  });

  it.each([
    ['not json'],
    ['"work"'],
    ['[]'],
    [JSON.stringify({ occasion: 'work', itemIds: ['item_1'] })],
    [JSON.stringify({ occasion: 'work', ownerId: 'someone' })],
  ])('returns 400 for the invalid payload %s', async (body) => {
    const res = await generateAs(alex, body);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ success: false, error: 'Invalid request payload' });
  });

  it('rejects a cross-site request with 403 before reading the session or wardrobe', async () => {
    const list = vi.spyOn(source, 'listAvailableByOwner');

    const res = await handleGenerateOutfit(
      generateRequest({ occasion: 'work' }, { cookie: alex.cookie, origin: 'https://evil.example' }),
      deps,
    );

    expect(res.status).toBe(403);
    expect(list).not.toHaveBeenCalled();
  });

  it('rejects a request with neither Origin nor Referer', async () => {
    const res = await handleGenerateOutfit(
      generateRequest({ occasion: 'work' }, { cookie: alex.cookie, origin: null }),
      deps,
    );

    expect(res.status).toBe(403);
  });

  it('returns 401 without a session, and reads no wardrobe', async () => {
    const list = vi.spyOn(source, 'listAvailableByOwner');

    const res = await handleGenerateOutfit(generateRequest({ occasion: 'work' }), deps);

    expect(res.status).toBe(401);
    expect(list).not.toHaveBeenCalled();
  });

  it('returns 401 for a session that has been signed out', async () => {
    await authService.logout(alex.cookie.split('=')[1]);

    const res = await generateAs(alex, { occasion: 'work' });

    expect(res.status).toBe(401);
  });

  it('returns 503 with a safe message when the wardrobe cannot be read', async () => {
    vi.spyOn(source, 'listAvailableByOwner').mockRejectedValue(new RepositoryUnavailableError());

    const res = await generateAs(alex, { occasion: 'work' });

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      success: false,
      error: 'The outfit service is temporarily unavailable. Please try again later.',
    });
  });

  it('returns 500 with a generic message for an unexpected failure, logging no details', async () => {
    vi.spyOn(source, 'listAvailableByOwner').mockRejectedValue(new Error('driver detail 10.0.0.5 s3cr3t'));

    const res = await generateAs(alex, { occasion: 'work' });

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ success: false, error: 'Internal server error' });
    expect(JSON.stringify(consoleError.mock.calls)).not.toMatch(/10\.0\.0\.5|s3cr3t/);
  });

  it('is wired to the route: the POST export checks the origin first', async () => {
    const res = await generateOutfitRoute(
      generateRequest({ occasion: 'work' }, { origin: 'https://evil.example' }),
    );

    expect(res.status).toBe(403);
  });
});
