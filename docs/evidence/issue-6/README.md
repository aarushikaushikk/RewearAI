# Issue #6 (Account and Sign-In): test evidence

Evidence for Phase 3 Checkpoints B and C of User Story 1. **No check in this folder ran against a real database.** MongoDB integration is still pending, and the production service fails closed until it arrives.

## What was tested, and how

| Evidence | Files | Auth backend | Runs in CI-style `npm test`? |
|---|---|---|---|
| Unit and integration tests (Vitest) | `checkpoint-b-red-green.txt`, `checkpoint-c-red-green.txt` | In-memory repositories from `tests/mocks/`, or mocked `fetch` and router for components | Yes |
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
| Final `npm test` | 340 tests in 23 files pass |
| Browser flows | 28 of 28 pass |
| Keyboard checks | 17 of 17 pass |
| axe-core, before Checkpoint C | Violations in 13 of 16 states, including one critical (`button-name`) |
| axe-core, after Checkpoint C | No violations in 19 of 19 states, none with horizontal overflow |

axe-core finds only part of what makes a page accessible. No screen reader was used, and no real phone or tablet was tested; viewports were emulated at 320, 375, 768, and 1280 px.

## Reading the red-green logs

Each log has labelled sections, such as `FIX 2 - RED` followed by `FIX 2 - GREEN`. They were filtered to failures and totals, so passing test names don't appear.

- `FIX 1` has two red runs. In the first, the matcher tests failed because of a wrong helper name in the test: Next 16.4.5 exports `unstable_doesMiddlewareMatch`, while its docs say `unstable_doesProxyMatch`. The second run shows the real failures.
- `FIX 7` was found by the browser check, not planned in advance.
- The Checkpoint C audit's "before" file records `home tab order` as stuck on `BODY`. That came from the audit's unfocused headless window, not the app; `checkpoint-c-keyboard.txt` is the valid keyboard result.

## What only real database integration can verify

- Account creation and sign-in against persistent storage.
- Sessions surviving a server restart, and revocation and expiry across server instances.
- How real database failures reach users.
- Isolation of wardrobe and outfit data between users, which also needs those routes to exist.
