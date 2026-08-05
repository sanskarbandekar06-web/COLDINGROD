import Link from 'next/link';
import { AlertCircle } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';

export default async function AuthCodeErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>;
}) {
  const { message } = await searchParams;

  return (
    <main className="flex min-h-svh items-center justify-center bg-brand-canvas p-6">
      <section className="coldingrod-card w-full max-w-md p-8 text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertCircle className="size-6" aria-hidden="true" />
        </span>
        <h1 className="mt-5 text-2xl font-semibold text-brand-navy">
          Sign-in could not be completed
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {message || 'The sign-in link is invalid or expired. Please try again.'}
        </p>
        <Link href="/login" className={buttonVariants({ className: 'mt-6 w-full' })}>
          Return to sign in
        </Link>
      </section>
    </main>
  );
}
