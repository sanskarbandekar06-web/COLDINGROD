# Coldingrod Project Status

Last verified: 2026-07-28
Primary implementation workspace: `C:\Users\SANSKAR\COLDINGROD IMPLEMENTATION\coldingrod`

## Current phase

Phase 2.8 application code and hosted database validation are complete. The database is migrated through `008`, the complete rollback-only acceptance suite passes, and GitHub is synchronized. Final Phase 2.8 approval is waiting only on Supabase Auth URL configuration and a real browser signup/login smoke test.

Do not begin Phase 2.9 until that final hosted-auth smoke test passes.

## Progress estimate

| Scope | Complete | Remaining |
| --- | ---: | ---: |
| Phase 1 | 100% | 0% |
| Phase 2.1–2.7 | 100% | 0% |
| Phase 2.8 application implementation | 100% | 0% |
| Phase 2.8 database/runtime validation | 100% | 0% |
| Phase 2.8 final hosted-auth smoke test | 70% | 30% |
| Repository handoff and local tooling | 100% | 0% |
| Phase 2.9 | 0% | 100% |
| Phase 2 overall | approximately 85% | approximately 15% |
| Full currently discussed product plan | approximately 65% | approximately 35% |

These percentages are planning estimates. Phase 2.9 remains the main unimplemented portion of Phase 2.

## Verified locally

- `.env.local` has the correct project URL, browser-safe publishable key format, and local app URL; it is ignored by Git.
- `npx tsc --noEmit` passes.
- `npm run build` passes on Next.js 16.2.10.
- GitHub `main` tracks the local repository and contains no recognized secrets.
- Supabase CLI 2.110.0 is installed, authenticated, initialized, and linked to project `mspfxgxduehikohdsomg`.
- The Stitch UI package is stored under `design-references/stitch/`.

## Hosted database verification

- Local and remote migration histories match through `008`; the final dry run reports the remote database is up to date.
- All 24 expected public tables exist and have RLS enabled.
- All 90 original policies are installed, with permission-scoped write hardening from migration `007`.
- All 11 expected functions, 19 triggers, 12 permission rows, and the availability exclusion constraint are present.
- `authenticated` has the required table privileges; `anon` has no public-table privileges.
- Actionable security-advisor warnings were fixed in migration `008`.
- Remaining security-advisor warnings refer to intentionally exposed authenticated `SECURITY DEFINER` RPCs. Their bodies enforce authentication, invitation email matching, active membership, self-protection, and explicit workspace permissions.
- The missing Docker warning affects only local migration-catalog caching, not hosted deployment or verification.

## Rollback-only acceptance suite

`supabase/tests/phase_2_8_acceptance.sql` passes and rolls back all synthetic data. It covers:

- Auth user trigger, public profile, personal workspace, membership, and all 12 owner permissions.
- Company workspace creation and owner permission grants.
- Invitation email mismatch rejection and valid acceptance.
- Atomic permission replacement and owner self-protection.
- Member removal and restoration of the same row with stale-permission clearing.
- Permission-scoped writes for AI, integrations, clients, leads/outreach, projects, tasks, assets, members, meetings, and settings.
- Active member, limited member, outsider, removed member, restored member, and anonymous access.
- Meeting organizer workspace validation, organizer participant protection, archived visibility, and update denial.
- Personal availability and database-level overlap rejection.
- Cleanup verification confirms zero synthetic auth users, workspaces, or invitations remain.

## Known validation exceptions

`npm run lint` currently crashes before inspecting source because the installed ESLint dependency chain cannot resolve `es-abstract/2024/AddEntriesFromIterable`. TypeScript and the production build pass. This dependency/tooling problem remains open.

Next.js also emits a non-blocking warning that the `middleware` convention is deprecated in favor of `proxy`.

Supabase's performance advisor reports RLS initialization-plan and multiple-permissive-policy optimizations. These are performance recommendations, not failed authorization checks; the functional RLS matrix passes.

## Remaining before final Phase 2.8 approval

1. Configure Supabase Authentication Site URL and localhost redirect URL.
2. Start the app with `npm run dev`.
3. Complete one real browser signup, email confirmation, login, company-workspace onboarding, and logout/login cycle.
4. Confirm the dashboard loads without permission or environment errors.
5. Mark Phase 2.8 approved and begin Phase 2.9 from the agreed plan.
