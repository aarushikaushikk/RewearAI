# Sprint 1 Standups

**Sprint:** Sprint 1 (HW-3)
**Team:** Aarushi Kaushik, Pranav Sirnapalli
**Notes:** Meeting notes recorded with Granola; transcript links are included with each entry.

---

## Meeting 1: Project Idea Selection and HW-3 Planning

**Date:** 25th October, 2026
**Attendees:** Aarushi, Pranav

### Discussed

- **Project idea:** Settled on **ReWear AI**, an AI wardrobe stylist that suggests outfits from clothes the user already owns, using image recognition.
  - Strong CV appeal: touches image recognition, storage, and trend tracking.
  - Simple pitch: "I own too many clothes and still don't know what to wear."
  - Runner-up: DayQuest AI, a personalized experience planner based on location, budget, and time.
  - Ruled out as too common: decision-making assistant, meal planning, interview prep.
- **Technical scope:**
  - Image recognition for clothing uploads.
  - MongoDB (or similar) for wardrobe and outfit history.
  - Track previously suggested trends to avoid repetition.
  - Pinterest image dataset as a fallback if a large training set is needed.
- **HW-3 requirements:** Due Friday, Oct 30. Deliverables are the GitHub repo, rules file, PRD, mockups, reflection, at least 10 GitHub issues, and screenshots of code with and without rules.
- **PRD plan:** Each person drafts a PRD separately, then we merge the best points into one final document.
- **Proposed starter issues:** Create PRD; set up GitHub repo and board; install Antigravity; define database structure.

### Blockers / Concerns

- HW-3 prerequisites reference a Project 1 PRD, but our topic has changed entirely.
- The screenshots / implementation requirement may not be feasible within scope.

### Decisions

- Project: ReWear AI.

### Schedule

- Aarushi is unavailable Wednesday (festival) and will pick up work Wednesday late evening.
- Pranav leaves Friday by 7 PM ET (travelling to North Carolina).
- Plan: Pranav finishes his portion by 7 PM Friday; Aarushi reviews, finalizes, and submits for both.

### Action Items

| Owner | Action |
|-------|--------|
| Aarushi, Pranav | Draft separate PRDs, then merge into one final PRD before Fri Oct 30 |
| Aarushi, Pranav | Message the professor tomorrow morning about the conflicting HW-3 prerequisites; ask for clarification or an extension |
| Pranav | Review the last 3 class recordings (transcripts via ChatGPT) for any HW-3 / Project 2 clarifications |
| Aarushi, Pranav | Meet tomorrow to align on the merged PRD and task split |


---

## Meeting 2: Team Setup and Working Agreement

**Date:** 26th October, 2026
**Attendees:** Aarushi, Pranav

### Discussed

- **Communication:** Weekly meetings on Microsoft Teams, every Friday at 5 PM. Emergency contact is allowed between meetings.
- **Conflict resolution:** Talk it through and negotiate openly.
- **GitHub:** Repository created on Aarushi's account and shared. Pranav accepted the invite after a login fix.
- **Project tracking:** Project board to be set up on the same repo, mirroring the AI Coding class setup.
- **Scoping approach:** Use Claude or ChatGPT to generate a full task list and proposal from the scope discussion, review it together, then divide tasks.
- **Dependencies:** The board should make blockers visible so no one is waiting unknowingly.

### Blockers / Concerns

- None blocking. 

### Decisions

- Action items and responsibilities are assigned only after scope is defined.

### Action Items

| Owner | Action |
|-------|--------|
| Aarushi | Set up the GitHub project board on the shared repo (mirror the AI Coding class structure) before call |
| Aarushi, Pranav | Run the Friday 5 PM scope session: brainstorm scope, feed it to AI, review and divide tasks |

**Transcript:** https://notes.granola.ai/t/aaa30ef7-4042-474d-a2b3-e31687edc789

---

## Meeting 3: Rules Experiment Results and Work Split

**Date:** 29th October, 2026
**Attendees:** Aarushi, Pranav

### Done Since Last Meeting

- **Pranav:** Completed the before/after rules comparison using **User Story 5 (Search and Filter)** in VS Code with Claude Code, on a 12-item dummy dataset.
  - Run A: baseline, without the PRD and `AGENTS.md`.
  - Run B: with the PRD and `AGENTS.md`, same Claude prompt.


### Decisions

- Submission likely a group submission. It includes the repo link, task board, before/after comparison with screenshots, and a reflection showing what worked plus evidence of iteration and refinement.
- The professor flagged caution around AI features. We're at the maximum of 15 user stories, but implementing about 10 of 15 is still gradeable.

### Action Items

| Owner | Action |
|-------|--------|
| Aarushi | Review the `AGENTS.md` PDF and PRD tonight and flag changes so Pranav can edit them |
| Aarushi | Create the GitHub repo and push Pranav's code files |
| Aarushi | Set up the Scrum board with 10+ issues, acceptance criteria, labels, and milestones |
| Aarushi | Write the full project reflection |
| Pranav | Write the Run A / Run B before/after section; finalize the PRD and `AGENTS.md` |
| Pranav | Push the PRD, `AGENTS.md`, code, and before/after doc to GitHub or Slack by 7 PM on Oct 30 |


---

## Meeting 4: Pull Requests, Sprint Board, and Submission Check

**Date:** 30th October, 2026
**Attendees:** Aarushi, Pranav

### Done Since Last Meeting

- Pranav accepted the GitHub repo invite.
- Comparison doc pushed to `main` (accidentally, directly). A second doc was opened as a pull request with Aarushi as reviewer, and Aarushi approved and merged it during the call.
- Sprint 1 updated to contain the HW-3 tasks, which count as project work.
- Tasks assigned to Pranav on the board.

### Discussed

- **Class recap:** Both found today's lecture hard to follow. Pranav's workaround is to paste the transcript into ChatGPT after class for key points.
- **Sprint board:** User Story 5 stays as the HW-3 experiment feature. Statuses will be updated gradually to reflect a realistic timeline.
- **Repo structure:** Restructure with a `docs/` folder per the professor's instructions. The README should document both runs: baseline (12-item dummy dataset, `localhost:3000`, no rules) and the rules-based run.
- **Rules file contents:** Project context, PRD references, Scrum workflow instructions, and do's and don'ts.
- **Deliverables checklist:** GitHub repo link, rules file, before/after comparison, reflection, and a project board with milestones, due dates, and 10+ issues with acceptance criteria.

### Blockers / Concerns

- AI harness: no strict tool requirement confirmed. Pranav uses VS Code with Claude (personal and college accounts), switching when tokens run out. It's unclear whether a Gemini account is required; classmates are using Cursor and other tools.
- Sprint call evidence isn't explicitly required in the HW-3 rubric, but the professor mentions it often.

### Decisions

- Create a Scrum meeting minutes folder in the repo and store all transcripts there as a precaution.
- Aarushi owns task status updates on the Scrum board going forward.

### Action Items

| Owner | Action |
|-------|--------|
| Pranav | Open the PRD as a pull request |
| Aarushi | Approve Pranav's PRD pull request |
| Aarushi | Restructure the repo with a `docs/` folder and update the README (baseline and rules-run documentation) |
| Aarushi | Create a Scrum meeting minutes folder in the repo |
| Aarushi | Run the rules test independently and compare before/after with Pranav's results |
| Aarushi | Double-check all documents against the rubric before submitting (do's and don'ts, acceptance criteria, all deliverables) |
