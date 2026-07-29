# Coldingrod Project Status

Last verified: 2026-07-29

Primary implementation workspace: `C:\Users\SANSKAR\COLDINGROD IMPLEMENTATION\coldingrod`

## Current phase

Phase 2.8 is approved: the real browser signup, email confirmation, login, and authenticated dashboard smoke test passed.

Phase 2.9 (Assets and File Manager) is implemented and validated. The linked Supabase database is migrated through `010`, both rollback-only acceptance suites pass, and the complete signed-in file lifecycle passed in the browser.

The next roadmap phase is Phase 2.10 (Activity Center and Notifications).

## Progress estimate

| Scope | Complete | Remaining |
| --- | ---: | ---: |
| Phase 1 | 100% | 0% |
| Phase 2.1–2.8 | 100% | 0% |
| Phase 2.9 Assets and File Manager | 100% | 0% |
| Phase 2 overall | approximately 92% | approximately 8% |
| Full currently discussed product plan | approximately 72% | approximately 28% |

These are planning estimates. Phase 2.10 is now the main remaining portion of Phase 2.

## Phase 2.9 delivered

- Private `workspace-assets` Supabase Storage bucket with a 25 MB per-file limit and an allowed MIME-type list.
- Workspace-isolated Storage SELECT, INSERT, UPDATE, and DELETE RLS policies.
- Storage paths scoped as `workspace-id/user-id/unique-file-name`.
- Asset metadata now includes upload source and automatic `updated_at`.
- Manager-only upload, rename, archive, restore, and permanent deletion.
- Active members can browse and download active workspace files; outsiders cannot access metadata or objects.
- Archived metadata and objects are manager-only.
- Multi-file drag/drop and native browse upload, up to 10 files per batch.
- Search, source and type filters, pagination, statistics, active/archive views, and empty states.
- Client/lead/project relation validation for related uploads.
- A short-lived signed download route for the private bucket.
- Permanent deletion removes both the Storage object and metadata row.
- The dashboard now loads both Tailwind/shadcn utilities and the Stitch design tokens in correct cascade layers. This fixes the previously unstyled login/dashboard/modal UI.

## Verified locally

- `.env.local` is configured and ignored by Git.
- `npx tsc --noEmit` passes.
- Phase 2.9 changed files pass targeted ESLint with zero findings.
- Production build passes on Next.js `16.2.12`.
- The local app renders the Stitch palette/typography with functional Tailwind/shadcn layouts and overlays.
- GitHub `main` tracks the local repository and contains no recognized secrets.
- Supabase CLI is authenticated, initialized, and linked to project `mspfxgxduehikohdsomg`.
- The Stitch reference package remains under `design-references/stitch/`.

## Hosted database verification

- Local and remote migration histories match through `010`.
- All 24 public tables exist with the existing 90 public RLS policies.
- One private asset bucket and four asset Storage policies are installed.
- The hosted database has 12 public functions, including the safe Storage workspace-path helper.
- The Phase 2.8 regression suite still passes after the asset migrations.
- The Phase 2.9 suite passes and rolls back every synthetic user, asset, and Storage row.
- The real browser test left zero generated asset rows and zero generated Storage objects.
- The Docker warning affects only local migration-catalog caching, not hosted deployment or verification.

## Phase 2.9 acceptance coverage

`supabase/tests/phase_2_9_assets_acceptance.sql` covers:

- Private bucket configuration and 25 MB file-size enforcement.
- Storage workspace path parsing and invalid-path rejection.
- All four Storage object policies.
- Manager metadata creation and private object access.
- Read-only access for a limited active member.
- Upload and metadata write denial without `manage_assets`.
- Complete outsider isolation.
- Manager-only archived metadata and object visibility.

The signed-in browser lifecycle additionally passed:

1. Upload a generated private text file.
2. Create and display its metadata.
3. Download it through a 60-second signed URL.
4. Rename it.
5. Archive it.
6. Verify the archived manager view.
7. Restore it.
8. Archive and permanently delete it.
9. Confirm zero test metadata and Storage rows remain.

## Known follow-up work

- Full-repository ESLint now runs, but reports 61 pre-existing errors and 43 warnings outside the Phase 2.9 files. Most are old explicit `any` types, unused imports, and React hook-rule findings.
- `npm audit --omit=dev` still reports transitive advisories in Next-bundled `postcss`/`sharp` and CLI-oriented dependencies. Next was upgraded from `16.2.10` to `16.2.12`, removing the direct framework advisories. Remaining transitive upgrades should be handled separately and regression-tested.
- Next.js still emits the non-blocking warning that the `middleware` convention is deprecated in favor of `proxy`.
- Supabase performance-advisor RLS optimization recommendations remain performance work, not failed authorization checks.

## Next work

Begin Phase 2.10: Activity Center and Notifications. Start by auditing the existing `activities` table, notification button shell, activity triggers, permission model, and the agreed ChatGPT project plan before implementing the notification inbox and read/unread workflow.
