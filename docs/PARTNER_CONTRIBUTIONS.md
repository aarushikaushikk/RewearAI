# Partner Contribution Log

**Project:** ReWear AI — An Intelligent Digital Wardrobe
**Team:** Aarushi Kaushik (`aarushikaushikk`), Pranav Sirnapalli (`pranav-sirnapalli`)
**Sources:** GitHub issues, pull requests, reviews, and commit history on `main` (as of November 15, 2026), plus the meeting notes in [docs/sprints/](sprints).

## Summary

| | Aarushi | Pranav |
|---|---|---|
| User stories delivered | 8 (US2, US4, US5, US8, US9, US13, US14, US15) | 7 (US1, US3, US6, US7, US10, US11, US12) |
| PRs merged | 14 | 15 |
| PRs reviewed and approved | 11 | 9 |
| Non-merge commits on `main` | 101 | 67 |

Every user story had its own GitHub issue with acceptance criteria, its own branch, and a PR. Each partner reviewed the other's feature PRs before merge.

## Aarushi Kaushik

### Sprint 1 — HW-3 setup
- Created the GitHub repository, project board, milestones, labels, and the issues with acceptance criteria.
- Restructured the repository with a `docs/` folder, wrote the README for the rules experiment, and wrote the HW-3 reflection and tested the user story as well.
- Reviewed the `AGENTS.md` rules file and the PRD, and set up the Scrum meeting minutes folder.

### Sprint 2 — Data layer and wardrobe
- **MongoDB setup (#28–#31, PR #32):** MongoDB Atlas connection helper and Mongoose models for users, sessions, accounts, wardrobe items, outfits, outfit history, and feedback.
- **Landing page (#35, PR #36):** signed-in Home at `/home`, matching the wireframe.
- **US2 Clothing Upload (#7, PR #37):** Cloudinary upload, image validation, preview, retry, drag-and-drop, and daily cleanup of abandoned uploads.
- **US4 Edit and Remove Clothing (#9, PR #38):** view, edit, and delete clothing items.
- **US5 Search and Filter (#10, PR #40):** search and category, color, season, and formality filters.

### Sprint 3 — Outfits
- **US9 Saved Outfits (#14, PR #44):** save, view, and remove outfits, with a missing-item state when a saved item is deleted.
- **US8 Alternative Outfit Suggestions (#13, PRs #45 and #49):** "Try another", which returns combinations not already shown.

### Sprint 4 — Recommendations, reliability, and delivery
- **US13 Recommendation Explanation (#18, PR #52):** color-aware outfit ranking and explanations grounded in item metadata and the occasion.
- **US14 Recommendation Feedback (#19, PR #53):** helpful / not helpful feedback that the user can clear.
- **US15 Failure Recovery (#20, PR #54):** recovery when an upload or save fails, including re-uploading a missing photo.
- **CI/CD pipeline (#46, PR #47):** multi-stage GitHub Actions pipeline with lint, type checks, tests, security scanning, and Vercel preview and production deploys.
- **Documentation (#55, PR #56):** setup and deployment guide, database schema, and CI/CD docs in the README.
- **Scrum records (PR #66):** sprint planning, standups, and retrospectives.

## Pranav Sirnapalli

### Sprint 1 — HW-3 setup
- Wrote the approved PRD (PR #22) and the `AGENTS.md` rules file (PR #21).
- Ran the with/without-rules experiment (Run A and Run B) on the User Story 5 prototype and wrote the before/after comparison.
- Restructured the repository with a docs/ folder, wrote the README for the rules experiment, and wrote the HW-3 reflection and tested the user story as well.

### Sprint 2 — Foundation, sign-in, and AI classification
- **Design spec and wireframes (PR #26):** `docs/DESIGN.md` and the wireframes for every page and state.
- **Next.js foundation (PR #27):** initial Project 2 application setup.
- **US1 Account and Sign-In (#6, PR #33):** email/password registration and login with bcrypt, hashed session tokens, and Google sign-in with `openid-client`.
- **US3 Clothing Classification (#8, PR #34):** AI clothing classification that suggests category, color, style, season, and formality.

### Sprint 3 — Availability and outfit generation
- **US6 Update Availability (#11, PR #41):** mark items available or unavailable.
- **US7 Occasion-Based Outfit Generation (#12, PR #39):** outfits built only from available items that suit the chosen occasion.

### Sprint 4 — Uncertainty, history, and documentation
- **US11 Classification Uncertainty (#16, PR #42):** low-confidence fields flagged as "needs review" until the user confirms them.
- **US12 Insufficient Wardrobe Items (#17, PR #43):** explains what is missing when an outfit can't be made.
- **US10 Outfit History (#15, PR #48):** mark outfits as worn, with history listed newest first.
- **API documentation (PR #57):** OpenAPI 3.1 specification and API guide.
- **Architecture (PR #58):** system architecture diagram and overview.
- **README (PR #59):** features, tech stack, and testing sections.
- **Smoke tests (PR #65):** more reliable Chrome startup in the browser smoke tests.
- Set up Google OAuth in production (Vercel environment variables and the authorized redirect URI) and presented the architecture, AI harness, and retrospective segments of the demo video.

## Shared Work

- Sprint planning, standups, and retrospectives (see [docs/sprints/](sprints)).
- Production deployment to Vercel and end-to-end testing together.
- Choosing and trying AI harnesses (Cursor, Windsurf, and Cline with DeepSeek) under the shared `AGENTS.md` rules.
- Demo video planning and recording.
- Individual reflections, written separately.
