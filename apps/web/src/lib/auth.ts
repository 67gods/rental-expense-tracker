import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import { env } from '@/env';

/**
 * Authentication (brief §8.3: two-user auth, kept simple).
 *
 * Google SSO with a fixed email allowlist. There is no org, no role hierarchy,
 * and no invitation flow - two people share one household's data with equal
 * permissions. Anyone not on the list is refused at sign-in rather than let in
 * with reduced access.
 *
 * Sessions are JWTs, so no adapter tables and no database round trip on every
 * request. The link between a signed-in Google account and an `actors` row is
 * resolved separately in session.ts, because actors also cover contractors and
 * property managers who never sign in.
 */
export const { handlers, signIn, signOut, auth } = NextAuth(() => ({
  secret: env.authSecret,
  providers: [
    Google({
      clientId: env.googleClientId,
      clientSecret: env.googleClientSecret,
      authorization: {
        params: {
          prompt: 'select_account',
          // Both spouses reach this from shared devices; forcing the account
          // chooser avoids logging work under the wrong person (§4).
          access_type: 'online',
        },
      },
    }),
  ],
  session: {
    strategy: 'jwt',
    // Long-lived: re-authenticating in a parking lot is how entries stop
    // getting made. Thirty days, refreshed on use.
    maxAge: 60 * 60 * 24 * 30,
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  callbacks: {
    signIn({ profile }) {
      const email = profile?.email?.toLowerCase();
      if (!email) return false;
      if (!profile?.email_verified) return false;
      return env.allowedEmails.includes(email);
    },
    jwt({ token, profile }) {
      if (profile?.sub) token.sub = profile.sub;
      if (profile?.email) token.email = profile.email.toLowerCase();
      if (profile?.name) token.name = profile.name;
      if (typeof profile?.picture === 'string') token.picture = profile.picture;
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? '';
        session.user.email = token.email ?? session.user.email;
      }
      return session;
    },
  },
  trustHost: true,
}));

/** True when this email is permitted to sign in. Used by the login page copy. */
export function isAllowedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return env.allowedEmails.includes(email.toLowerCase());
}
