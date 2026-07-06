import { NextResponse } from 'next/server';
import { ACCESS_COOKIE, accessToken, timingSafeEqualHex } from './lib/access.js';

// Gates the whole workspace behind APP_ACCESS_PASSWORD when it is set.
// Prospect-facing report links (/r/<id>) and the login flow stay public.
// Leaving the env var unset disables the gate entirely (local dev default).
const PUBLIC_PATH_PATTERNS = [/^\/login$/, /^\/api\/login$/, /^\/r\//];

export async function middleware(request) {
  const password = process.env.APP_ACCESS_PASSWORD;
  if (!password) return NextResponse.next();

  const { pathname } = request.nextUrl;
  if (PUBLIC_PATH_PATTERNS.some((pattern) => pattern.test(pathname))) {
    return NextResponse.next();
  }

  const cookie = request.cookies.get(ACCESS_COOKIE)?.value || '';
  const expected = await accessToken(password);
  if (timingSafeEqualHex(cookie, expected)) {
    return NextResponse.next();
  }

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
  return NextResponse.redirect(new URL('/login', request.url));
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
