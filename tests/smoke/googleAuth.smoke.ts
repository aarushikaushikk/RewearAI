import type { Server } from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import { FakeGoogle } from '../helpers/fakeGoogle';
import { startMongoTestServer, type MongoTestServer } from '../helpers/mongoTestServer';
import { startApp, type RunningApp } from '../helpers/nextApp';

const CLIENT_ID = 'smoke-client.apps.googleusercontent.com';
const CLIENT_SECRET = 'smoke-client-secret-value';
const TX_COOKIE = '__Host-rewear_google_tx';
const SESSION_COOKIE = 'rewear_session';
const IDENTITY = {
  sub: '108000000000000000009',
  email: 'smoke-google@example.com',
  email_verified: true,
  name: 'Smoke Tester',
};
const PRELOAD = pathToFileURL(path.resolve(__dirname, 'fakeGooglePreload.mjs')).href;

const pairOf = (res: Response, name: string) =>
  res.headers
    .getSetCookie()
    .find((c) => c.startsWith(`${name}=`))
    ?.split(';')[0];

describe('production build with no Google settings', () => {
  let server: MongoTestServer;
  let app: RunningApp;

  beforeAll(async () => {
    server = await startMongoTestServer();
    app = await startApp(server.uri);
  });

  afterAll(async () => {
    await app?.stop();
    await server?.stop();
  });

  it('fails closed on both Google routes', async () => {
    const start = await fetch(`${app.origin}/api/auth/google`, { redirect: 'manual' });
    const callback = await fetch(`${app.origin}/api/auth/google/callback?code=x&state=y`, {
      redirect: 'manual',
    });

    expect(start.status).toBe(303);
    expect(start.headers.get('location')).toBe('/sign-in?reason=google-unavailable');
    expect(callback.headers.get('location')).toBe('/sign-in?reason=google-unavailable');
  });

  it.each(['/sign-in', '/sign-up'])('shows no Google option on %s', async (route) => {
    const res = await fetch(`${app.origin}${route}`);

    expect(await res.text()).not.toContain('Continue with Google');
  });

  it('keeps password sign-up working', async () => {
    const res = await fetch(`${app.origin}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', origin: app.origin },
      body: JSON.stringify({ email: 'password@example.com', password: 'CorrectHorse123!' }),
    });

    expect(res.status).toBe(201);
  });
});

describe('production build with Google settings and a fake Google', () => {
  const google = new FakeGoogle(CLIENT_ID, CLIENT_SECRET, IDENTITY);
  let fakeServer: Server;
  let server: MongoTestServer;
  let database: mongoose.Connection;
  let app: RunningApp;

  async function start() {
    const res = await fetch(`${app.origin}/api/auth/google`, { redirect: 'manual' });
    const location = new URL(res.headers.get('location') ?? 'http://missing');
    const q = location.searchParams;
    return {
      res,
      location,
      cookie: pairOf(res, TX_COOKIE) ?? '',
      state: q.get('state') ?? '',
      authorization: {
        code_challenge: q.get('code_challenge') ?? '',
        nonce: q.get('nonce') ?? '',
        redirect_uri: q.get('redirect_uri') ?? '',
      },
    };
  }

  const callback = (query: Record<string, string>, cookie?: string) =>
    fetch(`${app.origin}/api/auth/google/callback?${new URLSearchParams(query)}`, {
      redirect: 'manual',
      headers: cookie ? { cookie } : {},
    });

  beforeAll(async () => {
    const fake = await google.listen();
    fakeServer = fake.server;
    server = await startMongoTestServer();
    database = await mongoose.createConnection(server.uri).asPromise();
    app = await startApp(server.uri, {
      GOOGLE_CLIENT_ID: CLIENT_ID,
      GOOGLE_CLIENT_SECRET: CLIENT_SECRET,
      FAKE_GOOGLE_ORIGIN: fake.origin,
      NODE_OPTIONS: `--import ${PRELOAD}`,
    });
  });

  afterAll(async () => {
    await app?.stop();
    await database?.close();
    await server?.stop();
    await new Promise((resolve) => fakeServer?.close(resolve));
  });

  it.each(['/sign-in', '/sign-up'])('offers Google on %s, reading settings at request time', async (route) => {
    const body = await (await fetch(`${app.origin}${route}`)).text();

    expect(body).toContain('Continue with Google');
    expect(body).toContain('href="/api/auth/google"');
    expect(body).not.toContain(CLIENT_SECRET);
    expect(body).not.toContain(CLIENT_ID);
  });

  it('shows a fixed message for a known failure reason only', async () => {
    const body = await (await fetch(`${app.origin}/sign-in?reason=google-cancelled`)).text();
    const unknown = await (await fetch(`${app.origin}/sign-in?reason=mystery`)).text();

    expect(body).toContain('Sign-in with Google was cancelled');
    expect(unknown).not.toContain('Sign-in with Google was cancelled');
  });

  it('builds a redirect to Google with the fixed callback URL', async () => {
    const { res, location, authorization } = await start();

    expect(res.status).toBe(303);
    expect(location.origin).toBe('https://accounts.google.com');
    expect(authorization.redirect_uri).toBe(`${app.origin}/api/auth/google/callback`);
    expect(location.searchParams.get('code_challenge_method')).toBe('S256');
  });

  it('makes new secrets per request, so the route was not prerendered at build', async () => {
    const first = await start();
    const second = await start();

    expect(second.state).not.toBe(first.state);
    expect(second.authorization.nonce).not.toBe(first.authorization.nonce);
    expect(second.cookie).not.toBe(first.cookie);
  });

  it('protects the transaction cookie with a __Host- name', async () => {
    const { res } = await start();

    const header = res.headers.getSetCookie().find((c) => c.startsWith(`${TX_COOKIE}=`)) ?? '';
    expect(header).toMatch(/HttpOnly/i);
    expect(header).toMatch(/Secure/i);
    expect(header).toMatch(/SameSite=Lax/i);
    expect(header).toMatch(/Path=\/(;|$)/i);
  });

  it('refuses a callback with the wrong state across the bundled route', async () => {
    const flow = await start();
    const code = google.authorize(flow.authorization);

    const res = await callback({ code, state: 'wrong' }, flow.cookie);

    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/sign-in?reason=google-failed');
    expect(pairOf(res, SESSION_COOKIE)).toBeUndefined();
  });

  it('refuses an invalid signature, using the real library in the real build', async () => {
    const flow = await start();
    const code = google.authorize(flow.authorization, { signWithUnknownKey: true });

    const res = await callback({ code, state: flow.state }, flow.cookie);

    expect(res.headers.get('location')).toBe('/sign-in?reason=google-failed');
    expect(pairOf(res, SESSION_COOKIE)).toBeUndefined();
    expect(await database.collection('users').countDocuments({ email: IDENTITY.email })).toBe(0);
  });

  it('signs in, reaches a private page, and signs out', async () => {
    const flow = await start();
    const code = google.authorize(flow.authorization);

    const res = await callback({ code, state: flow.state }, flow.cookie);

    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/home');
    const setCookie = res.headers.getSetCookie().find((c) => c.startsWith(`${SESSION_COOKIE}=`)) ?? '';
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/Secure/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    const session = pairOf(res, SESSION_COOKIE) ?? '';

    const stored = await database.collection('users').findOne({ email: IDENTITY.email });
    expect(stored?.passwordHash).toBeNull();
    const token = session.slice(SESSION_COOKIE.length + 1);
    expect(JSON.stringify(await database.collection('sessions').find({}).toArray())).not.toContain(token);

    const page = await fetch(`${app.origin}/home`, { redirect: 'manual', headers: { cookie: session } });
    expect((await page.text()).replaceAll('<!-- -->', '')).toContain('Welcome back, Smoke Tester');

    const check = await fetch(`${app.origin}/api/auth/session`, { headers: { cookie: session } });
    expect(check.status).toBe(200);

    const signOut = await fetch(`${app.origin}/api/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', origin: app.origin, cookie: session },
    });
    expect(signOut.status).toBe(200);
    const after = await fetch(`${app.origin}/api/auth/session`, { headers: { cookie: session } });
    expect(after.status).toBe(401);
  });

  it('refuses replaying a callback that already succeeded', async () => {
    const flow = await start();
    const code = google.authorize(flow.authorization);
    await callback({ code, state: flow.state }, flow.cookie);

    const replay = await callback({ code, state: flow.state }, flow.cookie);

    expect(replay.headers.get('location')).toBe('/sign-in?reason=google-failed');
    expect(pairOf(replay, SESSION_COOKIE)).toBeUndefined();
  });

  it('keeps secrets out of the server output', () => {
    const output = app.output();

    for (const secret of [CLIENT_SECRET, IDENTITY.email, IDENTITY.sub, 'fake-access-token', 'fake-code-']) {
      expect(output).not.toContain(secret);
    }
  });
});
