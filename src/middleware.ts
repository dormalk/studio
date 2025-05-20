
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const FIREBASE_SESSION_COOKIE_NAME = '__session'; // Example if using Firebase session cookies
const LEGACY_FIREBASE_AUTH_COOKIE_PATTERN = /^firebase:authUser:[^:]+:[^:]+$/;

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow access to API routes and static files without authentication
  if (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next/') ||
    pathname.includes('.') // Check for file extensions like .ico, .png
  ) {
    return NextResponse.next();
  }

  const isAuthPage = pathname.startsWith('/login') || pathname.startsWith('/register');

  // Standard Firebase authentication check
  let isAuthenticated = false;
  const sessionCookie = request.cookies.get(FIREBASE_SESSION_COOKIE_NAME);
  
  if (sessionCookie) {
    // In a real production app, you would verify this session cookie with Firebase Admin SDK.
    // For this example, presence of the cookie implies authentication.
    isAuthenticated = true;
    console.log("Middleware: User is authenticated via session cookie.");
  } else {
    // Check for legacy Firebase client-side SDK cookie as a fallback
    // This is less secure and typically used in client-rendered apps or during transition
    for (const [name] of request.cookies) {
      if (LEGACY_FIREBASE_AUTH_COOKIE_PATTERN.test(name)) {
        isAuthenticated = true;
        console.log("Middleware: User is authenticated via legacy Firebase auth cookie.");
        break;
      }
    }
  }

  if (isAuthenticated) {
    if (isAuthPage) {
      console.log("Middleware: Authenticated user on auth page, redirecting to /");
      return NextResponse.redirect(new URL('/', request.url));
    }
    return NextResponse.next(); // Allow access to app pages
  }

  // If not authenticated by any means and not on an auth page, redirect to login
  if (!isAuthPage) {
    console.log("Middleware: User NOT authenticated, and not on auth page. Redirecting to /login from", pathname);
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirectBackTo', pathname); // Optional: redirect back after login
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
