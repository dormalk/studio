
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
      
      setIsDevAdminActive(true);
      setUser(mockAdminUser);
      setLoading(false); // Set loading to false AFTER setting user and flag

      if (typeof window !== 'undefined' && !isRestoringFromCookie) {
        document.cookie = "dev_admin_override=true; path=/; SameSite=Lax; Max-Age=" + (60 * 60 * 24); // 1 day
        console.log("DEV MODE: Set dev_admin_override cookie.");
      }
      
      console.log("DEV MODE: User set as dev admin, loading is false. Current pathname:", pathname);
      // Push router.push to the next event loop tick
      setTimeout(() => {
        if (pathname === '/login' || pathname === '/register') {
             console.log("DEV MODE: setTimeout: Pushing to / from ", pathname);
             router.push('/');
        } else {
             console.log("DEV MODE: setTimeout: Already on an app page or similar, not pushing. Pathname:", pathname);
        }
      }, 0);
    } else {
      console.error("devLoginAsAdmin can only be used in development mode.");
    }
  }, [router, pathname]);

  // Effect for restoring dev admin session from cookie ON INITIAL CLIENT LOAD
  useEffect(() => {
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
      // Check only if dev admin isn't already active from a previous action in this session
      // And if we are still in the initial loading phase (to avoid conflicts with user interactions)
      if (!isDevAdminActive && loading) {
        const devCookie = document.cookie.split('; ').find(row => row.startsWith('dev_admin_override='));
        if (devCookie?.split('=')[1] === 'true') {
          console.warn("DEV MODE: AuthContext initial load: dev_admin_override cookie found. Attempting to restore dev admin session.");
          if (devLoginAsAdmin) { // devLoginAsAdmin is memoized by useCallback
            devLoginAsAdmin(true); // isRestoringFromCookie = true
          }
        }
      }
    }
    // This effect should run once on mount, or if devLoginAsAdmin changes (which it shouldn't if memoized correctly)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devLoginAsAdmin]); // Removed user, isDevAdminActive, loading to make it run more like a mount effect for cookie check

  // Effect for Firebase auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
      console.log("AuthContext: onAuthStateChanged triggered. Firebase user:", firebaseUser, "Current isDevAdminActive:", isDevAdminActive);

      if (firebaseUser) {
        // Real Firebase user signed in
        console.log("AuthContext: Real Firebase user detected. Clearing dev admin mode if active.");
        if (typeof window !== 'undefined') {
            document.cookie = "dev_admin_override=; path=/; Max-Age=0; SameSite=Lax";
        }
        setIsDevAdminActive(false); 
        // User profile fetching logic...
        try {
          const userProfileDocRef = doc(db, "users", firebaseUser.uid); 
          const userProfileDoc = await getDoc(userProfileDocRef);
          if (userProfileDoc.exists()) {
            const userProfileData = userProfileDoc.data() as UserProfile;
            const appUserInstance: AppUser = { /* ... assemble user ... */
              ...firebaseUser,
              soldierId: userProfileData.soldierId,
              role: userProfileData.role,
              divisionId: userProfileData.divisionId,
              displayName: userProfileData.displayName || firebaseUser.displayName,
            };
            setUser(appUserInstance);
            console.log("AuthContext: Real user profile set.");
          } else {
            console.error("AuthContext: User profile not found for UID:", firebaseUser.uid, "Signing out.");
            await firebaseSignOut(auth);
            setUser(null); // Explicitly set user to null here
          }
        } catch (error) {
            console.error("AuthContext: Error fetching real user profile:", error);
            await firebaseSignOut(auth);
            setUser(null); // Explicitly set user to null here
        } finally {
            setLoading(false);
        }
      } else { // No Firebase user
        if (isDevAdminActive) {
          console.log("AuthContext: No Firebase user, but dev admin is active. Preserving dev admin session.");
          // If dev admin is active, user and loading state are managed by devLoginAsAdmin or cookie restore
          // Ensure loading is false if it was still true for some reason
          if (loading) setLoading(false); 
        } else {
          console.log("AuthContext: No Firebase user and not in dev admin mode. Setting user to null.");
          setUser(null);
          setLoading(false); 
        }
      }
    });
    return () => unsubscribe();
  }, [isDevAdminActive, loading]); // router, pathname removed as they are not directly used in THIS effect's core logic for onAuthStateChanged


  const logout = async () => {
    console.log("AuthContext: logout called.");
    
    if (typeof window !== 'undefined') {
      document.cookie = "dev_admin_override=; path=/; Max-Age=0; SameSite=Lax";
      console.log("DEV MODE: Cleared dev_admin_override cookie on logout.");
    }
    
    setIsDevAdminActive(false);
    setUser(null); 
    setLoading(true); // Set loading to true before sign out, then false after or on redirect

    try {
      await firebaseSignOut(auth);
      console.log("AuthContext: Firebase signout successful.");
    } catch (error) {
      console.error("Error signing out from Firebase: ", error);
    } finally {
        setLoading(false); 
        // onAuthStateChanged should handle user=null and redirect via AppLayout or middleware
        if (pathname !== '/login') { // Extra safety redirect
            router.push('/login');
        }
    }
  };
  
  // Global loader display logic (could be in AppLayout too)
  // This loader is for the initial auth state resolution.
  if (loading && typeof window !== 'undefined') {
     // Avoid showing loader if dev admin was restored quickly from cookie and already set loading to false
    if (!isDevAdminActive || (isDevAdminActive && user?.uid !== 'dev-admin-uid-001') ) {
        const isAuthPage = pathname === '/login' || pathname === '/register';
        if (!isAuthPage) { // Don't show global loader on auth pages themselves
            return (
                <div className="flex justify-center items-center min-h-screen">
                  <Loader2 className="h-12 w-12 animate-spin text-primary" />
                </div>
            );
        }
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
