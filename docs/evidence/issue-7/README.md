# Issue #7 (Clothing Upload): test evidence

Evidence for reworking User Story 2 onto the conventions merged with #6 (PR #33). Unit and integration tests use in-memory repositories and an in-memory image store; `npm run test:db` uses a temporary local MongoDB. One manual run used real Cloudinary with a throwaway database ([commit-history-and-real-run.txt](commit-history-and-real-run.txt) §3). **Nothing has run against Atlas or on Vercel.**

## What was tested, and how

| Area | Evidence | Runs against | In `npm test`? |
|---|---|---|---|
| Image checks: type from file contents, 4 MB limit, empty file | `rework-red-green.txt` (`imageValidation.test.ts`) | Pure functions | Yes |
| Item details: required fields, allowed values, lengths, trimming, malformed bodies | `rework-red-green.txt` (`wardrobeValidation.test.ts`) | Pure functions | Yes |
| `WardrobeItemService`: upload folder and pending tag, ownership, retries, safe errors, cleanup | `rework-red-green.txt` (`wardrobeItemService.test.ts`) | Memory repository and image store | Yes |
| Repository contract | `repositoryContracts.test.ts` and `tests/db/mongoWardrobeItemRepository.test.ts` | Memory, then a temporary `mongod` | Memory yes; MongoDB through `npm run test:db` |
| Routes: CSRF, session, status codes, owner from the session, retries, cron secret | `rework-red-green.txt` (`wardrobeRoutes.test.ts`) | Real `AuthService` on memory repositories | Yes |
| Add Clothing form | `rework-red-green.txt` (`AddClothingForm.test.tsx`, `SelectField.test.tsx`) | jsdom, with `fetch` mocked | Yes |
| Production build | `rework-red-green.txt` (smoke section) | `next build`, then the existing smoke tests | No, `npm run test:smoke` |
| Signed-out access in a browser | Below | `next dev` | No, one-off check |
| Each commit red or green on its own | `commit-history-and-real-run.txt` §1 | Every commit checked out separately | Yes, at each commit |
| Dropping a photo on the image area | `commit-history-and-real-run.txt` §2 (red, then green) | jsdom | Yes |
| Add Clothing matching wireframes 05 and 06 | `commit-history-and-real-run.txt` §4 (red, then green), [screenshots/](screenshots) | jsdom, then `next start` at 1280 px and 375 px | Tests yes; browser check no |
| Signed-in drop, upload, save, and cleanup route | `commit-history-and-real-run.txt` §3, [screenshots/](screenshots) | `next start`, real Cloudinary, temporary MongoDB | No, one-off check |

The red run covers every new test file except `SelectField.test.tsx`, the `DuplicateImageError` case in `mongoErrorMapping.test.ts`, and `tests/db/mongoWardrobeItemRepository.test.ts`, which were written alongside their code.

## Results

| Check | Result |
|---|---|
| `npm test` | 928 tests in 55 files pass |
| `npm run test:db` | 361 tests in 13 files pass (346 from #6, 15 new) |
| `npm run test:smoke` | 35 tests in 2 files pass (34 from #6 and #35's update); every `/api` route and `/wardrobe/new` build as `ƒ` |
| `tsc --noEmit`, `eslint src tests` | No errors |
| Browser, signed out | `/wardrobe/new` redirects to `/sign-in`; `POST /api/uploads` returns 401; `GET /api/cron/cleanup-uploads` without the secret returns 401 |
| Browser, signed in, real Cloudinary | Dropped JPEG uploads (201) and previews; save returns 201 and the saved card loads the photo from `res.cloudinary.com`; cleanup route with the secret returns `{"deleted":0,"confirmed":0}` |

## What hasn't been verified

- Saving to Atlas: the real run used a temporary database, so nothing was written to the team's data.
- The daily cron job on Vercel, and an abandoned image over 24 hours old actually being deleted by the route. The route's listing call did reach Cloudinary.
- Choosing a file with the picker and real mouse dragging in the signed-in browser run: the drop was a scripted `DragEvent`, and the picker path is covered by component tests.
- Style is still a free-text field; it becomes a dropdown once the team agrees its values.
- Phone photos (HEIC, very large JPEGs) going through the browser's resize step, which jsdom can't run.
