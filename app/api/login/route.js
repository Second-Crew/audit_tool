import { NextResponse } from 'next/server';
import { ACCESS_COOKIE, accessToken, timingSafeEqualHex } from '../../../lib/access.js';

export const runtime = 'nodejs';

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export async function POST(request) {
  const password = process.env.APP_ACCESS_PASSWORD;
  if (!password) {
    return NextResponse.json({ error: 'The access gate is not enabled on this deployment' }, { status: 400 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 });
  }

  const submitted = typeof body?.password === 'string' ? body.password : '';
  // Compare fixed-length digests so the check is constant-time regardless of
  // submitted password length.
  const [expectedToken, submittedToken] = await Promise.all([accessToken(password), accessToken(submitted)]);

  if (!timingSafeEqualHex(submittedToken, expectedToken)) {
    return NextResponse.json({ error: 'Incorrect password' }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(ACCESS_COOKIE, expectedToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return response;
}
