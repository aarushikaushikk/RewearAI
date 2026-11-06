# Issue #6 (Account and Sign-In): test evidence

Evidence for Phase 3 Checkpoints B and C, Phase 4 Checkpoint B, and Phase 4C Steps 2 to 5 of User Story 1. **No check in this folder ran against Atlas, and no check has stored sessions in MongoDB.** Step 3 tests the test infrastructure, and Step 5 tests the user repository, both on a temporary local MongoDB server. The production service isn't connected to either and still fails closed.

## What was tested, and how

| Evidence | Files | Auth backend | Runs in CI-style `npm test`? |
|---|---|---|---|
| Unit and integration tests (Vitest) | `checkpoint-b-red-green.txt`, `checkpoint-c-red-green.txt`, `phase-4-checkpoint-b-red-green.txt`, `phase-4c-step-2-red-green.txt`, `phase-4c-step-4-red-green.txt` | In-memory repositories from `tests/mocks/`, mocked `fetch` and router for components, or the Mongoose models' `validate()` with no connection | Yes |
| Test server isolation (Vitest, `npm run test:db`) | `phase-4c-step-3-red-green.txt` | None: no auth code runs. Temporary `mongod` on `127.0.0.1` | No, separate command |
| User repository on real MongoDB (Vitest, `npm run test:db`) | `phase-4c-step-5-red-green.txt` | `MongoUserRepository` on a temporary `mongod`. Sessions are in memory where `AuthService` is used | No, separate command |
| Real build smoke test (curl against `next start`) | Reported in the checkpoint summaries | None: the real fail-closed factory, so login returns 503 | No, run by hand |
| Browser flows (headless Chrome) | `checkpoint-b-browser-flows.txt`, `checkpoint-c-browser-flows.txt` | **In-memory stub** | No, one-off script |
| Keyboard checks (headless Chrome) | `checkpoint-c-keyboard.txt` | **In-memory stub** | No, one-off script |
| Accessibility and layout audit (axe-core 4.10.3, four viewports) | `checkpoint-c-ui-audit-before.txt`, `checkpoint-c-ui-audit-after.txt` | **In-memory stub** | No, one-off script |
| Screenshots | `screenshots/` | **In-memory stub** | No |

### The in-memory stub

The browser checks needed a working sign-in, which production code can't provide yet. They ran against a throwaway copy of the app outside the repository. In that copy only, `getProductionAuthService()` was replaced with the real `AuthService` over `tests/mocks/` repositories, plus switches to simulate an outage, a failed session revocation, and a failed session creation.

**None of this is in the repository's `src/`.** The production factory still throws `ConfigurationError`. The scripts were one-off and aren't kept here; these flows should become Playwright tests once real repositories exist.

## Results

| Check | Result |
|---|---|
| `npm test`, end of Phase 3 | 340 tests in 23 files pass |
| `npm test`, end of Phase 4 Checkpoint B | 431 tests in 29 files pass |
| `npm test`, after merging `main` (Phase 4C Step 1) | 543 tests in 38 files pass |
| `npm test`, end of Phase 4C Step 2 | 562 tests in 39 files pass |
| `npm test`, end of Phase 4C Step 3 | 608 tests in 41 files pass |
| `npm run test:db`, end of Phase 4C Step 3 | 13 tests in 2 files pass |
| Test server safeguards removed one at a time, Phase 4C Step 3 | 11 of 11 caught by the tests |
| `npm test`, end of Phase 4C Step 4 | 618 tests in 42 files pass |
| `npm run test:db`, end of Phase 4C Step 4 | 13 tests in 2 files pass |
| Password hash safeguards removed one at a time, Phase 4C Step 4 | 9 of 9 caught, 8 by the tests and 1 by `tsc` |
| `npm test`, end of Phase 4C Step 5 | 618 tests in 42 files pass |
| `npm run test:db`, end of Phase 4C Step 5 | 86 tests in 4 files pass, including all 28 user contract tests |
| Repository safeguards removed one at a time, Phase 4C Step 5 | 17 of 18 caught; the other doesn't change behaviour for string IDs |
| Browser flows, Phase 3 (not rerun in Phase 4) | 28 of 28 pass |
| Keyboard checks | 17 of 17 pass |
| axe-core, before Checkpoint C | Violations in 13 of 16 states, including one critical (`button-name`) |
| axe-core, after Checkpoint C | No violations in 19 of 19 states, none with horizontal overflow |

axe-core finds only part of what makes a page accessible. No screen reader was used, and no real phone or tablet was tested; viewports were emulated at 320, 375, 768, and 1280 px.

## Reading the red-green logs

Each log has labelled sections, such as `FIX 2 - RED` followed by `FIX 2 - GREEN`. They were filtered to failures and totals, so passing test names don't appear.

- `FIX 1` has two red runs. In the first, the matcher tests failed because of a wrong helper name in the test: Next 16.4.5 exports `unstable_doesMiddlewareMatch`, while its docs say `unstable_doesProxyMatch`. The second run shows the real failures.
- `FIX 7` was found by the browser check, not planned in advance.
- The Checkpoint C audit's "before" file records `home tab order` as stuck on `BODY`. That came from the audit's unfocused headless window, not the app; `checkpoint-c-keyboard.txt` is the valid keyboard result.
- In `phase-4-checkpoint-b-red-green.txt`, the labels are `TASK 1` to `TASK 5`.
  - The `TASK 2 - GREEN (types)` run shows 2 errors. Both came from Task 3 test files importing a module that didn't exist yet, and a later run labelled as the correction shows 0.
  - `TASK 3a` has two green runs. The first still failed, because the first draft of `RepositoryError` accepted a message that could have carried driver text.
  - The page outage tests passed on their first run, so they have no red run. They record behaviour that already worked.
- `phase-4c-step-2-red-green.txt` has one red and one green section. The new contract test for a null password hash passed on its first run, so it isn't in the red section.
- `phase-4c-step-4-red-green.txt` has one red and one green section. The other 6 new tests passed on their first run, because they record behaviour that already worked.
- `phase-4c-step-5-red-green.txt` has a red section where the repository doesn't exist, so the test file can't load and no individual test ran. The removed-safeguard runs are the evidence that each test can fail. The two connection tests were added after the red commit, when a review found that removing `connectToDatabase()` wouldn't fail anything.

## What only real database integration can verify

- Sign-in with sessions stored in MongoDB, and on Atlas.
- Sessions surviving a server restart, and revocation and expiry across server instances.
- How real database failures reach users.
- Isolation of wardrobe and outfit data between users, which also needs those routes to exist.
