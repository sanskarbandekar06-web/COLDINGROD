# Coldingrod

Coldingrod is a multi-workspace business operating system built with Next.js and Supabase. It includes leads, clients, projects, tasks, meetings, assets, members, notifications, auditable AI-assisted workflows, analytics, and a server-only Google Places discovery boundary.

The implementation follows a human-control rule: automation may analyze, prepare, and recommend, but lead imports and outreach decisions remain explicit human actions.

## What is included

- Email/password and Google authentication through Supabase Auth
- Personal and company workspaces with invitations and granular permissions
- Editable personal profiles, avatar storage, timezone/locale, communication, and AI preferences
- Leads, contacts, clients, projects, tasks, meetings, files, activity, and notifications
- Lead qualification, discovery, research, pain-point analysis, outreach drafting, follow-up planning, approvals, and analytics
- Google Places Text Search (New) with a server-only API key and Place-ID-only persistence
- Row Level Security, trusted permission-checking RPCs, immutable audit data, and rollback-only hosted acceptance tests
- Production health endpoint, security headers, error boundaries, CI, and deployment runbooks
- A token-free Chrome/Edge browser companion for capturing pages into human-reviewed Lead Discovery

## Requirements

- Node.js 20 or newer
- Git
- A Supabase project
- Docker Desktop only if you want to run Supabase locally; it is not required for the linked hosted workflow
- Optional: a Google Cloud project with Places API (New) for live provider search

## Beginner local setup

1. Clone the repository and enter it.

   ```powershell
   git clone https://github.com/sanskarbandekar06-web/COLDINGROD.git
   cd COLDINGROD
   ```

2. Install exactly the dependencies recorded in `package-lock.json`.

   ```powershell
   npm ci
   ```

3. Create the private environment file.

   ```powershell
   Copy-Item .env.local.example .env.local
   ```

4. In Supabase Dashboard, open **Project Settings → API** and copy:

   - Project URL into `NEXT_PUBLIC_SUPABASE_URL`
   - Publishable or anon key into `NEXT_PUBLIC_SUPABASE_ANON_KEY`

   Set `NEXT_PUBLIC_APP_URL=http://localhost:3000`. Do not use or commit the service-role key.

5. Apply the database migrations.

   ```powershell
   npx supabase login
   npx supabase link --project-ref mspfxgxduehikohdsomg
   npx supabase migration list --linked
   npx supabase db push --linked
   ```

6. Start the app.

   ```powershell
   npm run dev
   ```

7. Open [http://localhost:3000](http://localhost:3000).

The linked project already has migrations 001–024. For a new clean Supabase project, linking it and running `db push` applies all migrations in order.

## Environment variables

| Variable | Required | Exposure | Purpose |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Browser-safe | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Browser-safe | Supabase publishable/anon key protected by RLS |
| `NEXT_PUBLIC_APP_URL` | Yes in production | Browser-safe | Exact application origin used for Auth callbacks |
| `GOOGLE_PLACES_API_KEY` | Optional | Server only | Enables Google Places Text Search (New) |

Never prefix the Google key with `NEXT_PUBLIC_`.

## Quality checks

```powershell
npm run typecheck
npm run lint
npm run build
npm run audit:prod
npm run check
```

The GitHub Actions workflow runs the same application checks on pushes and pull requests. Hosted database tests are kept separate because they require authorized access to the Supabase project.

## Documentation

- [Database and acceptance tests](docs/DATABASE.md)
- [Browser companion installation](browser-extension/README.md)
- [Production deployment](docs/DEPLOYMENT.md)
- [Google Places setup](docs/GOOGLE_PLACES.md)
- [Operations and rollback](docs/OPERATIONS.md)
- [Security model](SECURITY.md)
- [Current implementation status](PROJECT_STATUS.md)

## Important workflow rule

Once a Supabase project is managed by migrations, do not make schema changes directly in the Dashboard SQL or Table editors. Create a new migration, test it, commit it, and let one person run `supabase db push`.
