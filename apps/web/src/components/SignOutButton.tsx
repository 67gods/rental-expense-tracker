import { signOut } from '@/lib/auth';

export function SignOutButton() {
  return (
    <form
      action={async () => {
        'use server';
        await signOut({ redirectTo: '/login' });
      }}
    >
      <button type="submit" className="btn btn-ghost text-xs">
        Sign out
      </button>
    </form>
  );
}
