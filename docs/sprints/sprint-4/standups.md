# Sprint 4 Standups

**Sprint:** Sprint 4
**Team:** Aarushi Kaushik, Pranav Sirnapalli
**Notes:** Meeting notes recorded with Granola.

---

## Meeting 1: Project Status, CI/CD, and Deliverables Review

**Date:** 13th November, 2026
**Attendees:** Aarushi, Pranav

### Done Since Last Meeting

- **Aarushi:** Raised 4 PRs from last night's work: Alternative Outfit Suggestions (#49), Recommendation Explanation (#52), Recommendation Feedback (#53), and Failure Recovery (#54). None merged yet.
- **Both:** 14–15 of the 15 user stories are complete.
- The multi-stage CI/CD pipeline (preview deploy, tests, run on every PR) is in place.

### Doing Next

- **Pranav:** Review and merge the 4 open PRs after the call, then take a portion of the documentation (everything except the database schema).
- **Aarushi:** Update the sprint notes, write the database schema documentation, and finish the remaining docs after 4 PM Saturday.
- **Both:** Use the AI harness to draft the docs, then each review our own half.

### Blockers / Concerns

- The AI outfit combination feature is not implemented.
- Preview and production deploys share the same account. A suggested fix using 2 separate accounts was too verbose, so the decision is deferred.
- The pipeline was not set up from day one, which will likely cost a few marks (we expect about 24/30 for the pipeline).

### Decisions

- Skip the AI outfit combination feature because of time, and note it in the reflection as scoped but not completed.
- **Deliverables review:**
  - Functionality (45 marks): authentication, features, and API.
  - Code quality, architecture, and TDD (60 marks): both of us feel confident here.
  - AI mastery: evidence in the repo, including AI-generated `test.md`, shared rule files, and context engineering.
  - Documentation (15 marks): README, API docs, architecture diagram, database schema, setup and deployment guide, sprint retrospectives, and the partner contribution log.
  - Demo video: 10 minutes, walking through the architecture and database schema, then the create account and sign-in flows.
  - Individual 300-word reflection: a separate submission for each partner.
- **Schedule:** Check-in call Saturday at about 7 PM, demo recording Sunday morning (leaving time to edit the video and write reflections), and everything wrapped up by Sunday afternoon at the latest.

### Action Items

| Owner | Action |
|-------|--------|
| Pranav | Merge the 4 open PRs (all open and ready in the pull requests tab) |
| Aarushi | Update the sprint notes and take the database schema and remaining docs after 4 PM Saturday |
| Pranav | Confirm which docs he is covering |
| Aarushi, Pranav | Record the 10-minute demo video Sunday morning: architecture, database schema, then app flows |

---

## Meeting 2: Production Deployment and Google Sign-In Fix

**Date:** 14th November, 2026
**Attendees:** Aarushi, Pranav

### Done Since Last Meeting

- `main` is deployed to Vercel through the GitHub Actions CI/CD pipeline (#47). Early bot-flagged CI issues did not block the production deploy, and the latest workflow passed cleanly after a redeploy.
- The 4 open PRs from Meeting 1 are merged.

### Discussed

- **Google sign-in in production:**
  - Google sign-in was missing in production because `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` were not set in Vercel.
  - Pranav found the saved OAuth client, and we added both variables to the Vercel production environment.
  - Sign-in still failed after the redeploy because the production callback URL was not an authorized redirect URI in Google Cloud Console. We added it under Authorized Redirect URIs (not JavaScript Origins), and Google sign-in then worked on Aarushi's account.
- **Known bugs we will not fix before submission:**
  - Image deletion bug.
  - Slow loading on the sign-up page.
  - Sign-out occasionally unresponsive (to monitor during recording).

### Blockers / Concerns

- The intermittent sign-out issue could show up during the demo recording.

### Decisions

- The known bugs are not worth fixing before the recording; the submission does not require photo evidence.
- Record the demo on November 15th at 10 AM (Aarushi's time) / 12 PM (Pranav's time), wrapping up by 12 PM Pranav's time because of his 3 PM commitment.
- Video flow: (1) deployment overview, (2) architecture diagram (Pranav), (3) database schema (Aarushi), (4) app demo.
- Remaining deliverables: the video, meeting minutes (Aarushi drafts, Pranav reviews), and individual reflections.

### Action Items

| Owner | Action |
|-------|--------|
| Aarushi | Draft the video recording flow and script tonight and send it to Pranav to review before the 10 AM call |
| Aarushi, Pranav | Record the demo video on November 15th at 10 AM (Aarushi's time) |
| Aarushi | Continue drafting the meeting minutes; Pranav reviews and approves after his afternoon commitment |

---

## Meeting 3: Demo Recording Session

**Date:** 15th November, 2026
**Attendees:** Aarushi, Pranav

### Done Since Last Meeting

- Recorded the demo video, covering:
  - **Overview:** ReWear AI organizes clothes the user owns and generates occasion-based outfits. It is private by default and never invents items.
  - **Architecture:** a single Next.js app (React, TypeScript, Tailwind) with thin API handlers and business logic in services; MongoDB Atlas with Mongoose models for users, sessions, wardrobe items, outfits, history, and feedback; and Cloudinary for images, with MongoDB storing only the URL, Cloudinary ID, and clothing details.
  - **Features:** Google and email/password sign-in; adding clothing with AI-suggested attributes and "needs review" flags; My Wardrobe search, filters, delete, and availability; Create Outfit with color ranking, explanations, "Try another", and missing-item messages; feedback; Saved Outfits; and Outfit History.
  - **Testing and process:** about 2,100 unit and integration tests and about 460 database tests on a temporary MongoDB with a fake Google sign-in; failing tests committed first; 15 user stories as GitHub issues, each with its own branch and partner-reviewed PR; and agent mistakes turned into new rules in `AGENTS.md`.
  - **AI harnesses:** Cursor and Windsurf (AI-native VS Code forks with OpenAI-compatible API key support), Cline for DeepSeek API support, and `AGENTS.md` governing the stack, privacy rules, and process. OpenHands (a self-hosted multi-agent Docker sandbox) is a possible future experiment.
  - **Retrospective:** see the [Sprint 4 Retrospective](retro.md).

### Discussed

- **Recording session:**
  - We did several practice runs; Aarushi controlled the screen throughout.
  - Early script confusion: Aarushi had a lines-only version, so we switched to the full shared script.
  - The first attempt was interrupted and restarted. The second ran about 8 minutes 18 seconds, short of the 10-minute target, so a third take added the create-account flow and the harness and retrospective segment.
  - We used casual outfit generation in the demo instead of formal, because of a color and item mismatch.

### Decisions

- Edit the best segments of the takes into one final video, using the cleaner earlier recording as the base and splicing in the harness and retrospective segment from the last take.

### Action Items

| Owner | Action |
|-------|--------|
| Aarushi | Edit and merge the recordings into the final video |
| Aarushi | Check Zoom cloud for the recording files; re-record on Teams if they are missing |
| Aarushi | Send the edited video to Pranav for upload |
| Aarushi | Raise a PR with the Scrum meeting minutes and remaining Canvas uploads |
| Pranav | Review and approve that PR |
| Aarushi, Pranav | Complete the individual 300-word reflections; check Canvas for any separate upload requirements |
