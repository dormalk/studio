
"use client" 

import type { ReactNode } from 'react';
import Link from 'next/link';
import { Shield } from 'lucide-react';
import { AppHeader } from '@/components/layout/AppHeader';
import { SidebarNav } from '@/components/layout/SidebarNav';
import { useAuth } from '@/contexts/AuthContext'; 
import { useRouter, usePathname } from 'next/navigation'; 
import { Loader2 } from 'lucide-react'; 

export default function AppLayout({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname(); // Get current pathname

  useEffect(() => {
    // This effect runs on client-side after initial render and when user/loading changes
    if (!loading && !user) {
      // Check if dev admin cookie exists, to prevent premature redirection if devLogin is in progress
      let isDevAdminAttempt = false;
      if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
        const devCookie = document.cookie.split('; ').find(row => row.startsWith('dev_admin_override='));
        if (devCookie?.split('=')[1] === 'true') {
          isDevAdminAttempt = true;
        }
      }
      
      if (!isDevAdminAttempt && pathname !== '/login' && pathname !== '/register') {
        console.log("AppLayout: No user and not loading, and not dev admin attempt, redirecting to /login from", pathname);
        router.push('/login');
      }
    }
  }, [user, loading, router, pathname]);


  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }
  
  if (!user) {
    // If no user and no longer loading, and we are not on an auth page,
    // this means the redirect should have happened or is about to.
    // Return a loader or null to avoid rendering the layout for non-authed users.
    // This also handles the case where dev admin login is happening.
    if (pathname !== '/login' && pathname !== '/register') {
        console.log("AppLayout: No user and not loading, returning loader/null for path:", pathname);
         return (
            <div className="flex justify-center items-center min-h-screen">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
            </div>
        );
    }
    return null; // On auth pages, let them render.
  }

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
