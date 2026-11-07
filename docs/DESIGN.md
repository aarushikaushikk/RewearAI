# ReWear AI — Product Design Specification

**Project:** ReWear AI — An Intelligent Digital Wardrobe  
**Document:** `docs/DESIGN.md`  
**Status:** Review draft for both project partners; not yet approved  
**Version:** 0.2 — November 3, 2026 (team review draft)  
**Sources of truth:** `docs/PRD.md` (product scope and acceptance criteria), root `AGENTS.md` (engineering rules), assigned GitHub issues (task scope)

> **Approval rule:** This file proposes the visual system and interaction details for the 15 approved user stories. It does not add product features or override the PRD. Both partners should review the decisions marked **Confirm** before treating this as the implementation standard. Changes should go through a reviewed pull request.

## 1. Product experience and design goals

**Product promise:** “An intelligent stylist that creates new outfits from clothes you already own.”

ReWear AI should feel like a simple, welcoming, image-first personal wardrobe—not a spreadsheet, shopping site, or technical admin dashboard. Users should be able to recognize their clothing quickly, add an item with minimal friction, find an item in seconds, and understand which saved items make up an outfit recommendation.

Design principles:

1. **Clothing first.** Real item photos are the focal point of wardrobe and outfit screens. Metadata supports the photos rather than overwhelming them.
2. **One clear primary action per view.** Make the next useful action obvious without filling the screen with competing buttons.
3. **User control.** Classification suggestions must be reviewable and editable; users can edit availability, outfit feedback, and saved records.
4. **No invented items.** All recommended items are saved, available wardrobe items belonging to the signed-in user.
5. **Helpful recovery.** Empty, uncertain, loading, and failed states explain what happened and offer the relevant next step.
6. **Consistent across partners.** Shared spacing, type, colors, components, and state patterns apply to every story and sprint.

### Out of scope

No marketplace, purchase links, public wardrobe, social feed, virtual try-on, fashion trend forecasting, or standalone AI chatbot. Do not add these to mockups, navigation, or implementation.

## 2. Proposed visual direction — confirm with teammate

**Direction:** modern, calm, practical wardrobe organizer. Use a warm off-white background, dark readable text, a restrained evergreen primary color, subtle borders, and generous space around clothing imagery. This is a **proposal**, not an already-approved brand identity.

### Color tokens

| Token | Hex | Usage |
|---|---|---|
| `--color-background` | `#F8F7F3` | Page background |
| `--color-surface` | `#FFFFFF` | Cards, dialogs, inputs |
| `--color-text` | `#202A25` | Main headings and body text |
| `--color-text-muted` | `#58655E` | Supporting text |
| `--color-primary` | `#245B45` | Main actions, active navigation, focus accents |
| `--color-primary-hover` | `#194733` | Primary hover state |
| `--color-primary-soft` | `#E8F1EB` | Selected chips, subtle highlights |
| `--color-border` | `#D7DED8` | Input/card boundaries |
| `--color-danger` | `#A12828` | Destructive actions and errors |
| `--color-danger-soft` | `#FFF0EF` | Error background |
| `--color-warning` | `#865A13` | Uncertain classifications and warnings |
| `--color-warning-soft` | `#FFF5DE` | Warning background |

Use text labels as well as colors for statuses. Clothing photographs should supply most of the visual variety. Avoid assigning gender, season, or formality solely from a color cue.

### Typography and spacing

- Font: `Inter`, falling back to `system-ui, -apple-system, Segoe UI, sans-serif`. No paid font dependency.
- Main page heading: 30–36 px desktop, 26–30 px mobile; weight 700.
- Section heading: 20–24 px; weight 650–700. Card title: 16–18 px; weight 600.
- Body: 16 px; supporting text: 14 px minimum; tiny badges only where legible.
- Spacing scale: 4, 8, 12, 16, 24, 32, 48 px. Default section gap 24–32 px.
- Rounded corners: 10–12 px for controls and cards, 16 px for dialogs; minimal shadows.
- Buttons and form controls: at least 44 px high; visible keyboard focus ring.
- Content width: approximately 1200 px maximum, centered with responsive gutters.

### Photography and imagery

- Use the **user's uploaded item photo**, not stock clothing or invented recommendations.
- Wardrobe images use a consistent portrait-oriented **4:5** frame with `object-fit: contain` on a quiet neutral background, preserving the whole garment.
- Keep item images readable; do not cover the clothing with large text overlays.
- If an image is unavailable, show a neutral “Image unavailable” placeholder and the item name; never silently substitute a different garment.
- Use meaningful alt text derived from user-confirmed attributes (e.g., “White Oxford shirt”).

## 3. Information architecture and navigation

### Primary authenticated navigation

1. **Home** — welcome and shortcuts to existing functions.
2. **My Wardrobe** — all saved clothing; search, filters, availability, edit/delete.
3. **Create Outfit** — select an occasion, generate and review a combination.
4. **Saved Outfits** — saved recommendations and actions on them.
5. **Outfit History** — previously worn combinations in chronological order.

**Add Clothing** is a prominent action from Home and My Wardrobe, not a sixth primary navigation destination. **Sign In / Sign Up** are outside the authenticated navigation. **Clothing Detail / Edit** is accessed from an item card. Account menu supports **Sign Out**.

**Desktop:** top header with ReWear AI wordmark, navigation links, and account menu; content below.  
**Mobile:** compact header with a labeled menu button and accessible navigation drawer (or equivalent compact navigation); do not compress five full labels into an unreadable row. Keep the primary page action visible.

### Suggested routes (implementation can adapt)

| View | Suggested route | Stories |
|---|---|---|
| Sign in | `/sign-in` | 1 |
| Sign up | `/sign-up` | 1 |
| Home | `/` | 1–15 (navigation only) |
| Wardrobe | `/wardrobe` | 4, 5, 6 |
| Add clothing | `/wardrobe/new` | 2, 3, 11, 15 |
| Clothing detail/edit | `/wardrobe/[itemId]` | 4, 6 |
| Create outfit | `/outfits/create` | 7, 8, 12, 13, 14 |
| Saved outfits | `/outfits/saved` | 9 |
| Outfit history | `/outfits/history` | 10 |

These routes are a UI organization suggestion, not a requirement to add new backend endpoints.

## 4. Shared component library

| Component | Purpose and behavior |
|---|---|
| `AppHeader` / `MobileNav` | Consistent navigation, current-page indication, sign out |
| `PageHeader` | Page title, short description, one primary action |
| `PrimaryButton`, `SecondaryButton`, `TextButton`, `DangerButton` | Clear hierarchy, loading/disabled states |
| `TextField`, `SelectField`, `FormField` | Persistent visible labels, help and validation text |
| `FilterBar` / `FilterChip` | Search, attribute filters, active selections, clear-all |
| `ClothingCard` | 4:5 photo, item name, minimal attributes, availability label |
| `AvailabilityControl` | Explicit Available / Unavailable status with reversible action |
| `ClothingForm` | Image and editable category, color, style, season, formality |
| `ImageUploadField` | Choose/preview/replace image, progress, retry and errors |
| `OutfitCard` / `OutfitItemList` | Real wardrobe item images, occasion, save/worn controls |
| `ExplanationPanel` | Short reason grounded in the chosen occasion and actual metadata |
| `FeedbackControl` | Positive / negative / clear feedback; current choice visible |
| `EmptyState`, `ErrorState`, `LoadingSkeleton`, `StatusNotice` | Consistent copy and next actions |
| `ConfirmDialog` | Explicit confirmation for destructive deletion |

Avoid duplicating card styles or form logic in separate stories. Component names are illustrative and should be aligned with existing files before implementation.

## 5. Screen-by-screen layouts and behavior

### 5.1 Sign In and Sign Up — US1

**Layout:** narrow centered form panel with logo, one-sentence description, labeled account fields, primary submit button, and a link between sign-in and sign-up. Avoid wardrobe previews containing other users' private data.

- Show validation near the relevant field; keep entered non-secret values after a recoverable error.
- Clearly distinguish invalid credentials, expired sessions, and temporary server errors without exposing sensitive details.
- Successful sign-in enters the user's private Home screen; sign-out returns to sign-in.
- Private pages redirect unauthenticated users to sign-in; never render another user's wardrobe.

### 5.2 Home / Dashboard — navigation hub

**Layout:** greeting and concise explanation, primary **Add Clothing** or **Create Outfit** action, plus links to My Wardrobe, Saved Outfits, and History. If the wardrobe is empty, show **Add your first clothing item** instead of invented recommendations.

No new analytics, purchase suggestions, or unrelated dashboard features are required. Optional counts may be shown only when grounded in existing records and agreed by both partners.

### 5.3 My Wardrobe — US4, US5, US6

**Desktop wireframe (conceptual):**

```text
[ReWear AI]  Home  My Wardrobe  Create Outfit  Saved  History  [Account]

My Wardrobe                                  [+ Add Clothing]
Find and manage clothes you already own.

[Search items..............................................]
[Category v] [Color v] [Season v] [Formality v] [Clear filters]
Showing 12 of 12 items

[ photo ] [ photo ] [ photo ] [ photo ]
  Name      Name      Name      Name
  Status    Status    Status    Status

[ photo ] [ photo ] [ photo ] [ photo ]
  ...
```

- Desktop grid: four columns when width permits, three/two as space narrows, one or two on mobile based on legibility.
- Each item opens a detail/edit view; show its **Available** or **Unavailable** status as readable text.
- Search and filters apply together; show a result count and **Clear filters** action.
- Search covers item name and supported attributes per US5; match behavior must be consistent with implementation tests.
- **No matches:** “No items match your search and filters.” Action: **Clear filters**.
- **Empty wardrobe:** “Your wardrobe is empty.” Action: **Add clothing**.
- **Loading:** stable image-card skeletons; **error:** retry without erasing search/filter inputs.
- **Confirm before deleting** a clothing item; explain effects on saved outfits/history if needed before implementation.

**Confirm — seasonal matching:** The HW3 experiment differed on whether an item labeled `All-season` should appear when a specific season is selected. Proposed rule: `All-season` items **are included** for any selected season. Both partners must approve this rule and add matching tests before implementing it in the final application. Until approval, treat it as an open product decision, not settled behavior.

### 5.4 Add Clothing and Classification Review — US2, US3, US11, US15

Use a **two-stage flow** within the same task: (1) choose and preview an image, (2) review/edit suggested attributes before saving. A progress indicator is helpful but should not create a complex wizard.

```text
Add Clothing
[ Upload image / drag or choose ]  [ Image preview ]

Category [select]    Color [field/select]
Style    [field]     Season [select]
Formality[select]

[Cancel]                         [Save to My Wardrobe]
```

- Validate supported file formats and size; display the accepted limits from actual backend configuration, not invented limits.
- Display an image preview before save. Suggested category/color/style/season/formality remain **editable**.
- For uncertain classification: warning banner **“We aren't confident about these details. Please review them before saving.”** Mark uncertain fields and permit manual correction.
- If analysis fails: **“We couldn't analyze this image. You can retry or enter details manually.”** Actions: **Retry analysis** / **Enter details manually**.
- If upload fails: **“Your image didn't upload. Please try again.”** Action: **Retry upload**; preserve entered details and avoid duplicate items.
- Save only after the user confirms final values; show success and return to wardrobe or item detail.
- Do not imply AI classification is always accurate or required to finish the upload.

### 5.5 Clothing Detail / Edit — US4, US6

Large item photo on one side (stacked on mobile), editable attributes on the other, clearly labeled availability control, **Save changes**, and a secondary **Delete item** action with confirmation. Show an appropriate error if the item was removed or cannot be accessed. Never expose records by accepting a client-supplied owner ID.

### 5.6 Create Outfit — US7, US8, US12, US13, US14

**Step A — choose an occasion:** selectable cards or a labeled select for **Work, Dinner, Weekend, Casual, Formal**. One clear **Generate Outfit** button.

**Step B — review recommendation:** show the actual saved clothing photos and names, selected occasion, short explanation, and actions: **Try another outfit**, **Save outfit**, **Mark as worn**, and **Helpful / Not helpful** (with ability to change or clear feedback). Organize actions by hierarchy; don't present five equal primary buttons.

```text
Create Outfit
Occasion: [ Work v ]                         [Generate Outfit]

Your outfit for Work
[photo + item] [photo + item] [photo + item]
Why these items?  A short explanation based on occasion and item attributes.
[Try another]  [Save outfit]  [Mark as worn]
Was this useful? [Helpful] [Not helpful] [Clear feedback]
```

- Only items owned by the signed-in user and currently **available** are eligible.
- Never insert an imaginary item or suggest a purchase to fill a gap.
- If there are insufficient suitable items: **“There aren't enough available items for a [occasion] outfit yet.”** Actions: **View wardrobe** / **Add clothing**.
- If no different valid combination exists: **“There isn't another suitable combination right now.”** Keep the current outfit visible.
- Explanation text should reference observable attributes and occasion; avoid claiming subjective fashion certainty.
- Feedback controls must display persisted state. Do not claim the system “learns” from feedback unless that behavior is implemented and tested.
- If recommendation generation fails, preserve the occasion and offer **Try again**.

### 5.7 Saved Outfits — US9

Grid/list of saved outfits with small collages of their actual wardrobe items, occasion, and saved date. Open to inspect the exact saved items. Provide **Remove from saved** with confirmation. If an item has since been deleted or become unavailable, show an honest label rather than replacing it or silently editing the saved record.

Empty state: **“No saved outfits yet.”** Action: **Create an outfit**.

### 5.8 Outfit History — US10

Chronological list (most recent first) of outfits marked as worn, with worn date, occasion, and item thumbnails. Use readable dates, not just relative times. Preserve history when revisiting the app. If the list is empty: **“You haven't recorded an outfit yet.”** Action: **Create an outfit** or **View saved outfits**.

## 6. Interaction rules and content standards

- Use concise, neutral, plain-language labels. Avoid unnecessary fashion jargon and exaggerated AI claims.
- One primary action per step; secondary actions visually subordinate.
- Keep **Cancel**, **Back**, **Retry**, and **Clear** actions distinct; never use “Clear” to delete saved data.
- Never rely on color alone: badges read **Available**, **Unavailable**, **Needs review**, etc.
- Destructive actions use confirmation and specific labels such as **Delete clothing item**.
- A successful save/update should show a brief status message and update the visible state.
- Preserve user-entered information on recoverable errors; don't duplicate records on retry.
- Disable duplicate submit actions while a save is pending and give progress feedback.
- If an action is unavailable, explain why; do not leave an unexplained disabled button.

### 6.1 Required / optional fields and failure messages (team-requested addition)

Every page must explain failures at the point where an action fails, using a clear message and a relevant next action. Every input field must visibly indicate **Required** or **Optional** (or be labeled **To confirm** until the team decides). Do not silently make a field mandatory if the PRD does not specify that constraint. These labels and examples apply to desktop and mobile screens alike; the screen layouts and existing flows remain unchanged.

| Screen / wireframe | Required versus optional fields | Example failure message and recovery |
|---|---|---|
| 01 — Sign In / Sign Up | **Email (Required)** and **Password (Required)**, plus a **Continue with Google** link below the form, shown only when Google sign-in is configured. | “Enter a valid email address.” / “Sign-in failed. Check your details and try again.” Keep account-existence information private. The one exception: someone Google has verified as the email's owner is told it already has an account that isn't connected to Google. |
| 02 — Home | No form fields required to view the page. | “We couldn't load your wardrobe summary. Try again.” **Retry**. |
| 03 — My Wardrobe | **Search (Optional)**; **Category, Color, Season, Formality (Optional)** filters. | “We couldn't load your wardrobe. Try again.” **Retry**, preserving filters. A zero-match result is an empty state, not an error. |
| 04 — Clothing Detail / Edit | Existing metadata fields: **Required/Optional — confirm with team** before enforcing validation. Availability is a reversible control, not a required text field. | “We couldn't save your changes. Try again.” **Retry**; keep edits. For deletion: “We couldn't delete this item. Try again.” |
| 05 — Clothing Upload | **Clothing image (Required)** for the image-upload path; supported formats/size are determined by the actual implementation. | “This file type isn't supported. Choose another image.” / “Your image didn't upload. Try again.” **Choose another / Retry**. |
| 06 — Classification Review | **Category, Color, Style, Season, Formality: Required/Optional — confirm with team.** Suggestions must be editable; uncertain values cannot be silently accepted. | “Review or correct the highlighted details before saving.” / “We couldn't save this item. Try again.” **Edit / Retry**. |
| 07 — Classification Uncertainty / Recovery | On the manual-entry path, required attributes remain **to confirm**; user confirmation is required before save. | “We couldn't analyze this image. Try again or enter details manually.” **Retry analysis / Enter manually**. |
| 08 — Create Outfit | **Occasion (Required)**. Any future preference controls, if approved, must be labeled optional or required explicitly. | “Choose an occasion to continue.” / “We couldn't generate an outfit. Try again.” **Select occasion / Retry**. |
| 09 — Recommendation / Alternatives / Feedback | Feedback is **Optional**; no new form fields are required to review an outfit. | “We couldn't save your outfit or feedback. Try again.” **Retry**, retaining the current recommendation and choice. |
| 10 — Saved Outfits | No fields required to browse. Removing an outfit requires confirmation, not extra form data. | “We couldn't remove this saved outfit. Try again.” **Retry**. |
| 11 — Outfit History | An outfit must be selected to mark as worn; **worn date behavior — confirm with team** (e.g., whether today is the default). | “We couldn't record this outfit as worn. Try again.” **Retry** without duplicating the record. |
| 12 — Mobile Views | Same Required/Optional labels as the corresponding desktop fields. | Use the same concise inline/page error and recovery action as desktop; never hide the message offscreen. |
| 13 — State Checklist | Confirm each field's status and validation rule before marking a story complete. | Check invalid input, failed load, failed save, failed delete, failed upload, failed analysis, failed generation, and failed feedback. |

**Presentation rules:** Place **Required** / **Optional** next to visible field labels, not solely in placeholder text; show field-level validation beneath the affected input and a page-level error for server/network failures. Do not erase valid input after a recoverable failure. Error messages must describe what happened without leaking private data or technical stack traces; give a clear **Retry**, **Correct**, **Choose another**, or **Back** action. If a screen has no fields, no Required/Optional indicator is necessary. These are design examples, not claims that the features have already been implemented.

## 7. Responsive behavior and accessibility

| Viewport | Layout behavior |
|---|---|
| Large desktop (`>=1200px`) | Full top navigation; wardrobe grid up to 4 columns; spacious outfit composition |
| Tablet (`768–1199px`) | Condensed navigation; 2–3 wardrobe columns; controls wrap cleanly |
| Mobile (`<768px`) | Compact menu; 1–2 wardrobe columns; stacked forms and outfit cards; full-width primary actions |

- All interactive elements are keyboard reachable, with a visible focus indicator.
- Inputs have persistent text labels; errors are announced and associated with their fields.
- Use semantic headings, buttons, lists, and form controls; dialogs manage focus and Escape correctly.
- Ensure WCAG AA contrast for normal text and meaningful UI controls; test actual combinations.
- Support 200% zoom without losing key actions; minimum comfortable target size 44 × 44 px.
- Images have appropriate alt text; decorative imagery has empty alt text.
- Loading and error updates should be conveyed to assistive technologies without overwhelming announcements.
- Do not depend on hover to reveal a necessary action, especially on touch screens.

## 8. Required UI states and acceptance checks

| Feature | Happy path | Empty / edge / failure state |
|---|---|---|
| Authentication | Sign up, sign in, sign out | Validation, expired session, private access denied |
| Upload | Preview and save photo | Unsupported format, upload failure, retry |
| Classification | Review and correct attributes | Uncertain result, analysis failure, manual entry |
| Wardrobe | Grid, edit, delete | Empty wardrobe, missing photo, save/delete error |
| Search/filter | Combined filters and clear | Zero matches, reset, no mutation of records |
| Availability | Toggle and persist status | Unavailable item excluded from generated outfit |
| Generation | Occasion-based outfit from saved items | Insufficient items, generation error |
| Alternatives | Different valid combination | No alternative available |
| Saved outfits | Save, view, remove | Empty list, removed source item |
| History | Mark worn and review dates | Empty history, persistence after refresh |
| Explanation | Metadata-grounded short reason | No fabricated styling rationale |
| Feedback | Save, change, clear feedback | Save error and visible retry |

**Testing expectation:** For each story, connect screenshots or mockups to its PRD acceptance criteria and corresponding GitHub issue. Use Vitest/Playwright as specified by `AGENTS.md`. The HW3 isolated experiment is not evidence that production authentication, persistence, or full end-to-end flows already exist.

## 9. Coverage of all 15 approved user stories

| Story | Primary UI surface | Design evidence to check |
|---|---|---|
| US1 — Account and Sign-In | Sign In / Sign Up | Private session, errors, sign-out |
| US2 — Clothing Upload | Add Clothing | Preview, validation, save |
| US3 — Clothing Classification | Add Clothing | Suggested editable attributes |
| US4 — Edit and Remove Clothing | Wardrobe / Detail | Edit, delete confirmation |
| US5 — Search and Filter | Wardrobe | Search, combined filters, clear, no results |
| US6 — Update Availability | Wardrobe / Detail | Status label, reversible control |
| US7 — Occasion-Based Outfit | Create Outfit | Occasion, real items, valid result |
| US8 — Alternative Suggestions | Create Outfit | Try another, no-alternative state |
| US9 — Saved Outfits | Saved Outfits | Save, list, remove |
| US10 — Outfit History | History | Mark worn, chronological view |
| US11 — Classification Uncertainty | Add Clothing | Warning, correction, confirmation |
| US12 — Insufficient Wardrobe Items | Create Outfit | Explanation and recovery CTA |
| US13 — Recommendation Explanation | Create Outfit | Short grounded explanation |
| US14 — Recommendation Feedback | Create Outfit | Helpful/not helpful/change/clear |
| US15 — Failure Recovery | Add Clothing | Upload vs analysis failure, retry/manual path |

## 10. Handoff and implementation rules

1. Review this proposal with both partners and resolve **Confirm** decisions before calling it approved.
2. Keep `docs/PRD.md` authoritative for **what** the app does; this document describes **how it looks and behaves**. `AGENTS.md` governs implementation workflow.
3. Each GitHub issue should cite its user story and relevant screen/component section here.
4. Reuse the same design tokens and shared components across branches; do not silently introduce another palette or navigation system.
5. Implement accessible loading, empty, success, and error states as part of the feature—not as last-minute polish.
6. Attach final mockups/screenshots to this file or link them in `docs/` when approved. Text wireframes here are planning aids, **not final visual mockups**.
7. If a feature needs a new design decision, propose it in a PR and obtain partner review rather than changing the PRD to fit generated code.

## 11. Visual wireframe index and handoff to implementation

The following files are **low-fidelity, review-ready vector wireframes**. They are proposals for screen organization and behavior, not evidence of implemented features. The bundled `ReWear_Wireframes_Review_v0.2.pdf` is for teammate review; individual SVGs are the visual references for implementation.

| Wireframe | File | Stories / issue | Required interaction or state |
|---|---|---|---|
| 01 Account creation and sign-in | [`wireframes/01_authentication.svg`](wireframes/01_authentication.svg) | US1 / #6 (your Sprint 2 issue) | Sign-up, sign-in, persistent session, logout, access isolation |
| 02 Home | [`wireframes/02_home.svg`](wireframes/02_home.svg) | Cross-story | Navigation and first-use empty wardrobe |
| 03 Wardrobe | [`wireframes/03_wardrobe.svg`](wireframes/03_wardrobe.svg) | US4, US5, US6 | Search, combined filters, status, clear, no matches |
| 04 Clothing details | [`wireframes/04_item_details.svg`](wireframes/04_item_details.svg) | US4, US6 | Edit, delete confirmation, availability |
| 05 Upload | [`wireframes/05_upload.svg`](wireframes/05_upload.svg) | US2 | Preview, progress, format validation, upload retry |
| 06 Classification review | [`wireframes/06_classification.svg`](wireframes/06_classification.svg) | US3 / #8 (your Sprint 2 issue) | Category, color, style, season, formality; edit then confirm |
| 07 Classification recovery | [`wireframes/07_classification_recovery.svg`](wireframes/07_classification_recovery.svg) | US11, US15 | Uncertain result, manual entry, upload vs analysis error |
| 08 Outfit generation | [`wireframes/08_generate.svg`](wireframes/08_generate.svg) | US7, US12 | Occasion and insufficient-items recovery |
| 09 Recommendation | [`wireframes/09_recommendation.svg`](wireframes/09_recommendation.svg) | US7–US10, US13, US14 | Try another, save, mark worn, explanation, feedback |
| 10 Saved outfits | [`wireframes/10_saved.svg`](wireframes/10_saved.svg) | US9 | Saved outfit detail and removal |
| 11 History | [`wireframes/11_history.svg`](wireframes/11_history.svg) | US10 | Worn dates and persistent chronological list |
| 12 Mobile | [`wireframes/12_mobile.svg`](wireframes/12_mobile.svg) | All stories | Responsive examples and touch controls |
| 13 State checklist | [`wireframes/13_states.svg`](wireframes/13_states.svg) | All stories | Empty, error, loading, access and persistence review |

### Your confirmed Sprint 2 ownership (not the full team allocation)

- **US1 / GitHub issue #6 - Account and Sign-In.** Your design reference is Wireframe 01, plus private navigation in Wireframe 02. Verify session persistence, logout and user-to-user isolation against the PRD; the UI alone does not establish security.
- **US3 / GitHub issue #8 - Clothing Classification.** Your design reference is Wireframe 06 and its related recovery state in Wireframe 07. Coordinate the input/output boundary with the teammate implementing image upload (US2). Classification suggestions must be correctable before saving. The provider/model and uncertainty threshold have **not** been decided by this document.
- All other stories remain part of the **shared product design**; this file does not assign them to either partner.

### Project 2 rubric: design versus engineering evidence

A good wireframe supports professional UI/UX and user-story coverage, but **does not by itself satisfy** the technical rubric. Separately track:

| Rubric area | What must exist beyond the wireframes |
|---|---|
| Functionality (45) | Working frontend, backend, database, auth, public documented API, 3+ features and persistent/complex state |
| Technical excellence (60) | Real TDD red-green-refactor in Git history, unit/integration/E2E tests, sound database design, access controls |
| AI mastery (30) | Evidence of effective IDE harness use, shared rules/context and AI-assisted testing; use Antigravity as primary per course text, Claude Code as supplementary if permitted |
| CI/CD & DevOps (30) | Checks on every PR, multi-stage pipeline, security scanning, preview deployments, automated production deployment and environments |
| Agile / pair (20) | Two+ documented sprints, five+ issues per sprint, standups and retrospectives, meaningful commits by both partners, at least five PR reviews per partner |
| Documentation (15) | README, API docs, architecture and schema diagrams, setup/deployment guide, contribution log, 10-minute demo and individual reflections |

**Design handoff rule:** before implementation, review these screen sketches together and record approval or changes in the design PR. Implement assigned GitHub issues one at a time using PRD acceptance criteria, failing tests before feature code where applicable, and reviewed PRs. The earlier HW3 experiment is a separate proof of concept, not the full production application.

### Proposed screen flow

`Sign in / Sign up -> Home -> Wardrobe -> Add photo -> Classification review -> Save item -> Create outfit -> Review recommendation -> Save / Mark worn / Feedback -> Saved outfits / History`

Alternative paths: upload failure -> retry; classification uncertain -> edit manually; insufficient outfit items -> wardrobe; no alternatives -> retain current outfit; expired session -> sign in.

## 12. Decisions to confirm before approval

- [x] **Visual palette:** warm off-white, evergreen, dark text, restrained borders (user preference; partner approval pending).
- [ ] **Typography:** Inter/system fonts and specified scale.
- [ ] **Navigation:** top navigation on desktop; compact accessible menu on mobile.
- [ ] **Wardrobe card:** 4:5 image frame, name, availability, minimal metadata.
- [ ] **Season filter:** Should `All-season` items match any selected specific season? Not settled; do not silently decide.
- [ ] **Saved outfit after source-item removal:** preserve historical record with missing-item label; clarify data behavior.
- [ ] **Outfit feedback placement:** directly beneath recommendation explanation/actions.
- [ ] **Screen mockups:** review the attached 13 wireframe sheets and approve or revise before production UI implementation.
- [x] **Authentication method:** email/password and Google, with custom MongoDB-backed sessions rather than Auth.js (approved by both partners). Wireframe 01 predates this and doesn't show the Google link; the sign-in and sign-up pages are the reference until it's redrawn.
- [ ] **Classification integration:** agree on provider/model, failure contract and what counts as an uncertain result.
- [ ] **US2 to US3 handoff:** agree on uploaded image reference, provisional metadata and when the wardrobe record is created.
- [ ] **Outfit algorithm:** define what constitutes a valid outfit for each occasion; no arbitrary items or invented categories.

**Approval record:**  
Partner 1: _pending_  
Partner 2: _pending_  
Approved on: _pending_  
Related GitHub PR / issue: _pending_
