# Coldingrod Project Status

Last verified: 2026-07-28  
Primary implementation workspace: `C:\Users\SANSKAR\COLDINGROD IMPLEMENTATION\coldingrod`

## Current phase

Phase 2.8 is code-complete and passes the local application validation gate. It is not yet approved as database-complete because no Supabase project is connected and the migrations/RLS policies have not been exercised against a clean live database.

Do not begin Phase 2.9 until the Phase 2.8 database validation checklist below passes.

## Progress estimate

| Scope | Complete | Remaining |
| --- | ---: | ---: |
| Phase 1 | 100% | 0% |
| Phase 2.1–2.7 | 100% | 0% |
| Phase 2.8 application implementation | 100% | 0% |
| Phase 2.8 database/runtime approval | 0% | 100% |
| Phase 2.9 | 0% | 100% |
| Phase 2 overall | approximately 85% | approximately 15% |
| Full currently discussed product plan | approximately 65% | approximately 35% |

These are planning estimates, not story-point measurements. The largest remaining uncertainty is real Supabase migration and RLS testing.

## Verified locally

- `npx tsc --noEmit` passes.
- `npm run build` passes on Next.js 16.2.10.
- The production route manifest includes meetings, member management, AI, outreach, client, lead, project, task, settings, auth, and invite routes.
- No deprecated Base UI `asChild` usage remains under `src`.
- No explicit `any`, double-casts, or meeting-status assertion casts remain in the Phase 2.8 meeting/member files.
- No literal `\n` corruption remains in the SQL migrations.
- The old `update_rls.py` and `update_schema.js` migration-rewrite helpers were removed after their intended changes were audited directly into the migrations.

## Phase 2.8 work completed

- Added strict server-side authorization for meeting and member mutations.
- Added canonical workspace scoping for meetings, participants, availability, members, and related entities.
- Completed meeting create/edit/status/archive/restore behavior.
- Replaced participant UUID entry with active workspace-member selection and added duplicate, organizer, and schedule-conflict checks.
- Added personal availability create/edit/delete behavior, overlap checks, and a database exclusion constraint for concurrent overlap protection.
- Added manager-only archived meeting access and restore behavior.
- Hardened invite acceptance, including email matching, token locking, deleted-membership restoration, and stale-permission clearing.
- Added atomic database functions for permission replacement and member removal.
- Corrected initial owner permission grants so workspace creators receive the full permission catalog.
- Corrected meeting participant foreign-key prerequisites and RLS policies.
- Made activity rows append-only through RLS.

## Known validation exception

`npm run lint` currently crashes before linting source:

```text
Cannot find module 'es-abstract/2024/AddEntriesFromIterable'
```

The failure originates in the installed `object.fromentries` / `eslint-plugin-react` / `eslint-config-next` dependency chain. Per the project plan, dependencies were not modified during this audit. TypeScript and the production build both pass.

Next.js also emits a non-blocking warning that the `middleware` file convention is deprecated in favor of `proxy`. Treat this as technical debt, not a Phase 2.8 blocker.

## Required database validation before approval

1. Create the Supabase project.
2. Copy `.env.local.example` to `.env.local` and supply the project URL and anon key.
3. Apply migrations `001` through `006` in order on a clean database.
4. Verify auth-user creation creates a personal workspace, active membership, and the complete permission set.
5. Verify company-workspace creation and slug uniqueness.
6. Test invite creation, expiration, email mismatch rejection, acceptance, revoked invites, and restoration of a previously removed member without stale permissions.
7. Test member permission replacement, self-protection, removal, and RLS denial for unauthorized members.
8. Test meeting create/edit/status transitions/archive/restore, related-entity workspace validation, participant CRUD, organizer protection, and schedule conflicts.
9. Test availability CRUD, own-versus-manager authorization, and overlap rejection including concurrent inserts.
10. Test the full RLS matrix for active members, removed members, managers, unrelated authenticated users, and anonymous users.
11. Smoke-test the application against Supabase, then mark Phase 2.8 approved.

## Next planned work

After the database checklist passes:

1. Approve Phase 2.8.
2. Begin Phase 2.9 only from the agreed project plan.
