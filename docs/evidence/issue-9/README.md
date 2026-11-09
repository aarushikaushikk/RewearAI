# Issue #9 (User Story 4: Edit and Remove Clothing): evidence

Unit and integration tests use in-memory repositories and an in-memory image store. `npm run test:db` uses a temporary local MongoDB. One manual browser run used real Cloudinary with a throwaway in-memory database. **Nothing ran against Atlas or on Vercel.**

## Team decisions applied

| Decision | Where it shows |
|---|---|
| Hard delete | `deleteForOwner` removes the record; there is no soft-delete flag. Saved outfits and history don't exist yet, so nothing references items; #14 (US9) handles a missing item later. |
| Edit uses the same rules as Add Clothing | `validateItemDetails` is the one rule set; `validateNewItemInput` adds only the image check. Name is optional; category, color, style, season and formality are required. |
| No name → "Color Category" | `itemDisplayName` (for example "White Top") for the detail heading, card names, alt text and the Add Clothing saved card. |
| Deleting an item also deletes its Cloudinary photo | `WardrobeItemService.deleteItem` deletes the photo first, then the record. If Cloudinary fails, the item is kept and a retry works. If the record fails after the photo is gone, a retry finishes because deleting a missing Cloudinary ID succeeds. |

## Acceptance criteria → evidence

| Criterion | Tests | Browser |
|---|---|---|
| View saved clothing | `WardrobeGrid.test.tsx`, `GET /api/wardrobe` in `wardrobeRoutes.test.ts`, `listByOwner` contract | `wardrobe-grid-1280.jpg`: newest first, "Showing 2 of 2 items", unnamed item shown as "Blue Bottom" |
| Edit clothing information | `ClothingDetail.test.tsx`, `PATCH` route tests, `updateItem` service tests, `updateForOwner` contract | `item-detail-1280.jpg`, `item-edit-saved-1280.jpg` |
| Delete a clothing item | `ConfirmDialog.test.tsx`, `DELETE` route tests, `deleteItem` service tests | `delete-confirm-1280.jpg`, `delete-confirm-375.jpg`, `after-delete-empty-375.jpg`; both photos confirmed **gone** from Cloudinary afterwards via the Admin API |
| Changes persist | Contract "persists the update", db test "keeps an update and a deletion after reconnecting" | Edit still present after a full reload |
| Privacy (AGENTS §5, §7) | 404 for another user's item on GET/PATCH/DELETE; image, owner and availability in a PATCH body are ignored | `curl` as a second user: get/patch/delete → 404 each; cross-site DELETE → 403. The item was unchanged afterwards. |

Wireframe references: `wireframe-03-reference.png`, `wireframe-04-reference.png`.

## Results

| Check | Result |
|---|---|
| `npm test` | 1148 pass, 1 skipped (pre-existing), 70 files |
| `npm run test:db` | 378 pass in 13 files (32 in `mongoWardrobeItemRepository.test.ts`) |
| `npm run test:smoke` | 35 pass; `/api/wardrobe` and `/api/wardrobe/[itemId]` build as `ƒ` |
| `tsc --noEmit`, `eslint src tests` | No errors in project files (see note below) |

## Out of scope / not verified

- The availability toggle in wireframe 04 is #11 (US6). The detail page shows availability as a read-only label.
- Search and filters from wireframe 03 are #10 (US5).
- No Playwright end-to-end test: Playwright isn't installed in the repository yet, so the browser run above is a one-off check.
- `.next/dev` contained Finder-style duplicate files (`routes.d 2.ts` etc.) that broke `tsc` and `next build`. They're generated and ignored by git; the four in `.next/dev/types` were moved aside before the build.
