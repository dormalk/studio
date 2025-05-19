
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
  isDevAdminActive: boolean; // Expose this for potential UI indicators if needed
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
      
      setUser(mockAdminUser);
      setIsDevAdminActive(true);
      setLoading(false); // Dev admin is "loaded"

      if (typeof window !== 'undefined' && !isRestoringFromCookie) {
        document.cookie = "dev_admin_override=true; path=/; SameSite=Lax; Max-Age=" + (60 * 60 * 24);
        console.log("DEV MODE: Set dev_admin_override cookie.");
      }
      
      console.log("DEV MODE: User set as dev admin, attempting to redirect to /");
      if (pathname === '/login' || pathname === '/register') {
        router.push('/');
      }
    } else {
      console.error("devLoginAsAdmin can only be used in development mode.");
    }
  }, [router, pathname]); // Added pathname to deps

  // Effect for restoring dev admin session from cookie
  useEffect(() => {
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
      const devCookie = document.cookie.split('; ').find(row => row.startsWith('dev_admin_override='));
      if (devCookie?.split('=')[1] === 'true') {
        console.warn("DEV MODE: AuthContext useEffect found dev cookie, attempting to restore admin session.");
        // Only restore if not already logged in as dev admin and user is not set
        if (!isDevAdminActive && !user) {
             if (devLoginAsAdmin) devLoginAsAdmin(true);
        }
      } else {
        // If cookie is not 'true' or doesn't exist, but dev admin mode is active (e.g. from previous state), clear it.
        if (isDevAdminActive) {
            console.log("DEV MODE: Dev admin cookie not found or false, but dev admin mode was active. Clearing state.");
            setUser(null);
            setIsDevAdminActive(false);
            // setLoading will be handled by onAuthStateChanged or set to false if no authUser
        }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- devLoginAsAdmin is stable, user/isDevAdminActive are main triggers
  }, [user, isDevAdminActive]); // Rerun if user or isDevAdminActive changes, devLoginAsAdmin is stable

  // Effect for Firebase auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
      console.log("AuthContext: onAuthStateChanged triggered. Firebase user:", firebaseUser, "isDevAdminActive:", isDevAdminActive);

      if (isDevAdminActive) {
        console.log("AuthContext: Dev admin mode is active. Firebase auth changes will be ignored for user state unless a real user logs in.");
        if (firebaseUser) { // If a real user logs in, disable dev admin mode
          console.log("AuthContext: Real Firebase user detected while dev admin mode was active. Disabling dev admin mode.");
          setIsDevAdminActive(false);
          if (typeof window !== 'undefined') {
            document.cookie = "dev_admin_override=; path=/; Max-Age=0; SameSite=Lax";
          }
          // Fall through to process the real firebaseUser
        } else {
          // If dev admin is active and firebaseUser is null, do nothing, keep dev admin session.
          // setLoading was already set to false by devLoginAsAdmin or the cookie check effect.
          if (loading) setLoading(false); // Ensure loading is false if it wasn't already
          return;
        }
      }

      // Process real Firebase user
      if (firebaseUser) {
        try {
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
            console.error("AuthContext: User profile not found in Firestore for UID:", firebaseUser.uid);
            await firebaseSignOut(auth); // Sign out to be safe
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
      } else { // firebaseUser is null and dev admin is not active
        setUser(null);
        console.log("AuthContext: No Firebase user, user set to null.");
        const isAuthPage = pathname === '/login' || pathname === '/register';
        if (!isAuthPage && !pathname.startsWith('/api')) {
           console.log("AuthContext: Not on auth page, redirecting to /login.");
           router.push('/login');
        }
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [router, pathname, isDevAdminActive]); // isDevAdminActive is a key dependency here

  const logout = async () => {
    console.log("AuthContext: logout called. Was dev admin:", isDevAdminActive);
    const wasDevAdmin = isDevAdminActive;

    setIsDevAdminActive(false);
    if (typeof window !== 'undefined') {
      document.cookie = "dev_admin_override=; path=/; Max-Age=0; SameSite=Lax";
      console.log("DEV MODE: Cleared dev_admin_override cookie on logout.");
    }
    
    try {
      await firebaseSignOut(auth); // This will trigger onAuthStateChanged which will set user to null
      console.log("AuthContext: Firebase signout successful.");
    } catch (error) {
      console.error("Error signing out from Firebase: ", error);
    } finally {
      // Ensure user state is cleared and redirected, especially if it was just a dev admin session
      setUser(null); 
      setLoading(false);
      if (pathname !== '/login') {
        router.push('/login');
      }
    }
  };
  
  if (loading && !isDevAdminActive) { // Don't show global loader if dev admin is active (it handles its own loading)
    if (pathname !== '/login' && pathname !== '/register') {
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

    