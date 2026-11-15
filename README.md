# ReWear AI

> An intelligent stylist that creates new outfits from clothes you already own.

ReWear AI is a digital wardrobe application that helps users organize clothing they already own and generate occasion-based outfit combinations from those items, encouraging wardrobe reuse rather than new purchases.

**Team:** Aarushi Kaushik, Pranav Sirnapalli
**Course:** AI Coding, Project 2 / HW-3

## Status

The application is in `src/`. All 15 user stories in the [PRD](docs/PRD.md) are implemented and merged into `main`, the last of them in PR #54. The `baseline/` and `run-*` folders are separate prototypes from the [HW-3 Rules Experiment](#hw-3-rules-experiment).

## Features

ReWear AI is for people who want to get more use out of the clothes they already have. Each user's wardrobe is private, and outfits are only ever built from items that user has saved.

### Accounts

- **Email and password accounts.** Register, sign in, and sign out. Sessions last 7 days.
- **Google sign-in.** Available when the Google OAuth client is configured. A Google account is never attached to an existing account just because the email matches.

### Wardrobe

- **Add clothing.** Choose or drop a JPEG, PNG, or WebP photo. The browser shrinks it before upload, then you review the details and save. A photo can only be saved as one item, so retrying a save never creates a duplicate.
- **AI-assisted classification.** While the photo uploads, a model running in your browser suggests the category, color, style, season, and formality. Suggestions only fill fields you haven't touched. Uncertain ones are marked and must be confirmed before saving, and you can always enter the details yourself.
- **View, edit, and delete.** Each item has a detail page where its details can be corrected. Deleting an item removes its photo too.
- **Search and filter.** Search by name or attributes, and filter by category, color, season, and formality.
- **Availability.** Mark an item unavailable, for example while it's in the laundry. Unavailable items are left out of new outfits.

### Outfits

- **Occasion-based outfits.** Pick an occasion (work, dinner, weekend, casual, or formal) and get an outfit built only from your available items. If your wardrobe can't make one, the page explains why and links to your wardrobe and to Add Clothing.
- **Try another.** Ask for a different combination. When every valid combination has been shown, the page says so instead of repeating one.
- **Why these items?** Each outfit explains the formality, season, and color palette it was chosen on. A short stylist note describes the look.
- **Saved outfits.** Save an outfit to find it again later, and remove it from the Saved Outfits page. An item deleted since saving is shown as removed, not replaced.
- **Outfit history.** Mark an outfit as worn today and see your history, newest first. The same clothes on the same day are recorded once.
- **Feedback.** Rate an outfit Helpful or Not helpful, then change or clear the rating. A combination rated Not helpful is offered last for that occasion. Nothing else is learned from ratings.

### Failure recovery

Upload failures and analysis failures get different messages and actions:
- a failed upload offers **Retry upload** and keeps the photo;
- a failed analysis offers **Retry analysis** or **Enter details manually**;
- if a save finds the photo gone, **Upload photo again** sends it again without losing the entered details.

Failed requests don't leave broken or duplicate wardrobe items. When loading or saving fails, the app shows a fixed message with a way to try again, or a **Sign in** link if the session has ended.

### Where the AI runs

Clothing classification is the only machine-learning part of the app, and it runs in the browser:
- It uses [Transformers.js](https://huggingface.co/docs/transformers.js) with the Marqo-FashionSigLIP model, in a Web Worker.
- The model is downloaded once and cached by the browser.
- Photos are not sent to an AI service.
- If the model is already cached, the stylist note also uses it to score the outfit's photos.

Outfit recommendations are generated on the server by fixed rules in `src/services/outfits/`:
- formality for the occasion;
- matching seasons;
- a top and bottom or a dress, with no repeated category;
- shoes included when suitable ones exist;
- avoiding combinations already shown;
- calmer color palettes first.

They don't use a language model or any external AI API.

Full requirements, the 15 user stories, and acceptance criteria are in [docs/PRD.md](docs/PRD.md).

## Documentation

| Document | What it covers |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System architecture diagram and how the parts fit together |
| [docs/API.md](docs/API.md) | Guide to the HTTP API: authentication, conventions, errors, and curl examples |
| [docs/openapi.yaml](docs/openapi.yaml) | OpenAPI 3.1 specification of all 22 API operations. Open it in [Swagger Editor](https://editor.swagger.io) |
| [docs/PRD.md](docs/PRD.md) | Product requirements and the 15 user stories |
| [docs/DESIGN.md](docs/DESIGN.md) | UI design, screen states, and wireframe references |
| [AGENTS.md](AGENTS.md) | Rules for the AI coding tools we used |

## Repository Structure

```
RewearAI/
├── AGENTS.md                               # Rules file for AI coding tools
├── README.md
├── ReWear_HW3_Experiment_Comparison.pdf    # HW-3 before/after comparison
├── src/
│   ├── app/                                # Pages and API Route Handlers (app/api)
│   ├── components/                         # React components
│   ├── lib/                                # Auth, database, repositories, validation, images
│   ├── models/                             # Mongoose models
│   ├── services/                           # Business rules, outfit generation, classification
│   └── types/                              # Shared TypeScript types
├── tests/                                  # unit/, integration/, db/, smoke/, plus helpers and mocks
├── docs/
│   ├── PRD.md                              # Product requirements (15 user stories)
│   ├── DESIGN.md                           # UI design and wireframe references
│   ├── evidence/                           # Test and screenshot evidence for each issue
│   └── sprints/
│       ├── sprint-1/                       # planning.md, standups.md, retro.md
│       ├── sprint-2/
│       ├── sprint-3/
│       └── sprint-4/
├── baseline/                               # HW-3: shared starting point
├── run-a-no-rules/                         # HW-3: User Story 5 built WITHOUT rules
└── run-b-with-rules/                       # HW-3: User Story 5 built WITH rules
```

## Database Setup (MongoDB Atlas)

The app stores its data in MongoDB Atlas through Mongoose. The connection helper is [src/lib/db.ts](src/lib/db.ts) (server-only).

1. Create a free cluster at [MongoDB Atlas](https://www.mongodb.com/cloud/atlas).
2. Under **Database Access**, add a database user with a strong password.
3. Under **Network Access**, allow your IP address (for Vercel, allow `0.0.0.0/0` or use Vercel's Atlas integration).
4. Click **Connect → Drivers** and copy the connection string.
5. Copy the example env file and paste the string into `MONGODB_URI`, replacing the user, password, and cluster host. Keep `/rewear` as the database name:

   ```bash
   cp .env.example .env.local
   ```

6. Run `npm run dev`. Route Handlers call `connectToDatabase()`, which reuses one cached connection.

`.env.local` is git-ignored; never commit real credentials. If the URI is missing or the connection fails, the helper logs only the error type on the server and throws a `DatabaseConnectionError` with a safe, generic message.

## Authentication

People sign in with an email and password or with Google. Both issue the same session: a random token in an `HttpOnly` cookie, with only its SHA-256 hash stored in MongoDB, so sessions can be revoked on the server.

To turn on Google sign-in:

1. In the [Google Cloud Console](https://console.cloud.google.com/apis/credentials), create an OAuth client of type **Web application**.
2. Add this authorized redirect URI, exactly: `<APP_ORIGIN>/api/auth/google/callback`. Locally, that's `http://localhost:3000/api/auth/google/callback`.
3. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `APP_ORIGIN` in `.env.local`. Never commit them.

Without these, the Google option doesn't appear and password sign-in keeps working.

A Google sign-in never connects to an existing account because the email matches. It's refused, and that person signs in the way they did before. [AGENTS.md](AGENTS.md) §7 has the security rules.

## Running Tests

All automated tests use [Vitest](https://vitest.dev). Component and page tests also use React Testing Library in jsdom. We wrote the failing tests first for most stories, and the red and green runs are recorded in [docs/evidence/](docs/evidence).

| Folder | What it tests |
|---|---|
| `tests/unit/` and `src/**/*.test.ts` | Services (outfit generation, explanations, saved outfits, history, feedback), validation, classification logic, Mongoose schemas, and React components |
| `tests/integration/` | Route Handlers called with real `Request` objects and in-memory repositories, covering auth, uploads, wardrobe, and outfits. Also pages rendered with React Testing Library |
| `tests/contracts/` | Behaviour every repository must have, run against both the in-memory and the MongoDB versions |
| `tests/db/` | MongoDB repositories, indexes, and the Google sign-in routes against a temporary MongoDB server |
| `tests/smoke/` | The production build under `next start`: HTTP checks of auth, outfit generation, history, and feedback, plus real-Chrome checks of Create Outfit and Outfit History |

The two `*.live.test.ts` files run the real classification model. They're skipped unless `RUN_LIVE_MODEL` and a folder of test images are set.

We don't measure test coverage. The smoke suites are our end-to-end tests. They are custom Vitest suites that drive Chrome through the DevTools Protocol ([tests/helpers/chromeCdp.ts](tests/helpers/chromeCdp.ts)); Playwright isn't used.

The CI workflows (`.github/workflows/ci.yml` and `codeql.yml`) add security checks on top of these tests:
- `npm audit` of production dependencies;
- GitHub dependency review on pull requests;
- a gitleaks scan for committed secrets;
- CodeQL analysis.

The CI/CD and Deployment section explains how the pipeline runs.

| Command | What it runs | Database |
|---|---|---|
| `npm run lint` | ESLint with `eslint-config-next` | None |
| `npm run typecheck` | TypeScript check (`tsc --noEmit`) | None |
| `npm run build` | Production build. `npm run test:smoke` runs it first. | None |
| `npm test` | Unit, component, and integration tests | None; `MONGODB_URI` is blanked |
| `npm run test:db` | Real-database tests in `tests/db/` | A temporary MongoDB server on `127.0.0.1` |
| `npm run test:smoke` | Builds the app and tests `next start` with real requests | A temporary MongoDB server on `127.0.0.1` |

`npm run test:db` and `npm run test:smoke` never use `MONGODB_URI` or Google settings from your shell or `.env.local`, and no test contacts Google: they use a local fake. [tests/helpers/mongoTestServer.ts](tests/helpers/mongoTestServer.ts) starts a new server for each test file, refuses any other database, and removes the server's files when it stops. If the server can't start, the tests fail rather than falling back to another database.

`npm install` downloads the `mongod` binary these tests use. Set `MONGOMS_DISABLE_POSTINSTALL=1` to skip that download where the tests don't run; `npm run test:db` will then download it on first use.

## Image Storage Setup (Cloudinary)

Clothing photos are stored in Cloudinary; MongoDB keeps only the image URL and public ID. The adapter is [src/lib/images/cloudinaryImageStore.ts](src/lib/images/cloudinaryImageStore.ts) (server-only); tests use an in-memory store and never contact Cloudinary.

1. Create a free account at [Cloudinary](https://cloudinary.com).
2. Under **Settings → API Keys**, copy the cloud name, API key, and API secret into `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` in `.env.local`.
3. Set `CRON_SECRET` to a long random string (also in Vercel's project settings).

Uploads accept JPEG, PNG, or WebP up to 4 MB; the browser shrinks photos to 2000 px before uploading. Each image goes to `rewear/users/<userId>/` tagged `rewear-pending`. A daily Vercel Cron job ([vercel.json](vercel.json)) calls `/api/cron/cleanup-uploads`, which deletes pending images older than 24 hours that no wardrobe item uses, so abandoned uploads are removed within about 48 hours.

Both upload routes require a signed-in session (`requireAuth()`) and a same-origin request (`validateCsrfOrigin()`), like the auth routes. The cron route instead requires `Authorization: Bearer $CRON_SECRET`.

## HW-3 Rules Experiment

To test whether our rules file makes a measurable difference, we built the same feature twice with Claude Code in VS Code: once without rules and once with them.

**Feature tested:** [User Story 5 - Search and Filter (#10)](https://github.com/aarushikaushikk/RewearAI/issues/10)

> As a user, I want to search and filter my clothing so that I can quickly find specific items.

This was a **throwaway prototype** built on a hardcoded 12-item dummy wardrobe (`data/clothing.ts`), with no database, authentication, or image upload. It isn't the real implementation of User Story 5, so #10 stays in the backlog for its scheduled sprint.

| Folder | What it is |
|--------|------------|
| [`baseline/`](baseline) | Shared starting point: Next.js 16.4.3 / React 19.3 / TypeScript scaffold, plus the dummy clothing data and `ClothingItem` type. Both runs started from this. |
| [`run-a-no-rules/`](run-a-no-rules) | **Run A:** fresh chat, no `AGENTS.md` or PRD, brief feature description only. |
| [`run-b-with-rules/`](run-b-with-rules) | **Run B:** same prompt, clean start, with `AGENTS.md` and `docs/PRD.md` in place. |

### What changed between the runs

| | Run A (no rules) | Run B (with rules) |
|---|---|---|
| Filtering logic | `lib/filterClothing.ts` | `services/filterClothing.ts` (matches the `services/` domain-logic folder in `AGENTS.md`) |
| UI components | One `WardrobeBrowser.tsx` (163 lines) | `WardrobeBrowser.tsx` (121 lines) plus a separate `ClothingCard.tsx` |
| Tests | None | `services/filterClothing.test.ts`: 12 unit tests, all passing |
| Project docs in the run | None | `AGENTS.md` and `docs/PRD.md` |

The full comparison (code quality, design intent, naming, and architecture, with screenshots) is in [ReWear_HW3_Experiment_Comparison.pdf](ReWear_HW3_Experiment_Comparison.pdf).

### Running a prototype locally

Each folder is a standalone Next.js app. Run one at a time, since they all use port 3000:

```bash
cd run-b-with-rules
npm install
npm run dev
```

Then open http://localhost:3000. Swap in `baseline` or `run-a-no-rules` to see the others.

Run B's unit tests use Node's built-in test runner (Node 23.6+ for direct TypeScript support):

```bash
cd run-b-with-rules
node --test services/filterClothing.test.ts
```

## Rules File

[AGENTS.md](AGENTS.md) is the shared rules file every AI coding tool reads. It covers:

- **Project context:** sources of truth (PRD, design, the assigned issue), approved tech stack, architecture, naming and coding conventions
- **Product invariants:** never recommend clothing the user doesn't own, exclude unavailable items, keep data private
- **Database, images, auth, privacy, and security** rules
- **UI, mockups, and accessibility** requirements
- **Scrum workflow:** branch naming, commit format, PR and review rules
- **TDD, quality gates, CI/CD, and deployment**, plus how the agent should work

## Tech Stack

ReWear AI is a single Next.js application: the pages, the API, and the browser code are built and deployed together. Versions are the ones in [package.json](package.json). The HW-3 prototypes use only Next.js, React, and TypeScript.

| Technology | What we use it for |
|---|---|
| Next.js 16 (App Router) | Server-rendered pages and the API, as Route Handlers in `src/app/api` |
| React 19 | The UI, as server components for page shells and client components for interactive screens |
| TypeScript 5 | All application and test code |
| Tailwind CSS 4 | Styling |
| MongoDB Atlas + Mongoose 9 | Users, sessions, Google account links, wardrobe items, outfits, outfit history, and feedback |
| Cloudinary | Clothing photo storage. MongoDB keeps each photo's URL and public ID. |
| Transformers.js 4 + Marqo-FashionSigLIP | In-browser clothing classification, run in a Web Worker |
| Custom session authentication | Random session token in an HttpOnly cookie, stored only as a SHA-256 hash; passwords hashed with bcryptjs. No JWT sessions. |
| Google OpenID Connect (`openid-client` 6) | Google sign-in with PKCE |
| Vitest 3 + React Testing Library + jsdom | Unit, component, integration, and smoke tests |
| `mongodb-memory-server` | Temporary MongoDB servers for the database and smoke tests |
| ESLint 9 | Linting, with `eslint-config-next` |
| Vercel | Hosting, plus the daily upload-cleanup cron job in [vercel.json](vercel.json) |

The design is covered in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Project Management

Work is tracked on GitHub using Scrum:

- **Project board:** [ReWear AI Sprint Board](https://github.com/users/aarushikaushikk/projects/4), in Board layout with the columns **Backlog → Sprint Todo → In Progress → In Review → Done**, plus a view for each sprint.
- **Issues:** [23 issues](https://github.com/aarushikaushikk/RewearAI/issues), covering the 5 HW-3 tasks, the 15 PRD user stories, and a test-and-deploy task for each feature sprint. Each issue has its acceptance criteria as a checklist, labels, an estimate, and a milestone.
- **Labels:** `feature`, `bug`, `chore`, `docs`, `priority: high`, `priority: medium`, `priority: low`
- **Milestones:** [one per sprint](https://github.com/aarushikaushikk/RewearAI/milestones)

| Sprint | Due | Scope |
|--------|-----|-------|
| Sprint 1 | Fri Oct 30 | HW-3 tasks (#1–#5) |
| Sprint 2 | Wed Nov 4 | User Stories 1–5 (#6–#10), test and deploy (#23) |
| Sprint 3 | Sat Nov 7 | User Stories 6–9 (#11–#14), test and deploy (#24) |
| Sprint 4 | Wed Nov 11 | User Stories 10–15 (#15–#20), test and deploy (#25) |

Each sprint folder in [docs/sprints/](docs/sprints) holds its `planning.md` (goal, committed issues, estimates, PO/SM), `standups.md`, and `retro.md`.

## Team Workflow

- **Roles:** Product Owner and Scrum Master are recorded in each sprint's `planning.md`.
- **Sync:** Weekly on Microsoft Teams, Fridays at 5 PM; contact between meetings for anything blocking.
- **Branches:** One per issue, e.g. `feature/42-description`, `fix/57-description`, `chore/63-description`.
- **Commits:** Reference the issue, e.g. `feat: add wardrobe upload (#42)`.
- **Pull requests:** Link the issue (`Closes #42`), summarize the changes, describe testing, and get a partner's review before merging. Nothing goes directly to `main`.

## HW-3 Deliverables

- [x] GitHub repository: https://github.com/aarushikaushikk/RewearAI
- [x] Scrum board, milestones, and 10+ issues with acceptance criteria: [project board](https://github.com/users/aarushikaushikk/projects/4)
- [x] Rules file: [AGENTS.md](AGENTS.md)
- [x] PRD: [docs/PRD.md](docs/PRD.md)
- [x] Before/after comparison: [ReWear_HW3_Experiment_Comparison.pdf](ReWear_HW3_Experiment_Comparison.pdf)
- [ ] Reflection: _link to be added_
- [x] Sprint 1 standups: [docs/sprints/sprint-1/standups.md](docs/sprints/sprint-1/standups.md)
