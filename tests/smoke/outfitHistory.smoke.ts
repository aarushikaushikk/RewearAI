import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import mongoose, { type Connection } from 'mongoose';
import { todayLocalDate } from '@/lib/dates/localDate';
import { WardrobeItem } from '@/models/WardrobeItem';
import { launchChrome, type CdpPage, type RunningChrome } from '../helpers/chromeCdp';
import { startMongoTestServer, type MongoTestServer } from '../helpers/mongoTestServer';
import { startApp, type RunningApp } from '../helpers/nextApp';

/**
 * US10 smoke test: Mark as worn and Outfit History on the real `next start` build, against a
 * temporary MongoDB server, with fake users and synthetic wardrobe items written straight to
 * that database. Cloudinary settings are blank, so adding clothing through the app isn't
 * covered here; generating outfits and recording history don't need Cloudinary.
 *
 * The HTTP checks always run. The browser checks run only when SMOKE_CHROME_PATH points to a
 * Chrome executable; screenshots are saved when SMOKE_US10_SCREENSHOT_DIR is set. Photos are
 * Cloudinary's public demo image, loaded through Next.js image optimization; nothing is uploaded.
 */

const CHROME_PATH = process.env.SMOKE_CHROME_PATH ?? '';
const SCREENSHOT_DIR = process.env.SMOKE_US10_SCREENSHOT_DIR ?? '';

const SAMPLE_IMAGE = 'https://res.cloudinary.com/demo/image/upload/sample.jpg';

// Next.js doesn't load a variable from .env.local once it is defined, so real values can't load.
const BLANK_SECRETS = {
  CLOUDINARY_CLOUD_NAME: '',
  CLOUDINARY_API_KEY: '',
  CLOUDINARY_API_SECRET: '',
  CRON_SECRET: '',
};

const PASSWORD = 'SmokeTest123!';
const USER_A = { email: 'history-a@example.com', password: PASSWORD, name: 'History Tester A' };
const USER_B = { email: 'history-b@example.com', password: PASSWORD, name: 'History Tester B' };
const USER_C = { email: 'history-c@example.com', password: PASSWORD, name: 'History Tester C' };

type Seed = { name: string; category: string; formality: string };

// Oldest first. The dress is oldest, so the newer shirt leads the Work outfit.
const ITEMS: Seed[] = [
  { name: 'Silk dress', category: 'Dress', formality: 'Formal' },
  { name: 'Oxford shirt', category: 'Top', formality: 'Smart casual' },
  { name: 'Chinos', category: 'Bottom', formality: 'Smart casual' },
  { name: 'Linen tee', category: 'Top', formality: 'Casual' },
  { name: 'Denim shorts', category: 'Bottom', formality: 'Casual' },
];

const cookieFrom = (res: Response) => (res.headers.get('set-cookie') ?? '').split(';')[0];

let server: MongoTestServer;
let database: Connection;
let app: RunningApp;
const users: Record<'a' | 'b' | 'c', { cookie: string; id: string }> = {
  a: { cookie: '', id: '' },
  b: { cookie: '', id: '' },
  c: { cookie: '', id: '' },
};

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

async function seed(ownerId: string, prefix: string) {
  // The real schema, so its enums and URL validation apply to the synthetic data.
  const Item = database.models.WardrobeItem ?? database.model('WardrobeItem', WardrobeItem.schema);
  for (const [i, item] of ITEMS.entries()) {
    await Item.create({
      owner: ownerId,
      image: { url: SAMPLE_IMAGE, publicId: `rewear/users/${ownerId}/history-smoke-${i}` },
      name: `${prefix} ${item.name}`,
      category: item.category,
      color: 'Black',
      style: item.category,
      season: 'All-season',
      formality: item.formality,
    });
  }
}

function post(route: string, body: unknown, cookie: string, origin = app.origin) {
  return fetch(`${app.origin}${route}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', origin, ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
}

const listHistory = (cookie: string) =>
  fetch(`${app.origin}/api/outfits/history`, { headers: cookie ? { cookie } : {} });

async function generatedIds(cookie: string, occasion: string): Promise<string[]> {
  const res = await post('/api/outfits/generate', { occasion }, cookie);
  const { data } = await res.json();
  expect(data.status).toBe('ok');
  return data.items.map((i: { id: string }) => i.id);
}

const historyCount = (ownerId: string) =>
  database.collection('outfithistories').countDocuments({ owner: new mongoose.Types.ObjectId(ownerId) });

beforeAll(async () => {
  server = await startMongoTestServer();
  database = await mongoose.createConnection(server.uri).asPromise();
  app = await startApp(`${server.uri}?serverSelectionTimeoutMS=2000`, BLANK_SECRETS);
  users.a = await register(USER_A);
  users.b = await register(USER_B);
  users.c = await register(USER_C);
  await seed(users.a.id, 'A');
  await seed(users.b.id, 'B');
  await seed(users.c.id, 'C');
});

afterAll(async () => {
  await app?.stop();
  await database?.close();
  await server?.stop();
});

describe('US10 outfit history on the production build (HTTP)', () => {
  const today = todayLocalDate();

  it('keeps the History page and the API private', async () => {
    const page = await fetch(`${app.origin}/outfits/history`, { redirect: 'manual' });
    expect(page.status).toBe(307);
    expect(page.headers.get('location')).toMatch(/\/sign-in$/);

    expect((await listHistory('')).status).toBe(401);
    const body = { itemIds: ['64c0000000000000000000a1'], occasion: 'work', wornOn: today };
    expect((await post('/api/outfits/history', body, '')).status).toBe(401);
    expect((await post('/api/outfits/history', body, users.a.cookie, 'https://evil.example')).status).toBe(403);
    expect((await post('/api/outfits/history', { ...body, userId: users.b.id }, users.a.cookie)).status).toBe(400);
  });

  it('starts with an empty history', async () => {
    const res = await listHistory(users.a.cookie);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, data: { entries: [] } });
  });

  it('records a generated outfit once, however it is resubmitted that day', async () => {
    const itemIds = await generatedIds(users.a.cookie, 'work');

    const first = await post('/api/outfits/history', { itemIds, occasion: 'work', wornOn: today }, users.a.cookie);
    expect(first.status).toBe(201);
    const created = (await first.json()).data;
    expect(created.created).toBe(true);
    expect(created.entry.items.map((i: { name: string }) => i.name)).toEqual(['A Oxford shirt', 'A Chinos']);

    const reordered = await post(
      '/api/outfits/history',
      { itemIds: [...itemIds].reverse(), occasion: 'dinner', wornOn: today },
      users.a.cookie,
    );
    expect(reordered.status).toBe(200);
    expect((await reordered.json()).data).toEqual({ created: false, entry: created.entry });

    const burst = await Promise.all(
      Array.from({ length: 5 }, () => post('/api/outfits/history', { itemIds, occasion: 'work', wornOn: today }, users.a.cookie)),
    );
    expect(burst.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
    expect(await historyCount(users.a.id)).toBe(1);
  });

  it("refuses another user's items and never shows another user's history", async () => {
    const aItems = await generatedIds(users.a.cookie, 'casual');

    const res = await post('/api/outfits/history', { itemIds: aItems, occasion: 'casual', wornOn: today }, users.b.cookie);
    expect(res.status).toBe(404);
    expect(await (await listHistory(users.b.cookie)).json()).toEqual({ success: true, data: { entries: [] } });
    expect(await historyCount(users.b.id)).toBe(0);
  });

  it('refuses a backdated or future worn date', async () => {
    const itemIds = await generatedIds(users.a.cookie, 'casual');
    for (const wornOn of ['2020-01-01', '2099-01-01', '2026-02-30']) {
      const res = await post('/api/outfits/history', { itemIds, occasion: 'casual', wornOn }, users.a.cookie);
      expect(res.status).toBe(400);
    }
  });
});

describe.runIf(CHROME_PATH)('US10 Mark as worn and Outfit History in a real browser', () => {
  let chrome: RunningChrome;
  let page: CdpPage;
  const requestUrls = new Map<string, string>();
  const historyPosts: { itemIds: string[]; occasion: string; wornOn: string }[] = [];
  const responses: { url: string; status: number; mimeType: string }[] = [];
  const consoleErrors: { text: string; url: string }[] = [];
  const failedRequests: { url: string; errorText: string; canceled: boolean; type: string }[] = [];
  let timezone = '';
  // While set, paused history requests are answered with this failure instead of the server.
  let injectedFailure: { status: number; body: unknown } | null = null;

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
  const setOccasion = (label: string) =>
    page.evaluate(`(() => {
      const select = document.getElementById('occasion');
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, ${JSON.stringify(label)});
      select.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
  const fill = (id: string, value: string) =>
    page.evaluate(`(() => {
      const input = document.getElementById(${JSON.stringify(id)});
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
  const clickButton = (name: string, times = 1) =>
    page.evaluate(`(() => {
      const button = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === ${JSON.stringify(name)});
      if (!button) throw new Error('No button named ' + ${JSON.stringify(name)});
      for (let i = 0; i < ${times}; i++) button.click();
    })()`);
  const clickLink = (text: string) =>
    page.evaluate(`(() => {
      const link = [...document.querySelectorAll('main a')].find((a) => a.textContent.trim() === ${JSON.stringify(text)});
      if (!link) throw new Error('No link named ' + ${JSON.stringify(text)});
      link.click();
    })()`);
  const pressEnterOn = async (buttonName: string) => {
    await page.evaluate(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === ${JSON.stringify(buttonName)}).focus()`);
    expect(await page.evaluate<string>('document.activeElement.textContent.trim()')).toBe(buttonName);
    await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  };
  /** Reloads and waits for the new document, not the old one that is still on screen. */
  const reloadAndWait = async (ready: string, label: string) => {
    await page.evaluate('window.__beforeReload = true');
    await page.send('Page.reload');
    await page.waitFor(`!window.__beforeReload && document.readyState === 'complete' && (${ready})`, label);
  };
  const injectHistoryFailure = async (status: number, body: unknown) => {
    injectedFailure = { status, body };
    await page.send('Fetch.enable', { patterns: [{ urlPattern: '*/api/outfits/history', requestStage: 'Request' }] });
  };
  const stopInjecting = async () => {
    await page.send('Fetch.disable');
    injectedFailure = null;
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
  const statusText = () => page.evaluate<string>(`document.querySelector('p[role="status"]')?.textContent ?? ''`);
  const browserLocalDate = () =>
    page.evaluate<string>(
      `(() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); })()`,
    );
  const historyEntries = () =>
    page.evaluate<{ wornOn: string; date: string; occasion: string; names: string[]; missing: number }[]>(
      `[...document.querySelectorAll('ol[aria-label="Worn outfits, newest first"] > li')].map((li) => ({
        wornOn: li.querySelector('time').getAttribute('datetime'),
        date: li.querySelector('h2').textContent,
        occasion: [...li.querySelectorAll('p')].map((p) => p.textContent).find((t) => t.startsWith('Occasion')) ?? '',
        names: [...li.querySelectorAll('ul li p.font-semibold')].map((p) => p.textContent),
        missing: [...li.querySelectorAll('ul li')].filter((i) => i.textContent === 'No longer in your wardrobe').length,
      }))`,
    );
  const waitForHistoryPhotos = () =>
    page.waitFor(
      `[...document.querySelectorAll('ol img')].length > 0 && [...document.querySelectorAll('ol img')].every((img) => img.complete && img.naturalWidth > 0)`,
      'the history photos to load',
      30_000,
    );
  const noHorizontalScroll = () => page.evaluate<boolean>('document.documentElement.scrollWidth <= innerWidth');

  beforeAll(async () => {
    chrome = await launchChrome(CHROME_PATH);
    page = await chrome.newPage();
    page.on('Network.requestWillBeSent', (p) => {
      const request = p.request as { url: string; method: string; postData?: string };
      requestUrls.set(p.requestId as string, request.url);
      if (request.url.endsWith('/api/outfits/history') && request.method === 'POST' && request.postData) {
        historyPosts.push(JSON.parse(request.postData));
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
    page.on('Fetch.requestPaused', (p) => {
      const failure = injectedFailure;
      const reply = failure
        ? page.send('Fetch.fulfillRequest', {
            requestId: p.requestId,
            responseCode: failure.status,
            responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
            body: Buffer.from(JSON.stringify(failure.body)).toString('base64'),
          })
        : page.send('Fetch.continueRequest', { requestId: p.requestId });
      reply.catch(() => undefined);
    });
    await Promise.all(['Network.enable', 'Runtime.enable', 'Log.enable', 'Page.enable'].map((m) => page.send(m)));
    // A time zone whose date differs from the UTC date right now, so a UTC date would be caught.
    timezone = new Date().getUTCHours() < 10 ? 'Pacific/Pago_Pago' : 'Pacific/Kiritimati';
    await page.send('Emulation.setTimezoneOverride', { timezoneId: timezone });
    await viewport(1280);
  }, 60_000);

  afterAll(async () => {
    await chrome?.close();
  });

  it('sends a signed-out visitor from Outfit History to sign-in, then signs User C in', async () => {
    await goto('/outfits/history');
    await page.waitFor(`location.pathname === '/sign-in'`, 'the sign-in redirect');
    await fill('email', USER_C.email);
    await fill('password', USER_C.password);
    await clickButton('Sign In');
    await page.waitFor(`location.pathname === '/home'`, 'sign-in to finish');
  });

  it('shows the empty history with Create an outfit, and no Saved Outfits link (desktop, 1280 px)', async () => {
    await goto('/outfits/history');
    await page.waitFor(`document.body.innerText.includes("You haven't recorded an outfit yet.")`, 'the empty state');
    expect(await page.evaluate('document.querySelector("h1").textContent')).toBe('Outfit History');
    const mainLinks = await page.evaluate<string[]>(`[...document.querySelectorAll('main a')].map((a) => a.textContent)`);
    expect(mainLinks).toEqual(['Create an outfit']);
    await shot('desktop-1280-history-empty');

    await clickLink('Create an outfit');
    await page.waitFor(`location.pathname === '/outfits/create' && document.getElementById('occasion')`, 'Create Outfit');
  });

  it('offers Mark as worn under a generated outfit, and sends its items, occasion and local date', async () => {
    await generateAndWait('Work');
    expect(await outfitNames()).toEqual(['C Oxford shirt', 'C Chinos']);
    await page.waitFor(
      `[...document.querySelectorAll('ul[aria-label="Items in this outfit"] img')].every((img) => img.complete && img.naturalWidth > 0)`,
      'the outfit photos to load',
      30_000,
    );
    await shot('desktop-1280-recommendation-mark-as-worn');

    await clickButton('Mark as worn');
    await page.waitFor(`document.querySelector('p[role="status"]')`, 'the confirmation');

    const localDate = await browserLocalDate();
    const ids = await database
      .collection('wardrobeitems')
      .find({ name: { $in: ['C Oxford shirt', 'C Chinos'] } })
      .toArray();
    const byName = Object.fromEntries(ids.map((i) => [i.name, String(i._id)]));
    expect(historyPosts).toEqual([
      { itemIds: [byName['C Oxford shirt'], byName['C Chinos']], occasion: 'work', wornOn: localDate },
    ]);
    // The emulated time zone is on a different date from UTC, so this proves it isn't a UTC date.
    expect(localDate).not.toBe(new Date().toISOString().slice(0, 10));
    expect(await statusText()).toMatch(/^Recorded as worn on \w+day, \w+ \d{1,2}, \d{4}\.$/);
    expect(await page.evaluate('!![...document.querySelectorAll("a")].find((a) => a.textContent === "View outfit history")')).toBe(true);
    expect(await historyCount(users.c.id)).toBe(1);
    await shot('desktop-1280-mark-as-worn-recorded');
  });

  it('reports the same clothes as already recorded today, without a duplicate', async () => {
    await generateAndWait('Work');
    await clickButton('Mark as worn');
    await page.waitFor(`document.querySelector('p[role="status"]')`, 'the confirmation');

    expect(await statusText()).toMatch(/^You already recorded this outfit as worn on /);
    expect(await historyCount(users.c.id)).toBe(1);
  });

  it('records from the keyboard, and recovers from a failed attempt with Try again', async () => {
    await generateAndWait('Casual');
    expect(await outfitNames()).toEqual(['C Linen tee', 'C Denim shorts']);
    await pressEnterOn('Mark as worn');
    await page.waitFor(`document.querySelector('p[role="status"]')`, 'the keyboard confirmation');
    expect(await statusText()).toMatch(/^Recorded as worn on /);

    await injectHistoryFailure(503, { success: false, error: 'unavailable' });
    await generateAndWait('Formal');
    expect(await outfitNames()).toEqual(['C Silk dress']);
    await clickButton('Mark as worn');
    await page.waitFor(`document.querySelector('[role="alert"]')`, 'the error alert');
    expect(await page.evaluate('document.querySelector("[role=alert]").textContent')).toContain(
      'Service temporarily unavailable. Please try again later.',
    );
    expect(await page.evaluate('document.activeElement && document.activeElement.getAttribute("role")')).toBe('alert');
    expect(await outfitNames()).toEqual(['C Silk dress']);
    await shot('desktop-1280-mark-as-worn-error');

    await stopInjecting();
    await clickButton('Try again');
    await page.waitFor(`document.querySelector('p[role="status"]')`, 'the retry confirmation');
    expect(await statusText()).toMatch(/^Recorded as worn on /);
    expect(await historyCount(users.c.id)).toBe(3);
  });

  it('opens Outfit History from the confirmation, newest first, with dates, occasions, names and photos', async () => {
    await clickLink('View outfit history');
    await page.waitFor(`location.pathname === '/outfits/history' && document.querySelector('ol')`, 'the history list');
    await waitForHistoryPhotos();

    const entries = await historyEntries();
    expect(entries.map((e) => [e.occasion, e.names])).toEqual([
      ['Occasion: Formal', ['C Silk dress']],
      ['Occasion: Casual', ['C Linen tee', 'C Denim shorts']],
      ['Occasion: Work', ['C Oxford shirt', 'C Chinos']],
    ]);
    const localDate = await browserLocalDate();
    for (const e of entries) {
      expect(e.wornOn).toBe(localDate);
      expect(e.date).toMatch(/^\w+day, \w+ \d{1,2}, \d{4}$/);
    }
    const src = await page.evaluate<string>(`document.querySelector('ol img').currentSrc`);
    expect(src).toContain('/_next/image?url=' + encodeURIComponent(SAMPLE_IMAGE));
    expect(await page.evaluate('document.querySelectorAll("a[aria-current=page]")[0].textContent')).toBe('Outfit History');
    await shot('desktop-1280-history-entries');

    await reloadAndWait(`document.querySelector('ol')`, 'the reloaded history');
    expect((await historyEntries()).map((e) => e.names)).toEqual(entries.map((e) => e.names));
  });

  it('keeps an entry whose item was deleted, with an honest placeholder', async () => {
    // US4's delete needs Cloudinary, which this environment blanks, so the item is removed directly.
    const removed = await database.collection('wardrobeitems').deleteOne({ name: 'C Denim shorts' });
    expect(removed.deletedCount).toBe(1);

    await reloadAndWait(`document.querySelector('ol')`, 'the reloaded history');

    const casual = (await historyEntries())[1];
    expect(casual).toMatchObject({ occasion: 'Occasion: Casual', names: ['C Linen tee'], missing: 1 });
    await waitForHistoryPhotos();
    await shot('desktop-1280-history-deleted-item');
  });

  it('offers Retry when the history fails to load, and recovers', async () => {
    await injectHistoryFailure(500, { success: false, error: 'Internal server error' });
    await reloadAndWait(`document.querySelector('[role="alert"]')`, 'the load error');
    expect(await bodyText()).toContain("We couldn't load your outfit history. Try again.");

    await stopInjecting();
    await clickButton('Retry');
    await page.waitFor(`document.querySelector('ol')`, 'the history after Retry');
    expect(await historyEntries()).toHaveLength(3);
  });

  it('lays out the history and Mark as worn on mobile (375 px) without horizontal scrolling', async () => {
    await viewport(375);
    await goto('/outfits/history');
    await page.waitFor(`document.querySelector('ol')`, 'the history list');
    await waitForHistoryPhotos();
    expect(await noHorizontalScroll()).toBe(true);
    // Three thumbnails per row inside the 375 px viewport, none cut off.
    const thumbnails = await page.evaluate<{ left: number; right: number; width: number }[]>(
      `[...document.querySelectorAll('ol > li ul > li')].map((li) => { const r = li.getBoundingClientRect(); return { left: r.left, right: r.right, width: r.width }; })`,
    );
    expect(thumbnails.length).toBeGreaterThan(0);
    for (const t of thumbnails) {
      expect(t.left).toBeGreaterThanOrEqual(0);
      expect(t.right).toBeLessThanOrEqual(375);
      expect(t.width).toBeLessThan(375 / 2);
    }
    await shot('mobile-375-history-entries');

    await goto('/outfits/create');
    await page.waitFor(`document.getElementById('occasion')`, 'the occasion select');
    await generateAndWait('Work');
    expect(await noHorizontalScroll()).toBe(true);
    await clickButton('Mark as worn');
    await page.waitFor(`document.querySelector('p[role="status"]')`, 'the mobile confirmation');
    expect(await statusText()).toMatch(/^You already recorded this outfit as worn on /);
    expect(await noHorizontalScroll()).toBe(true);
    const link = await page.evaluate<{ width: number; height: number; right: number }>(
      `(() => { const r = [...document.querySelectorAll('a')].find((a) => a.textContent === 'View outfit history').getBoundingClientRect(); return { width: r.width, height: r.height, right: r.right }; })()`,
    );
    expect(link.height).toBeGreaterThanOrEqual(44);
    expect(link.right).toBeLessThanOrEqual(375);
    await shot('mobile-375-mark-as-worn-already-recorded');
  });

  it('offers Sign in when the session has ended before Mark as worn', async () => {
    // Work, because the Casual outfit lost its shorts in the deleted-item check.
    await generateAndWait('Work');
    await database.collection('sessions').deleteMany({});
    await clickButton('Mark as worn');
    await page.waitFor(`document.querySelector('[role="alert"]')`, 'the session alert');
    expect(await page.evaluate('document.querySelector("[role=alert]").textContent')).toContain(
      'Your session has ended. Sign in again to continue.',
    );
    const signIn = await page.evaluate<string | null>(
      `([...document.querySelectorAll('a')].find((a) => a.textContent === 'Sign in') || null)?.getAttribute('href') ?? null`,
    );
    expect(signIn).toBe('/sign-in?reason=session-ended');
    expect(await historyCount(users.c.id)).toBe(3);
  });

  it('has no unexpected console errors or failed application requests', async () => {
    // Expected: the injected 503 and 500, and the ended session's 401.
    const expected = (url: string) => url.endsWith('/api/outfits/history');
    // The header links to Saved Outfits (US9), which isn't merged, so its prefetch is a 404.
    const unmergedStory = (url: string) => /\/outfits\/saved(\?|$)/.test(url);
    // Next.js prefetches linked pages; a prefetch Chrome cancels itself isn't a server failure.
    const cancelledPrefetch = (f: (typeof failedRequests)[number]) =>
      f.canceled && f.errorText === 'net::ERR_ABORTED' && /[?&]_rsc=/.test(f.url);
    const pathOf = (url: string) => url.replace(app.origin, '');

    const badResponses = responses.filter((r) => r.status >= 400);
    console.log(
      '[smoke] US10 browser request report',
      JSON.stringify(
        {
          timezone,
          expected: badResponses.filter((r) => expected(r.url)).map((r) => `${r.status} ${pathOf(r.url)}`),
          unmergedStory: badResponses.filter((r) => unmergedStory(r.url)).map((r) => `${r.status} ${pathOf(r.url)}`),
          cancelledPrefetches: failedRequests.filter(cancelledPrefetch).map((f) => pathOf(f.url)),
        },
        null,
        1,
      ),
    );

    const setAside = (url: string) => expected(url) || unmergedStory(url);
    expect(badResponses.filter((r) => !setAside(r.url))).toEqual([]);
    expect(failedRequests.filter((f) => !setAside(f.url) && !cancelledPrefetch(f))).toEqual([]);
    expect(
      consoleErrors.filter((e) => !(e.text.startsWith('Failed to load resource') && setAside(e.url))),
    ).toEqual([]);
  });
});
