# Issue #6: decisions for team review before merging

For Aarushi and Pranav. Email and password sign-in and Google sign-in both work in a production build, checked by automated tests and in real Chrome with a temporary local database and a local fake Google. Pranav also reports completing both by hand with real Google and a development Atlas cluster; `docs/evidence/issue-6/phase-5-checkpoint-5-final-verification.txt` lists exactly what that covered. **Nothing has run on Vercel.** §8 lists what's left.

## 1. Google sign-in

Both partners have agreed to support email/password and Google, with the linking rule below. The PRD's User Story 1 criteria don't mention Google, so it's a team addition rather than a PRD requirement. `docs/DESIGN.md` now records this, but Wireframe 01 still predates it.

### Google sign-in never links by email

A Google sign-in never links to an existing user because the email matches, including a passwordless user with no link. Password sign-up doesn't verify email, so someone could register a victim's address first and keep access through their password after a link. Existing users will need a future signed-in linking flow.

### How a new Google user is written

`src/services/googleSignInService.ts` takes claims verified by `src/lib/auth/googleOidc.ts`, and must never be given values from a request. It refuses anything without `email_verified` set to exactly `true`, then:

1. Looks for an `Account` by Google's `sub`. If the email is already taken and there's no `Account`, it refuses without writing anything.
2. Writes the `Account` with a newly generated user ID. A repeated identity is rejected by a unique index, and the request then uses the existing `Account`.
3. Writes the `User` with that ID, then creates the session.

| What happened | Result | Recovery |
|---|---|---|
| The `Account` write fails | Nothing stored | Sign in again |
| The `User` write fails | An `Account` pointing at no user. It gives no access and reserves no email | The next sign-in finishes it with the same ID |
| The email was taken between those writes | Refused. The `Account` stays, pointing at no user | The next sign-in finishes it if the email has become free, and refuses otherwise |
| The session write fails | The `User` and `Account` are kept | The next sign-in creates a session |

Because the `Account` always gets a new ID, it can't point at an existing user. Writing the `User` first would be worse: a failed `Account` write would leave a passwordless user that blocks its email and can't sign in.

**Links are never removed during sign-in**, and the repository has no method that could remove one. A refused request can't know whether another request for the same identity is about to write the `User`, so removing the link could leave that user with no link, and it could then never sign in. Without removal, each identity has one `Account` and one user ID permanently, and the `Account` always exists first, so a user can't be stranded however many requests overlap. `tests/db/googleAccountRecovery.test.ts` scripts the sequence that stranded a user in the earlier design, in both orders, and adds randomized overlap with a registration that rolls back.

**Known limits:**
- An `Account` with no `User` stays until the same person retries. It gives no access, reserves no email, holds no email or name, and there's at most one per Google identity. No cleanup job exists. One would need its own delete method and would have to wait long enough that no request could still be in progress, and the future linking flow must treat such a record as replaceable.
- A later Google sign-in recreates a deleted `User` with the same ID if its `Account` remains, and any data left under that ID would reattach. A future account deletion feature should delete the user's data, then the `User`, then the `Account`, so an interruption at any point leaves nothing to reattach.

### The Google sign-in flow

`GET /api/auth/google` redirects to Google, and `GET /api/auth/google/callback` handles the return. Sign-in and sign-up show a **Continue with Google** link when it's configured, and the sign-in page shows a fixed message for each failure. Invalid, expired, and general failures share one message, because the next step is the same.

- **Library:** `openid-client` 6, which also adds `oauth4webapi` and `jose`. It handles Authorization Code Flow with PKCE S256, and checks the ID token's signature, issuer, audience, expiry, and nonce. Signature checks are optional in the library and turned on here.
- **Issuer:** fixed to `https://accounts.google.com` in code, with no setting to change it.
- **Transaction:** the state, nonce, and PKCE verifier sit in a 10-minute `HttpOnly`, `SameSite=Lax` cookie, encrypted with AES-GCM under a key derived from the client secret. It's named `__Host-` and `Secure` in production, so a subdomain or plain HTTP can't plant one.
- **Redirects:** only to fixed paths. The callback URL comes from `APP_ORIGIN`, never the `Host` header.
- **Tokens:** Google's access and refresh tokens are discarded. Only `sub`, the email, and the name are used.
- **Not configured:** both routes redirect to the sign-in page, and password sign-in keeps working.

**Known limits:**
- **Real Google:** Pranav reports that sign-in, refresh, sign-out, and signing in again all worked by hand. Automated tests still use a local fake with Google's hostnames. Google's page on OpenID Connect allows two forms of `iss`, and only the form Google actually sent was exercised; the other would fail closed. Cancelling at Google and a refused existing email haven't been reported on real Google, only tested against the fake.
- **Replay:** there's no server-side record of used transactions. A replayed callback is refused because the cookie is cleared after use and Google's codes work once. Someone who copied the cookie and callback URL before first use would race the real browser for that single use.
- **Rate limiting:** the Google routes have none. The start route does no database work, and the callback only contacts Google for a valid transaction. The shared limiter in §6 should cover them.
- **Google key rotation** isn't tested: the fake uses one key.
- **Compatibility:** tests ran on Node 24. `openid-client` states Node 20 as its baseline, but Node 20.19 hasn't been run.

### New `GET` routes must call `connection()`

With Cache Components, Next.js prerendered a `GET` route handler at build even though it read `req.url`, freezing one response for every visitor. The Google callback hit this, and the start route would have given every visitor the same state. Both now call `await connection()`. The build output shows it: `/api/...` routes must be listed as `ƒ`, not `○`.

## 2. Custom sessions rather than Auth.js

Both partners have agreed to keep custom opaque-token sessions (random tokens, stored hashed, revocable on the server), and to use `openid-client` for Google. `AGENTS.md` §2 records this.

## 3. Sign-up reveals whether an email is registered

`POST /api/auth/register` returns 409 with "An account with this email already exists." Wireframe 01 says errors shouldn't expose whether a private account exists, so this is a known exception. Sign-in does not have this problem: it gives the same message for a wrong password and an unknown email.

Hiding it properly requires email verification, which is outside User Story 1. The 409 stays for now, and the rate limiter reduces how quickly someone could test emails.

**Needed from the team:** accept this tradeoff, or add it to the backlog.

### Passwords past 72 bytes

bcrypt ignores everything after a password's first 72 bytes, so two long passwords that differ only after that point both work. A test confirmed this. Someone would need the first 72 bytes to benefit, so it doesn't block review. Limiting new passwords to 72 bytes would be the simple fix, but it's a new product rule, so it's left for the team to decide.

## 4. How the database is connected

`getProductionAuthService()` builds `AuthService` on `MongoUserRepository` and `MongoSessionRepository`, and throws `ConfigurationError` if `MONGODB_URI` is missing. For anyone changing this code:

- **Don't cache the `AuthService` instance.** Next.js bundles pages and route handlers separately, so a shared instance's errors fail `instanceof AuthError` and expected 401s become 500s. The connection and index state are cached on `globalThis` instead.
- **Keep `null` and `undefined` distinct for `passwordHash`.** `findByEmail` returns `null` for an account with no password. `findById` never loads the field, and its return type (`UserWithoutPassword`) leaves it out. TypeScript doesn't stop an implementation returning extra fields, so the contract tests check this at runtime.
- **Errors:** `src/lib/repositories/mongoSupport.ts` turns connection, network, and failover failures into `RepositoryUnavailableError` (503), duplicates on the email index alone into `DuplicateEmailError` (409), and everything else into `RepositoryError` (500). Logs hold only a fixed operation name and category, because driver errors can contain hosts and user emails.
- **Indexes:** `src/lib/repositories/mongoIndexes.ts` builds them before each process's first operation, for `User`, `Session`, and `Account`. This means an `Account` index failure blocks password sign-in too. Every operation fails if they can't be built, so duplicate emails already in the database block sign-in and sign-up until someone fixes the data. Without this, 25 of 25 concurrent registrations for one email succeeded on a database with no indexes.
- **Query input:** session lookups require a 64-character hex hash and user lookups a 24-character hex ID, because Mongoose would otherwise run an object such as `{ $ne: null }` as a query operator.

### Accounts that can't be rolled back

MongoDB writes for a new user and its first session aren't one transaction. If the session can't be created, registration deletes the new user. The user can stay signed out with an account in place in these cases:

| What happened | What the user is told | What happens next |
|---|---|---|
| The delete fails and the account is confirmed to remain | Account created; please sign in | Sign-in works with the password just chosen. Registering again gets a 409. |
| The delete and the follow-up check both fail, usually an outage | Account created; please sign in | Same as above, once the database is back. |
| The delete applied but its reply was lost, and the check also fails | Account created; please sign in, which is wrong in this rare case | Sign-in fails, then registering again succeeds. |

No cleanup job exists, so an account left this way stays until someone signs in to it or removes it by hand. No user data is exposed, because the account is protected by the password its owner chose.

## 5. Connection timeout

`src/lib/db.ts` doesn't set `serverSelectionTimeoutMS`, so requests wait 30 seconds during an outage before answering 503. Vercel may end the request first, and the user would then get its error page instead of ours.

**Needed from Aarushi:** add `serverSelectionTimeoutMS: 5000` to `mongoose.connect`, and update `src/lib/db.test.ts`, which asserts the exact options. Until then, add `serverSelectionTimeoutMS=5000` to the production URI.

## 6. Deployment (#23)

### Required before public deployment: a shared rate limiter

`MemoryRateLimiter` keeps its counts in the memory of one server instance, so it doesn't protect a Vercel deployment:

- **Limits are per instance.** Each instance counts separately, and counts are lost when an instance restarts, so real limits are far higher than the 5 attempts in 15 minutes they appear to be.
- **Memory use isn't capped.** Each email tried adds an entry that is never removed, so someone trying many addresses grows the instance's memory.
- **A successful sign-in resets the IP's count.** Someone can mix sign-ins to their own account into attempts on other people's emails, and never reach the IP limit. Each email is still limited separately, but that count has the per-instance problem above.
- **Limits can lock out real users.** Without `TRUST_PROXY=true`, all visitors share one count, so 5 failed sign-ins by anyone block everyone. With it, people on one network, such as a campus, still share one.

**Recommendation:** add an atomic limiter behind the existing `IRateLimiter` interface, using a MongoDB collection with a TTL index. It adds no new service, but it does add a model, so both partners need to agree. Stop resetting the IP count on success at the same time. Redis (Upstash) is the alternative if MongoDB adds too much load. A private class demo can use the current limiter if we accept these limits.

### Vercel settings

| Setting | Value | If it's wrong |
|---|---|---|
| `MONGODB_URI` | Atlas URI for a production database, with `serverSelectionTimeoutMS=5000` | Missing: sign-in returns 503 |
| `APP_ORIGIN` | The exact production origin | All sign-in, sign-up, and sign-out requests return 403 |
| `TRUST_PROXY` | `true` | All users share one rate limit |
| `MONGOMS_DISABLE_POSTINSTALL` | `1` | Every install also downloads `mongod` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | From the Google Cloud Console, with `<APP_ORIGIN>/api/auth/google/callback` as an authorized redirect URI | Missing: Google sign-in is unavailable, and password sign-in keeps working |
| Node.js version | 20.19 or later, as Mongoose and `mongodb-memory-server` require. `package.json` doesn't pin one, so set it in Vercel | Install or runtime failures. All tests ran on Node 24 |

- **Dev dependencies:** the build type-checks `tests/`, so it needs them installed. Don't use `--omit=dev`.
- **Preview deployments:** their URLs don't match `APP_ORIGIN`, so auth returns 403 on them unless they get their own value, and they must not share the production database.
- **`TRUST_PROXY`:** the code trusts the first `X-Forwarded-For` entry, so it's only safe behind a proxy that overwrites that header. Vercel's documentation says it does; confirm this on the deployed app.
- **Cookies:** the session cookie is `Secure` in production, so the site must use HTTPS. It's `HttpOnly` and `SameSite=Lax`, and lasts 7 days.

### MongoDB Atlas

- Use a separate database, and a database user limited to it, for each environment. Pranav's manual checks used a separate development cluster.
- Pranav's machine needed a local DNS workaround to reach Atlas. It isn't part of this repository, so it doesn't show that Vercel will connect, and a partner's machine may or may not need it.
- That user needs `readWrite`, which includes creating indexes. Without it, every auth request fails.
- `0.0.0.0/0` network access is usually needed from Vercel, so a strong password matters. Vercel's Atlas integration is the alternative.
- Check that new server instances don't noticeably slow the first request, since each one confirms the indexes once.

### Quality checks

- CI needs to run `npm test`, `npm run test:db`, and `npm run test:smoke`. No workflow exists yet, so the last two only run by hand.
- `npm audit` reports 11 findings in dev tools, including 2 critical in `vitest` 3 and `tinypool`, and none in production dependencies. The fix is a major `vitest` upgrade, which needs its own task.

## 7. Design questions

`docs/DESIGN.md` is still marked "not yet approved", so the current UI follows it as a draft.

- **Home:** Wireframe 02 shows three "Open" cards (My Wardrobe, Create Outfit, Saved Outfits), while §5.2's text describes a primary Add Clothing or Create Outfit action plus links. The current page follows §5.2. Which one should it be?
- **Input borders:** inputs use the muted text color rather than `--color-border`, which is only about 1.4:1 against white, below the 3:1 that WCAG asks for on control boundaries. Is that acceptable, or should the token change?
- **Wireframe 01:** it predates Google sign-in and says not to show both methods until one is selected. It's only a PDF here, so it hasn't been redrawn. Should it be?

## 8. What's left for User Story 1

| Item | Who | Blocks |
|---|---|---|
| Accept the sign-up 409 or add it to the backlog (§3) | Both | Closing #6 |
| Decide on the 72-byte password limit (§3) | Both | Nothing; can follow later |
| Agree that wardrobe and outfit stories will test isolation (below) | Both | Closing #6 |
| Connection timeout (§5) | Both, in Aarushi's file | Deployment |
| Shared rate limiter, including the Google routes (§6) | Both | Public deployment |
| Vercel settings, production Atlas and Google redirect URI, and a check on the deployed URL (§6) | #23 | Deployment |
| Turn the browser checks into Playwright tests and add CI (§6) | #23 | Course quality gates |
| Review and merge PR #33 | Aarushi | Closing #6 |

"A user cannot access another user's private wardrobe or outfit data" is only partly testable today. Tests confirm that each session resolves to its own user, but no wardrobe or outfit routes exist yet, so those stories must test it when they add them.
