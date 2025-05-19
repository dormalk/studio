
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
      setLoading(false); // Crucial: set loading false *after* user and flag

      if (typeof window !== 'undefined' && !isRestoringFromCookie) {
        document.cookie = "dev_admin_override=true; path=/; SameSite=Lax; Max-Age=" + (60 * 60 * 24); // 1 day
        console.log("DEV MODE: Set dev_admin_override cookie.");
      }

      console.log("DEV MODE: User set as dev admin, loading is false. Current pathname:", pathname);
      if (pathname === '/login' || pathname === '/register') {
        setTimeout(() => {
            console.log("DEV MODE: setTimeout: Pushing to / from ", pathname);
            router.push('/');
        }, 0);
      } else {
        console.log("DEV MODE: Already on an app page or similar, not pushing from devLoginAsAdmin. Pathname:", pathname);
      }
    } else {
      console.error("devLoginAsAdmin can only be used in development mode.");
    }
  }, [router, pathname]); // Add pathname dependency

  // Effect for restoring dev admin session from cookie ON INITIAL CLIENT LOAD
  useEffect(() => {
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development' && loading && !user && !isDevAdminActive) {
      const devCookie = document.cookie.split('; ').find(row => row.startsWith('dev_admin_override='));
      if (devCookie?.split('=')[1] === 'true') {
        console.warn("DEV MODE: AuthContext initial load: dev_admin_override cookie found. Attempting to restore dev admin session.");
        if (devLoginAsAdmin) {
          devLoginAsAdmin(true); // isRestoringFromCookie = true
        }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devLoginAsAdmin]); // Runs once on mount, or if devLoginAsAdmin instance changes (it shouldn't often due to useCallback)


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
        try {
          // Use soldierId (which is firebaseUser.uid if registration maps them, or a custom claim)
          // For this app, the user document ID in 'users' collection is the soldierId.
          // We need to ensure this mapping. If Firebase UID is different from soldierId, this needs adjustment.
          // Assuming 'users' collection document ID is the Firebase UID.
          const userProfileDocRef = doc(db, "users", firebaseUser.uid);
          const userProfileDoc = await getDoc(userProfileDocRef);

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
            console.log("AuthContext: Real user profile set:", appUserInstance);
          } else {
            console.error("AuthContext: User profile not found for UID:", firebaseUser.uid, ". User may exist in Auth but not in Firestore 'users' collection. Signing out.");
            await firebaseSignOut(auth); // This will trigger onAuthStateChanged again with null
            // setUser(null) will be handled by the subsequent onAuthStateChanged
          }
        } catch (error) {
            console.error("AuthContext: Error fetching real user profile:", error);
            await firebaseSignOut(auth);
        } finally {
            setLoading(false);
        }
      } else { // No Firebase user
        if (isDevAdminActive) {
          console.log("AuthContext: No Firebase user, but dev admin is active. Preserving dev admin session.");
          if (loading) setLoading(false); // Ensure loading is false if dev admin is active
        } else {
          console.log("AuthContext: No Firebase user and not in dev admin mode. Setting user to null.");
          setUser(null);
          setLoading(false);
        }
      }
    });
    return () => unsubscribe();
  }, [isDevAdminActive, loading]); // 'loading' is important here to re-evaluate when it changes.

  const logout = async () => {
    console.log("AuthContext: logout called.");
    const wasDevAdmin = isDevAdminActive;

    setIsDevAdminActive(false);
    setUser(null); // Clear user state immediately
    if (typeof window !== 'undefined') {
      document.cookie = "dev_admin_override=; path=/; Max-Age=0; SameSite=Lax";
      console.log("DEV MODE: Cleared dev_admin_override cookie on logout.");
    }

    try {
      await firebaseSignOut(auth);
      console.log("AuthContext: Firebase signout successful.");
      // onAuthStateChanged will handle setting user to null and loading to false
    } catch (error) {
      console.error("Error signing out from Firebase: ", error);
    } finally {
        if (wasDevAdmin) { // If it was a dev admin, onAuthStateChanged might not fire if no real session existed
            setLoading(false);
            if (pathname !== '/login') router.push('/login');
        }
        // For real users, onAuthStateChanged will set loading to false and handle redirection if needed via AppLayout
    }
  };

  // This loader is for the absolute initial auth state resolution.
  // It should only show if no decision (user, no user, dev admin) has been made yet.
  if (loading && !user && !isDevAdminActive && typeof window !== 'undefined') {
    const isAuthPage = pathname === '/login' || pathname === '/register';
    if (!isAuthPage) {
        console.log("AuthContext: Displaying initial global loader. Path:", pathname);
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
