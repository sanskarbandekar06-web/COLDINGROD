# Production deployment

This guide uses GitHub plus Vercel because the repository is already on GitHub and Vercel supports the complete Next.js server feature set used by Coldingrod.

## 1. Confirm the release locally

```powershell
git pull origin main
npm ci
npm run check
npm run audit:prod
npx supabase migration list --linked
```

Do not deploy if any command fails or if Local and Remote migrations differ.

## 2. Import the GitHub repository into Vercel

1. Sign in at [vercel.com](https://vercel.com).
2. Select **Add New → Project**.
3. Connect GitHub if it is not connected.
4. Import `sanskarbandekar06-web/COLDINGROD`.
5. Keep **Framework Preset: Next.js**.
6. Keep the project root as the repository root.
7. Do not deploy until the environment variables below are entered.

## 3. Add production environment variables

In **Vercel Project → Settings → Environment Variables**, add:

```text
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_OR_ANON_KEY
NEXT_PUBLIC_APP_URL=https://YOUR_PRODUCTION_DOMAIN
GOOGLE_PLACES_API_KEY=YOUR_SERVER_ONLY_KEY
```

Apply the Supabase variables and app URL to Production and Preview as appropriate. Use a separate restricted Google key for production when possible. Never add a Supabase service-role key.

## 4. Configure Supabase Auth URLs

In **Supabase Dashboard → Authentication → URL Configuration**:

1. Set **Site URL** to the exact production origin.
2. Add `https://YOUR_PRODUCTION_DOMAIN/auth/callback` to Redirect URLs.
3. If you use Vercel previews for authentication, add only the preview patterns you deliberately trust.

For Google login, also configure the Google provider in **Authentication → Providers → Google** using the callback URL shown by Supabase.

## 5. Deploy

Return to Vercel and select **Deploy**. After it finishes:

1. Open `/api/health`; it must return `{"service":"coldingrod","status":"ok"}`.
2. Open `/terms` and `/privacy` while signed out.
3. Create and confirm a test account.
4. Sign in and open every sidebar route.
5. Create a disposable workspace, member invite, lead, project, task, and meeting.
6. Verify a discovery run requires human selection before import.
7. Verify outreach remains a draft until human approval.

## 6. Custom domain

Add the domain in **Vercel Project → Settings → Domains**, follow the displayed DNS instructions, then update:

- `NEXT_PUBLIC_APP_URL`
- Supabase Site URL
- Supabase allowed Redirect URLs
- Google OAuth authorized URLs, if Google login is enabled

Redeploy after changing build-time `NEXT_PUBLIC_` values.

## GitHub behavior

The workflow at `.github/workflows/ci.yml` validates each push and pull request. Vercel creates preview deployments for branches and production deployments from `main` once the repository integration is enabled.
