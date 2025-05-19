
"use client" 

import type { ReactNode } from 'react';
import Link from 'next/link';
import { Shield } from 'lucide-react';
import { AppHeader } from '@/components/layout/AppHeader';
import { SidebarNav } from '@/components/layout/SidebarNav';
import { useAuth } from '@/contexts/AuthContext'; 
import { useRouter, usePathname } from 'next/navigation'; 
import { Loader2 } from 'lucide-react'; 
import { useEffect } from 'react'; // Added useEffect import

export default function AppLayout({ children }: { children: ReactNode }) {
  const { user, loading, isDevAdminActive } = useAuth(); // Added isDevAdminActive
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // This effect runs on client-side after initial render and when user/loading/isDevAdminActive changes
    if (!loading && !user && !isDevAdminActive) { // Check isDevAdminActive
      // If not loading, no user, and not in dev admin mode
      if (pathname !== '/login' && pathname !== '/register') { // And not already on an auth page
        console.log("AppLayout: No authenticated user (and not dev admin), redirecting to /login from", pathname);
        router.push('/login');
      }
    }
  }, [user, loading, isDevAdminActive, router, pathname]);


  if (loading) {
    // If dev admin is active, AuthContext loader might handle it or devLoginAsAdmin sets loading to false.
    // This loader is more for the real Firebase auth state resolution.
    // To prevent flashing, if dev admin is active and user is set, we might not need this.
    // However, if dev admin is being restored from cookie, loading might be true initially.
    // The AuthContext's own loader display is more global.
    // AppLayout should show its loader if its specific content is waiting for auth.
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }
  
  // If not loading, but no user AND not in dev admin mode,
  // the useEffect above should have initiated a redirect if on an app page.
  // If we reach here, it means we are waiting for that redirect or something is wrong.
  // Or, this layout shouldn't be rendered at all for non-auth users (handled by middleware).
  if (!user && !isDevAdminActive) {
    console.log("AppLayout: No user and not dev admin, not loading. Pathname:", pathname, ". Middleware should handle this for /app routes.");
    // If middleware is correctly configured, this state (being in AppLayout without user) shouldn't happen for /app/* routes.
    // Showing a loader as a fallback while redirect might be in progress.
    return (
      <div className="flex justify-center items-center min-h-screen">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  // If user exists (real or dev admin) OR dev admin is active (even if user object is momentarily in flux during dev_admin_override restore)
  // Render the main app layout
  return (
    <div className="grid min-h-screen w-full md:grid-cols-[220px_1fr] lg:grid-cols-[280px_1fr]">
      <aside className="hidden border-l bg-card md:block"> {/* border-l for RTL */}
        <div className="flex h-full max-h-screen flex-col gap-2">
          <div className="flex h-16 items-center border-b px-4 lg:px-6">
            <Link href="/" className="flex items-center gap-2 font-semibold text-lg">
              <Shield className="h-7 w-7 text-primary" />
              <span className="">מנהל צה"ל</span>
            </Link>
          </div>
          <div className="flex-1">
            <SidebarNav />
          </div>
        </div>
      </aside>
      <div className="flex flex-col">
        <AppHeader />
        <main className="flex flex-1 flex-col gap-4 p-4 lg:gap-6 lg:p-6 bg-background">
          {children}
        </main>
      </div>
    </div>
  );
}
