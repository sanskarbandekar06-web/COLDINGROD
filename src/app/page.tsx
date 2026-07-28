import { redirect } from 'next/navigation';

export default function RootPage() {
  // Redirect root to dashboard (middleware will bounce to login if unauthenticated)
  redirect('/dashboard');
}
