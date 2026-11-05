# Issue #6: decisions for team review before merging

For Aarushi and Pranav. The email/password UI on `feature/6-account-signin` is finished and tested, but it can't sign anyone in until the items below are settled. Item 1 needs a decision first, because it determines most of the integration work.

## 1. Our user model and auth flow don't match yet

| | `feature/6-account-signin` | `chore/28-setup-db` |
|---|---|---|
| Sign-in method | Email and password | "Accounts come from OAuth sign-in, so no password is stored" (`src/models/User.ts`) |
| `passwordHash` on User | Required at registration; `null` means the account has no password and can't use password sign-in | Not in the schema |
| `name` | Optional, 100 characters at most | Required, 100 characters at most |
| `image` | Not used | Optional |
| Session storage | Needs a persisted session record | No session model |

The team has agreed to support both email/password and Google OAuth, with Google in a later phase, so both share one account model. Aarushi is updating the models to allow for this.

**Needed from the team:**
- Add an optional `passwordHash` and make `name` optional, or decide how accounts without a name work. Passwords must never be returned by default queries.
- Add a Session model matching `ISessionRepository`: user ID, hashed token, expiry, and revoked date, with lookups by token hash.
- Decide what happens when a Google sign-in uses an email that already has a password account. Linking them automatically without checking that the email is verified would let someone take over an account.

## 2. Custom sessions versus Auth.js

`AGENTS.md` §2 lists Auth.js / NextAuth as the approved authentication tool. Phases 1 to 3 instead use custom opaque-token sessions: random tokens, stored hashed, revocable on the server. Pranav decided to keep these for now.

**Needed from the team:** confirm this and update `AGENTS.md` with both partners' agreement, or plan a switch. Choosing how to add Google OAuth is the natural moment to decide, since Auth.js is the usual route for it and adopting it would replace much of Phase 2.

## 3. Sign-up reveals whether an email is registered

`POST /api/auth/register` returns 409 with "An account with this email already exists." Wireframe 01 says errors shouldn't expose whether a private account exists, so this is a known exception. Sign-in does not have this problem: it gives the same message for a wrong password and an unknown email.

Hiding it properly requires email verification, which is outside User Story 1. The 409 stays for now, and the rate limiter reduces how quickly someone could test emails.

**Needed from the team:** accept this tradeoff, or add it to the backlog.

## 4. Connecting the database

Once item 1 is settled:

1. Implement `IUserRepository` and `ISessionRepository` (`src/lib/repositories/`), and connect them in `getProductionAuthService()` (`src/lib/auth/getAuthService.ts`).
2. Throw `ConfigurationError` if configuration is missing, so pages and APIs keep failing closed.
3. Cache the database connection on `globalThis` if needed, as `src/lib/db.ts` does, but **not the `AuthService` instance**. Next.js bundles pages and route handlers separately, so a shared instance's errors fail `instanceof AuthError` and expected 401s become 500s. This happened in testing.
4. Implement `deleteById`. Without it, a failed session can't roll back a new account.
5. Throw `DuplicateEmailError` (`src/lib/repositories/repositoryErrors.ts`) for code 11000 on the email index only. `AuthService.register` no longer looks at message text, so this is the only way to get a 409.
6. Throw `RepositoryUnavailableError` for connection failures, including `DatabaseConnectionError`; the routes turn it into a 503 that doesn't count toward rate limits. Throw `RepositoryError` for other database failures, which become a generic 500. Never forward driver errors: their messages can contain the database host and user emails.
7. Run the adapters through the shared suites in `tests/contracts/`.

### Accounts that can't be rolled back

MongoDB writes for a new user and its first session aren't one transaction. If the session can't be created, registration deletes the new user. The user can stay signed out with an account in place in these cases:

| What happened | What the user is told | What happens next |
|---|---|---|
| The delete fails and the account is confirmed to remain | Account created; please sign in | Sign-in works with the password just chosen. Registering again gets a 409. |
| The delete and the follow-up check both fail, usually an outage | Account created; please sign in | Same as above, once the database is back. |
| The delete applied but its reply was lost, and the check also fails | Account created; please sign in, which is wrong in this rare case | Sign-in fails, then registering again succeeds. |

No cleanup job exists, so an account left this way stays until someone signs in to it or removes it by hand. No user data is exposed, because the account is protected by the password its owner chose.

## 5. Merging the two branches

A trial merge of `feature/6-account-signin` and `chore/28-setup-db` conflicts in three files:

- **`vitest.config.ts`:** keep both sets of changes. The React plugin and `tests/**/*.test.tsx` must stay or component tests stop running, and `src/**/*.test.ts` and the `server-only` alias must stay for the database tests.
- **`package.json` and `package-lock.json`:** keep both sets of dependencies, then regenerate the lockfile.

The database branch's `tsconfig.json` also adds `tests/**/*.ts` to type checking, and `next build` fails on any error there. This branch has been fixed for that. A trial merge with these resolutions passes tests, type checks, lint, and build.

`.env.example` is untracked on this branch, because `.env*` is ignored here. The database branch fixes that rule, so its version will need these variables added: `APP_ORIGIN` and `TRUST_PROXY`.

## 6. Deployment settings (#23)

- `APP_ORIGIN` must match the deployed URL, or all sign-in, sign-up, and sign-out requests return 403. Vercel preview URLs won't match, so previews need a plan.
- `TRUST_PROXY=true` is needed on Vercel. Otherwise all users share one rate-limit bucket.
- Rate limiting is in memory, so limits are per server instance and reset on restart.

## 7. Design questions

`docs/DESIGN.md` is still marked "not yet approved", so the current UI follows it as a draft.

- **Home:** Wireframe 02 shows three "Open" cards (My Wardrobe, Create Outfit, Saved Outfits), while §5.2's text describes a primary Add Clothing or Create Outfit action plus links. The current page follows §5.2. Which one should it be?
- **Input borders:** inputs use the muted text color rather than `--color-border`, which is only about 1.4:1 against white, below the 3:1 that WCAG asks for on control boundaries. Is that acceptable, or should the token change?
- **Sign-in method:** §12 still lists this as unconfirmed, and Wireframe 01 says not to depict both methods until one is selected. This needs updating once Google OAuth is confirmed.
