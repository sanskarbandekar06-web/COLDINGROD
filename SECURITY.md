# Security

## Reporting

Do not open a public GitHub issue containing credentials, personal data, or a reproducible exploit. Contact the repository owner privately with the affected route, impact, and reproduction steps.

## Security model

- Supabase Row Level Security isolates every workspace-owned table.
- Trusted RPCs use `SECURITY DEFINER` only where atomic cross-table work is required.
- Each client-callable trusted RPC validates the authenticated user, active workspace membership, workspace identifier, and required permissions.
- Direct authenticated writes to AI scores, discovery state, research reports, analytics snapshots, and provider references are denied.
- Lead discovery and outreach require explicit human selection or approval.
- Provider secrets remain in server environment variables and are rejected from integration metadata.
- Google Places results are ephemeral; only the selected Place ID is retained.
- Security headers deny framing, MIME sniffing, sensitive browser capabilities, and cross-origin opener/resource sharing.

## Secrets

Never commit:

- `.env.local`
- Supabase service-role keys
- Supabase database passwords
- Google API keys
- OAuth client secrets
- Personal access tokens

The Supabase publishable/anon key is designed for browser use, but it is safe only because RLS is enabled and tested. The service-role key bypasses RLS and must never be used in this web application.

## Automated checks

- TypeScript and ESLint on the entire repository
- Production Next.js build
- Production dependency audit
- Supabase schema lint
- Supabase security and performance advisors
- Eleven rollback-only hosted acceptance suites

Authenticated `SECURITY DEFINER` advisor findings are reviewed exceptions for the trusted RPC boundary described above. They are not blanket grants: the regression matrix includes denied cross-workspace and missing-permission calls.
