
"use client" 

import type { ReactNode } from 'react';
import Link from 'next/link';
import { Shield } from 'lucide-react';
import { AppHeader } from '@/components/layout/AppHeader';
import { SidebarNav } from '@/components/layout/SidebarNav';
import { useAuth } from '@/contexts/AuthContext'; 
import { useRouter, usePathname } from 'next/navigation'; 
import { Loader2 } from 'lucide-react'; 
import { useEffect } from 'react';

export default function AppLayout({ children }: { children: ReactNode }) {
  const { user, loading, isDevAdminActive } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) {
      console.log("AppLayout: Auth context is loading, skipping redirection checks.");
      return; // Don't make redirection decisions while loading
    }

    const onAuthPage = pathname === '/login' || pathname === '/register';

    if (user || isDevAdminActive) { // User is authenticated (real or dev admin)
      if (onAuthPage) {
        console.log("AppLayout: User/DevAdmin is authenticated and on auth page, redirecting to / from", pathname);
        router.push('/');
      }
    } else { // No user and not dev admin
      if (!onAuthPage) { 
        // This check is mostly a fallback; middleware should handle unauth access to /app/*
        console.log("AppLayout: No user/devAdmin, not loading, and on an app page. Redirecting to /login from", pathname);
        router.push('/login');
      }
    }
  }, [user, loading, isDevAdminActive, router, pathname]);


  if (loading) {
    console.log("AppLayout: Rendering loader because AuthContext loading is true.");
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }
  
  if (!user && !isDevAdminActive) {
    // If not loading, and still no user/devAdmin, it means we are likely on an auth page,
    // or middleware should have redirected. AppLayout shouldn't render its shell.
    // Showing a loader as a safety net if somehow on an app page.
    console.log("AppLayout: Rendering fallback loader (no user/devAdmin, not loading). Path:", pathname);
    return (
      <div className="flex justify-center items-center min-h-screen">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  // If user exists (real or dev admin) OR dev admin is active and not loading
  // Render the main app layout
  console.log("AppLayout: Rendering main app shell. User:", !!user, "isDevAdminActive:", isDevAdminActive, "Path:", pathname);
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
