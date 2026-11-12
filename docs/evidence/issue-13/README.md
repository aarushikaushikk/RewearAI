# Issue #13 (User Story 8: Alternative Outfit Suggestions): evidence

**Try another** on Create Outfit asks for a different combination from the user's own available clothes. An alternative only has to differ by at least one item. It prefers pieces that haven't been shown yet, so repeated requests mix and match across the wardrobe instead of returning the same clothes. When every combination has been shown, the page says "There isn't another suitable combination right now." and keeps the current outfit (DESIGN §5.6). The browser checks ran in headless Chrome against the production build (`next start`) with a throwaway in-memory MongoDB and the smoke test's synthetic wardrobe, which uses the Cloudinary demo photo as a placeholder. **Nothing ran against Atlas or on Vercel.**

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
| The user can request another recommendation | `CreateOutfitForm.test.tsx` "asks for a different outfit than the one shown, and shows it"; `outfitRoutes.test.ts` | `desktop-1280-try-another.jpg`: **Try another** next to **Save outfit** |
| A different combination is generated when enough alternatives exist | `generateOutfit.test.ts` "returns a different combination…", "keeps the season and formality rules for alternatives"; smoke HTTP check for work/weekend/casual | Weekend gave 4 distinct outfits in a row (below) |
| The application avoids repeatedly returning the exact same outfit when alternatives exist | `generateOutfit.test.ts` "offers every distinct combination once, then says there is no alternative", "matches shown outfits regardless of item order"; `CreateOutfitForm.test.tsx` "sends every outfit shown so far…" | Each outfit was checked against all earlier ones |
| If no suitable alternative exists, the application clearly tells the user | `CreateOutfitForm.test.tsx` "says when there is no other combination, keeping the current outfit"; `outfitRecommendationService.test.ts` | `desktop-1280-no-alternative.jpg`, `mobile-375-no-alternative.jpg` |

Mobile (375 px): one column, no horizontal scroll (`scrollWidth <= innerWidth`). User A has one Work combination, so Try another shows the message and keeps that outfit (`mobile-375-no-alternative.jpg`).

## Browser run (2026-11-11, `tests/smoke/outfitGeneration.smoke.ts`)

Run with `SMOKE_CHROME_PATH` set to Chrome and `SMOKE_SCREENSHOT_DIR` set: 22 of 22 pass, 2 of them new for US8.

1. Weekend outfit after **Try again**: Linen tee + Denim shorts + Loafers.
2. **Try another** → Oxford shirt + Chinos + Loafers + Wool coat (`desktop-1280-try-another.jpg`).
3. **Try another** → Linen tee + Chinos + Loafers.
4. **Try another** → Oxford shirt + Denim shorts + Loafers.
5. **Try another** → "There isn't another suitable combination right now." Outfit 4 stays on screen with **Save outfit** (`desktop-1280-no-alternative.jpg`).
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

- Shown outfits live in the page, so a refresh or a new **Generate Outfit** starts over, and the first outfit for an occasion is the same each time (US7). Remembering across sessions would fit with outfit history (#15). Partner sign-off is pending.
- Only the last 20 shown outfits are sent, so in a very large wardrobe an older one can come back after 20 requests.
- The outfit rules are still provisional (DESIGN "Outfit algorithm" open item).
- No Playwright end-to-end test: Playwright isn't installed in the repository yet. No OpenAPI file exists yet to document `shown`.
- Mark as worn, explanation and feedback belong to #15, #18 and #19.
