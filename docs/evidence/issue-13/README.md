# Issue #13 (User Story 8: Alternative Outfit Suggestions): evidence

**Try another** on Create Outfit asks for a different combination from the user's own available clothes. An alternative only has to differ by at least one item. It prefers pieces that haven't been shown yet, so repeated requests mix and match across the wardrobe instead of returning the same clothes. When every combination has been shown, the page says "There isn't another suitable combination right now." and keeps the current outfit (DESIGN §5.6).

Screenshots come from two runs:
- **`test-account-*`:** the seeded evidence account (`test@example.com`, 106 illustrated wardrobe items) on the local dev server (`next dev`, MongoDB Atlas and Cloudinary from `.env.local`), driven by headless Chrome. The "N" badge is the Next.js dev-mode indicator.
- **`smoke-*`:** the automated smoke test on the production build (`next start`) with a throwaway in-memory MongoDB and a small synthetic wardrobe that uses the Cloudinary demo photo as a placeholder. The no-alternative state comes from this run: the test account has too many combinations to run out (see below).

Nothing ran on Vercel.

## Design decisions applied

| Decision | Where it shows |
|---|---|
| An alternative differs by at least one item; the rest of the outfit can stay | `generateOutfit.test.ts` "keeps some of the same clothes when only part of the outfit can change", "swaps an optional piece when the core cannot change" |
| The least-shown pieces are preferred, so the pool is spread out | `generateOutfit.test.ts` "mixes in clothes that have not been shown yet before reusing shown ones", "spreads repeated requests across the pool instead of reusing the same pieces" (3 tops × 3 bottoms, 3 requests → each piece once) |
| Leaving out a suitable piece, such as shoes, is not a new outfit | `generateOutfit.test.ts` "does not count dropping a suitable piece as an alternative" |
| Shown outfits are tracked by the page and sent as `shown` (up to 20 outfits of 1–6 item IDs). Shown IDs only rule combinations out and never make an item eligible; the owner comes from the session. No schema change | `outfitValidation.test.ts`; `outfitRoutes.test.ts` "never adds another user's items named in the shown outfits" |
| "No alternative" is a normal 200 result, distinct from an insufficient wardrobe | `outfitRoutes.test.ts` "answers 200 with an explicit no-alternative result…"; `generateOutfit.test.ts` "still reports insufficient items rather than no alternative" |
| Generate Outfit or an occasion change starts over | `CreateOutfitForm.test.tsx` "starts over on Generate Outfit…", "forgets the shown outfits when the occasion changes" |

## Acceptance criteria → evidence

| Criterion | Tests | Browser |
|---|---|---|
| The user can request another recommendation | `CreateOutfitForm.test.tsx` "asks for a different outfit than the one shown, and shows it"; `outfitRoutes.test.ts` `test-account-desktop-1280-first-outfit.jpg`: **Try another** next to **Save outfit** |
| A different combination is generated when enough alternatives exist | `generateOutfit.test.ts` "returns a different combination…", "keeps the season and formality rules for alternatives"; smoke HTTP check for work/weekend/casual `test-account-desktop-1280-try-another-1.jpg`, `-2.jpg`: each a new Work combination; smoke Weekend gave 4 distinct outfits in a row (below) |
| The application avoids repeatedly returning the exact same outfit when alternatives exist | `generateOutfit.test.ts` "offers every distinct combination once, then says there is no alternative", "matches shown outfits regardless of item order"; `CreateOutfitForm.test.tsx` "sends every outfit shown so far…" | Test account: 3 Work outfits in a row with no item repeated; smoke run: each outfit checked against all earlier ones |
| If no suitable alternative exists, the application clearly tells the user | `CreateOutfitForm.test.tsx` "says when there is no other combination, keeping the current outfit"; `outfitRecommendationService.test.ts` | `smoke-desktop-1280-no-alternative.jpg`, `smoke-mobile-375-no-alternative.jpg` |

Mobile (375 px): one column, no horizontal scroll (`scrollWidth <= innerWidth`), with Try another above the full-width Save outfit (`test-account-mobile-375-try-another.jpg`). In the smoke run, User A has one Work combination, so Try another shows the message and keeps that outfit (`smoke-mobile-375-no-alternative.jpg`).

## Test account run (2026-11-11, local dev server)

Signed in as `test@example.com` through the real sign-in form, chose **Work**, and pressed **Generate Outfit**, then **Try another** twice. Every piece changed each time, because the account has many unshown Smart casual and Formal items:

1. Camel Shirt Dress, Black Pointed Heels, Brown Suede Jacket, Red Satin Clutch (`test-account-desktop-1280-first-outfit.jpg`)
2. Blush Slip Dress, Red Stiletto Heels, White Linen Blazer, Black Dress Watch (`test-account-desktop-1280-try-another-1.jpg`)
3. Purple Cocktail Dress, Beige Driving Loafers, Black Tuxedo Jacket, Brown Leather Strap Watch (`test-account-desktop-1280-try-another-2.jpg`)

At 375 px, a fresh **Generate Outfit** started over at outfit 1, and **Try another** gave outfit 2 again (`test-account-mobile-375-try-another.jpg`). That's expected: the shown list resets on Generate Outfit. No account data was changed, and nothing was saved.

## Smoke run (2026-11-11, `tests/smoke/outfitGeneration.smoke.ts`)

Run with `SMOKE_CHROME_PATH` set to Chrome and `SMOKE_SCREENSHOT_DIR` set: 22 of 22 pass, 2 of them new for US8.

1. Weekend outfit after **Try again**: Linen tee + Denim shorts + Loafers.
2. **Try another** → Oxford shirt + Chinos + Loafers + Wool coat.
3. **Try another** → Linen tee + Chinos + Loafers.
4. **Try another** → Oxford shirt + Denim shorts + Loafers.
5. **Try another** → "There isn't another suitable combination right now." Outfit 4 stays on screen with **Save outfit** (`smoke-desktop-1280-no-alternative.jpg`).
6. Each press sent exactly one `POST /api/outfits/generate`. The unavailable blazer and User B's items never appeared. There were no unexpected console errors or failed requests.

Oxford shirt + Chinos + Loafers without the coat isn't offered: that only drops a piece that fits, so it isn't a new outfit.

## Results

| Check | Result |
|---|---|
| Red commits | `5774027` (generator: 12 failing), `f4f1352` (validation, service, route: 12 failing), `3eb3fdb` (Create Outfit form: 11 failing) each come before their implementation commits |
| `npm test` | 1540 pass, 1 skipped (pre-existing), 84 files |
| `npm run test:db` | 410 pass in 15 files |
| `npm run test:smoke` | 44 pass, 11 skipped without Chrome; `/api/outfits/generate` builds as `ƒ` |
| `outfitGeneration.smoke.ts` with Chrome | 22 pass |
| `npm run typecheck`, `npm run lint` | No errors |

## Out of scope / not verified

- The no-alternative screenshots use the synthetic smoke wardrobe, not the test account. Reaching that state on the test account would mean marking most of its items unavailable, so its data was left unchanged.

- Shown outfits live in the page, so a refresh or a new **Generate Outfit** starts over, and the first outfit for an occasion is the same each time (US7). Remembering across sessions would fit with outfit history (#15). Partner sign-off is pending.
- Only the last 20 shown outfits are sent, so in a very large wardrobe an older one can come back after 20 requests.
- The outfit rules are still provisional (DESIGN "Outfit algorithm" open item).
- No Playwright end-to-end test: Playwright isn't installed in the repository yet. No OpenAPI file exists yet to document `shown`.
- Mark as worn, explanation and feedback belong to #15, #18 and #19.
