import { redirect } from 'next/navigation';
import { auth, signIn } from '@/lib/auth';

export const metadata = { title: 'Sign in — Rental Tracker' };

/** Auth.js reports failures as a code in the query string. */
const ERROR_COPY: Record<string, string> = {
  AccessDenied:
    'That Google account is not on the household list, so it cannot sign in. Check you picked the right account.',
  Verification: 'That sign-in link has expired. Try again.',
  Configuration:
    'Sign-in is not configured yet. The Google client ID, secret, and allowed email list all need to be set.',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const session = await auth();
  const params = await searchParams;

  if (session?.user) redirect(params.next ?? '/');

  const error = params.error
    ? (ERROR_COPY[params.error] ?? 'Sign-in did not go through. Try again.')
    : null;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-10">
      <div className="panel panel-body">
        <h1 className="text-2xl font-bold tracking-tight">Rental Tracker</h1>
        <p className="hint mt-1 text-sm">
          Expenses, hours, mileage, and time on site for the portfolio.
        </p>

        {error ? (
          <p
            role="alert"
            className="mt-4 rounded-lg border border-[color:var(--color-alert-500)] bg-[color:var(--color-alert-50)] p-3 text-sm text-[color:var(--color-alert-700)]"
          >
            {error}
          </p>
        ) : null}

        <form
          className="mt-6"
          action={async () => {
            'use server';
            await signIn('google', { redirectTo: params.next ?? '/' });
          }}
        >
          <button type="submit" className="btn btn-primary btn-block">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path
                fill="currentColor"
                d="M12.24 10.29v3.62h5.02c-.2 1.3-1.5 3.8-5.02 3.8-3.02 0-5.48-2.5-5.48-5.58s2.46-5.58 5.48-5.58c1.72 0 2.87.73 3.53 1.36l2.4-2.32C16.6 3.9 14.6 3 12.24 3 7.44 3 3.56 6.88 3.56 11.68s3.88 8.68 8.68 8.68c5.01 0 8.33-3.52 8.33-8.48 0-.57-.06-1-.14-1.43z"
              />
            </svg>
            Continue with Google
          </button>
        </form>

        <p className="hint mt-5">
          Only the two household Google accounts can sign in. Every entry is
          recorded against whoever is signed in, so use your own account rather
          than a shared one.
        </p>
      </div>
    </main>
  );
}
