
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const FIREBASE_SESSION_COOKIE_NAME = '__session'; // Example if using Firebase session cookies
const LEGACY_FIREBASE_AUTH_COOKIE_PATTERN = /^firebase:authUser:[^:]+:[^:]+$/; // Pattern for legacy client-side SDK cookie
const DEV_ADMIN_OVERRIDE_COOKIE_NAME = 'dev_admin_override';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const devAdminOverrideCookie = request.cookies.get(DEV_ADMIN_OVERRIDE_COOKIE_NAME);
  const isDevAdminActive = process.env.NODE_ENV === 'development' && devAdminOverrideCookie?.value === 'true';

  // Allow access to API routes and static files without authentication
  if (pathname.startsWith('/api/') ||
      pathname.startsWith('/_next/') ||
      pathname.includes('.')) { // Check for file extensions like .ico, .png
    return NextResponse.next();
  }

  const isAuthPage = pathname.startsWith('/login') || pathname.startsWith('/register');

  if (isDevAdminActive) {
    console.log("Middleware: Dev admin override IS ACTIVE.");
    if (isAuthPage) {
      console.log("Middleware: Dev admin on auth page, redirecting to /");
      return NextResponse.redirect(new URL('/', request.url));
    }
    return NextResponse.next(); // Dev admin is active, allow access to app pages
  }

  // Standard Firebase authentication check
  let isAuthenticated = false;
  const sessionCookie = request.cookies.get(FIREBASE_SESSION_COOKIE_NAME);
  if (sessionCookie) {
    // In a real scenario, you'd verify this session cookie with Firebase Admin SDK
    isAuthenticated = true;
  } else {
    for (const [name] of request.cookies) {
      if (LEGACY_FIREBASE_AUTH_COOKIE_PATTERN.test(name)) {
        isAuthenticated = true;
        break;
      }
    }
  }

  if (isAuthenticated) {
    console.log("Middleware: User is authenticated via Firebase cookie.");
    if (isAuthPage) {
      console.log("Middleware: Authenticated user on auth page, redirecting to /");
      return NextResponse.redirect(new URL('/', request.url));
    }
    return NextResponse.next();
  }

  // If not authenticated by any means
  if (!isAuthPage) {
    console.log("Middleware: User NOT authenticated, and not on auth page. Redirecting to /login from", pathname);
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  // If on an auth page and not authenticated, allow access
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     *
     * We will handle /api routes within the middleware itself.
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
