import { signOut } from '@/lib/auth';

/**
 * Sign out, living in the rail foot.
 *
 * There is no page header any more, so this sits at the bottom of the rail
 * beside who you are - where a desktop app puts it, and a long way from
 * anything destructive.
 */
export function SignOutButton() {
  return (
    <form
      action={async () => {
        'use server';
        await signOut({ redirectTo: '/login' });
      }}
    >
      <button type="submit" className="btn btn-block">
        Sign out
      </button>
    </form>
  );
}
