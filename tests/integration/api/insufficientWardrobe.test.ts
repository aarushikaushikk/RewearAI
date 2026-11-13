// US12 (Insufficient Wardrobe Items) across US6 and US7: one in-memory wardrobe store backs both
// the real availability handler (PATCH /api/wardrobe/[itemId]/availability) and outfit generation
// (POST /api/outfits/generate), as the production repository and outfit source share MongoDB.
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { handleGenerateOutfit } from '@/lib/outfits/outfitHandlers';
import { handleSetAvailability } from '@/lib/wardrobe/wardrobeHandlers';
import { SESSION_COOKIE_NAME } from '@/lib/auth/cookieConfig';
import { AuthService } from '@/services/authService';
import { OutfitRecommendationService } from '@/services/outfitRecommendationService';
import { WardrobeItemService } from '@/services/wardrobeItemService';
import { OCCASIONS, type Occasion } from '@/types/outfit';
import type { Category, Formality, WardrobeItemRecord } from '@/types/wardrobe';
import { MemoryUserRepository } from '../../mocks/memoryUserRepository';
import { MemorySessionRepository } from '../../mocks/memorySessionRepository';
import { MemoryWardrobeItemRepository } from '../../mocks/memoryWardrobeItemRepository';
import { MemoryImageStore } from '../../mocks/memoryImageStore';

const ORIGIN = 'http://localhost:3000';
const PASSWORD = 'Password123!';

type User = { id: string; cookie: string };
type OutfitItem = { id: string; role: string; image: { url: string }; category: string; formality: string };

function jsonRequest(method: 'POST' | 'PATCH', path: string, body: unknown, cookie: string) {
  return new Request(`${ORIGIN}${path}`, {
    method,
    headers: { host: 'localhost:3000', origin: ORIGIN, 'Content-Type': 'application/json', cookie },
    body: JSON.stringify(body),
  });
}

describe('US12: insufficient wardrobe with US6 availability and US7 generation', () => {
  let authService: AuthService;
  let itemRepo: MemoryWardrobeItemRepository;
  let wardrobeService: WardrobeItemService;
  let outfitService: OutfitRecommendationService;
  let alex: User;
  let sam: User;
  let consoleError: MockInstance;
  let photo = 1;

  async function signUp(email: string): Promise<User> {
    const result = await authService.register({ email, password: PASSWORD });
    return { id: result.user.id, cookie: `${SESSION_COOKIE_NAME}=${result.sessionToken}` };
  }

  function save(owner: User, category: Category, formality: Formality = 'Casual'): Promise<WardrobeItemRecord> {
    const n = photo++;
    return itemRepo.create({
      ownerId: owner.id,
      image: { url: `https://res.cloudinary.com/test/image/upload/v1/p${n}.jpg`, publicId: `rewear/users/${owner.id}/p${n}` },
      name: `${category} ${n}`,
      category,
      color: 'Black',
      style: category,
      season: 'All-season',
      formality,
    });
  }

  async function setAvailability(user: User, itemId: string, isAvailable: boolean) {
    const res = await handleSetAvailability(
      jsonRequest('PATCH', `/api/wardrobe/${itemId}/availability`, { isAvailable }, user.cookie),
      itemId,
      { authService, wardrobeService },
    );
    expect(res.status).toBe(200);
  }

  async function generate(user: User, occasion: Occasion) {
    const res = await handleGenerateOutfit(jsonRequest('POST', '/api/outfits/generate', { occasion }, user.cookie), {
      authService,
      outfitService,
    });
    expect(res.status).toBe(200);
    return (await res.json()).data;
  }

  beforeEach(async () => {
    authService = new AuthService(new MemoryUserRepository(), new MemorySessionRepository());
    itemRepo = new MemoryWardrobeItemRepository();
    wardrobeService = new WardrobeItemService(itemRepo, new MemoryImageStore(), 'test-db');
    // US6's repository has the listAvailableByOwner the outfit service reads.
    outfitService = new OutfitRecommendationService(itemRepo);
    alex = await signUp('alex@example.com');
    sam = await signUp('sam@example.com');
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it('reports an insufficient wardrobe while a needed item is unavailable, and an outfit once it is available again', async () => {
    const top = await save(alex, 'Top');
    const bottom = await save(alex, 'Bottom');
    // Sam's bottom would complete Alex's outfit if generation ever read another user's items.
    const samsBottom = await save(sam, 'Bottom');
    await setAvailability(alex, bottom.id, false);

    const before = await generate(alex, 'casual');
    expect(before).toEqual({ status: 'insufficient', occasion: 'casual', reason: 'no_complete_outfit' });

    await setAvailability(alex, bottom.id, true);
    const after = await generate(alex, 'casual');

    expect(after).toMatchObject({ status: 'ok', occasion: 'casual' });
    expect(after.items.map((i: OutfitItem) => [i.role, i.id])).toEqual([
      ['top', top.id],
      ['bottom', bottom.id],
    ]);
    const alexsIds = (await itemRepo.listByOwner(alex.id)).map((i) => i.id);
    expect(after.items.every((i: OutfitItem) => alexsIds.includes(i.id))).toBe(true);
    expect(JSON.stringify(after)).not.toContain(samsBottom.id);
  });

  it('reports no suitable items when the only suitable item is made unavailable', async () => {
    const dress = await save(alex, 'Dress', 'Formal');
    await setAvailability(alex, dress.id, false);

    expect(await generate(alex, 'formal')).toEqual({ status: 'insufficient', occasion: 'formal', reason: 'no_suitable_items' });

    await setAvailability(alex, dress.id, true);
    expect((await generate(alex, 'formal')).items.map((i: OutfitItem) => i.id)).toEqual([dress.id]);
  });

  it("doesn't let another user's availability change affect the signed-in user's result", async () => {
    await save(alex, 'Top');
    const samsBottom = await save(sam, 'Bottom');
    await setAvailability(sam, samsBottom.id, true);

    expect(await generate(alex, 'casual')).toMatchObject({ status: 'insufficient', reason: 'no_complete_outfit' });
  });

  it.each(OCCASIONS)(
    'recommends for %s only items from the signed-in user\'s saved, available wardrobe, never invented ones',
    async (occasion) => {
      const formalities: Formality[] = ['Casual', 'Smart casual', 'Formal'];
      for (const formality of formalities) {
        for (const category of ['Top', 'Bottom', 'Dress', 'Shoes', 'Outerwear', 'Accessory'] as Category[]) {
          await save(alex, category, formality);
          const off = await save(alex, category, formality);
          await setAvailability(alex, off.id, false);
          await save(sam, category, formality);
        }
      }
      const stored = new Map((await itemRepo.listByOwner(alex.id)).map((i) => [i.id, i]));

      const data = await generate(alex, occasion);

      expect(data.status).toBe('ok');
      expect(data.items.length).toBeGreaterThan(0);
      for (const item of data.items as OutfitItem[]) {
        const saved = stored.get(item.id);
        expect(saved, `${item.id} is one of Alex's saved items`).toBeDefined();
        expect(saved!.isAvailable).toBe(true);
        // Shown attributes are the stored ones, not filled in.
        expect(item).toMatchObject({ image: { url: saved!.image.url }, category: saved!.category, formality: saved!.formality });
      }
    },
  );

  it.each([
    ['a top without a bottom', ['Top', 'Shoes', 'Accessory']],
    ['a bottom without a top', ['Bottom', 'Outerwear']],
    ['only optional pieces', ['Shoes', 'Outerwear', 'Accessory']],
  ] as [string, Category[]][])('returns an insufficient result, not a partial outfit, for %s', async (_label, categories) => {
    for (const category of categories) {
      await save(alex, category);
    }

    const data = await generate(alex, 'casual');

    expect(data).toEqual({ status: 'insufficient', occasion: 'casual', reason: 'no_complete_outfit' });
    expect(data).not.toHaveProperty('items');
  });
});
