
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
  isDevAdminActive: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDevAdminActive, setIsDevAdminActive] = useState(false);
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
      
      setIsDevAdminActive(true); // Set flag first
      setUser(mockAdminUser);
      setLoading(false); // Crucial: set loading to false

      if (typeof window !== 'undefined' && !isRestoringFromCookie) {
        document.cookie = "dev_admin_override=true; path=/; SameSite=Lax; Max-Age=" + (60 * 60 * 24);
        console.log("DEV MODE: Set dev_admin_override cookie.");
      }
      
      console.log("DEV MODE: User set as dev admin, loading is false. Pathname:", pathname);
      if (pathname === '/login' || pathname === '/register') {
        router.push('/');
      }
    } else {
      console.error("devLoginAsAdmin can only be used in development mode.");
    }
  }, [router, pathname]);

  // Effect for restoring dev admin session from cookie
  useEffect(() => {
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
      const devCookie = document.cookie.split('; ').find(row => row.startsWith('dev_admin_override='));
      // Only try to restore if cookie exists, AND we are not already logged in (user is null),
      // AND not already in dev admin mode. And ensure loading is still true (meaning onAuthStateChanged hasn't resolved yet)
      if (devCookie?.split('=')[1] === 'true' && !user && !isDevAdminActive && loading) {
        console.warn("DEV MODE: AuthContext initial useEffect found dev cookie, calling devLoginAsAdmin(true).");
        if (devLoginAsAdmin) devLoginAsAdmin(true);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devLoginAsAdmin]); // devLoginAsAdmin is memoized


  // Effect for Firebase auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
      console.log("AuthContext: onAuthStateChanged triggered. Firebase user:", firebaseUser, "Current isDevAdminActive:", isDevAdminActive);

      if (isDevAdminActive) {
        if (firebaseUser) { // A real user signed in, this overrides and disables dev admin mode
          console.log("AuthContext: Real Firebase user detected while dev admin mode was active. Disabling dev admin mode.");
          setIsDevAdminActive(false);
          if (typeof window !== 'undefined') {
            document.cookie = "dev_admin_override=; path=/; Max-Age=0; SameSite=Lax"; // Clear dev cookie
          }
          // Fall through to process the real firebaseUser below
        } else {
          // Dev admin is active, and no real Firebase user.
          // The state (user, loading) should have been set by devLoginAsAdmin or the initial cookie check.
          // We should NOT set user to null here.
          console.log("AuthContext: Dev admin active, no real Firebase user. State maintained by dev logic. Ensuring loading is false.");
          if (loading) setLoading(false); // Ensure loading is false if dev admin is active
          return; // IMPORTANT: Do not proceed to set user to null
        }
      }

      // This part runs if isDevAdminActive is false, OR if a real user signed in (which turned off dev admin above)
      if (firebaseUser) {
        try {
          // The user document ID in 'users' collection is the Firebase Auth UID, NOT the soldierId.
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
              router.push('/');
            }
          } else {
            console.error("AuthContext: User profile not found in Firestore for UID:", firebaseUser.uid, "Signing out.");
            await firebaseSignOut(auth); // Sign out to be safe, this will re-trigger onAuthStateChanged
            setUser(null); // Explicitly set user to null
            // No need to redirect here, onAuthStateChanged will run again with null user
          }
        } catch (error) {
            console.error("AuthContext: Error fetching user profile:", error);
            await firebaseSignOut(auth);
            setUser(null);
        } finally {
            setLoading(false);
        }
      } else {
        // No Firebase user, AND dev admin is NOT active.
        console.log("AuthContext: No Firebase user and dev admin not active. Setting user to null.");
        setUser(null);
        setLoading(false);
      }
    });

    return () => unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDevAdminActive, router, pathname]); // isDevAdminActive helps gate the logic. router/pathname for redirects.

  const logout = async () => {
    console.log("AuthContext: logout called. Was dev admin:", isDevAdminActive);
    
    if (typeof window !== 'undefined') {
      document.cookie = "dev_admin_override=; path=/; Max-Age=0; SameSite=Lax";
      console.log("DEV MODE: Cleared dev_admin_override cookie on logout.");
    }
    setIsDevAdminActive(false); // Turn off dev admin mode first
    
    try {
      await firebaseSignOut(auth);
      console.log("AuthContext: Firebase signout successful.");
      // onAuthStateChanged will handle setting user to null and loading to false
    } catch (error) {
      console.error("Error signing out from Firebase: ", error);
      // Even if Firebase signout fails, ensure local state is cleared
      setUser(null);
      setLoading(false);
    } finally {
        // Ensure user is null and loading is false after logout attempt,
        // regardless of whether it was dev admin or real user.
        // onAuthStateChanged might also set these, but being explicit helps.
        setUser(null); 
        setLoading(false);
        if (pathname !== '/login') {
            router.push('/login');
        }
    }
  };
  
  // Global loader for initial auth state resolution, unless dev admin already took over
  if (loading && !(isDevAdminActive && user)) { 
    // Show loader if still loading AND (dev admin is not active OR user is not yet set by dev admin)
    // This prevents flashing loader if dev admin logs in very quickly.
    const isAuthPage = pathname === '/login' || pathname === '/register';
    if (!isAuthPage) { // Don't show global loader on auth pages themselves
        return (
            <div className="flex justify-center items-center min-h-screen">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            </div>
        );
    }
  }

  return (
    <AuthContext.Provider value={{ user, loading, logout, devLoginAsAdmin, isDevAdminActive }}>
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
