# OpenAPI validation report

**Specification:** [docs/openapi.yaml](../../openapi.yaml) · **Guide:** [docs/API.md](../../API.md)
**Branch:** `docs/openapi-api-documentation`, based on `dd61ab8` (Merge pull request #54) · **Date:** 2026-11-14

## Result

| Check | Result |
|---|---|
| OpenAPI version | `3.1.0`; `info.version` `0.1.0` |
| YAML parses | Yes (js-yaml 4.3.2, already in `node_modules`) |
| OpenAPI 3.1 validity (Redocly CLI 1.34.3, recommended rules) | **Valid. 0 errors, 5 warnings**, all intended (below) |
| Local `$ref`s | 237 checked, all resolve; no unused components |
| Examples match their schemas | Yes. No `no-invalid-media-type-examples` warnings. A deliberately broken scratch copy showed the rule checks both inline examples and `components/examples`. |
| Route coverage | 17 `route.ts` files with 22 exported handlers; 22 documented operations; **0 undocumented, 0 invented** |
| `operationId`s | 22, all unique |
| Origin check documented | Every `POST`, `PUT`, `PATCH`, and `DELETE` has the `Origin` header parameter and a `403` response |
| Secrets | None. Pattern scan for connection strings, keys, bearer tokens, and private keys found nothing. Examples use `example.com`, `example-cloud`, and `<placeholders>`. |
| Markdown links in API.md | All relative file links and section anchors resolve |

## Commands

Run from a scratch folder outside the repository. Nothing was installed into the project, and `package.json` and `package-lock.json` are unchanged.

1. **Spec checks.** A Node script, kept outside the repository, run with `node checkSpec.cjs <repo>`. It:
   - parses the spec with the project's existing `js-yaml`;
   - lists every `src/app/api/**/route.ts` and its exported `GET`, `POST`, `PUT`, `PATCH`, and `DELETE` functions;
   - compares them with the spec's paths and methods;
   - resolves every local `$ref`;
   - reports unused components;
   - checks the `Origin` parameter and `403` on state-changing operations.

   Output:

   ```text
   openapi: 3.1.0, info.version: 0.1.0
   routes in code: 22, operations in spec: 22, paths: 17
   local $refs checked: 237
   No problems found.
   ```

2. **OpenAPI 3.1 lint.** `npx` downloaded Redocly CLI into npm's user cache, not the repository:

   ```bash
   npx --yes @redocly/cli@1.34.3 lint <repo>/docs/openapi.yaml --format=stylish
   ```

   Output (colour codes and npm deprecation notices removed):

   ```text
   No configurations were provided -- using built in recommended configuration by default.
   docs/openapi.yaml:
     40:10  warning  no-server-example.com   Server `url` should not point to example.com or localhost.
     373:7  warning  operation-2xx-response  Operation must have at least one `2XX` response.
     373:7  warning  operation-4xx-response  Operation must have at least one `4XX` response.
     429:7  warning  operation-2xx-response  Operation must have at least one `2XX` response.
     429:7  warning  operation-4xx-response  Operation must have at least one `4XX` response.
   Woohoo! Your API description is valid. 🎉
   You have 5 warnings.
   ```

   On Windows, the Node process printed a libuv `Assertion failed … async.c` line while exiting, after the result. It doesn't affect the result.

## The 5 warnings are intended

| Warning | Why it stays |
|---|---|
| `no-server-example.com` (line 40) | The approved server is `http://localhost:3000`. No production URL is verified yet. |
| `operation-2xx-response` and `operation-4xx-response` for `GET /api/auth/google` (line 373) and `GET /api/auth/google/callback` (line 429) | These are browser redirects. The code answers only `303`, including on failure, so a `2XX` or `4XX` response would be invented. |

## Checked by hand against the code

**Request schemas** were checked against these validation modules:
- `authValidation.ts`: register and sign-in;
- `wardrobeValidation.ts`: new item, details, availability;
- `outfitValidation.ts`: generate, save, rate;
- `outfitHistoryValidation.ts`: mark as worn;
- `wardrobeHandlers.ts` and `src/types/upload.ts`: the upload field, types, and the 4 MB limit.

**Response schemas** were checked against these handlers and their types:
- `authHandlers.ts` and `SafeUser`;
- `WardrobeItemDto`;
- `OutfitRecommendationDto`, `OutfitExplanationDto`, `OutfitFeedbackDto`;
- `SavedOutfitDto`;
- `src/types/outfitHistory.ts`;
- the cleanup result.

**Status codes and messages** were checked against each handler's error handling and its service's errors.

**Authentication** was checked against the code:
- `requireAuth` is used by every wardrobe, upload, and outfit handler;
- `handleGetSession` checks the cookie itself;
- logout works without a session;
- the Google handlers need no session;
- the cron endpoint requires `Authorization: Bearer <CRON_SECRET>`.

**Behaviour found while checking:**
- A `negative` rating makes generation offer that combination only after every other valid combination (`outfitRecommendationService.ts`, `generateOutfit.ts`). Both documents describe this.
- The `Set-Cookie` examples follow the attribute order written by `serializeCookie`.

## Limitations

- **Not checked in Swagger Editor or any browser** in this pass. Screenshots for the submission are to be taken separately.
- **No live server was called.** Response examples are fictional and built from the code's types. They were checked against the schemas by Redocly, not against a running application.
- **The route check is a static scan** of `export async function GET|POST|PUT|PATCH|DELETE`, which is how every route file in `src/app/api` is written.
- **Register and sign-in validation messages** are documented by example, not listed one by one.
