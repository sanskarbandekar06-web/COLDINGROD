# Operations and rollback

## Health and basic monitoring

- `GET /api/health` checks that the Next.js server is responding.
- Supabase Dashboard shows Auth, database, API, and Storage logs.
- Vercel shows build, function, runtime, and deployment logs.
- Google Cloud Console shows Places API usage, errors, quota, and billing.

The health endpoint intentionally does not query Supabase. A healthy endpoint means the web process is alive, not that every external dependency is available.

## Before every release

```powershell
npm ci
npm run check
npm run audit:prod
npx supabase migration list --linked
npx supabase db lint --linked --schema public --level warning --fail-on warning
npx supabase db advisors --linked --type performance --level warn --fail-on warn
```

Run the hosted SQL regression loop from `docs/DATABASE.md` whenever a migration changes.

## Incident checklist

1. Identify whether the failure is web, Supabase, Google, or configuration.
2. Check the most recent deployment and migration.
3. Stop automatic deployment promotion if failures continue.
4. Do not paste secrets into logs, issues, screenshots, or chat.
5. Rotate a secret only if it may have been exposed; update every environment that uses it.
6. Record the incident, impact, cause, and corrective action.

## Web rollback

Use the hosting provider to promote the previous known-good deployment. Because `NEXT_PUBLIC_` variables are embedded during build, confirm the promoted deployment was built with the correct Supabase project and app URL.

## Database rollback

Do not edit old migration files and do not use `db reset --linked` on production. Create a new forward migration that safely reverses the problematic schema change. Test that migration and the complete hosted acceptance suite before applying it.

For a destructive or data-transforming change, take a Supabase backup first and write a restoration plan before deployment.

## Secret rotation

- Supabase publishable/anon key: update local and hosting variables, then redeploy.
- Google Places key: create a new restricted key, deploy it, verify traffic, then disable the old key.
- OAuth client secret: update the Supabase provider configuration and verify sign-in before retiring the old secret.
