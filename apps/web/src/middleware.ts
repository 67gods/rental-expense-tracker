import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

/**
 * Route guard.
 *
 * Everything except the login page, the auth callbacks, and static assets
 * requires a session. Runs on the Edge runtime, so it checks the JWT directly
 * rather than importing the full auth config, which pulls in the database
 * client.
 */
const PUBLIC_PATHS = ['/login', '/api/auth'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET,
    secureCookie: process.env.NODE_ENV === 'production',
  });

  if (token) return NextResponse.next();

  // API callers get a status they can act on rather than an HTML login page.
  // The Android client at M4 depends on this distinction.
  if (pathname.startsWith('/api/')) {
    return NextResponse.json(
      { error: 'unauthenticated', message: 'Sign in to use this endpoint.' },
      { status: 401 },
    );
  }

  const loginUrl = new URL('/login', request.url);
  if (pathname !== '/') loginUrl.searchParams.set('next', pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    // Everything except Next internals, the favicon, and static files.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico|txt|webmanifest)$).*)',
  ],
};
