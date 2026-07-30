# Coldingrod Project Status

Last verified: 2026-07-31

Primary implementation workspace: `C:\Users\SANSKAR\COLDINGROD IMPLEMENTATION\coldingrod`

## Current phase

Phase 3.2 (Lead Discovery Intake and Orchestration) is implemented, deployed to the linked Supabase project, and validated. Phase 2 remains complete, and Phase 3 AI Automation is in progress.

The first two production agents are intentionally transparent and deterministic. They use only evidence a workspace member supplies, never invent missing facts, require human selection before lead creation, and do not require an external AI-provider key.

## Progress estimate

| Scope | Complete | Remaining |
| --- | ---: | ---: |
| Phase 1 | 100% | 0% |
| Phase 2 overall | 100% | 0% |
| Phase 3.1 Lead Qualification Agent | 100% | 0% |
| Phase 3.2 Lead Discovery Intake | 100% | 0% |
| Phase 3 overall | approximately 35% | approximately 65% |
| Full currently discussed product plan | approximately 80% | approximately 20% |

These are planning estimates. Phase 3 still includes provider-backed business research and pain-point analysis, personalization, compliant message generation, follow-up automation, and analytics. Phase 4 covers integrations such as Google Maps/Places, and Phase 5 covers production hardening and release.

## Phase 3.1 delivered

- A global system `Lead Qualification Agent` registered as `coldingrod-rules-v1`.
- A trusted `run_lead_qualification` database function that requires both `manage_ai` and `manage_leads`, an active workspace membership, and an active lead in the same workspace.
- Strict validation for website, social, SEO, Google rating/review count, CTA, booking/enquiry, and evidence-note signals.
- A minimum of three known signals before qualification can run.
- A deterministic 0–100 service-opportunity score, evidence confidence, score band, contributing factors, and recommended agency opportunities.
- An immutable lead-score record linked to a completed AI action, plus an AI-authored activity and member notifications.
- Automatic lead progression from `new` to `analyzed` without overwriting later pipeline states.
- Cross-workspace agent-scope protection for AI actions.
- A responsive, accessible qualification dialog and score panel on lead details.
- A Phase 3 status banner, agent/action statistics, and recent results in AI Center.
- Correct slug-based lead drawer navigation and Next.js 16 asynchronous route handling for AI action details.
- Reduced unnecessary TypeScript complexity in touched lead and AI list paths by replacing explicit `any` values with small shared contracts and inference.

## Phase 3.2 delivered

- A global system `Lead Discovery Agent` registered as `coldingrod-rules-v1`.
- Trusted discovery and import RPCs requiring active membership plus both `manage_ai` and `manage_leads`.
- Strict brief and candidate allowlists, length checks, HTTP(S) URL checks, email validation, and a 1–50 candidate batch limit.
- Workspace-aware duplicate detection against existing leads and within each discovery run.
- Read-only discovery run/candidate tables for authenticated clients; all mutations belong to the trusted functions.
- Human review and explicit selection before any staged candidate becomes a lead.
- Enriched lead creation with website, industry, location, business email, and business phone.
- One descriptive import activity per batch instead of generic per-lead audit notification spam.
- Completed AI actions, AI/human activities, member notifications, and safe links between discovery runs, AI actions, and imported leads.
- Responsive discovery intake, recent-run overview, review cards, selection/import controls, and enriched business profiles.
- A forward migration correcting PostgreSQL output-column name resolution on the already-hosted import RPC, with the clean-install migration carrying the explicit fix.
## Hosted database verification

- Local and remote migration histories match through `015_lead_discovery_import_name_resolution.sql`.
- The rollback-only Phase 3.1 and Phase 3.2 acceptance suites pass.
- Phase 2.8 authorization, Phase 2.9 asset, and Phase 2.10 notification regression suites still pass.
- Acceptance coverage includes authentication, dual permissions, workspace and lead/run isolation, agent scoping, strict input allowlisting, deterministic scoring, duplicate traceability, atomic human-approved import, audit suppression, activity delivery, and notification delivery.
- Direct authenticated writes to lead scores and discovery tables are denied; trusted RPCs own score, run, candidate, and batch-import mutations.
- All synthetic SQL fixtures were rolled back.
- The real browser lifecycle produced a temporary lead, 94/100 score, completed AI action, activities, and notifications; every temporary record was then deleted and verified at zero.

## Verified locally and in the browser

- `.env.local` is configured and ignored by Git.
- `npx tsc --noEmit` passes.
- Phase 3.1, Phase 3.2, and related navigation files pass targeted ESLint with zero findings.
- A signed-in desktop lifecycle passed: create a lead, record seven observed signals, run qualification, verify 94/100 and 100% confidence, inspect the linked AI action, and confirm AI Center statistics.
- Lead status advanced from `new` to `analyzed`, and the three highest-value opportunities rendered correctly.
- Lead drawer “View Full Details” now uses the workspace slug and reaches the correct lead page.
- AI Center, lead details, and the qualification dialog were checked at a 390 × 844 mobile viewport with no horizontal overflow.
- A signed-in Phase 3.2 lifecycle passed: supply two candidates, confirm one ready and one within-run duplicate, explicitly select the ready candidate, import it, inspect the enriched lead profile, and follow the linked AI action back to its run.
- The discovery review page was checked at a 390 × 844 mobile viewport with no horizontal overflow.
- Browser console verification found and drove a fix for non-deterministic candidate field IDs; the final deterministic implementation passes lint, TypeScript, and production build checks.
- Every temporary browser-test run, candidate, action, notification, and lead was deleted and verified at zero remaining rows.

## TypeScript approach

The project keeps TypeScript where it protects database, authorization, and UI contracts. Ordinary implementation details rely on inference, and touched list/drawer paths no longer use explicit `any`. Converting core Next.js files to JavaScript would increase regression risk without changing the agreed product or design, so future work will continue using the lightest useful typing.

## Known follow-up work

- Full-repository ESLint has a pre-existing backlog outside the files touched for Phase 3.1, mainly old explicit `any` types, unused imports, and React hook-rule findings.
- `npm audit --omit=dev` still reports transitive advisories in Next-bundled and CLI-oriented dependencies; these should be upgraded separately with regression testing.
- Next.js emits the non-blocking warning that the `middleware` convention is deprecated in favor of `proxy`.
- Supabase performance-advisor RLS recommendations remain optimization work, not failed authorization checks.

## Next work

Continue Phase 3 with business research and pain-point analysis, followed by personalization, compliant outreach generation, follow-up automation, and analytics. Google Maps/Places remains in the agreed Phase 4 integration scope and will feed the same discovery pipeline.
