'use client';

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <main className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
          <div className="max-w-md space-y-4 text-center">
            <p className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
              Coldingrod
            </p>
            <h1 className="text-2xl font-semibold">Something went wrong</h1>
            <p className="text-sm text-muted-foreground">
              The request could not be completed. Your stored workspace data was not changed.
            </p>
            <button
              type="button"
              onClick={reset}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              Try again
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
