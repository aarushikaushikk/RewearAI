# ReWear AI API Guide

This guide explains the HTTP API behind the ReWear AI web application. The full machine-readable contract is in [openapi.yaml](openapi.yaml) (OpenAPI 3.1). This guide covers how to use it.

| | |
|---|---|
| **API version** | `0.1.0` (matches `package.json`) |
| **Base URL** | `http://localhost:3000` locally (`npm run dev`). In a deployment, the deployment's own origin. |
| **Format** | JSON, except the photo upload (`multipart/form-data`) and the Google sign-in redirects |
| **Implementation** | Next.js Route Handlers in [`src/app/api/`](../src/app/api/) |

## 1. Overview

ReWear AI is a private digital wardrobe. Through this API a signed-in user can:

- create an account, or sign in with email and password or with Google;
- upload clothing photos and save clothing items;
- edit items, remove them, and mark them available or unavailable;
- generate outfits for an occasion, ask for alternatives, and see why items were chosen;
- save outfits, mark outfits as worn, and rate them.

The API serves the ReWear AI web application. Scripts can call it after signing in (see [section 13](#13-curl-walkthrough)). It is **not** designed for unrestricted third-party access: there are no API keys, no CORS support, and every data endpoint is private to the signed-in user.

## 2. Authentication

### Sessions

Signing in sets an HttpOnly cookie named **`rewear_session`**. It contains an opaque random token. The server stores only the token's SHA-256 hash, and the session lasts **7 days**. The cookie has `Path=/` and `SameSite=Lax`, plus `Secure` in production. No JWT is used for application sessions.

- Browsers send the cookie automatically. Other clients must keep it from the sign-in response, for example with curl's `-c` and `-b` cookie-jar options.
- In OpenAPI the cookie is the `sessionCookie` security scheme (`apiKey` in a cookie). It applies to every operation except those listed below.
- `POST /api/auth/logout` revokes the session and clears the cookie.

These endpoints need **no session**: register, sign in, sign out (it works with or without one), both Google sign-in redirects, and the internal cron endpoint, which has its own secret.

### Google sign-in (browser redirects)

Google sign-in uses OpenID Connect with PKCE. Its two endpoints are **browser redirects**. They answer `303 See Other` with a `Location` header and no JSON, so open them in a browser rather than calling them with `fetch`.

1. `GET /api/auth/google` stores a short-lived (10-minute), HttpOnly, sealed transaction cookie and redirects to Google. The cookie is named `__Host-rewear_google_tx` in production and `rewear_google_tx` in development.
2. Google sends the browser back to `GET /api/auth/google/callback?code=…&state=…`. The server checks that `state` matches the transaction cookie, exchanges the code, and verifies the ID token. It then always clears the transaction cookie and redirects:

| Redirect | Meaning |
|---|---|
| `/home` | Signed in. `rewear_session` is set. |
| `/sign-in?reason=google-cancelled` | The user cancelled at Google. |
| `/sign-in?reason=google-email-unverified` | Google hasn't verified the account's email. |
| `/sign-in?reason=google-email-in-use` | The email belongs to another ReWear AI account. Accounts are never linked by email. |
| `/sign-in?reason=google-unavailable` | Google sign-in isn't configured, or Google or the database is unavailable. |
| `/sign-in?reason=google-failed` | A missing or mismatched transaction, or any other failure. |

Each redirect also sends `Cache-Control: no-store` and `Referrer-Policy: no-referrer`.

## 3. Origin requirement

Every `POST`, `PUT`, `PATCH`, and `DELETE` request must send an **`Origin`** header (or, failing that, a `Referer`) whose origin equals the application's configured origin, `APP_ORIGIN`. Locally, without `APP_ORIGIN`, the request's own host is accepted. This check protects against cross-site request forgery.

Browsers add `Origin` automatically. Scripts must set it, for example `-H 'Origin: http://localhost:3000'`. A missing or mismatched origin is refused with `403` before anything else happens:

```json
{ "success": false, "error": "CSRF validation failed: origin mismatch or missing security headers" }
```

## 4. Endpoints

| Method | Path | Purpose | Session | Success |
|---|---|---|---|---|
| POST | `/api/auth/register` | Create an account and sign in | – | 201 |
| POST | `/api/auth/login` | Sign in with email and password | – | 200 |
| POST | `/api/auth/logout` | Sign out | optional | 200 |
| GET | `/api/auth/session` | The signed-in user | ✓ | 200 |
| GET | `/api/auth/google` | Start Google sign-in (redirect) | – | 303 |
| GET | `/api/auth/google/callback` | Finish Google sign-in (redirect) | – | 303 |
| POST | `/api/uploads` | Upload a clothing photo | ✓ | 201 |
| GET | `/api/wardrobe` | List clothing items | ✓ | 200 |
| POST | `/api/wardrobe` | Save a clothing item | ✓ | 201 / 200 on retry |
| GET | `/api/wardrobe/{itemId}` | One clothing item | ✓ | 200 |
| PATCH | `/api/wardrobe/{itemId}` | Edit an item's details | ✓ | 200 |
| DELETE | `/api/wardrobe/{itemId}` | Delete an item and its photo | ✓ | 200 |
| PATCH | `/api/wardrobe/{itemId}/availability` | Mark available or unavailable | ✓ | 200 |
| POST | `/api/outfits/generate` | Generate an outfit, or an alternative | ✓ | 200 |
| GET | `/api/outfits/saved` | List saved outfits | ✓ | 200 |
| POST | `/api/outfits/saved` | Save an outfit | ✓ | 201 / 200 on retry |
| DELETE | `/api/outfits/saved/{outfitId}` | Remove from saved outfits | ✓ | 200 |
| GET | `/api/outfits/history` | List worn outfits | ✓ | 200 |
| POST | `/api/outfits/history` | Mark an outfit as worn | ✓ | 201 / 200 on retry |
| PUT | `/api/outfits/feedback` | Rate an outfit | ✓ | 200 |
| DELETE | `/api/outfits/feedback/{outfitId}` | Clear a rating | ✓ | 200 |
| GET | `/api/cron/cleanup-uploads` | **Internal:** delete abandoned uploads | cron secret | 200 |

That is 22 operations in 17 route files. The first 21 are user-facing; the last is internal ([section 12](#12-internal-endpoint)).

**Not HTTP endpoints.** These features run in the browser and have no API route:
- clothing classification and its uncertainty review;
- the outfit stylist note;
- wardrobe search and filtering (`GET /api/wardrobe` takes no query parameters).

Alternatives and explanations are part of `POST /api/outfits/generate`, not separate routes.

## 5. Conventions

**Envelope.** JSON responses look like this:

```json
{ "success": true, "data": { "...": "..." } }
{ "success": false, "error": "A fixed message that is safe to show the user" }
```

There are two exceptions:
- Sign-out succeeds with `{ "success": true, "message": "Logged out successfully" }`.
- Register and sign-in errors may add a machine-readable `code`, such as `VALIDATION_ERROR`, `DUPLICATE_EMAIL`, or `INVALID_CREDENTIALS`.

Error messages never contain stack traces or internal details.

**Ownership.** Whose data is used always comes from the session. User or owner IDs in a body are ignored or refused. Another user's item or outfit answers exactly like a missing one (`404`).

**IDs.** Item and outfit IDs are 24-character hexadecimal MongoDB ObjectIds. A malformed ID answers `404`, not `400`.

**Dates.** Timestamps such as `createdAt` and `savedAt` are ISO 8601 strings in UTC. `wornOn` is a calendar date, `YYYY-MM-DD`.

**Request bodies are checked in two stages:**
1. **Shape.** A body that isn't a JSON object, or has a field of the wrong type, answers `400 "Invalid request payload"`.
2. **Values.** A field with an invalid value answers `400` with a specific message. For wardrobe items, only the **first** problem is reported, for example `"Choose a category."`. There is no per-field error map.

Unknown fields are handled differently by area:

| Area | Unknown fields |
|---|---|
| Wardrobe save and edit | Ignored |
| Availability, outfit generation, saved outfits, history, feedback | Refused with `400` (the body must contain exactly the documented fields) |

**Item names.** Wardrobe items **leave out** `name` when the item has none. Outfit, saved-outfit, and history items always include `name`, which is `null` when the item has none.

**Allowed values:**

| Field | Values |
|---|---|
| `category` | Top, Bottom, Outerwear, Dress, Shoes, Accessory |
| `color` | Black, White, Grey, Charcoal, Beige, Camel, Brown, Red, Burgundy, Pink, Orange, Yellow, Green, Blue, Navy, Indigo, Purple, Multicolor |
| `season` | Spring, Summer, Autumn, Winter, All-season |
| `formality` | Casual, Smart casual, Formal |
| `occasion` | work, dinner, weekend, casual, formal |
| `rating` | positive, negative |

`style` is required free text, at most 40 characters. `name` is optional, at most 80 characters. Both limits apply after trimming spaces.

## 6. Errors

| Status | When |
|---|---|
| 400 | Malformed body, or an invalid value (see [section 5](#5-conventions)) |
| 401 | No valid session (`"Authentication required"`), wrong sign-in credentials, or a missing or wrong cron secret |
| 403 | The origin check failed ([section 3](#3-origin-requirement)) |
| 404 | The item, outfit, or photo doesn't exist or belongs to someone else |
| 409 | Registration with an email that already has an account |
| 413 | Upload larger than 4 MB |
| 415 | Upload that isn't JPEG, PNG, or WebP |
| 429 | Too many failed sign-in or registration attempts (see [section 7](#7-rate-limiting)) |
| 500 | Unexpected failure (`"Internal server error"`) |
| 502 | The image service failed: upload, photo check, or photo deletion. Safe to retry. |
| 503 | The database or server configuration is unavailable. Each area has its own fixed message. |

The platform can also answer `405` for an unsupported method. A body over the hosting platform's request limit (4.5 MB on Vercel) may be refused before it reaches the API.

## 7. Rate limiting

`POST /api/auth/register` and `POST /api/auth/login` allow **5 failed attempts per 15 minutes**. The limit is counted separately per IP address and per email address. When the limit is reached, they answer `429` with a `Retry-After` header in seconds.

- Only client errors count, such as invalid input, a duplicate email, or wrong credentials. A malformed body is refused before it is counted, and server failures never count.
- A successful sign-in resets both counters.
- The IP address comes from `X-Forwarded-For` only when `TRUST_PROXY=true`.

**Limitation:** the counters are kept in each server instance's memory. On a platform that runs several instances, such as Vercel, the limit is per instance rather than global, and it resets when an instance restarts. No other endpoints are rate limited.

## 8. Adding clothing: upload, then save

Adding clothing takes two requests, so a failed upload never leaves a broken wardrobe item.

1. **Upload the photo:** `POST /api/uploads` as `multipart/form-data` with an `image` file field.
   - The file must be JPEG, PNG, or WebP (checked from its bytes) and at most 4 MB.
   - The web app shrinks photos to 2,000 px on the longest edge before uploading.
   - The response is `201` with `{ url, publicId }`. The photo goes into the user's own folder, `rewear/users/<userId>/`.
   - If the image service fails, the response is `502`. Retrying is safe.
2. **Save the item:** `POST /api/wardrobe` with the `publicId` and the details: `category`, `color`, `style`, `season`, `formality`, and optionally `name`.
   - The server checks the photo again and stores the URL the image service returns, never one from the client.
   - `404` means the photo is gone or isn't the user's. Upload it again.
   - `502` means the photo couldn't be checked. Nothing was saved; retry.

A photo that is uploaded but never saved is deleted by the daily cleanup, about 24 to 48 hours later.

Other wardrobe operations:
- `PATCH /api/wardrobe/{itemId}` replaces the editable details. The photo and availability can't be changed this way.
- `PATCH /api/wardrobe/{itemId}/availability` takes exactly `{ "isAvailable": true | false }`.
- `DELETE /api/wardrobe/{itemId}` deletes the photo, then the item. If the photo can't be deleted, the item is kept (`502`) and the request can be retried.

## 9. Outfits and alternatives

`POST /api/outfits/generate` with `{ "occasion": "work" }` builds an outfit from the user's **available** items only. Nothing is saved. A combination the user rated negative for this occasion is offered only after every other valid combination. It answers `200` with one of three results, told apart by `data.status`:

| `status` | Meaning | Fields |
|---|---|---|
| `ok` | An outfit | `occasion`, `season`, `items[]` (each with its `role`), `explanation`, `feedback` |
| `insufficient` | No outfit can be made | `occasion`, `reason`: `no_suitable_items` or `no_complete_outfit` |
| `no_alternative` | Every valid combination has already been shown | `occasion` |

- **Alternatives ("Try another").** Send the item IDs of outfits already shown: `{ "occasion": "work", "shown": [["<id1>", "<id2>"]] }`. That's at most 20 lists of 1 to 6 IDs each. Those combinations are excluded.
- **Explanations.** `explanation` gives the facts the outfit was chosen on:
  - `formalities` and `seasons`: the items' values;
  - `palette`: one of `tonal`, `neutral`, `one_accent`, `paired`, `bold`;
  - `alternative`: `true` when `shown` was sent.

  The web app turns these facts into sentences.
- **Existing rating.** `feedback` is the user's saved rating for exactly these items and this occasion, as `{ outfitId, rating }`, or `null`.

## 10. Saved outfits, history, and feedback

**Saved outfits**
- `POST /api/outfits/saved` takes `{ occasion, itemIds }`. Every item must be the user's own (`400` otherwise).
- `GET /api/outfits/saved` lists saved outfits, newest saved first.
- `DELETE /api/outfits/saved/{outfitId}` takes the outfit off the list but keeps the record.
- An item deleted from the wardrobe since saving appears as `{ "status": "removed", "id": "…" }`.

**Outfit history**
- `POST /api/outfits/history` takes exactly `{ itemIds, occasion, wornOn }`.
  - `wornOn` is the user's local date, `YYYY-MM-DD`. It must be today's date in some time zone (UTC−12 to UTC+14), so a wear can't be backdated or recorded in advance (`400 "The worn date must be today's date."`).
  - The items must form a valid outfit: a top and a bottom, or a dress, with at most one item per category (`400` otherwise).
  - Items not in the user's wardrobe answer `404`.
- `GET /api/outfits/history` returns `{ entries: [...] }`, newest worn date first.
- An item deleted from the wardrobe since then appears as `{ "status": "missing", "id": "…" }`. `occasion` is `null` only if the outfit record no longer exists.

**Feedback**
- `PUT /api/outfits/feedback` takes `{ occasion, itemIds, rating }` and returns `{ outfitId, rating }`. The items must form a valid outfit.
- `DELETE /api/outfits/feedback/{outfitId}` clears the rating.
- A rating is shown again whenever the same outfit is generated (`feedback` in [section 9](#9-outfits-and-alternatives)).
- A **negative** rating has one fixed effect: that exact combination is offered for that occasion only after every other valid combination. It is never excluded.
- A positive rating doesn't change which outfit is chosen.
- Nothing else is learned from ratings.

## 11. Retries and idempotency

| Operation | Repeating the same request |
|---|---|
| `POST /api/wardrobe` | `200` with the item already saved for that photo. Each photo can belong to only one item. |
| `POST /api/outfits/saved` | `200`. The same items in any order for the same occasion are one outfit, and it moves to the top of the list. |
| `POST /api/outfits/history` | `200` with the existing entry. The same clothes in any order on the same date are one wear, whatever the occasion, even when two requests arrive at once. |
| `PUT /api/outfits/feedback` | `200`. The rating is replaced. |
| `PATCH` availability or details | Same result. |
| `DELETE /api/outfits/saved/{id}`, `DELETE /api/outfits/feedback/{id}` | `200` again for any outfit the user has. |
| `POST /api/auth/logout` | `200`, with or without a session. |
| `POST /api/uploads` | Each successful upload stores a new photo. Unused photos are cleaned up automatically. |

## 12. Internal endpoint

`GET /api/cron/cleanup-uploads` is marked `x-internal: true` in the specification. Vercel Cron calls it once a day at 04:00 UTC (see [vercel.json](../vercel.json)). Users and the web application never call it.

- It requires `Authorization: Bearer <CRON_SECRET>`, the `cronBearer` scheme. A session cookie doesn't work.
- It answers `401` if the secret is missing, wrong, or not configured.
- It looks at uploads still marked pending that are more than 24 hours old. Those used by a wardrobe item are confirmed; the rest are deleted.
- It returns `{ "deleted": n, "confirmed": n }`.

## 13. curl walkthrough

All values below are fictional. Replace `<…>` placeholders with your own. Run against a local server started with `npm run dev`. The cookie jar `cookies.txt` keeps the session between commands.

```bash
BASE=http://localhost:3000

# Create an account; the session cookie is saved to cookies.txt
curl -s -c cookies.txt -X POST "$BASE/api/auth/register" \
  -H "Origin: $BASE" -H 'Content-Type: application/json' \
  -d '{"email":"alex@example.com","password":"<a-password-of-8+-characters>","name":"Alex Rivera"}'
# 201 {"success":true,"data":{"user":{"id":"6650a1b2c3d4e5f6a7b8c9d0","email":"alex@example.com","name":"Alex Rivera","createdAt":"2026-11-14T09:30:00.000Z"}}}

# Or sign in to an existing account
curl -s -c cookies.txt -X POST "$BASE/api/auth/login" \
  -H "Origin: $BASE" -H 'Content-Type: application/json' \
  -d '{"email":"alex@example.com","password":"<your-password>"}'

# Who am I? (GET requests need no Origin header)
curl -s -b cookies.txt "$BASE/api/auth/session"

# 1. Upload a photo
curl -s -b cookies.txt -X POST "$BASE/api/uploads" \
  -H "Origin: $BASE" -F 'image=@shirt.jpg;type=image/jpeg'
# 201 {"success":true,"data":{"url":"https://res.cloudinary.com/example-cloud/image/upload/v1731577800/rewear/users/6650a1b2c3d4e5f6a7b8c9d0/k3x9q2.jpg","publicId":"rewear/users/6650a1b2c3d4e5f6a7b8c9d0/k3x9q2"}}

# 2. Save it as a wardrobe item (repeat it: the second answer is 200 with the same item)
curl -s -b cookies.txt -X POST "$BASE/api/wardrobe" \
  -H "Origin: $BASE" -H 'Content-Type: application/json' \
  -d '{"publicId":"rewear/users/6650a1b2c3d4e5f6a7b8c9d0/k3x9q2","name":"Linen shirt","category":"Top","color":"White","style":"Button-down","season":"Summer","formality":"Smart casual"}'

# Mark it unavailable
curl -s -b cookies.txt -X PATCH "$BASE/api/wardrobe/6650b7e1c3d4e5f6a7b8c9d1/availability" \
  -H "Origin: $BASE" -H 'Content-Type: application/json' -d '{"isAvailable":false}'

# Generate an outfit, then ask for an alternative to it
curl -s -b cookies.txt -X POST "$BASE/api/outfits/generate" \
  -H "Origin: $BASE" -H 'Content-Type: application/json' -d '{"occasion":"work"}'
curl -s -b cookies.txt -X POST "$BASE/api/outfits/generate" \
  -H "Origin: $BASE" -H 'Content-Type: application/json' \
  -d '{"occasion":"work","shown":[["6650b7e1c3d4e5f6a7b8c9d1","6650b7e1c3d4e5f6a7b8c9d2"]]}'

# Save it, mark it as worn today, and rate it
curl -s -b cookies.txt -X POST "$BASE/api/outfits/saved" \
  -H "Origin: $BASE" -H 'Content-Type: application/json' \
  -d '{"occasion":"work","itemIds":["6650b7e1c3d4e5f6a7b8c9d1","6650b7e1c3d4e5f6a7b8c9d2"]}'
curl -s -b cookies.txt -X POST "$BASE/api/outfits/history" \
  -H "Origin: $BASE" -H 'Content-Type: application/json' \
  -d "{\"itemIds\":[\"6650b7e1c3d4e5f6a7b8c9d1\",\"6650b7e1c3d4e5f6a7b8c9d2\"],\"occasion\":\"work\",\"wornOn\":\"$(date +%F)\"}"
curl -s -b cookies.txt -X PUT "$BASE/api/outfits/feedback" \
  -H "Origin: $BASE" -H 'Content-Type: application/json' \
  -d '{"occasion":"work","itemIds":["6650b7e1c3d4e5f6a7b8c9d1","6650b7e1c3d4e5f6a7b8c9d2"],"rating":"positive"}'

# Sign out
curl -s -b cookies.txt -c cookies.txt -X POST "$BASE/api/auth/logout" -H "Origin: $BASE"
```

Without `-H "Origin: …"`, every `POST`, `PUT`, `PATCH`, and `DELETE` above answers `403`.

`cookies.txt` holds a live session token, so keep it private and delete it when you're done.

## 14. Viewing the specification

The specification is a single file, [openapi.yaml](openapi.yaml). Nothing needs to be installed in the project to view it:

- **Swagger Editor:** open <https://editor.swagger.io>, choose **File → Import file**, and select `docs/openapi.yaml`. Operations are grouped by tag, and schemas are under **Schemas**.
- **Any OpenAPI 3.1 viewer**, such as Redocly or Stoplight, can open the same file.

No Swagger UI is served by the application.

**Interactive "Try it out" requests won't work** against the application:
- The session cookie is HttpOnly, so a documentation page can't set or read it.
- `SameSite=Lax` stops browsers from sending it with cross-site requests.
- Requests from another origin fail the origin check (`403`).
- The API sends no CORS headers.

Use the curl walkthrough above instead.

## 15. Validating the specification

The specification was validated with [Redocly CLI](https://redocly.com/docs/cli/), run temporarily with `npx` and not added to the project:

```bash
npx --yes @redocly/cli@1.34.3 lint docs/openapi.yaml
```

The results, including a check that every route file is documented, are recorded in [evidence/openapi/validation-report.md](evidence/openapi/validation-report.md).
