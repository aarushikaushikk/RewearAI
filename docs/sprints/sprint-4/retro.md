# Sprint 4 Retrospective

**Date:** 15th November, 2026
**Attendees:** Aarushi, Pranav
**Notes:** Held during the demo recording session (Sprint 4 Meeting 3). Recorded with Granola.

## What went well

- The app is deployed to Vercel through a multi-stage GitHub Actions pipeline that runs on every PR.
- Google sign-in was fixed in production once the environment variables and redirect URI were set.
- Strong test coverage: about 2,100 unit and integration tests and about 460 database tests, written test-first.
- Every user story had its own branch and a partner-reviewed PR, and agent mistakes became new rules in `AGENTS.md`.
- The demo video was recorded on schedule.

## What didn't go well

- We split user stories by skill, but some stories depended on each other, so Aarushi was blocked on Pranav's work at times, and the other way around.
- The CI/CD pipeline was not set up from day one.
- The AI outfit combination feature was not implemented because of time.
- Production configuration (Google OAuth variables and redirect URI) was only set up at the end.
- Known bugs remain: image deletion, slow sign-up page, and an occasionally unresponsive sign-out.
- The recording needed several takes, and the second take ran short of the 10-minute target.

## Action items

| Owner | Action |
|-------|--------|
| Aarushi, Pranav | In Project 3, give stories that touch the same files or part of the architecture to one person |
| Aarushi, Pranav | Set up the CI/CD pipeline and production environment variables at the start of Project 3 |
| Aarushi, Pranav | Note the unfinished AI outfit combination feature in our reflections |
