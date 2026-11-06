import { createHash, createSign, generateKeyPairSync, randomBytes, type KeyObject } from 'node:crypto';
import { createServer, type Server } from 'node:http';

const ISSUER = 'https://accounts.google.com';
const KEY_ID = 'fake-key-1';

function base64url(value: string | Buffer): string {
  return Buffer.from(value).toString('base64url');
}

export interface IssuedCodeOptions {
  /** Merged over the normal ID token claims. A value of undefined removes the claim. */
  claims?: Record<string, unknown>;
  /** Signs the ID token with a key the JSON Web Key Set doesn't contain. */
  signWithUnknownKey?: boolean;
}

export interface AuthorizationParams {
  code_challenge: string;
  nonce: string;
  redirect_uri: string;
}

interface IssuedCode extends AuthorizationParams {
  options: IssuedCodeOptions;
  used: boolean;
}

/**
 * Stands in for Google's OIDC endpoints, with generated keys and rules like the real ones:
 * codes work once, PKCE must match, and so must the client and redirect URI. Serves the
 * same hosts as Google, so production code runs unchanged with its fixed issuer.
 */
export class FakeGoogle {
  private readonly key = generateKeyPairSync('rsa', { modulusLength: 2048 });
  private readonly unknownKey: KeyObject = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
  private readonly codes = new Map<string, IssuedCode>();
  /** The next token request gets this response. */
  tokenResponse: { status: number; body: unknown } | null = null;

  constructor(
    readonly clientId: string,
    readonly clientSecret: string,
    readonly identity: Record<string, unknown>,
  ) {}

  /** What Google does when the person approves: issues a code bound to this request. */
  authorize(params: AuthorizationParams, options: IssuedCodeOptions = {}): string {
    const code = `fake-code-${randomBytes(16).toString('hex')}`;
    this.codes.set(code, { ...params, options, used: false });
    return code;
  }

  readonly fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> =>
    this.handle(new Request(input, init));

  async handle(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === '/.well-known/openid-configuration') {
      return Response.json({
        issuer: ISSUER,
        authorization_endpoint: `${ISSUER}/o/oauth2/v2/auth`,
        token_endpoint: 'https://oauth2.googleapis.com/token',
        jwks_uri: 'https://www.googleapis.com/oauth2/v3/certs',
        response_types_supported: ['code'],
        subject_types_supported: ['public'],
        id_token_signing_alg_values_supported: ['RS256'],
        code_challenge_methods_supported: ['S256'],
      });
    }
    if (pathname === '/oauth2/v3/certs') {
      const jwk = this.key.publicKey.export({ format: 'jwk' });
      return Response.json({ keys: [{ ...jwk, kid: KEY_ID, alg: 'RS256', use: 'sig' }] });
    }
    if (pathname === '/token' && request.method === 'POST') {
      return this.token(new URLSearchParams(await request.text()));
    }
    return new Response('not found', { status: 404 });
  }

  /** Serves the same endpoints over HTTP, for a separate process to reach. */
  listen(): Promise<{ origin: string; server: Server }> {
    const server = createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const headers = new Headers();
      for (const [name, value] of Object.entries(req.headers)) {
        if (typeof value === 'string') headers.set(name, value);
      }
      const response = await this.handle(
        new Request(`http://127.0.0.1${req.url}`, {
          method: req.method,
          headers,
          ...(chunks.length > 0 ? { body: Buffer.concat(chunks) } : {}),
        }),
      );
      res.writeHead(response.status, { 'content-type': response.headers.get('content-type') ?? 'text/plain' });
      res.end(await response.text());
    });
    return new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const { port } = server.address() as { port: number };
        resolve({ origin: `http://127.0.0.1:${port}`, server });
      });
    });
  }

  private token(form: URLSearchParams): Response {
    if (this.tokenResponse) {
      const { status, body } = this.tokenResponse;
      this.tokenResponse = null;
      return Response.json(body, { status });
    }
    if (form.get('client_id') !== this.clientId || form.get('client_secret') !== this.clientSecret) {
      return Response.json({ error: 'invalid_client' }, { status: 401 });
    }

    const issued = this.codes.get(form.get('code') ?? '');
    if (!issued || issued.used) {
      return Response.json({ error: 'invalid_grant' }, { status: 400 });
    }
    issued.used = true;

    const challenge = createHash('sha256').update(form.get('code_verifier') ?? '').digest('base64url');
    if (challenge !== issued.code_challenge || form.get('redirect_uri') !== issued.redirect_uri) {
      return Response.json({ error: 'invalid_grant' }, { status: 400 });
    }

    return Response.json({
      access_token: 'fake-access-token',
      refresh_token: 'fake-refresh-token',
      token_type: 'Bearer',
      expires_in: 3600,
      scope: 'openid email profile',
      id_token: this.idToken(issued),
    });
  }

  private idToken(issued: IssuedCode): string {
    const now = Math.floor(Date.now() / 1000);
    const claims = {
      iss: ISSUER,
      aud: this.clientId,
      iat: now,
      exp: now + 3600,
      nonce: issued.nonce,
      ...this.identity,
      ...issued.options.claims,
    };
    const header = base64url(JSON.stringify({ alg: 'RS256', kid: KEY_ID, typ: 'JWT' }));
    const payload = base64url(JSON.stringify(claims));
    const signature = createSign('RSA-SHA256')
      .update(`${header}.${payload}`)
      .sign(issued.options.signWithUnknownKey ? this.unknownKey : this.key.privateKey);
    return `${header}.${payload}.${base64url(signature)}`;
  }
}
