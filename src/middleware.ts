
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const AUTH_COOKIE_NAME = 'firebaseAuthToken'; // Example name, adjust if Firebase SDK uses a different default or if you set a custom one

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const authToken = request.cookies.get(AUTH_COOKIE_NAME)?.value; // Check for Firebase auth token

  const isAuthPage = pathname.startsWith('/login') || pathname.startsWith('/register');
  const isAppPage = pathname.startsWith('/divisions') || pathname.startsWith('/soldiers') || pathname.startsWith('/armory') || pathname === '/';


  // If user is authenticated
  if (authToken) {
    // If trying to access login/register page while authenticated, redirect to home
    if (isAuthPage) {
      return NextResponse.redirect(new URL('/', request.url));
    }
    // Allow access to app pages
    return NextResponse.next();
  }

  // If user is not authenticated
  if (!authToken) {
    // If trying to access an app page without authentication, redirect to login
    if (isAppPage) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    // Allow access to auth pages (login, register)
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
