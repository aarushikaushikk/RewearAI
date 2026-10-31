# AGENTS.md

## 1. Project Context and Sources of Truth

ReWear AI — An Intelligent Digital Wardrobe helps users organize clothing they already own and discover occasion-based outfits.
The product is private by default and must never recommend clothing the user has not saved.
The approved scope is defined by the team's 15 frozen user stories; do not invent additional features.
Do not add a separate chatbot or unrelated AI feature just because the product name includes AI.

Read these references before implementing a feature:
- `docs/PRD.md`: problem, users, 15 user stories, acceptance criteria, data needs, and scope.
- The assigned GitHub Issue: specific task, owner, sprint, and acceptance checklist.
If the documents disagree, identify the conflict and ask the team before implementing.
Do not edit product requirements or design decisions just to make generated code fit.

## 2. Approved Technology Stack

- Frontend: Next.js, React, TypeScript, Tailwind CSS.
- Backend: Next.js Route Handlers (`app/api`); no separate Express server.
- Database: MongoDB Atlas using Mongoose.
- Image storage: Cloudinary; MongoDB stores the image URL/public ID and metadata.
- Authentication: Auth.js / NextAuth, configured for the selected account flow.
- Tests: Vitest (unit/integration) and Playwright (end-to-end).
- Quality: ESLint, Prettier, and TypeScript type checking.
- Hosting: Vercel for the app, MongoDB Atlas for data, Cloudinary for images.

### Versions

Baseline versions, taken from the HW-3 prototype `package.json`:

| Package | Version |
|---------|---------|
| Next.js / `eslint-config-next` | 16.4.3 |
| React / React DOM | 19.3.0 |
| TypeScript | 5.x |
| Tailwind CSS | 4.x |
| ESLint | 9.x |
| Node.js | 20.9 or later (minimum for Next.js 16) |

Use stable, mutually compatible versions verified during repository initialization.
Follow versions recorded in the lockfile; do not automatically upgrade packages mid-task.
Ask both partners before adding a major dependency or changing an approved service.

## 3. Repository and Architecture

Use one Next.js repository with clear boundaries between UI, server logic, and persistence.
Suggested locations (adapt to the actual initialized repository):
- `src/app/`: pages, layouts, and Route Handlers.
- `src/components/`: reusable presentational and interactive React components.
- `src/lib/`: server helpers, auth, database connection, and shared utilities.
- `src/models/`: Mongoose models and schema definitions.
- `src/services/`: domain rules, outfit selection, and image operations.
- `src/types/`: shared domain types and API response types.
- `tests/` and/or colocated `*.test.ts(x)`: unit/integration tests.
- `e2e/`: Playwright scenarios; `docs/`: PRD, design, and architecture notes.
Never import database models, credentials, or server-only modules into client components.
Keep API handlers thin: authenticate, validate, call service, and return a consistent response.
Put outfit eligibility and other reusable business rules in testable services.

## 4. Naming and Coding Conventions

Use TypeScript for all application code; prefer explicit domain types over `any`.
Use functional React components and hooks; do not introduce class components.
- React component/type names and component files: `PascalCase` (e.g., `WardrobeGrid.tsx`).
- Variables, functions, hooks, and service files: `camelCase` (e.g., `getAvailableItems.ts`).
- Route URLs: lowercase, descriptive segments; keep API names consistent.
- Environment variables: `UPPER_SNAKE_CASE`; secrets are server-only.
Prefer small, focused functions, descriptive names, and `async/await`.
Use shared types for wardrobe items, outfits, and API payloads when appropriate.
Handle null, empty, loading, and failed states explicitly; avoid silent fallbacks.
Do not duplicate business rules, leave dead code, or reformat unrelated files.

## 5. Core Product Invariants

Every wardrobe item, outfit, history record, and feedback entry belongs to one user.
Users may only view or modify their own private records.
Only currently available, saved wardrobe items can appear in new outfit suggestions.
Never fabricate clothing items, image URLs, or attributes to complete an outfit.
If an occasion lacks suitable items, explain why instead of returning an invalid outfit.
When alternatives exist, avoid returning the identical combination repeatedly.
Let users review and correct clothing metadata before finalizing an item.
Do not silently replace user-confirmed metadata with uncertain classification output.
Support search/filter, availability changes, saved outfits, and outfit history per the PRD.
Preserve saved data across sessions and handle removed items without breaking the UI.
Recommendation explanations must refer to actual item metadata and chosen occasion.
Feedback is user-controlled; do not claim that preferences are learned unless implemented.

## 6. Database and Image Handling

Use Mongoose models and a reusable MongoDB connection helper.
Model core records such as User, WardrobeItem, Outfit, OutfitHistory, and Feedback.
Include ownership, timestamps, and stable IDs where needed.
Validate required fields and allowed values before persisting records.
Scope database queries to the authenticated user, not a user ID supplied by the client.
Store clothing photos in Cloudinary, not as raw binary fields in MongoDB.
Persist Cloudinary identifiers to support authorized deletion or replacement.
Validate image format and size before upload; reject unsupported files clearly.
Avoid partially saved wardrobe records if an upload or database operation fails.
Do not create duplicate records when the user retries a failed request.

## 7. Authentication, Privacy, and Security

Protect private pages and API endpoints with server-side authentication checks.
Check record ownership on every private read, update, and delete operation.
Do not assume a hidden button or client-side check provides authorization.
Never commit `.env` files, database credentials, API keys, or auth secrets.
Use environment variables and document required variable names in `.env.example`.
Do not log access tokens, passwords, secrets, or private user images.
Return safe error messages; do not expose stack traces or internal database details.
Treat uploaded content and request payloads as untrusted input.
Keep public API documentation separate from private user data access.

## 8. UI, Mockups, and Accessibility

Follow `docs/DESIGN.md` and approved mockups; do not invent a competing visual system.
Use clothing images as the visual focus of wardrobe and outfit screens.
Maintain responsive layouts for desktop and mobile widths.
Use accessible labels, keyboard navigation, visible focus, and readable contrast.
Provide meaningful image alt text and accessible action names.
Show loading, empty, success, validation, and failure states where relevant.
Preserve user input when a recoverable upload or save error occurs.

## 9. Scrum, Branching, and Pull Requests

Start each task from an assigned GitHub Issue with acceptance criteria and a sprint milestone.
Keep the Project board states: Backlog, Sprint Todo, In Progress, In Review, Done.
Create one branch per issue: `feature/42-description`, `fix/57-description`, or `chore/63-description`.
Never push feature work directly to `main` or combine unrelated tasks in one PR.
Use clear commits such as `feat: add wardrobe upload (#42)`.
Each PR must link the issue (`Closes #42`), summarize changes, and describe testing.
A partner reviews the PR before merge; address review comments and pass required checks.
Both partners should contribute meaningful commits and at least five PR reviews each for P2.
Document sprint planning, at least three standups per partner per sprint, and retrospectives.
Use retrospectives to turn recurring agent mistakes into concrete, reviewed rules.

## 10. TDD and Quality Gates

For new behavior, follow red-green-refactor whenever applicable.
Write a meaningful failing test tied to acceptance criteria and confirm why it fails.
Commit failing-test evidence before implementing the behavior when required by the course.
Implement the smallest change that makes the test pass; then refactor and rerun tests.
Use Vitest for domain logic and API integration; Playwright for user journeys.
Test success, empty, invalid, unauthorized, and failure cases where relevant.
Prioritize auth isolation, uploads, wardrobe CRUD, filters, outfit eligibility, and history.
Before PR review, run relevant tests, lint, format checks, and TypeScript checks.

## 11. CI/CD, Documentation, and Deployment

Run automated checks on every PR with a multi-stage GitHub Actions pipeline.
Include dependency/security scanning and preview deployment checks where configured.
Deploy to Vercel with production MongoDB Atlas and Cloudinary credentials securely set.
Verify sign-in, data persistence, image upload, and outfit flows on the deployed URL.
Document API endpoints using OpenAPI/Swagger, including auth and response schemas.
Keep README setup, environment variables, test commands, and deployment steps current.

## 12. Agent Working Method

Read the relevant issue, PRD criteria, design reference, and existing code first.
For broad changes, propose a brief plan and wait for approval before editing many files.
Do not install packages, change schema design, or alter architecture without explanation.
Make the smallest coherent change and report files changed, tests run, and open risks.
If information is missing, state the assumption or ask instead of inventing requirements.
Only revise this file with partner agreement and a concrete lesson from implementation.
