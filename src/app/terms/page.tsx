import Link from 'next/link';

export default function TermsPage() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-12">
      <p className="text-sm font-medium text-primary">Coldingrod</p>
      <h1 className="mt-2 text-3xl font-bold">Terms of Use</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Last updated July 31, 2026
      </p>
      <div className="mt-8 space-y-6 text-sm leading-7 text-muted-foreground">
        <section>
          <h2 className="text-lg font-semibold text-foreground">
            Responsible use
          </h2>
          <p className="mt-2">
            You are responsible for the business information, outreach content,
            consent, and account credentials you use with Coldingrod. Automated
            drafts require human review, and you must follow applicable privacy,
            marketing, anti-spam, and platform rules.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-foreground">
            Third-party services
          </h2>
          <p className="mt-2">
            Optional integrations are governed by their own terms. Google Places
            functionality is also subject to the{' '}
            <a
              href="https://cloud.google.com/maps-platform/terms"
              className="text-primary underline underline-offset-4"
            >
              Google Maps Platform Terms
            </a>
            . Provider availability, billing, quotas, and returned data are
            controlled by the provider.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-foreground">
            No guaranteed outcome
          </h2>
          <p className="mt-2">
            Analytics and recommendations are calculated from stored workspace
            records. They do not promise revenue, delivery, responses, meetings,
            or any other business result.
          </p>
        </section>
      </div>
      <div className="mt-10 flex gap-4 text-sm">
        <Link href="/privacy" className="text-primary underline">
          Privacy
        </Link>
        <Link href="/login" className="text-primary underline">
          Return to sign in
        </Link>
      </div>
    </main>
  );
}
