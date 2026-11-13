import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import mongoose, { type Connection } from 'mongoose';
import { WardrobeItem } from '@/models/WardrobeItem';
import { OCCASIONS, type Occasion } from '@/types/outfit';
import { launchChrome, type CdpPage, type RunningChrome } from '../helpers/chromeCdp';
import { startMongoTestServer, type MongoTestServer } from '../helpers/mongoTestServer';
import { startApp, type RunningApp } from '../helpers/nextApp';

/**
 * US7 smoke test: the real `next start` build against a temporary MongoDB server, with fake
 * users and synthetic wardrobe items. Run with `npm run test:smoke`.
 *
 * The HTTP checks always run. The browser checks run only when SMOKE_CHROME_PATH points to a
 * Chrome executable; screenshots are saved when SMOKE_SCREENSHOT_DIR is set. The browser
 * checks load Cloudinary's public demo images through Next.js image optimization, so they
 * need network access to res.cloudinary.com. No credentials are used, and nothing is uploaded.
 */

const CHROME_PATH = process.env.SMOKE_CHROME_PATH ?? '';
const SCREENSHOT_DIR = process.env.SMOKE_SCREENSHOT_DIR ?? '';

/** Cloudinary's documented public sample image, and a path on the same host that doesn't exist. */
const SAMPLE_IMAGE = 'https://res.cloudinary.com/demo/image/upload/sample.jpg';
const MISSING_IMAGE = 'https://res.cloudinary.com/demo/image/upload/rewear-smoke-missing-9f3c.jpg';

// Next.js doesn't load a variable from .env.local once it is defined, so real values can't load.
const BLANK_SECRETS = {
  CLOUDINARY_CLOUD_NAME: '',
  CLOUDINARY_API_KEY: '',
  CLOUDINARY_API_SECRET: '',
  CRON_SECRET: '',
};

const USER_A = { email: 'smoke-a@example.com', password: 'SmokeTest123!', name: 'Smoke Tester A' };
const USER_B = { email: 'smoke-b@example.com', password: 'SmokeTest123!', name: 'Smoke Tester B' };

type Seed = { name: string; category: string; formality: string; season: string; image?: string; isAvailable?: boolean };

// Created in this order, so later items are newer. Generation prefers newer items, so the
// unavailable blazer and User B's items would be chosen if either filter failed.
const A_ITEMS: Seed[] = [
  { name: 'A Oxford shirt', category: 'Top', formality: 'Smart casual', season: 'All-season' },
  { name: 'A Chinos', category: 'Bottom', formality: 'Smart casual', season: 'All-season', image: MISSING_IMAGE },
  { name: 'A Loafers', category: 'Shoes', formality: 'Smart casual', season: 'All-season' },
  { name: 'A Linen tee', category: 'Top', formality: 'Casual', season: 'Summer' },
  { name: 'A Denim shorts', category: 'Bottom', formality: 'Casual', season: 'Summer' },
  { name: 'A Wool coat', category: 'Outerwear', formality: 'Smart casual', season: 'Winter' },
  { name: 'A Unavailable blazer', category: 'Top', formality: 'Smart casual', season: 'All-season', isAvailable: false },
];
const B_ITEMS: Seed[] = [
  { name: 'B Silk gown', category: 'Dress', formality: 'Formal', season: 'All-season' },
  { name: 'B Hoodie', category: 'Top', formality: 'Casual', season: 'All-season' },
  { name: 'B Joggers', category: 'Bottom', formality: 'Casual', season: 'All-season' },
];
const NEVER_SHOWN = ['A Unavailable blazer', 'B Silk gown', 'B Hoodie', 'B Joggers'];

const EXPECTED: Record<Occasion, string[] | 'insufficient'> = {
  work: ['A Oxford shirt', 'A Chinos', 'A Loafers', 'A Wool coat'],
  dinner: ['A Oxford shirt', 'A Chinos', 'A Loafers', 'A Wool coat'],
  weekend: ['A Linen tee', 'A Denim shorts', 'A Loafers'],
  casual: ['A Linen tee', 'A Denim shorts'],
  formal: 'insufficient',
};

const cookieFrom = (res: Response) => (res.headers.get('set-cookie') ?? '').split(';')[0];

let server: MongoTestServer;
let database: Connection;
let app: RunningApp;
let cookieA = '';

async function register(user: typeof USER_A): Promise<{ cookie: string; id: string }> {
  const res = await fetch(`${app.origin}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', origin: app.origin },
    body: JSON.stringify(user),
  });
  expect(res.status).toBe(201);
  const stored = await database.collection('users').findOne({ email: user.email });
  return { cookie: cookieFrom(res), id: String(stored?._id) };
}

async function seed(ownerId: string, items: Seed[]) {
  // The real schema, so its enums and URL validation apply to the synthetic data.
  const Item = database.models.WardrobeItem ?? database.model('WardrobeItem', WardrobeItem.schema);
  for (const [i, item] of items.entries()) {
    await Item.create({
      owner: ownerId,
      image: { url: item.image ?? SAMPLE_IMAGE, publicId: `rewear/users/${ownerId}/smoke-${i}` },
      name: item.name,
      category: item.category,
      color: 'Black',
      style: item.category,
      season: item.season,
      formality: item.formality,
      isAvailable: item.isAvailable ?? true,
    });
  }
}

function generate(body: unknown, cookie = cookieA, origin = app.origin) {
  return fetch(`${app.origin}/api/outfits/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', origin, ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  server = await startMongoTestServer();
  database = await mongoose.createConnection(server.uri).asPromise();
  app = await startApp(`${server.uri}?serverSelectionTimeoutMS=2000`, BLANK_SECRETS);
  const a = await register(USER_A);
  const b = await register(USER_B);
  cookieA = a.cookie;
  await seed(a.id, A_ITEMS);
  await seed(b.id, B_ITEMS);
});

afterAll(async () => {
  await app?.stop();
  await database?.close();
  await server?.stop();
});

describe('US7 outfit generation on the production build (HTTP)', () => {
  it('keeps the Create Outfit page and the API private', async () => {
    const page = await fetch(`${app.origin}/outfits/create`, { redirect: 'manual' });
    expect(page.status).toBe(307);
    expect(page.headers.get('location')).toMatch(/\/sign-in$/);

    expect((await generate({ occasion: 'work' }, '')).status).toBe(401);
    expect((await generate({ occasion: 'work' }, cookieA, 'https://evil.example')).status).toBe(403);
    expect((await generate({ occasion: 'work', userId: 'someone' })).status).toBe(400);
  });

  it.each(OCCASIONS)("recommends only User A's available items for %s", async (occasion) => {
    const res = await generate({ occasion });
    expect(res.status).toBe(200);
    const { data } = await res.json();
    const expected = EXPECTED[occasion];

    if (expected === 'insufficient') {
      expect(data).toEqual({ status: 'insufficient', occasion, reason: 'no_suitable_items' });
    } else {
      expect(data.status).toBe('ok');
      expect(data.items.map((i: { name: string }) => i.name)).toEqual(expected);
    }
    const json = JSON.stringify(data);
    for (const name of NEVER_SHOWN) expect(json).not.toContain(name);
    expect(json).not.toMatch(/publicId|ownerId|isAvailable/);
  });
});

const UNSAFE_CHARS: Record<string, string> = {
  '<': '\\u003C',
  '>': '\\u003E',
  '/': '\\u002F',
  '\\': '\\\\',
  '\b': '\\b',
  '\f': '\\f',
  '\n': '\\n',
  '\r': '\\r',
  '\t': '\\t',
  '\0': '\\0',
  '\u2028': '\\u2028',
  '\u2029': '\\u2029',
};

/** A string as a JavaScript literal that is safe to place inside code evaluated in the page. */
const jsString = (value: string) =>
  JSON.stringify(value).replace(/[<>\b\f\n\r\t\0\u2028\u2029]/g, (c) => UNSAFE_CHARS[c]);

describe.runIf(CHROME_PATH)('US7 Create Outfit in a real browser', () => {
  let chrome: RunningChrome;
  let page: CdpPage;
  const requestUrls = new Map<string, string>();
  const generateRequests: string[] = [];
  const responses: { url: string; status: number; mimeType: string }[] = [];
  const consoleErrors: { text: string; url: string }[] = [];
  const failedRequests: { url: string; errorText: string; canceled: boolean; type: string }[] = [];

  const shot = async (name: string) => {
    if (!SCREENSHOT_DIR) return;
    const { cssContentSize } = await page.send<{ cssContentSize: { width: number; height: number } }>(
      'Page.getLayoutMetrics',
    );
    const { data } = await page.send<{ data: string }>('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
      clip: { x: 0, y: 0, width: cssContentSize.width, height: cssContentSize.height, scale: 1 },
    });
    mkdirSync(SCREENSHOT_DIR, { recursive: true });
    writeFileSync(path.join(SCREENSHOT_DIR, `${name}.png`), Buffer.from(data, 'base64'));
  };
  const viewport = (width: number) =>
    page.send('Emulation.setDeviceMetricsOverride', {
      width,
      height: width < 640 ? 812 : 900,
      deviceScaleFactor: 1,
      mobile: width < 640,
    });
  const goto = async (route: string) => {
    await page.send('Page.navigate', { url: `${app.origin}${route}` });
    await page.waitFor(`document.readyState === 'complete'`, `${route} to load`);
  };
  const bodyText = () => page.evaluate<string>('document.body.innerText');
  // Input before hydration is lost, and a click submits the form natively, so wait until React
  // has attached its props to the element. Slow CI runners hydrate well after `load`.
  const waitForHydration = (element: string, label: string) =>
    page.waitFor(
      `(() => { const el = ${element}; return !!el && Object.keys(el).some((k) => k.startsWith('__reactProps$')); })()`,
      `${label} to hydrate`,
    );
  const findButton = (name: string) =>
    `[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === ${jsString(name)})`;
  const setOccasion = async (label: string) => {
    await waitForHydration(`document.getElementById('occasion')`, 'the occasion select');
    await page.evaluate(`(() => {
      const select = document.getElementById('occasion');
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, ${jsString(label)});
      select.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
  };
  const fill = async (id: string, value: string) => {
    await waitForHydration(`document.getElementById(${jsString(id)})`, `the ${id} field`);
    await page.evaluate(`(() => {
      const input = document.getElementById(${jsString(id)});
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${jsString(value)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
  };
  const clickButton = async (name: string, times = 1) => {
    await waitForHydration(findButton(name), `the ${name} button`);
    await page.evaluate(`(() => {
      const button = ${findButton(name)};
      if (!button) throw new Error('No button named ' + ${jsString(name)});
      for (let i = 0; i < ${times}; i++) button.click();
    })()`);
  };
  const outfitNames = () =>
    page.evaluate<string[]>(
      `[...document.querySelectorAll('ul[aria-label="Items in this outfit"] li p.font-semibold')].map((p) => p.textContent)`,
    );
  const generateAndWait = async (label: string) => {
    await setOccasion(label);
    await clickButton('Generate Outfit');
    await page.waitFor(`document.getElementById('outfit-heading')`, `the ${label} outfit`);
  };

  beforeAll(async () => {
    chrome = await launchChrome(CHROME_PATH);
    page = await chrome.newPage();
    page.on('Network.requestWillBeSent', (p) => {
      const request = p.request as { url: string; method: string };
      requestUrls.set(p.requestId as string, request.url);
      if (request.url.endsWith('/api/outfits/generate') && request.method === 'POST') {
        generateRequests.push(request.url);
      }
    });
    page.on('Network.responseReceived', (p) => {
      const response = p.response as { url: string; status: number; mimeType: string };
      responses.push({ url: response.url, status: response.status, mimeType: response.mimeType });
    });
    page.on('Network.loadingFailed', (p) => {
      failedRequests.push({
        url: requestUrls.get(p.requestId as string) ?? '',
        errorText: p.errorText as string,
        canceled: p.canceled === true,
        type: p.type as string,
      });
    });
    page.on('Runtime.exceptionThrown', (p) => {
      const details = p.exceptionDetails as { text: string; url?: string };
      consoleErrors.push({ text: details.text, url: details.url ?? '' });
    });
    page.on('Runtime.consoleAPICalled', (p) => {
      if (p.type === 'error') {
        const args = p.args as { value?: unknown; description?: string }[];
        consoleErrors.push({ text: args.map((a) => a.value ?? a.description).join(' '), url: '' });
      }
    });
    page.on('Log.entryAdded', (p) => {
      const entry = p.entry as { level: string; text: string; url?: string };
      if (entry.level === 'error') consoleErrors.push({ text: entry.text, url: entry.url ?? '' });
    });
    await Promise.all(['Network.enable', 'Runtime.enable', 'Log.enable', 'Page.enable'].map((m) => page.send(m)));
    await viewport(1280);
  }, 60_000);

  afterAll(async () => {
    await chrome?.close();
  });

  it('sends a signed-out visitor from Create Outfit to sign-in', async () => {
    await goto('/outfits/create');
    await page.waitFor(`location.pathname === '/sign-in'`, 'the sign-in redirect');
  });

  it('signs User A in through the real form and opens Create Outfit', async () => {
    await fill('email', USER_A.email);
    await fill('password', USER_A.password);
    await clickButton('Sign In');
    await page.waitFor(`location.pathname === '/home'`, 'sign-in to finish');
    await goto('/outfits/create');
    await page.waitFor(`document.getElementById('occasion')`, 'the occasion select');
    expect(await page.evaluate('document.querySelector("h1").textContent')).toBe('Create Outfit');
  });

  it('offers the five occasions (desktop, 1280 px)', async () => {
    const options = await page.evaluate<string[]>(
      `[...document.querySelectorAll('#occasion option')].map((o) => o.textContent)`,
    );
    expect(options).toEqual(['Choose…', 'Work', 'Dinner', 'Weekend', 'Casual', 'Formal']);
    await shot('desktop-1280-occasion-selector');
  });

  it("shows User A's work outfit with names, roles, a loaded photo, and a placeholder", async () => {
    const before = generateRequests.length;
    await generateAndWait('Work');

    expect(generateRequests.length - before).toBe(1);
    expect(await outfitNames()).toEqual(EXPECTED.work);
    const text = await bodyText();
    for (const role of ['Top', 'Bottom', 'Shoes', 'Outerwear']) expect(text).toContain(role);
    for (const name of NEVER_SHOWN) expect(text).not.toContain(name);
    expect(await page.evaluate('document.activeElement && document.activeElement.id')).toBe('outfit-heading');

    // The public sample loads through Next.js image optimization.
    await page.waitFor(
      `(() => { const img = document.querySelector('img[alt="A Oxford shirt"]'); return img && img.complete && img.naturalWidth > 0; })()`,
      'the Oxford shirt photo to load',
      30_000,
    );
    const src = await page.evaluate<string>(`document.querySelector('img[alt="A Oxford shirt"]').currentSrc`);
    expect(src).toContain('/_next/image?url=' + encodeURIComponent(SAMPLE_IMAGE));
    expect(responses.some((r) => r.url === src && r.status === 200 && r.mimeType.startsWith('image/'))).toBe(true);

    // The missing photo is replaced by the placeholder; its name and role stay.
    await page.waitFor(
      `document.querySelector('[role="img"][aria-label="Image unavailable for A Chinos"]')`,
      'the Chinos placeholder',
      30_000,
    );

    const columns = await page.evaluate<number>(
      `new Set([...document.querySelectorAll('ul[aria-label="Items in this outfit"] li')].map((li) => li.getBoundingClientRect().top)).size`,
    );
    expect(columns).toBe(2); // 4 items in 3 columns: two rows.
    await page.waitFor(
      `[...document.querySelectorAll('ul[aria-label="Items in this outfit"] img')].every((img) => img.complete)`,
      'all photos to settle',
    );
    await shot('desktop-1280-recommendation');
  });

  it('clears the recommendation when the occasion changes', async () => {
    await setOccasion('Casual');
    await page.waitFor(`!document.getElementById('outfit-heading')`, 'the old outfit to clear');
  });

  it('explains an insufficient wardrobe with recovery links', async () => {
    await setOccasion('Formal');
    await clickButton('Generate Outfit');
    await page.waitFor(`document.body.innerText.includes("There aren't enough available items for a formal outfit yet.")`, 'the insufficient message');
    const links = await page.evaluate<Record<string, string>>(
      `Object.fromEntries([...document.querySelectorAll('a')].filter((a) => ['View wardrobe', 'Add clothing'].includes(a.textContent)).map((a) => [a.textContent, a.getAttribute('href')]))`,
    );
    expect(links).toEqual({ 'View wardrobe': '/wardrobe', 'Add clothing': '/wardrobe/new' });
    for (const name of NEVER_SHOWN) expect(await bodyText()).not.toContain(name);
    await shot('desktop-1280-insufficient');
  });

  it('shows loading and sends one request for repeated clicks', async () => {
    await page.send('Fetch.enable', { patterns: [{ urlPattern: '*/api/outfits/generate', requestStage: 'Request' }] });
    let paused = '';
    page.on('Fetch.requestPaused', (p) => (paused = p.requestId as string));
    const before = generateRequests.length;

    await setOccasion('Dinner');
    await clickButton('Generate Outfit', 3);
    await page.waitFor(`document.querySelector('button[aria-busy="true"]')`, 'the loading state');
    expect(await page.evaluate('document.querySelector("button[aria-busy=true]").disabled')).toBe(true);
    expect(await page.evaluate('document.getElementById("occasion").disabled')).toBe(true);
    for (let i = 0; i < 20 && !paused; i++) await new Promise((r) => setTimeout(r, 100));

    await page.send('Fetch.continueRequest', { requestId: paused });
    await page.waitFor(`document.getElementById('outfit-heading')`, 'the dinner outfit');
    await page.send('Fetch.disable');
    expect(generateRequests.length - before).toBe(1);
    expect(await outfitNames()).toEqual(EXPECTED.dinner);
  });

  it('offers Try again after a server error, and recovers', async () => {
    await page.send('Fetch.enable', { patterns: [{ urlPattern: '*/api/outfits/generate', requestStage: 'Request' }] });
    page.on('Fetch.requestPaused', (p) => {
      void page.send('Fetch.fulfillRequest', {
        requestId: p.requestId,
        responseCode: 500,
        responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
        body: Buffer.from(JSON.stringify({ success: false, error: 'Internal server error' })).toString('base64'),
      });
    });
    await setOccasion('Weekend');
    await clickButton('Generate Outfit');
    await page.waitFor(`document.querySelector('[role="alert"]')`, 'the error alert');
    expect(await page.evaluate('document.querySelector("[role=alert]").textContent')).toContain(
      "We couldn't generate an outfit. Try again.",
    );
    expect(await page.evaluate('document.getElementById("occasion").value')).toBe('Weekend');

    await page.send('Fetch.disable');
    await clickButton('Try again');
    await page.waitFor(`document.getElementById('outfit-heading')`, 'the weekend outfit');
    expect(await outfitNames()).toEqual(EXPECTED.weekend);
  });

  it('lays out the selector, recommendation, and insufficient state on mobile (375 px)', async () => {
    await viewport(375);
    await goto('/outfits/create');
    await page.waitFor(`document.getElementById('occasion')`, 'the occasion select');
    expect(await page.evaluate('document.documentElement.scrollWidth <= innerWidth')).toBe(true);
    await shot('mobile-375-occasion-selector');

    await generateAndWait('Work');
    await page.waitFor(
      `[...document.querySelectorAll('ul[aria-label="Items in this outfit"] img')].every((img) => img.complete) && document.querySelector('[aria-label="Image unavailable for A Chinos"]')`,
      'photos and placeholder on mobile',
      30_000,
    );
    const rows = await page.evaluate<number>(
      `new Set([...document.querySelectorAll('ul[aria-label="Items in this outfit"] li')].map((li) => li.getBoundingClientRect().top)).size`,
    );
    expect(rows).toBe(4); // One column.
    expect(await page.evaluate('document.documentElement.scrollWidth <= innerWidth')).toBe(true);
    await shot('mobile-375-recommendation');

    await setOccasion('Formal');
    await clickButton('Generate Outfit');
    await page.waitFor(`document.body.innerText.includes("There aren't enough available items")`, 'the insufficient message');
    expect(await page.evaluate('document.documentElement.scrollWidth <= innerWidth')).toBe(true);
    await shot('mobile-375-insufficient');
  });

  it('offers Sign in when the session has ended', async () => {
    await database.collection('sessions').deleteMany({});
    await setOccasion('Casual');
    await clickButton('Generate Outfit');
    await page.waitFor(`document.querySelector('[role="alert"]')`, 'the session alert');
    expect(await page.evaluate('document.querySelector("[role=alert]").textContent')).toContain(
      'Your session has ended. Sign in again to continue.',
    );
    const signIn = await page.evaluate<string | null>(
      `([...document.querySelectorAll('a')].find((a) => a.textContent === 'Sign in') || null)?.getAttribute('href') ?? null`,
    );
    expect(signIn).toBe('/sign-in?reason=session-ended');
    expect(await page.evaluate('[...document.querySelectorAll("button")].some((b) => b.textContent === "Try again")')).toBe(false);
  });

  it('has no unexpected console errors or failed application requests', async () => {
    // Expected: the deliberately missing demo photo, the injected 500, and the ended session's 401.
    const expected = (url: string) =>
      url.includes(encodeURIComponent(MISSING_IMAGE)) || url.endsWith('/api/outfits/generate');
    // Routes that belong to unmerged stories (US4 /wardrobe; US9 and US10 pages), prefetched by links.
    const otherStories = (url: string) => /\/(wardrobe|outfits\/saved|outfits\/history)(\?|$)/.test(url);

    // Next.js prefetches linked pages in the background (`?_rsc=` requests). Chrome reports a
    // prefetch it cancelled itself, for example because the test navigated away, as canceled
    // with net::ERR_ABORTED. That isn't a server failure, so only those are set aside, and
    // only when Chrome flags them as canceled.
    const cancelledPrefetch = (f: (typeof failedRequests)[number]) =>
      f.canceled && f.errorText === 'net::ERR_ABORTED' && /[?&]_rsc=/.test(f.url);
    const pathOf = (url: string) => url.replace(app.origin, '');

    const badResponses = responses.filter((r) => r.status >= 400);
    const report = {
      expected: badResponses.filter((r) => expected(r.url)).map((r) => `${r.status} ${pathOf(r.url)}`),
      otherStories: badResponses.filter((r) => otherStories(r.url)).map((r) => `${r.status} ${pathOf(r.url)}`),
      cancelledPrefetches: failedRequests.filter(cancelledPrefetch).map((f) => {
        const route = pathOf(f.url).split('?')[0];
        const succeeded = responses.filter((r) => pathOf(r.url).split('?')[0] === route && r.url.includes('_rsc=') && r.status === 200).length;
        return `${pathOf(f.url)} (${f.type}, canceled; ${succeeded} other prefetches of ${route} returned 200)`;
      }),
    };
    console.log('[smoke] browser request report', JSON.stringify(report, null, 1));

    const unexpectedResponses = badResponses.filter((r) => !expected(r.url) && !otherStories(r.url));
    const unexpectedFailures = failedRequests.filter(
      (f) => !expected(f.url) && !otherStories(f.url) && !cancelledPrefetch(f),
    );
    const unexpectedConsole = consoleErrors.filter(
      (e) => !(e.text.startsWith('Failed to load resource') && (expected(e.url) || otherStories(e.url))),
    );
    expect(unexpectedResponses).toEqual([]);
    expect(unexpectedFailures).toEqual([]);
    expect(unexpectedConsole).toEqual([]);
  });
});
