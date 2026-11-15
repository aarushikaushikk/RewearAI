# Issue #14 (User Story 9: Saved Outfits): evidence

Users can save a generated outfit from Create Outfit, see their saved outfits on `/outfits/saved` (wireframe 10), and remove one after confirming. A saved outfit stores references to the user's own wardrobe items, never copies. An item deleted since saving shows as "Item removed from your wardrobe" and is never replaced. Screenshots come from a local `next dev` run of this branch using the team's `.env.local`, which means the real MongoDB Atlas database and Cloudinary images. They use the team's existing **Test User** account and its illustrated wardrobe. An earlier run against a throwaway in-memory MongoDB checked the same flow, including that a repeated save adds no second record. Nothing ran on Vercel.

## Design decisions applied

| Decision | Where it shows |
|---|---|
| Removing a saved outfit sets `isSaved: false` and keeps the record, so later history and feedback (US10, US14) can still refer to it | `unsaveForOwner` in the repository contract; service test "removes an outfit from the saved list without touching its items" |
| The same items for the same occasion, in any order, are one outfit, so saving it again or retrying updates `savedAt` instead of adding a second record | Repository contract "returns the outfit already saved when the same items are saved again, in any order"; API test "answers a retried save with 200 and the same outfit, adding no duplicate" |
| A deleted source item is shown as removed, not filled in (DESIGN §5.7, wireframe 10 note). This follows the open DESIGN §12 item "Saved outfit after source-item removal"; partner sign-off is still pending | `toSavedOutfitDto`; `SavedOutfitList` test "shows a clear missing-item state for an item deleted since saving, inventing nothing" |
| `explanation` is optional on `Outfit` until US13 adds it; a blank explanation is stored as none | `Outfit.test.ts` |
| A 404 on remove counts as already removed, so the card leaves the list instead of showing an error | `SavedOutfitList` test "drops an outfit the server no longer has (404) from the list" |

## Acceptance criteria → evidence

| Criterion | Tests | Browser |
|---|---|---|
| The user can save an outfit recommendation | `SaveOutfitButton.test.tsx`, `CreateOutfitForm.test.tsx`, `savedOutfitRoutes.test.ts` (POST) | `create-outfit-saved-1280.jpg`: **Saved** with "Outfit saved. View saved outfits" |
| A saved outfit retains its specific wardrobe items | `savedOutfitService.test.ts`, repository contract (memory and MongoDB) | `saved-list-1280.jpg`: each card shows its own items; the Dinner card shows "Item removed from your wardrobe" for its deleted shoes |
| The user can view previously saved outfits | `savedOutfitsPage.test.tsx`, `SavedOutfitList.test.tsx`, GET route tests | `saved-list-1280.jpg`: newest first; `empty-state-1280.jpg` |
| The user can remove a saved outfit | `SavedOutfitList.test.tsx` (confirm, cancel, retry), DELETE route tests (incl. another user's outfit → 404) | `remove-confirm-1280.jpg`, `removed-1280.jpg`; still removed after reload |

Mobile (375 px): one column, no horizontal scroll (`scrollWidth` 375), and Remove saved is visible without hover (`mobile-375.jpg`). Wireframe reference: `wireframe-10-reference.png`.

## Browser runs (2026-11-11)

**Screenshots: `next dev` with `.env.local` (Atlas and Cloudinary), Test User, 1280 px and 375 px**

1. Work outfit (Camel Shirt Dress, Black Pointed Heels, Brown Suede Jacket, Red Satin Clutch) and Casual outfit (Navy Striped Day Dress, Navy Canvas Sneakers, Yellow Rain Jacket, Beige Canvas Cap) saved from Create Outfit → **Saved** with "Outfit saved. View saved outfits" (`create-outfit-saved-1280.jpg`).
2. Missing item, with none of Test User's own clothes deleted: a temporary copy of Black Pointed Heels was uploaded, a Dinner outfit (Purple Silk Blouse, Black Pencil Skirt, the copy) was saved through `POST /api/outfits/saved`, and then only the copy was deleted. The Dinner card shows "Item removed from your wardrobe" in its place (`saved-list-1280.jpg`).
3. **Remove saved** on Casual opens the confirmation with focus on **Cancel** (`remove-confirm-1280.jpg`). Confirming removes the card and shows "Saved outfit removed." (`removed-1280.jpg`).
4. 375 px: one column, `scrollWidth` 375 (`mobile-375.jpg`).
5. Clean-up: the Dinner and Work outfits were removed afterwards, so Test User's Saved Outfits is empty again, as it was before the run (`empty-state-1280.jpg`).

**Earlier check: production build with a throwaway in-memory MongoDB**

- A signed-out visit to `/outfits/saved` redirects to `/sign-in`.
- Saving the same Work outfit twice left **one** Work record in the database. Generating again gives a fresh **Save outfit** button.
- Escape closes the remove confirmation, and a removed outfit stays gone after reload.
- Requests: `GET /api/outfits/saved` 200, `DELETE /api/outfits/saved/:id` 200. The only 404 is the header's prefetch of `/outfits/history`, which is #15 (US10) and not built yet.

## Results

| Check | Result |
|---|---|
| Red commits | `f436739`, `89af120`, `ae9595f`, `6c369dd`, `ed545c3`, `1266cc9` each add failing tests before their implementation commits |
| `npm test` | 1497 pass, 1 skipped (pre-existing), 84 files |
| `npm run test:db` | 410 pass in 15 files |
| `npm run test:smoke` | 41 pass, 11 skipped (browser checks need `SMOKE_CHROME_PATH`); `/api/outfits/saved`, `/api/outfits/saved/[outfitId]` and `/outfits/saved` build as `ƒ` |
| `npm run typecheck`, `npm run lint` | No errors |

## Out of scope / not verified

- Saved outfits don't label items that have since become **unavailable**. DESIGN §5.7 mentions this, but this branch only handles deleted items. Follow-up if the team wants it.
- Two truly simultaneous first saves of the same outfit could both insert, because no unique index covers the item set (noted in `mongoSavedOutfitRepository.ts`). The button blocks double clicks.
- No Playwright end-to-end test: Playwright isn't installed in the repository yet.
- Mark as worn, Try another, explanation and feedback belong to #15, #13, #18 and #19.
