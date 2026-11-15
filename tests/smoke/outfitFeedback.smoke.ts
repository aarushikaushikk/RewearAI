import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import mongoose, { type Connection } from 'mongoose';
import { WardrobeItem } from '@/models/WardrobeItem';
import { startMongoTestServer, type MongoTestServer } from '../helpers/mongoTestServer';
import { startApp, type RunningApp } from '../helpers/nextApp';

/**
 * US14 smoke test: rating, changing, clearing and using recommendation feedback on the real
 * `next start` build, against a temporary MongoDB server, with fake users and synthetic wardrobe
 * items written straight to that database. HTTP only; the UI is covered by component tests.
 */

const SAMPLE_IMAGE = 'https://res.cloudinary.com/demo/image/upload/sample.jpg';

// Next.js doesn't load a variable from .env.local once it is defined, so real values can't load.
const BLANK_SECRETS = {
  CLOUDINARY_CLOUD_NAME: '',
  CLOUDINARY_API_KEY: '',
  CLOUDINARY_API_SECRET: '',
  CRON_SECRET: '',
};

const PASSWORD = 'SmokeTest123!';
const USER_A = { email: 'feedback-a@example.com', password: PASSWORD, name: 'Feedback Tester A' };
const USER_B = { email: 'feedback-b@example.com', password: PASSWORD, name: 'Feedback Tester B' };

// Two casual tops and one bottom: two valid casual outfits.
const ITEMS = [
  { name: 'Linen tee', category: 'Top' },
  { name: 'Polo', category: 'Top' },
  { name: 'Denim shorts', category: 'Bottom' },
];

const cookieFrom = (res: Response) => (res.headers.get('set-cookie') ?? '').split(';')[0];

let server: MongoTestServer;
let database: Connection;
let app: RunningApp;
const users = { a: { cookie: '', id: '' }, b: { cookie: '', id: '' } };

async function register(user: typeof USER_A) {
  const res = await fetch(`${app.origin}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', origin: app.origin },
    body: JSON.stringify(user),
  });
  expect(res.status).toBe(201);
  const stored = await database.collection('users').findOne({ email: user.email });
  return { cookie: cookieFrom(res), id: String(stored?._id) };
}

async function seed(ownerId: string) {
  const Item = database.models.WardrobeItem ?? database.model('WardrobeItem', WardrobeItem.schema);
  for (const [i, item] of ITEMS.entries()) {
    await Item.create({
      owner: ownerId,
      image: { url: SAMPLE_IMAGE, publicId: `rewear/users/${ownerId}/feedback-smoke-${i}` },
      name: item.name,
      category: item.category,
      color: 'Black',
      style: item.category,
      season: 'All-season',
      formality: 'Casual',
    });
  }
}

function send(method: string, route: string, body: unknown, cookie: string, origin = app.origin) {
  return fetch(`${app.origin}${route}`, {
    method,
    headers: {
      origin,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(cookie ? { cookie } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function generate(cookie: string) {
  const res = await send('POST', '/api/outfits/generate', { occasion: 'casual' }, cookie);
  const { data } = await res.json();
  expect(data.status).toBe('ok');
  return { itemIds: data.items.map((i: { id: string }) => i.id) as string[], feedback: data.feedback };
}

const feedbackCount = () => database.collection('feedbacks').countDocuments();

beforeAll(async () => {
  server = await startMongoTestServer();
  database = await mongoose.createConnection(server.uri).asPromise();
  app = await startApp(`${server.uri}?serverSelectionTimeoutMS=2000`, BLANK_SECRETS);
  users.a = await register(USER_A);
  users.b = await register(USER_B);
  await seed(users.a.id);
});

afterAll(async () => {
  await app?.stop();
  await database?.close();
  await server?.stop();
});

describe('US14 recommendation feedback on the production build (HTTP)', () => {
  it('keeps the feedback API private', async () => {
    const body = { occasion: 'casual', itemIds: ['64c0000000000000000000a1'], rating: 'positive' };
    expect((await send('PUT', '/api/outfits/feedback', body, '')).status).toBe(401);
    expect((await send('PUT', '/api/outfits/feedback', body, users.a.cookie, 'https://evil.example')).status).toBe(403);
    expect((await send('PUT', '/api/outfits/feedback', { ...body, userId: users.b.id }, users.a.cookie)).status).toBe(400);
    expect((await send('DELETE', '/api/outfits/feedback/64c0000000000000000000a1', undefined, '')).status).toBe(401);
  });

  it('rates, changes and clears feedback on one stored record, and generation uses it', async () => {
    const first = await generate(users.a.cookie);
    expect(first.feedback).toBeNull();

    const disliked = await send(
      'PUT',
      '/api/outfits/feedback',
      { occasion: 'casual', itemIds: first.itemIds, rating: 'negative' },
      users.a.cookie,
    );
    expect(disliked.status).toBe(200);
    const { outfitId } = (await disliked.json()).data;

    const next = await generate(users.a.cookie);
    expect(next.itemIds).not.toEqual(first.itemIds);

    const retries = await Promise.all(
      Array.from({ length: 3 }, () =>
        send('PUT', '/api/outfits/feedback', { occasion: 'casual', itemIds: first.itemIds, rating: 'positive' }, users.a.cookie),
      ),
    );
    expect(retries.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(await feedbackCount()).toBe(1);
    const liked = await generate(users.a.cookie);
    expect(liked).toEqual({ itemIds: first.itemIds, feedback: { outfitId, rating: 'positive' } });

    expect((await send('DELETE', `/api/outfits/feedback/${outfitId}`, undefined, users.b.cookie)).status).toBe(404);
    expect((await send('DELETE', `/api/outfits/feedback/${outfitId}`, undefined, users.a.cookie)).status).toBe(200);
    expect(await feedbackCount()).toBe(0);
    expect((await generate(users.a.cookie)).feedback).toBeNull();
  });

  it("refuses to rate another user's items", async () => {
    const { itemIds } = await generate(users.a.cookie);

    const res = await send('PUT', '/api/outfits/feedback', { occasion: 'casual', itemIds, rating: 'negative' }, users.b.cookie);

    expect(res.status).toBe(404);
  });
});
