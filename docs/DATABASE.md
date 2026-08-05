# Database setup and acceptance tests

## Apply migrations to a hosted project

Run these commands from the repository root:

```powershell
npx supabase login
npx supabase link --project-ref mspfxgxduehikohdsomg
npx supabase migration list --linked
npx supabase db push --linked
npx supabase migration list --linked
```

`migration list` should show the same entries under Local and Remote through `023_functionality_repairs.sql`.

For a different Supabase project, replace the project reference. Never run `supabase db reset --linked` against a database containing real data; remote reset drops and rebuilds the user-created schema.

## Run the complete hosted regression matrix

The SQL files in `supabase/tests` create synthetic fixtures inside a transaction and roll them back. They do not keep their test records.

PowerShell:

```powershell
$tests = Get-ChildItem supabase/tests -Filter *.sql | Sort-Object Name
foreach ($test in $tests) {
  npx supabase db query --linked --file $test.FullName
  if ($LASTEXITCODE -ne 0) {
    throw "Failed: $($test.Name)"
  }
}
```

The twelve suites cover:

- Authentication and workspace permission combinations
- Complete RLS isolation and denied direct writes
- Workspace invites, including restoration of a previously removed member
- Assets, storage ownership, activities, and notifications
- Lead qualification and explicit discovery import
- Research and evidence-grounded pain points
- Personalized outreach and atomic approval/rejection
- Follow-up response stopping and no automatic delivery
- Immutable analytics
- Integration controls and Google Place-ID retention
- Production RLS performance hardening
- Safe activity-note editing/redaction, atomic lead conversion, idempotency, and outsider/anonymous denial

## Database release checks

```powershell
npx supabase db lint --linked --schema public --level warning --fail-on warning
npx supabase db advisors --linked --type performance --level warn --fail-on warn
npx supabase db advisors --linked --type security --level info --fail-on none
```

The schema lint and performance advisor should be clean. The security advisor intentionally reports that selected `SECURITY DEFINER` RPCs are executable by authenticated users. Those RPCs are the application boundary: each checks `auth.uid()`, active membership, workspace identity, and the required permission before it changes data. The acceptance suites verify both permitted and denied calls.

Supabase may also recommend leaked-password protection. It can be enabled in **Authentication → Settings → Password security** on plans where Supabase provides the feature.

## Creating the next migration

```powershell
npx supabase migration new short_description
```

Write the change in the new file, test it on a disposable/local database, commit it, and then have one person apply it with `npx supabase db push --linked`.
