# Issue #35 (Landing page: signed-in Home at /home): test evidence

Evidence that the signed-in Home page moved to `/home`, that `/` and every sign-in path now lead there, and that the page follows `docs/Wireframes.pdf` page 3, "02 Home / navigation hub". **Every check here used a temporary in-memory MongoDB and a throwaway account, never Atlas, real Google, or real credentials.** Nothing has run on Vercel.

## Files

| Evidence | File | What it shows |
|---|---|---|
| Red → green at every commit | `red-green.txt` | Each `test:` commit fails for the expected reason, and the `feat:` commit after it passes |
| Quality gates on the final commit | `final-verification.txt` | ESLint, `tsc`, `npm test`, `npm run test:db`, `npm run test:smoke`, and the build's route table |
| Browser checks | `browser-flows.txt` | Real headless Chrome on the production build: redirects, sign-up and sign-in, the wireframe layout, keyboard order and focus, and layout at 1280, 768, 375, and 320 px |
| Screenshots | `screenshots/` | The page at each width, the keyboard focus ring, the mobile menu, and the wireframe it follows |
| Scripts that produced the above | `scripts/` | Rerun them to refresh this folder (see below) |

## Results

| Check | Result |
|---|---|
| `test:` commits (`c0f6eab`, `9b87de2`, `6fb553e`, `47c0f21`) | Each fails: 2 files can't load, then 3 + 2, 1, and 3 tests fail |
| `feat:` commits (`3ba470e`, `ff01548`, `c3e9958`, `fbe1ca5`) | Each passes: 829, 829, 829, then 832 tests |
| ESLint on `src` and `tests`, final commit | No problems |
| `npm run typecheck`, final commit | No errors |
| `npm test`, final commit | 832 tests in 48 files pass |
| `npm run test:db`, final commit | 346 tests in 12 files pass |
| `npm run test:smoke`, final commit | 35 tests in 2 files pass; `/home` is rendered per request (`ƒ`) |
| Browser checks, final commit | 38 of 38 pass |

## Screenshots

| Screenshot | What it shows |
|---|---|
| `wireframe-02-home-reference.png` | The design being followed: `docs/Wireframes.pdf` page 3 |
| `home-desktop-1280.png` | Home after sign-up: greeting, three cards with only the first Open filled, and the Add Clothing panel |
| `home-keyboard-focus-open-1280.png` | Keyboard focus ring on "Open My Wardrobe" |
| `home-tablet-768.png` | Tablet: three cards still in one row |
| `home-mobile-375.png`, `home-small-320.png` | Phone: cards stacked, full-width buttons, no horizontal scroll |
| `home-mobile-nav-open-375.png` | Phone menu open, with Home first and marked as the current page |
| `signed-out-root-redirects-to-sign-in-1280.png` | A signed-out visit to `/` ends on sign-in |

## How to refresh this evidence

Run these from the repository root. They write into the folder you pass, so review the results before copying them here.

1. Red → green at each commit (about 6 minutes; uses a scratch git worktree and removes it afterwards):

   ```bash
   docs/evidence/issue-35/scripts/red-green.sh /tmp/issue-35
   ```

2. Quality gates on the current commit (about 4 minutes; the smoke suite runs `next build`):

   ```bash
   docs/evidence/issue-35/scripts/final-verification.sh /tmp/issue-35
   ```

3. Browser checks and screenshots. This needs Google Chrome and a fresh production build. It starts its own in-memory MongoDB, `next start` on port 3005, and headless Chrome, and stops all three at the end:

   ```bash
   npm run build && node docs/evidence/issue-35/scripts/browserFlows.mjs . /tmp/issue-35
   ```

For a new issue, copy `scripts/` into `docs/evidence/issue-<n>/`. Then change the commit list in `red-green.sh`, and the checks and screenshot names in `browserFlows.mjs`.

## Notes on the runs

- **First browser run: 32 of 36.** All four failures were mistakes in the check script, fixed before the recorded run:
  - It measured Home before client navigation had finished.
  - It expected the cards to stack at 768 px, but Tailwind's `md` breakpoint is 768 px, and DESIGN.md §7 allows 2–3 columns on tablet.
  - It left the card border out of the button-width calculation.
  - It pressed Tab once more than needed and logged the page body.
- **Previous page kept in the DOM.** After sign-up, Next.js 16 keeps the sign-up page mounted inside a `display:none` element, so the DOM holds two `h1`s. The browser log records that the old one is hidden, and that the accessibility tree exposes one `h1`, the greeting.
- **Commit 1 counts as failing even though no individual test fails.** Its two test files can't load because `@/app/home/page` doesn't exist yet, and Vitest reports that as failed files.
- **The redirect test commit was reordered.** It was first committed after its fix, then moved before it on the unpushed branch. `red-green.txt` was run on the final order.
- **Smoke tests changed once during implementation.** `/` now answers with a direct 307, rather than the streamed redirect the old Home produced.

## What hasn't been verified

- Wireframe 02's empty-wardrobe state. Counting items needs #7's wardrobe repository, so the Add Clothing panel always shows. It's a follow-up on #35.
- Screen readers, real phones and tablets, and browsers other than Chrome. Viewports were emulated.
- Google sign-in in a browser. The redirect to `/home` is covered by `tests/db/googleAuthRoutes.test.ts` and the Google smoke test against a local fake Google.
- Anything on Vercel or Atlas.
- Playwright tests, because Playwright isn't installed in this repository.
