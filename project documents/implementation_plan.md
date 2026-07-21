# Implementation Plan: SDP 4 Solvable Fixes & Full-Stack Infrastructure Setup

This plan addresses all currently solvable problems in **SDP 4** (fixing CSS/Tailwind theme bugs across all 8 HTML mockups) and establishes the project infrastructure along with a tracked technical risk checklist for full-stack implementation.

## User Review Required

> [!NOTE]
> All 8 HTML mockup templates will be updated to remove hardcoded CSS background overrides (`body { background-color: #0A0A0B }`) and replace non-standard `light:` Tailwind classes with standard Tailwind `dark:` styling. This ensures light/dark mode toggling works cleanly across all static wireframes.

## Open Questions
No open questions at this stage.

## Proposed Changes

### HTML Mockups Optimization & CSS Theme Fixes

Grouped fixes across all 8 prototype directories to sanitize CSS, remove hardcoded background overrides, fix invalid Tailwind syntax, and eliminate DOM-repainting mousemove animations.

#### [MODIFY] [code.html (landing_page_academic_engineering)](file:///f:/SDP%204/landing_page_academic_engineering/code.html)
- Remove hardcoded `body { background-color: #0A0A0B }` CSS override.
- Replace invalid `light:` Tailwind classes with standard `dark:` mode utility classes.
- Strip mousemove listener DOM-repainting scripts.

#### [MODIFY] [code.html (authentication_login_register)](file:///f:/SDP%204/authentication_login_register/code.html)
- Remove hardcoded body CSS override and `.shake` error keyframe animations.
- Update body and input tags to use standard Tailwind `bg-[#F4F4F6] dark:bg-[#0A0A0B]`.

#### [MODIFY] [code.html (database_onboarding_wizard)](file:///f:/SDP%204/database_onboarding_wizard/code.html)
- Remove body CSS background overrides.
- Update cards and status elements to support standard light/dark mode toggling.

#### [MODIFY] [code.html (central_workspace_dashboard)](file:///f:/SDP%204/central_workspace_dashboard/code.html)
- Fix header theme toggle JavaScript to toggle `dark` class on `document.documentElement`.
- Clean up hardcoded style overrides.

#### [MODIFY] [code.html (developer_profile_configuration)](file:///f:/SDP%204/developer_profile_configuration/code.html)
- Sanitize body CSS overrides and fix profile container dark mode classes.

#### [MODIFY] [code.html (advanced_ide_quantum_lattice)](file:///f:/SDP%204/advanced_ide_quantum_lattice/code.html)
- Remove hardcoded canvas CSS overrides.
- Ensure unsaved dot indicator uses static cyan style.

#### [MODIFY] [code.html (collaboration_review_drawer)](file:///f:/SDP%204/collaboration_review_drawer/code.html)
- Update patch diff boxes for clean dark/light mode background contrast.

#### [MODIFY] [code.html (teammate_invite_acceptance_portal)](file:///f:/SDP%204/teammate_invite_acceptance_portal/code.html)
- Update invite card container to use standard Tailwind dark mode variables.

---

### Project Foundation Setup

#### [NEW] [package.json](file:///f:/SDP%204/package.json)
- Node.js project manifest at root of `f:\SDP 4` configuring scripts for React frontend and Express backend.

#### [NEW] [.env.example](file:///f:/SDP%204/.env.example)
- Environment variable template for Firebase configuration keys and `GEMINI_API_KEY` to ensure secret keys are never exposed to client-side code.

---

### Deferred Technical Risk Checklist (To execute during full-stack build)

1. **SPA Routing**: Implement `react-router-dom` to route `/`, `/auth`, `/onboarding`, `/dashboard`, `/profile`, `/ide`, and `/invite`, replacing raw `.html` links.
2. **Firebase Quota Protection**: Implement manual REST API handlers (`axios`/`fetch`) for Save-and-Sync. Prohibit continuous `onSnapshot` listeners to stay strictly within the 50,000 daily read limit.
3. **Server-Side Gemini AI Integration**: Route AI bug reviews through `POST /api/ai-review` on Express.js to protect `GEMINI_API_KEY`.
4. **Flat Directory String Tree Parser**: Create `parseFlatArrayToTreeNodes()` helper in React to parse Firestore relative path strings into the visual left-hand IDE tree.

## Verification Plan

### Automated Tests
- Run HTML syntax and path reference checks across all 8 prototype pages.

### Manual Verification
- Open updated HTML files in web browser, trigger theme toggle buttons, and verify background colors switch smoothly between Dark (`#0A0A0B`) and Light (`#F4F4F6`).
