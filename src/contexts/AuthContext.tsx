
"use client";

import type { ReactNode } from 'react';
import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { auth, db } from '@/lib/firebase';
import type { User as FirebaseUser } from 'firebase/auth';
import { onAuthStateChanged, signOut as firebaseSignOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import type { AppUser, UserProfile } from '@/types';
import { useRouter, usePathname } from 'next/navigation';
import { Loader2 } from 'lucide-react';

interface AuthContextType {
  user: AppUser | null;
  loading: boolean;
  logout: () => Promise<void>;
  devLoginAsAdmin?: (isRestoring?: boolean) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDevAdminActive, setIsDevAdminActive] = useState(false); // Flag for dev admin mode
  const router = useRouter();
  const pathname = usePathname();

  const devLoginAsAdmin = useCallback((isRestoringFromCookie = false) => {
    if (process.env.NODE_ENV === 'development') {
      console.log("DEV MODE: devLoginAsAdmin called. isRestoringFromCookie:", isRestoringFromCookie);
      const mockAdminUser: AppUser = {
        uid: 'dev-admin-uid-001',
        email: 'admin-dev@tzahal.app',
        emailVerified: true,
        displayName: 'מנהל מערכת (פיתוח)',
        isAnonymous: false,
        photoURL: null,
        providerData: [{
          providerId: 'password',
          uid: 'dev-admin-uid-001',
          displayName: 'מנהל מערכת (פיתוח)',
          email: 'admin-dev@tzahal.app',
          phoneNumber: null,
          photoURL: null,
        }],
        providerId: 'password',
        phoneNumber: null,
        tenantId: null,
        metadata: { creationTime: new Date().toISOString(), lastSignInTime: new Date().toISOString() } as unknown as import('firebase/auth').UserMetadata,
        getIdToken: async () => 'mock-dev-admin-id-token',
        getIdTokenResult: async () => ({ token: 'mock-dev-admin-id-token' } as any),
        reload: async () => { console.log('Mock reload called for dev admin'); },
        delete: async () => { console.log('Mock delete called for dev admin'); },
        toJSON: () => ({ uid: 'dev-admin-uid-001', email: 'admin-dev@tzahal.app' }),
        soldierId: '0000000',
        role: 'Admin',
        divisionId: 'dev-admin-division',
      };
      setUser(mockAdminUser);
      setIsDevAdminActive(true); // Set dev admin flag
      setLoading(false); 

      if (typeof window !== 'undefined' && !isRestoringFromCookie) {
        document.cookie = "dev_admin_override=true; path=/; SameSite=Lax; Max-Age=" + (60 * 60 * 24);
        console.log("DEV MODE: Set dev_admin_override cookie.");
      }
      console.log("DEV MODE: User set, attempting to redirect to /");
      router.push('/');
    } else {
      console.error("devLoginAsAdmin can only be used in development mode.");
    }
  }, [router]);


  useEffect(() => {
    let devCookieRestoredAttempted = false;
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
      const devCookie = document.cookie.split('; ').find(row => row.startsWith('dev_admin_override='));
      if (devCookie?.split('=')[1] === 'true' && !user) { // Check !user to avoid race if auth already set user
        console.warn("DEV MODE: AuthContext useEffect found dev cookie, attempting to restore admin session.");
        if (devLoginAsAdmin) {
            devLoginAsAdmin(true); 
            devCookieRestoredAttempted = true; // Mark that we attempted to restore
        }
      }
    }

    if (devCookieRestoredAttempted) {
        // If dev admin was restored, user and loading state are handled by devLoginAsAdmin
        // We can potentially skip the Firebase listener if we are sure dev admin is active,
        // but it's safer to let it run and just ensure it doesn't override dev admin.
        // setLoading(false) is called within devLoginAsAdmin.
    }
    
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
      console.log("AuthContext: onAuthStateChanged triggered. Firebase user:", firebaseUser, "isDevAdminActive:", isDevAdminActive);
      if (firebaseUser) {
        setIsDevAdminActive(false); // Real user logged in, dev admin mode is off
        if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
            document.cookie = "dev_admin_override=; path=/; Max-Age=0; SameSite=Lax"; // Clear dev cookie
        }
        try {
          // In production, user.uid would be the doc ID. For dev, soldierId can be used if that's how users are created.
          // Let's assume the user's document ID in 'users' collection is their Firebase Auth UID.
          const userProfileDoc = await getDoc(doc(db, "users", firebaseUser.uid));
          if (userProfileDoc.exists()) {
            const userProfileData = userProfileDoc.data() as UserProfile;
            const appUserInstance: AppUser = {
              ...firebaseUser,
              soldierId: userProfileData.soldierId,
              role: userProfileData.role,
              divisionId: userProfileData.divisionId,
              displayName: userProfileData.displayName || firebaseUser.displayName,
            };
            setUser(appUserInstance);
            console.log("AuthContext: User profile found and set:", appUserInstance);
            if (pathname === '/login' || pathname === '/register') {
              console.log("AuthContext: User on auth page, redirecting to /");
              router.push('/');
            }
          } else {
            console.error("AuthContext: User profile not found in Firestore for UID:", firebaseUser.uid);
            // Potentially a new user who just registered but profile creation failed or is pending
            // Or an old user whose profile was deleted. Sign out to be safe.
            await firebaseSignOut(auth);
            setUser(null);
            if (pathname !== '/login' && pathname !== '/register') {
              router.push('/login');
            }
          }
        } catch (error) {
            console.error("AuthContext: Error fetching user profile:", error);
            await firebaseSignOut(auth);
            setUser(null);
            if (pathname !== '/login' && pathname !== '/register') {
              router.push('/login');
            }
        }
      } else { // firebaseUser is null
        if (!isDevAdminActive) { // Only set user to null if not in dev admin mode
          setUser(null);
          console.log("AuthContext: No Firebase user, user set to null (dev admin not active).");
          const isAuthPage = pathname === '/login' || pathname === '/register';
          if (!isAuthPage && !pathname.startsWith('/api')) {
             console.log("AuthContext: Not on auth page, redirecting to /login (dev admin not active).");
             router.push('/login');
          }
        } else {
          console.log("AuthContext: No Firebase user, but dev admin is active. User state preserved.");
        }
      }
      // Only set loading to false if not in an active dev admin session that already handled it
      if (!isDevAdminActive || firebaseUser) { 
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [router, pathname, devLoginAsAdmin, isDevAdminActive]); // Added isDevAdminActive


  const logout = async () => {
    console.log("AuthContext: logout called");
    const wasDevAdmin = isDevAdminActive;
    setIsDevAdminActive(false); // Deactivate dev admin mode first
    setLoading(true);
    try {
      await firebaseSignOut(auth); // This will trigger onAuthStateChanged
      if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
        document.cookie = "dev_admin_override=; path=/; Max-Age=0; SameSite=Lax";
        console.log("DEV MODE: Cleared dev_admin_override cookie.");
      }
      // setUser(null) will be handled by onAuthStateChanged.
      // router.push('/login') will also be handled by onAuthStateChanged or AppLayout.
    } catch (error) {
      console.error("Error signing out: ", error);
      setLoading(false); 
    }
    // If it was a dev admin logout, onAuthStateChanged might not fire if there was no real Firebase session.
    // So, ensure redirect and state clear if it was a dev admin.
    if (wasDevAdmin) {
        setUser(null);
        setLoading(false); // Ensure loading is false after dev admin logout
        router.push('/login');
    }
  };
  
  // This loader is for the initial app load while checking auth state
  if (loading && !user && !isDevAdminActive) { // Check !isDevAdminActive here too
    // Only show global loader if not on an auth page and true loading is happening
    if (pathname !== '/login' && pathname !== '/register') {
        return (
            <div className="flex justify-center items-center min-h-screen">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            </div>
        );
    }
  }

  return (
    <AuthContext.Provider value={{ user, loading, logout, devLoginAsAdmin }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

