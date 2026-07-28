# Coldingrod Beginner Setup: Supabase, GitHub, Migrations, and Security Tests

This guide is written for the current Coldingrod project at:

```text
C:\Users\SANSKAR\COLDINGROD IMPLEMENTATION\coldingrod
```

Read the safety rules first, then follow the sections in order.

## Safety rules

1. Never paste your Supabase database password, secret key, or legacy `service_role` key into chat, GitHub, screenshots, or source files.
2. Only the Supabase project URL and **publishable key** are intended for the browser.
3. The project currently calls the publishable key `NEXT_PUBLIC_SUPABASE_ANON_KEY`. The variable name is older, but its value should be the current `sb_publishable_...` key.
4. Never commit `.env.local`.
5. Do not use Supabase's Table Editor or SQL Editor to make schema changes after migrations are connected. Schema changes must be added as migration files and deployed with `supabase db push`.
6. Never run `supabase db reset --linked` against a project containing important data. It deletes the remote database data before rebuilding it.
7. If a migration command reports an error, stop. Do not run `migration repair`, reset commands, or later migrations until the error has been reviewed.

Official references:

- [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys)
- [Supabase CLI installation](https://supabase.com/docs/guides/local-development/cli/getting-started)
- [Supabase migration workflow](https://supabase.com/docs/guides/deployment/database-migrations)
- [GitHub: add existing local code](https://docs.github.com/en/migrations/importing-source-code/using-the-command-line-to-import-source-code/adding-locally-hosted-code-to-github)

## Part 1 — Create or verify the Supabase project

Having a Supabase account is not the same as having a project. The project is the hosted database used by Coldingrod.

1. Open [Supabase Dashboard](https://supabase.com/dashboard) and sign in.
2. Look for an existing project intended only for Coldingrod.
3. If no Coldingrod project exists, click **New project**.
4. Select your personal organization, or create one if Supabase asks.
5. Use a name such as `coldingrod-dev`.
6. Generate a strong database password and save it in a password manager. Do not send this password to anyone.
7. Select a region close to the expected users.
8. Choose the Free plan for development unless the project already needs paid capacity.
9. Create the project and wait until its status is healthy.

### Confirm that it is a clean project

1. Open **Table Editor**.
2. A clean project should not already contain Coldingrod tables such as `workspaces`, `clients`, `meetings`, or `workspace_members`.
3. If those tables already exist or the project contains important data, stop. Do not apply these migrations. Create a separate clean development project instead.

### Record the non-secret project reference

The dashboard URL looks similar to:

```text
https://supabase.com/dashboard/project/abcdefghijklmnop
```

The characters after `/project/` are the project reference. It is safe to tell Codex the project reference, but not the database password.

## Part 2 — Obtain the safe browser connection values

1. Open the Coldingrod project.
2. Click **Connect**, or open **Project Settings → API Keys**.
3. Copy the **Project URL**. It resembles:

   ```text
   https://abcdefghijklmnop.supabase.co
   ```

4. Copy the **Publishable key**. It begins with:

   ```text
   sb_publishable_
   ```

5. Do not copy a Secret key or legacy `service_role` key.

Supabase recommends publishable keys for browser applications. Secret and `service_role` keys bypass Row Level Security and must never be placed in `NEXT_PUBLIC_...` variables.

## Part 3 — Create `.env.local`

Open PowerShell and run:

```powershell
Set-Location 'C:\Users\SANSKAR\COLDINGROD IMPLEMENTATION\coldingrod'
Copy-Item '.env.local.example' '.env.local'
notepad '.env.local'
```

Replace the placeholders with:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_YOUR_KEY
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Rules:

- Do not add quotation marks.
- Do not put spaces around `=`.
- Save and close Notepad.
- Do not share the completed file.
- Restart the Next.js development server whenever environment variables change.

The existing `.gitignore` excludes `.env.local`, so it should not be uploaded to GitHub.

## Part 4 — Configure Supabase Auth URLs

1. In Supabase, open **Authentication → URL Configuration**.
2. Set **Site URL** to:

   ```text
   http://localhost:3000
   ```

3. Add this development **Redirect URL**:

   ```text
   http://localhost:3000/**
   ```

4. Save the changes.
5. Keep email/password authentication enabled.
6. Keep email confirmation enabled for realistic testing. Hosted Supabase projects normally require confirmation by default.

The default Supabase test email sender is rate-limited, so do not repeatedly create many accounts in a short period. Production will eventually need custom SMTP.

Official references:

- [Supabase redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
- [Supabase password authentication](https://supabase.com/docs/guides/auth/passwords)

## Part 5 — Create the GitHub repository

The application folder is not currently a Git repository. Git is installed on this computer, but GitHub CLI is not installed. The simplest first step is to create an empty repository on GitHub's website.

1. Open [GitHub](https://github.com) and sign in.
2. Click the **+** button in the upper-right corner.
3. Click **New repository**.
4. Set **Owner** to your personal GitHub account.
5. Set **Repository name** to `coldingrod`.
6. Add a short description such as `Agency business operating system`.
7. Select **Private**.
8. Do not select:
   - Add a README
   - Add `.gitignore`
   - Choose a license
9. Click **Create repository**.
10. Copy the HTTPS repository URL:

    ```text
    https://github.com/YOUR_USERNAME/coldingrod.git
    ```

11. Send Codex only this repository URL. It is not a secret.

The repository must be empty because the local project already has a README and `.gitignore`. GitHub also recommends not pre-populating those files when pushing an existing project.

### Local Git commands

Codex can safely run these after the empty repository exists:

```powershell
Set-Location 'C:\Users\SANSKAR\COLDINGROD IMPLEMENTATION\coldingrod'
git init
git branch -M main
git status
git add .
git status
git commit -m "Initial Coldingrod Phase 2.8"
git remote add origin https://github.com/YOUR_USERNAME/coldingrod.git
git push -u origin main
```

Before the commit, confirm that these are not listed:

- `.env.local`
- `node_modules`
- `.next`
- database passwords
- Supabase secret or `service_role` keys

GitHub may open a browser sign-in through Git Credential Manager during the first push.

## Part 6 — Prepare the Supabase CLI

The recommended migration method is the CLI, not pasting schema migrations into the remote SQL Editor. CLI deployment records every applied migration in `supabase_migrations.schema_migrations`.

Node.js 24 is already installed and meets the CLI's Node.js 20-or-newer requirement.

From PowerShell:

```powershell
Set-Location 'C:\Users\SANSKAR\COLDINGROD IMPLEMENTATION\coldingrod'
npm install --save-dev supabase
npx supabase init
npx supabase login
```

What happens:

1. Installation adds the Supabase CLI as a development dependency.
2. `supabase init` creates `supabase/config.toml`. It must preserve the existing `supabase/migrations` folder.
3. `supabase login` opens a browser so you can authorize the CLI.

Do not paste an access token into source files.

Docker is not required just to link and push to the hosted project. Docker is required later if we want a full disposable Supabase stack on this computer.

## Part 7 — Link the clean Supabase project

Run:

```powershell
npx supabase link --project-ref YOUR_PROJECT_REF
```

The CLI may ask for the database password created in Part 1. Type it only into the local prompt.

Because this is a clean project, do not run `supabase db pull` before the initial push. A pull is for preserving schema that already exists remotely.

Check the migration status:

```powershell
npx supabase migration list --linked
```

The local side should show versions `001` through `006`; the remote side should initially be empty.

## Part 8 — Preview and apply migrations 001–006

First run a dry run:

```powershell
npx supabase db push --linked --dry-run
```

Expected order:

1. `001_core_tenancy.sql`
2. `002_ai_engine_and_integrations.sql`
3. `003_business_entities.sql`
4. `004_work_system_and_assets.sql`
5. `005_functions_and_triggers.sql`
6. `006_rls_policies.sql`

If the dry run does not show all six in this order, stop and send the complete terminal output to Codex.

If the preview is correct:

```powershell
npx supabase db push --linked
```

After success:

```powershell
npx supabase migration list --linked
```

Every local migration should have a matching remote version.

Do not paste the six files into the remote SQL Editor as the normal deployment method. Supabase warns that direct remote schema changes bypass migration history and can cause future `db push` synchronization errors.

## Part 9 — Verify the migrated database

The SQL Editor is appropriate for read-only verification queries.

### Verify migration history

Open **SQL Editor → New query**, run:

```sql
select version, name
from supabase_migrations.schema_migrations
order by version;
```

Expected: six rows, versions `001` through `006`.

### Verify Coldingrod tables

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_type = 'BASE TABLE'
order by table_name;
```

Expected: 24 Coldingrod public tables.

### Verify RLS

```sql
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
order by tablename;
```

Expected: all 24 Coldingrod tables have `rowsecurity = true`.

### Verify important functions

```sql
select routine_name, security_type
from information_schema.routines
where routine_schema = 'public'
order by routine_name;
```

Confirm that the list includes:

- `accept_workspace_invite`
- `create_company_workspace`
- `has_workspace_permission`
- `is_active_workspace_member`
- `remove_workspace_member`
- `set_workspace_member_permissions`

## Part 10 — Start the application

In PowerShell:

```powershell
Set-Location 'C:\Users\SANSKAR\COLDINGROD IMPLEMENTATION\coldingrod'
npm run dev
```

Open:

```text
http://localhost:3000
```

If the port is already occupied, Next.js may use another port. Use the URL printed in the terminal.

## Part 11 — Test the auth trigger

1. Open `/signup`.
2. Create the first account, called **User A** in this guide.
3. Confirm the email through the message sent by Supabase.
4. Sign in.
5. Open Supabase **Authentication → Users** and confirm User A exists.
6. Open **Table Editor** and verify:
   - `users` contains User A.
   - `workspaces` contains a personal workspace.
   - `workspace_members` contains an active membership.
   - `workspace_permissions` contains permissions for that membership.

Read-only SQL verification:

```sql
select
  au.email,
  w.name as workspace_name,
  w.is_personal,
  count(wp.id) as permission_count
from auth.users au
join public.users u on u.id = au.id
join public.workspace_members wm on wm.user_id = u.id
join public.workspaces w on w.id = wm.workspace_id
left join public.workspace_permissions wp on wp.workspace_member_id = wm.id
where lower(au.email) = lower('USER_A_EMAIL')
  and wm.deleted_at is null
group by au.email, w.name, w.is_personal;
```

Expected: the personal workspace has 12 permissions.

This verifies the `on_auth_user_created` trigger.

## Part 12 — Test company-workspace creation

1. Sign in as User A.
2. Use the Coldingrod create-workspace page.
3. Create a company workspace.
4. Open it.
5. Verify that User A can access Members, Meetings, Clients, Leads, Projects, Tasks, Settings, and AI routes.
6. In Supabase, verify the new `workspaces` row has `is_personal = false`.
7. Verify the creator has 12 permissions.

This exercises `create_company_workspace`.

## Part 13 — Test invitation and restoration

Use a second real test email, called **User B**.

### First invitation

1. Sign up User B and confirm the email.
2. Sign in as User A.
3. Open the company workspace's **Members** page.
4. Invite User B with a small permission set, such as `manage_meetings`.
5. The current project creates the invitation record but does not yet send a real workspace-invitation email.
6. For development testing only, retrieve the newest token in Supabase SQL Editor:

   ```sql
   select email, token, expires_at, status
   from public.workspace_invites
   where lower(email) = lower('USER_B_EMAIL')
   order by created_at desc
   limit 1;
   ```

7. Copy the token.
8. Sign in as User B in a different browser profile or private window.
9. Open:

   ```text
   http://localhost:3000/invite/COPIED_TOKEN
   ```

10. Accept the invitation.
11. Verify User B can open the company workspace.

### Removal and restoration

1. Sign in as User A.
2. Remove User B from the Members page.
3. Verify User B immediately loses company-workspace access.
4. Invite User B again, this time with a different permission set.
5. Retrieve and open the new token as User B.
6. Accept the new invitation.
7. Verify User B is active again.
8. Verify only the newly selected permissions are present. Old permissions must not return.

This tests:

- `accept_workspace_invite`
- soft-deleted membership restoration
- clearing stale permissions
- atomic member removal
- invitation email matching and expiration

Never publish invitation tokens or put them in screenshots.

## Part 14 — Test meetings and availability

As User A, who has `manage_meetings`:

1. Create an unscheduled requested meeting.
2. Edit its title and description.
3. Add a schedule and confirm it becomes scheduled.
4. Add User B as a participant.
5. Confirm duplicate participant addition is rejected.
6. Confirm the organizer cannot be removed.
7. Attempt an overlapping meeting for the organizer or User B and confirm it is rejected.
8. Test valid status transitions.
9. Archive the meeting.
10. Confirm it leaves the active list.
11. Open Archived Meetings and restore it.
12. Add, edit, and delete your personal availability.
13. Create two overlapping availability slots and confirm the second is rejected.

As User B without `manage_meetings`:

1. Confirm meetings can be viewed.
2. Confirm meeting create/edit/archive/participant controls are unavailable or rejected.
3. Confirm User B can manage only their own availability.

## Part 15 — Test the complete RLS matrix

Use separate browser profiles so sessions do not overwrite each other.

| Test identity | Expected access |
| --- | --- |
| User A — workspace manager | Can manage allowed company records and members |
| User B — active limited member | Can read workspace data; mutations depend on assigned permissions |
| User C — authenticated outsider | Cannot read or mutate the company workspace |
| Removed User B | Immediately loses company-workspace access |
| Logged-out browser | Cannot access dashboard data |

For each identity, test:

1. Workspace page access.
2. Members list access.
3. Member invitation, permission edit, and removal.
4. Meeting view and meeting mutation.
5. Availability view and own-slot mutation.
6. Client, lead, project, task, AI, integration, and settings routes.
7. Direct navigation using a copied URL from User A's browser.

Do not rely only on hidden buttons. A secure result means the server/database rejects unauthorized direct requests too. After the accounts exist, Codex should add or run scripted RLS checks using temporary credentials rather than asking a beginner to simulate JWT claims manually in SQL.

## Part 16 — Attached Stitch UI package

The attached UI reference is located outside the application repository:

```text
C:\Users\SANSKAR\COLDINGROD IMPLEMENTATION\Coldingrod_Design_System_v1.md\stitch_coldingrod_design_system\stitch_coldingrod_design_system
```

It contains:

- 21 screen screenshots
- 21 matching HTML mockups
- 3 design-system documents

It includes app shell, dashboard, clients, leads, meetings, AI, settings, onboarding, notifications, proposals, and analytics references.

Because it is outside the `coldingrod` application folder, it will not be included in the GitHub repository unless it is deliberately copied into a folder such as:

```text
design-references/stitch/
```

The primary Coldingrod design document and the `Executive Precision` document contain slightly different accent palettes. Before implementing the screens, use one canonical token set. The main Coldingrod document is the safest default; the Executive Precision set should be treated as an optional variant unless explicitly selected.

Do not paste the raw Stitch HTML directly over the working Next.js application. Use it as a visual and interaction reference, then implement it using the existing React, Tailwind, and Base UI component system.

## Completion checklist

Setup is complete only when every item is checked:

- [ ] Clean Supabase project exists.
- [ ] Database password is safely stored and not shared.
- [ ] Project URL and publishable key are in `.env.local`.
- [ ] Auth Site URL and Redirect URL are configured.
- [ ] Empty private GitHub repository exists.
- [ ] Local project is committed and pushed without secrets.
- [ ] Supabase CLI is installed and initialized.
- [ ] Local project is linked to the correct Supabase project.
- [ ] Dry run shows migrations 001–006 in order.
- [ ] `db push` succeeds.
- [ ] Migration history shows six matching versions.
- [ ] All 24 public tables exist with RLS enabled.
- [ ] Auth user creation trigger passes.
- [ ] Company workspace creation passes.
- [ ] Invitation, removal, and restoration pass.
- [ ] Meeting and availability tests pass.
- [ ] Manager, limited member, outsider, removed member, and logged-out RLS tests pass.
- [ ] Phase 2.8 is approved before Phase 2.9 begins.
