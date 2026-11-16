# Sprint 3 Standups

**Sprint:** Sprint 3
**Team:** Aarushi Kaushik, Pranav Sirnapalli
**Notes:** Meeting notes recorded with Granola.

---

## Meeting 1: Sprint 3 Kickoff, Story Progress, and Deployment Plan

**Date:** 9th November, 2026
**Attendees:** Aarushi, Pranav

### Done Since Last Meeting

- **Aarushi:**
  - User Story 4 – Edit and Remove Clothing (#9) is done and merged.
  - User Story 5 – Search and Filter (#10) is mostly done; some code is still local.
- **Pranav:**
  - User Story 7 – Occasion-Based Outfit Generation (#12) is done. The merge is on hold until User Story 6 is complete, because #12 depends on it.

### Doing Next

- **Aarushi:**
  - Clean up the local User Story 5 code and raise its PR.
  - User Story 8 – Alternative Outfit Suggestions (#13), the AI feature.
  - User Story 9 – Saved Outfits (#14).
  - Keep the project board up to date.
- **Pranav:**
  - Finish User Story 6 – Update Availability (#11) today, or tomorrow at the latest.
  - Merge User Story 7 once User Story 6 is in.

### Blockers / Concerns

- Sprint 2 is not closed yet, so Sprint 2 and Sprint 3 work overlap.
- User Story 7 cannot merge until User Story 6 is complete.

### Decisions

- The project deadline is extended to November 16th (from November 15th).
- Sprint 3 starts on November 8th.
- Aarushi owns keeping the project board current.
- Completing all 15 user stories by the end of Sprint 4 looks achievable.

### Action Items

| Owner | Action |
|-------|--------|
| Aarushi | Clean up local code to confirm what's complete, then raise the User Story 5 PR |
| Pranav | Finish User Story 6, then merge User Story 7 |
| Aarushi, Pranav | Meet tomorrow at 2:30 PM Pranav's time (1:30 PM Aarushi's time) to deploy to Vercel and test together, closing the Sprint 2 test and deploy task (#23) |

---

## Meeting 2: Merge Order and PR Handoff

**Date:** 11th November, 2026
**Attendees:** Aarushi, Pranav
**Notes:** Coordinated over Slack during the day, followed by an evening Zoom call.

### Done Since Last Meeting

- **Pranav:** PRs ready for User Story 6 – Update Availability (#41), User Story 7 – Occasion-Based Outfit Generation (#39), and User Story 11 – Classification Uncertainty (#42).
- **Aarushi:** Pushed the two PRs for the remaining Sprint 3 stories: User Story 9 – Saved Outfits (#44) and User Story 8 – Alternative Outfit Suggestions (#45).

### Doing Next

- **Aarushi:** Merge Pranav's PRs in the agreed order.
- **Pranav:** Set up the local environment and test the app end to end.

### Blockers / Concerns

- User Story 7 depends on the availability functionality from User Story 6, so merging out of order could break integration.
- Pranav needed the local environment configuration before he could test.
- The evening call moved to 10:10 PM (Pranav's time) because of a train delay.

### Decisions

- Merge order: #41 (User Story 6) first, then #39 (User Story 7), and #42 (User Story 11) last, since #42 is mostly independent.

### Action Items

| Owner | Action |
|-------|--------|
| Aarushi | Merge #41, then #39, then #42 |
| Aarushi | Share the local environment setup with Pranav so he can test |
| Pranav | Review Aarushi's Saved Outfits and Alternative Outfit Suggestions PRs |
