# Issue #7 (Clothing Upload): test evidence

Evidence for reworking User Story 2 onto the conventions merged with #6 (PR #33). **No check in this folder ran against Atlas or Cloudinary.** Unit and integration tests use in-memory repositories and an in-memory image store; `npm run test:db` uses a temporary local MongoDB. Nothing has run on Vercel.

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

The red run covers every new test file except `SelectField.test.tsx`, the `DuplicateImageError` case in `mongoErrorMapping.test.ts`, and `tests/db/mongoWardrobeItemRepository.test.ts`, which were written alongside their code.

## Results

| Check | Result |
|---|---|
| `npm test` | 916 tests in 55 files pass |
| `npm run test:db` | 361 tests in 13 files pass (346 from #6, 15 new) |
| `npm run test:smoke` | 34 tests in 2 files pass; every `/api` route and `/wardrobe/new` build as `ƒ` |
| `tsc --noEmit`, `eslint src tests` | No errors |
| Browser, signed out | `/wardrobe/new` redirects to `/sign-in`; `POST /api/uploads` returns 401; `GET /api/cron/cleanup-uploads` without the secret returns 401 |

## What hasn't been verified

- A real upload to Cloudinary, or the Cloudinary adapter at all: no credentials are configured, and no test contacts Cloudinary.
- The signed-in upload flow in a browser. It needs an account in a database; the form is covered by component tests instead.
- The daily cron job on Vercel, and abandoned images actually being deleted from Cloudinary.
- Phone photos (HEIC, very large JPEGs) going through the browser's resize step, which jsdom can't run.
