// Loaded only into the smoke test's `next start` process, through NODE_OPTIONS. Sends the
// production code's requests for Google's hosts to the fake, so its fixed issuer is unchanged.
const FAKE_ORIGIN = process.env.FAKE_GOOGLE_ORIGIN;
const GOOGLE_HOSTS = new Set(['accounts.google.com', 'oauth2.googleapis.com', 'www.googleapis.com']);
const realFetch = globalThis.fetch;

globalThis.fetch = (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (!GOOGLE_HOSTS.has(url.hostname)) {
    return realFetch(input, init);
  }
  const target = `${FAKE_ORIGIN}${url.pathname}${url.search}`;
  return realFetch(input instanceof Request ? new Request(target, input) : target, init);
};
