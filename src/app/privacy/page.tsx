import Link from 'next/link';

export default function PrivacyPage() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-12">
      <p className="text-sm font-medium text-primary">Coldingrod</p>
      <h1 className="mt-2 text-3xl font-bold">Privacy Policy</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Last updated July 31, 2026
      </p>
      <div className="mt-8 space-y-6 text-sm leading-7 text-muted-foreground">
        <section>
          <h2 className="text-lg font-semibold text-foreground">
            Workspace data
          </h2>
          <p className="mt-2">
            Coldingrod stores account, workspace, lead, client, project,
            outreach, meeting, asset metadata, audit, notification, and AI
            workflow records needed to provide the product. Supabase
            authentication and row-level security isolate workspace access.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-foreground">
            Integration credentials
          </h2>
          <p className="mt-2">
            Provider secrets are server environment values and are not saved in
            workspace integration metadata or returned to the browser.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-foreground">
            Google Places
          </h2>
          <p className="mt-2">
            Google Places search results are displayed temporarily with Google
            Maps attribution. Coldingrod does not automatically persist Places
            content; only a selected Place ID may be retained as an external
            reference. Google processes provider requests under the{' '}
            <a
              href="https://policies.google.com/privacy"
              className="text-primary underline underline-offset-4"
            >
              Google Privacy Policy
            </a>
            .
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-foreground">
            Access and deletion
          </h2>
          <p className="mt-2">
            Workspace permissions control access. Authorized members can archive
            or remove supported records, and owners should contact the operator
            for account-level export or deletion requests.
          </p>
        </section>
      </div>
      <div className="mt-10 flex gap-4 text-sm">
        <Link href="/terms" className="text-primary underline">
          Terms
        </Link>
        <Link href="/login" className="text-primary underline">
          Return to sign in
        </Link>
      </div>
    </main>
  );
}
