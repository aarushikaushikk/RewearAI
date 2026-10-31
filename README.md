# ReWear AI

> An intelligent stylist that creates new outfits from clothes you already own.

ReWear AI is a digital wardrobe application that helps users organize clothing they already own and generate occasion-based outfit combinations from those items, encouraging wardrobe reuse rather than new purchases.

**Team:** Aarushi Kaushik, Pranav Sirnapalli
**Course:** AI Coding, Project 2 / HW-3

## Status

Sprint 1 (HW-3) wraps up Fri Oct 30, 2026. Sprint 2 (first app features) starts Sat Oct 31.

The code currently in this repo is a **HW-3 prototype only** (see [HW-3 Rules Experiment](#hw-3-rules-experiment)). The real application hasn't been started yet.

## Core Features (planned)

- Authentication with private, user-specific wardrobe data
- Clothing image upload and AI-assisted classification (category, color, style, season, formality)
- Digital wardrobe: view, edit, search, filter, and remove items
- Availability management
- Occasion-based outfit generation (work, dinner, weekend, casual, formal)
- Alternative suggestions, saved outfits, and outfit history
- Recommendation explanations and feedback
- Graceful handling of upload, processing, and classification failures

Full requirements, the 15 user stories, and acceptance criteria are in [docs/PRD.md](docs/PRD.md).

## Repository Structure

```
RewearAI/
├── AGENTS.md                               # Rules file for AI coding tools
├── README.md
├── ReWear_HW3_Experiment_Comparison.pdf    # HW-3 before/after comparison
├── docs/
│   ├── PRD.md                              # Product requirements (15 user stories)
│   └── sprints/
│       ├── sprint-1/                       # planning.md, standups.md, retro.md
│       ├── sprint-2/
│       ├── sprint-3/
│       └── sprint-4/
├── baseline/                               # HW-3: shared starting point
├── run-a-no-rules/                         # HW-3: User Story 5 built WITHOUT rules
└── run-b-with-rules/                       # HW-3: User Story 5 built WITH rules
```

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

## Planned Tech Stack

As defined in `AGENTS.md`. The HW-3 prototypes use only Next.js, React, and TypeScript.

| Layer | Choice |
|-------|--------|
| Frontend | Next.js, React, TypeScript, Tailwind CSS |
| Backend | Next.js Route Handlers (`app/api`) |
| Database | MongoDB Atlas with Mongoose |
| Image storage | Cloudinary |
| Authentication | Auth.js / NextAuth |
| Testing | Vitest (unit/integration), Playwright (end-to-end) |
| Quality | ESLint, Prettier, TypeScript type checking |
| Hosting | Vercel |

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
