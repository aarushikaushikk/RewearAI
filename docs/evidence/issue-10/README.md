# Issue #10 (User Story 5: Search and Filter): evidence

Search and filters run in the browser over the items `GET /api/wardrobe` already returns for the signed-in user, so no API, schema or query changed. Unit tests use mocked `fetch`. One manual browser run used a production build against a throwaway in-memory MongoDB with five seeded items (placeholder Cloudinary demo photo). **Nothing ran against Atlas or on Vercel.**

## Team decisions applied

| Decision | Where it shows |
|---|---|
| Season filter matches exactly; `All-season` items are **not** included for a specific season (DESIGN §5.3 open question; decided for #10, partner sign-off pending) | `filterWardrobeItems` and its test "matches the selected season exactly"; `WardrobeGrid` test "shows only items of the selected season, not All-season ones" |
| Search covers the name and every attribute (category, color, style, season, formality), ignores case and extra spaces, and every word must match | `filterWardrobeItems` search tests |
| One **Clear filters** action, always shown beside the count (wireframe 03), disabled until a search or filter is set | `WardrobeGrid` test "offers one Clear filters action…" |

## Acceptance criteria → evidence

| Criterion | Tests | Browser |
|---|---|---|
| Search wardrobe items | `filterWardrobeItems.test.ts` (search), `WardrobeGrid.test.tsx` "narrows the items as the user searches" | "casual" → Showing 4 of 5 items |
| Filter by relevant attributes | `filterWardrobeItems.test.ts` (attribute filters), `FilterBar.test.tsx` | `search-plus-season-1280.jpg` |
| Filters can be combined | "combines filters with each other and with search", "combines a filter with search" | `search-plus-season-1280.jpg`: "casual" + Winter → only Winter Sweater |
| Clear filters returns the full wardrobe | "explains when nothing matches, and Clear filters returns the full wardrobe" | `no-matches-1280.jpg`, then Clear filters → Showing 5 of 5 items, all inputs back to empty/All (`cleared-375.jpg`) |
| Failure keeps current filters (wireframe 03 note) | "keeps the current search and filters when a failed load is retried" | — |

Mobile (375 px): no horizontal scroll; search full width, filters two per row (`cleared-375.jpg`). Wireframe reference: `wireframe-03-reference.png`.

## Results

| Check | Result |
|---|---|
| Red commit `dad285f` | 7 new `WardrobeGrid` tests failed (no search/filter controls); `filterWardrobeItems` and `FilterBar` test files failed to import their missing modules |
| `npm test` | 1189 pass, 1 skipped (pre-existing), 71 files |
| `npm run test:db` | 378 pass in 13 files (no DB code changed) |
| `npm run test:smoke` | 35 pass; `/api/wardrobe` routes build as `ƒ` |
| `tsc --noEmit`, `eslint src tests` | No errors |

## Out of scope / not verified

- Availability filtering and the availability toggle are #11 (US6).
- No Playwright end-to-end test: Playwright isn't installed in the repository yet.
- Header links to outfit pages 404 on prefetch because those pages don't exist yet; unrelated to this change.
