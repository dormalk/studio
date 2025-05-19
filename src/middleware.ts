
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// For real Firebase token validation in middleware, you'd typically use Firebase Admin SDK
// or verify ID tokens. For simplicity here, we'll just check for cookie existence.
// A more robust check would involve verifying the token's validity.
const FIREBASE_SESSION_COOKIE_NAME = '__session'; // Example if using Firebase session cookies
const LEGACY_FIREBASE_AUTH_COOKIE_PATTERN = /^firebase:authUser:[^:]+:[^:]+$/; // Pattern for legacy client-side SDK cookie

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Development escape hatch for admin user
  if (process.env.NODE_ENV === 'development') {
    const devAdminOverrideCookie = request.cookies.get('dev_admin_override');
    if (devAdminOverrideCookie?.value === 'true') {
      console.log("Middleware: Dev admin override active.");
      if ((pathname.startsWith('/login') || pathname.startsWith('/register')) && pathname !== '/') {
        console.log("Middleware: Dev admin on auth page, redirecting to /");
        return NextResponse.redirect(new URL('/', request.url));
      }
      return NextResponse.next(); // Allow access
    }
  }

  // Check for any Firebase auth-related cookie.
  // This is a simplified check. For production, proper ID token verification is needed.
  let isAuthenticated = false;
  const sessionCookie = request.cookies.get(FIREBASE_SESSION_COOKIE_NAME);
  if (sessionCookie) {
    isAuthenticated = true; // Assume valid if session cookie exists (needs server-side validation ideally)
  } else {
    // Check for legacy Firebase client SDK cookies
    for (const [name, cookie] of request.cookies) {
      if (LEGACY_FIREBASE_AUTH_COOKIE_PATTERN.test(name)) {
        isAuthenticated = true;
        break;
      }
    }
  }
   // If we are on a server where cookies are not directly readable in middleware for Firebase Auth
   // we might need to rely on client-side checks or a custom token stored in a readable cookie.
   // For this example, we assume the AuthContext on the client will handle true auth state.
   // The middleware provides a first layer of redirection.

  const isAuthPage = pathname.startsWith('/login') || pathname.startsWith('/register');
  
  // Allow access to API routes and static files without authentication
  if (pathname.startsWith('/api/') || 
      pathname.startsWith('/_next/') || 
      pathname.includes('.')) { // Check for file extensions like .ico, .png
    return NextResponse.next();
  }

  if (isAuthenticated) {
    if (isAuthPage && pathname !== '/') { // Avoid redirect loop if home is an auth page by mistake
      return NextResponse.redirect(new URL('/', request.url));
    }
    return NextResponse.next();
  }

  // If not authenticated
  if (!isAuthenticated && !isAuthPage) {
    let from = pathname;
    if (request.nextUrl.search) {
      from += request.nextUrl.search;
    }
    const loginUrl = new URL('/login', request.url)
    // loginUrl.searchParams.set('from', from) // Optional: redirect back after login
    return NextResponse.redirect(loginUrl);
  }

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

    