# Issue #6: decisions for team review before merging

For Aarushi and Pranav. Email and password sign-in now works on MongoDB in a production build, checked with a temporary local database and real Chrome. **It hasn't run on Atlas or Vercel.** §8 lists what's left, and §1 and §6 need decisions first.

## 1. Google sign-in and the sign-in method

The models now support both methods: `User.passwordHash` is optional and hidden by default, and `Account` links a Google identity to a user. No Google sign-in code exists.

The PRD's User Story 1 criteria don't mention Google. It comes from the team's agreement to support both methods, and `docs/DESIGN.md` §12 still lists the method as unconfirmed.

**Needed from the team:**
- Confirm Google is part of User Story 1, or move it to its own issue. Email and password meet the sign-in criteria without it.
- Confirm the linking rule Pranav set for Phase 5 (below).
- Update `docs/DESIGN.md` §12 and Wireframe 01 to match.

### Google sign-in never links by email

A Google sign-in never links to an existing user because the email matches, including a passwordless user with no link. Password sign-up doesn't verify email, so someone could register a victim's address first and keep access through their password after a link. Existing users will need a future signed-in linking flow.

### How a new Google user is written

The repositories are ready for this order, tested in `tests/db/googleAccountRecovery.test.ts`. `GoogleSignInService` will implement it in Checkpoint 2.

1. Write the `Account` with a newly generated user ID. A repeated identity is rejected by a unique index, and the request then uses the existing `Account`.
2. Write the `User` with that ID.

| What happened | Result | Recovery |
|---|---|---|
| The `Account` write fails | Nothing stored | Sign in again |
| The `User` write fails | An `Account` pointing at no user. It gives no access and reserves no email | The next sign-in finishes it with the same ID |
| The email is already taken | Refused, and the `Account` is removed | None needed |
| The `Account` can't be removed after a refusal | Same leftover `Account`, still pointing at no user | The next attempt refuses and removes it |

Because the `Account` always gets a new ID, it can't point at an existing user. Writing the `User` first would be worse: a failed `Account` write would leave a passwordless user that blocks its email and can't sign in.

**Known limits:**
- Leftover `Account` records stay until the same person retries. They're harmless, but no cleanup job exists.
- A later Google sign-in recreates a deleted `User` with the same ID if its `Account` remains, and any data left under that ID would reattach. A future account deletion feature should delete the user's data, then the `User`, then the `Account`, so an interruption at any point leaves nothing to reattach.
- A refusal can remove a link just as another request for the same identity writes the `User`. Each side checks after its own write and restores the link, and tests cover both orders. A third request for that identity arriving in the same moment could still leave a passwordless user with no `Account`, which would need fixing by hand.

## 2. Custom sessions versus Auth.js

`AGENTS.md` §2 lists Auth.js / NextAuth as the approved authentication tool. Phases 1 to 3 instead use custom opaque-token sessions: random tokens, stored hashed, revocable on the server. Pranav decided to keep these for now.

**Needed from the team:** confirm this and update `AGENTS.md` with both partners' agreement, or plan a switch. Choosing how to add Google OAuth is the natural moment to decide, since Auth.js is the usual route for it and adopting it would replace much of Phase 2.

## 3. Sign-up reveals whether an email is registered

`POST /api/auth/register` returns 409 with "An account with this email already exists." Wireframe 01 says errors shouldn't expose whether a private account exists, so this is a known exception. Sign-in does not have this problem: it gives the same message for a wrong password and an unknown email.

Hiding it properly requires email verification, which is outside User Story 1. The 409 stays for now, and the rate limiter reduces how quickly someone could test emails.

**Needed from the team:** accept this tradeoff, or add it to the backlog.

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
| Node.js version | 20.19 or later, as Mongoose requires | Install or runtime failures. `AGENTS.md` still says 20.9 |

- **Dev dependencies:** the build type-checks `tests/`, so it needs them installed. Don't use `--omit=dev`.
- **Preview deployments:** their URLs don't match `APP_ORIGIN`, so auth returns 403 on them unless they get their own value, and they must not share the production database.
- **`TRUST_PROXY`:** the code trusts the first `X-Forwarded-For` entry, so it's only safe behind a proxy that overwrites that header. Vercel's documentation says it does; confirm this on the deployed app.
- **Cookies:** the session cookie is `Secure` in production, so the site must use HTTPS. It's `HttpOnly` and `SameSite=Lax`, and lasts 7 days.

### MongoDB Atlas

- Use a separate database, and a database user limited to it, for each environment.
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
- **Sign-in method:** §12 still lists this as unconfirmed, and Wireframe 01 says not to depict both methods until one is selected. This needs updating once Google OAuth is confirmed.

## 8. What's left for User Story 1

| Item | Who | Blocks |
|---|---|---|
| Decide on Google sign-in and account linking (§1) | Both | Closing #6, if Google is in scope |
| Keep custom sessions or move to Auth.js, and update `AGENTS.md` (§2) | Both | Choosing how to build Google sign-in |
| Accept the sign-up 409 or add it to the backlog (§3) | Both | Closing #6 |
| Check on a dedicated Atlas database | Pranav | Merging |
| Connection timeout (§5) | Aarushi | Reliable outage responses |
| Shared rate limiter (§6) | Both agree | Public deployment |
| Vercel settings and a check on the deployed URL (§6) | #23 | Deployment |
| Turn the browser checks into Playwright tests and add CI (§6) | #23 | Course quality gates |
| Review and merge PR #33 | Aarushi | Closing #6 |

"A user cannot access another user's private wardrobe or outfit data" is only partly testable today. Tests confirm that each session resolves to its own user, but no wardrobe or outfit routes exist yet, so those stories must test it when they add them.
