
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
    console.log("AppLayout Effect: loading:", loading, "user:", !!user, "isDevAdminActive:", isDevAdminActive, "pathname:", pathname);
    if (loading) {
      console.log("AppLayout: Auth context is loading, skipping redirection checks.");
      return; // Don't make redirection decisions while loading
    }

    const onAuthPage = pathname === '/login' || pathname === '/register';
    const isAuthenticated = user || isDevAdminActive;

    if (isAuthenticated) {
      if (onAuthPage) {
        console.log("AppLayout: User/DevAdmin IS authenticated and ON auth page, redirecting to / from", pathname);
        router.push('/');
      } else {
        console.log("AppLayout: User/DevAdmin IS authenticated and NOT on auth page. Staying on", pathname);
      }
    } else { // Not authenticated (no user AND not dev admin)
      if (!onAuthPage) {
        console.log("AppLayout: User/DevAdmin NOT authenticated, NOT loading, and ON an app page. Redirecting to /login from", pathname);
        router.push('/login');
      } else {
         console.log("AppLayout: User/DevAdmin NOT authenticated, NOT loading, and ON an auth page. Staying on", pathname);
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

  // If not loading, but still no user and not dev admin,
  // and we are on an app page, middleware should have caught this.
  // This is a fallback / edge case rendering if somehow reached.
  if (!user && !isDevAdminActive) {
    const onAuthPage = pathname === '/login' || pathname === '/register';
    if (!onAuthPage) { // Only show loader if NOT on an auth page already
        console.log("AppLayout: Rendering fallback loader (no user/devAdmin, not loading, not on auth page). Path:", pathname);
        return (
          <div className="flex justify-center items-center min-h-screen">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
          </div>
        );
    }
    // If on an auth page, children (AuthLayout -> Login/Register) will render, AppLayout shell is not needed
    return null;
  }

  // If user exists OR dev admin is active, and not loading
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
