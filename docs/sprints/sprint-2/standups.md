# Sprint 2 Standups

**Sprint:** Sprint 2
**Team:** Aarushi Kaushik, Pranav Sirnapalli
**Notes:** Meeting notes recorded with Granola.

---

## Meeting 1: Sprint 1 Retro and Sprint 2 Story Assignments

**Date:** 2nd November, 2026
**Attendees:** Aarushi, Pranav

### Discussed

- **Sprint 1 retrospective:** Recorded in [Sprint 1 Retrospective](../sprint-1/retro.md).
- **Sprint 2 target:** 6 user stories, with a soft deadline of November 4th or 5th. The project is due November 12th.
- **Story assignments:**
  - **Aarushi:** User Story 2 – Clothing Upload (#7), User Story 4 – Edit and Remove Clothing (#9), User Story 5 – Search and Filter (#10), the new MongoDB setup story (#28, with #29–#31), and the landing page (#35).
  - **Pranav:** User Story 1 – Account and Sign-In (#6) and User Story 3 – Clothing Classification, the AI feature (#8).
  - Test and deploy Sprint 2 (#23) is shared.
  - Clothing upload (#7) is deferred until MongoDB is set up.
- **Deployment and testing:**
  - The project must be live (not on localhost) for 6 months, per the professor's requirement.
  - Vercel is the likely deployment option.
  - Both partners test independently.
  - A deployment task is added to each sprint board as a recurring item.

### Blockers / Concerns

- There is no agreed `design.md` yet, which blocks front-end work.
- Clothing upload is blocked until MongoDB is configured.

### Decisions

- Pranav drafts `design.md` tonight, with the account and sign-in flow as his priority area.
- A quick call tomorrow (about 10 minutes) to review and align on `design.md` before moving forward.

### Action Items

| Owner | Action |
|-------|--------|
| Pranav | Draft `design.md` and share it before tomorrow's call; focus on the account and sign-in flow. Aarushi reviews and gives input on the call |
| Aarushi | Add the MongoDB setup story to the sprint board; clothing upload is blocked until MongoDB is configured |
| Pranav | Coordinate tomorrow's meeting time via iMessage (before or after class; 10–15 minutes to align on `design.md`) |

---

## Meeting 2: Wireframe and `design.md` Walkthrough

**Date:** 3rd November, 2026
**Attendees:** Aarushi, Pranav

### Discussed

- **Wireframe and `design.md` walkthrough:** Pranav walked through `design.md` and the wireframe together. The wireframe gives context for `design.md`; it is not a separate deliverable. Pages covered:
  - Sign in and sign up, with validation, error states, and privacy behavior.
  - Homepage navigation: Home, Wardrobe, Create Outfit, Saved Outfits, History, and Account.
  - Saved vs. History: Saved is for outfits set aside for later; History is for outfits already worn.
  - Search, filter, and availability combined into one page.
  - Clothing details, edit, and availability (User Stories 4 and 6).
  - Add clothes and upload flow (User Story 2, which depends on User Story 3).
  - Uncertainty and failure recovery (User Stories 11 and 15).
  - Create Outfit: occasion and eligibility, with a wardrobe view by occasion type.
  - Saved outfits and history views.
  - Required states: authentication, classification, generation, and feedback.
- **Error handling and mandatory fields:**
  - Error and failure messages should appear on every page, not just the upload flow.
  - Delete actions need explicit confirmation.
  - Mandatory and optional fields are decided per page. Whoever implements a story defines its mandatory fields and tells the team about changes (for example, "I made style mandatory in the edit story").
- **Sprint 1 deduction:** About 2 marks (possibly 1.5) were deducted because `design.md` was missing from the Sprint 1 submission. The assignment did not explicitly require it. The pre-submission review flagged the missing file, so the reference to it in `AGENTS.md` was removed at the time. Now that `design.md` exists, it needs to be added properly.
- **Mobile and screen compatibility:** Mobile should mirror web behavior. A full Android app is out of scope. Instead, we will check responsiveness and compatibility across screen sizes.
- **Scope and priorities:**
  - User Stories 11, 12, 13, and 14 are lower priority and can be deprioritized if time is short.
  - The AI features are mandatory and need clear scope.
  - Visual design and look-and-feel are deferred until core functionality works. Tailwind CSS and React styling are easy to add later. The priority is a working end-to-end flow before any front-end polish.

### Blockers / Concerns

- The screen-size requirement in the assignment spec needs to be confirmed.
- `design.md` still needs to be merged into the repo.

### Decisions

- Error messages on every page and confirmation on every delete.
- Each story's implementer decides its mandatory fields and communicates changes.
- Responsive web only; no separate mobile app.
- End-to-end functionality comes before visual polish.

### Action Items

| Owner | Action |
|-------|--------|
| Pranav | Update the wireframe with failure messages and mandatory field indicators |
| Aarushi | Review the updated wireframe and approve the `design.md` PR |
| Pranav | Create a separate branch for all commits |
| Aarushi | Check the project proposal and share the file |
| Aarushi | Identify the mandatory AI requirements and add them to the stories |
| Aarushi | Double-check the screen-size requirement in the assignment spec |

---

## Meeting 3: Sign-In Progress, Upload Status, and Re-Scoping

**Date:** 6th November, 2026
**Attendees:** Aarushi, Pranav

### Done Since Last Meeting

- **Pranav (User Story 1 – Account and Sign-In, #6):**
  - The PR was approved this morning.
  - Email/password registration and login are complete, connected to MongoDB, with session management.
  - The Google sign-in service is complete, and a concurrency issue is resolved.
- **Aarushi:**
  - MongoDB changes finished yesterday.
  - The upload feature (#7) is complete on a local branch.

### Doing Next

- **Pranav:**
  - Routes, button testing, cloud login, and production readiness.
  - Merge the User Story 1 PR in about 2–3 hours.
  - Add the `openid-client` 6 dependency for Google OAuth. It handles Google's sign-in protocol and avoids crashes in our custom sessions. It needs no MongoDB model or `db.ts` changes, but `AGENTS.md` and the design doc must be updated to reference it.
- **Aarushi:**
  - Finish edit (#9) and filter (#10).
  - The landing page is not covered by any story yet. Add a story for it, build it on a separate branch, and get it approved.
  - Raise the upload PR after the landing page is approved and Pranav's code is merged.

### Blockers / Concerns

- We are both still on User Story 1 after about 2 days of work, which is longer than expected.
- The AI feature scope probably needs to be reduced.
- Pranav is already hitting AI tool token limits.

### Decisions

- Re-scope the project, including the AI feature, at the next meeting once the picture is clearer.
- **Project 3:** We will work together again as a team of 2, to avoid a larger workload. Aarushi suggested a stock market or trading app. It may be too large, so we will evaluate the scope before committing. The Project 3 proposal starts after Project 2 wraps up.

### Action Items

| Owner | Action |
|-------|--------|
| Aarushi | Submit the P2 proposal by November 7th and send it to Pranav. Each person submits individually to avoid point allocation issues |
| Aarushi | Review Pranav's User Story 1 PR when it arrives (in about 2 hours) |
| Aarushi | Create the landing page story and branch, get it approved, then raise the upload flow PR |
| Aarushi, Pranav | Meet Saturday or Sunday morning to re-scope the project, including the AI feature |
