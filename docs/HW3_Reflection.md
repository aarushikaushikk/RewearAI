# HW-3 Reflection: ReWear AI

**Team:** Aarushi Kaushik, Pranav Sirnapalli
**Date:** October 30, 2026

## 1. How our rules file bridges the PRD and mockups to implementation

Our PRD describes *what* ReWear AI must do: 15 user stories, each with acceptance criteria, plus the data model, occasion categories, and privacy rules. On its own, though, an AI coding assistant reading a feature request has no way of knowing those decisions exist. `AGENTS.md` is the bridge. Before any code is written, it tells the agent where the sources of truth are (`docs/PRD.md`, the design document, and the assigned GitHub Issue) and asks it to raise any conflict between them instead of guessing.

The rules file also turns product requirements into implementation constraints. The PRD says recommendations must only use clothing the user owns and has marked available. `AGENTS.md` repeats this as a product invariant the code must never break, and also says where that logic belongs (testable services rather than UI components). The same pattern applies to privacy (server-side authorization, never trusting a hidden button), failure handling (no partial or duplicate wardrobe records on retry), and UI behavior (loading, empty, success, and failure states; accessible labels; responsive layouts). It also pins the approved stack, the folder structure, naming conventions, and a test-first workflow, so every feature is built the same way regardless of which of us, or which AI session, writes it.

`AGENTS.md` also refers to a `docs/DESIGN.md` for mockups and visual rules, which isn't in place yet, and that's intentional. The HW-3 work was a prototype: a hardcoded sample wardrobe of 12 clothing items, built only to test whether our rules change the AI's output. A design document wasn't needed for HW-3, so the agent relied on the PRD's screen list and the UI rules in `AGENTS.md`. We'll create `docs/DESIGN.md` later, when the main project needs it.

## 2. Testing the rules: what the experiment showed

After running a controlled before/after experiment on **User Story 5 (Search and Filter)** as a throwaway prototype on a 12-item sample wardrobe. Both runs used Claude Code (Opus 5.5) and started from the same Next.js baseline with an identical feature prompt. Run A had no rules or PRD; Run B read the 150-line `AGENTS.md` and `docs/PRD.md` first.

**What worked.** Both runs passed the same five manual browser checks (search, single filter, combined filters, no-match, and clear filters), so the rules didn't make the feature "more working." The real difference was development discipline and attention to edge cases. Run B wrote a test file *before* the implementation, saw it fail as expected, then built the service and ended with 12 passing automated tests across three suites. Run A produced no reusable tests. Run B also followed the architecture in our rules more closely: it put filtering logic in `services/`, split out a separate `ClothingCard` component, generated filter options from the data, and added an explicit empty-wardrobe state plus a "clear filters" recovery action on the no-results screen. These are exactly the empty and failure states `AGENTS.md` asks for, which suggests the agent understood the intent behind the PRD rather than just the literal prompt.

**What didn't work, or wasn't conclusive.** Run A was not a poor implementation. It already had responsive cards, labeled filters, a result count, and a no-match message. Run B also departed from our planned tooling by using Node's built-in test runner instead of Vitest, which showed that the rules weren't specific enough to stop that. The two runs also handled "All-season" items differently, and our user story doesn't say which behavior is correct. Finally, because Run B received the rules *and* the PRD together, we can't tell which one caused the improvements.

**What we're changing.** Based on these results, we've identified three refinements to `AGENTS.md`:

1. Specify a minimum test matrix per feature (for User Story 5: search, each filter, combined filters, reset, no results, and empty wardrobe).
2. State clearly that Vitest is required, rather than any test runner.
3. Resolve the "All-season" matching rule in the PRD first, then reflect it in the rules.

We're also adding the missing pieces we noticed while reviewing the file against the rubric: descriptions of key UI components, the main user flow, and test coverage goals. We're treating these as reviewed team decisions, changed through a pull request, not silent edits.

## 3. How Scrum on GitHub organized our AI-assisted development

Planning this project was very simple. From the start, each of us had a clear idea of what was required and which tasks were ours, and we coordinated whenever one person's work depended on the other's. 

The GitHub Project board summarizes every task with its acceptance criteria, labels, estimate, and sprint. We treat it as a contract the two of us have already agreed on. If something needs to change, we take a quick call and update the acceptance criteria together as the project moves forward. We may need to revisit some items because of time constraints, and having the agreed criteria written down makes those conversations easy.

Our Scrum calls are short, usually a 10-minute check-in. we share our updates, we decide on the next tasks, and we wrap up. These regular check-ins always tell us where we stand, and they've been informative and fun rather than a burden. We record the meetings as standup notes in the repository.

This structure also fits AI-assisted development well. Each GitHub Issue gives the agent a scoped task with an explicit acceptance checklist, which is exactly what `AGENTS.md` tells it to read before writing code. Branch names, commit messages, and pull requests all reference issue numbers, so every AI-generated change traces back to a user story and goes through partner review before it reaches `main`.

The project is still at a very early stage, and we haven't built much of the real application yet. But the plan looks solid: our responsibilities are clear, and Scrum has made coordinating with each other simple and manageable.

## 4. What we would add or change for Sprint 2

- **Apply the `AGENTS.md` refinements above** (test matrix, Vitest requirement, "All-season" rule, UI components, user flows, coverage goals) through a reviewed pull request.
- **Use a branch and PR for every change.** In Sprint 1 a document was pushed directly to `main` by accident. From Sprint 2 onward, everything goes through a reviewed pull request.
- **Keep the board current.** Move cards and tick acceptance criteria as work finishes, so the board always reflects where we actually are.
- **Run smaller, controlled checks when we change the rules**, testing one instruction at a time, so we can tell which rule actually changes the agent's output.
- **Stay realistic about scope.** Sprint 2 begins the real build (User Stories 1–5) with a short deadline, so we'll protect the core flow first and revisit lower-priority criteria if time runs short.
