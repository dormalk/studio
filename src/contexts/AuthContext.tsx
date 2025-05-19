
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
      setLoading(false); // Crucial: set loading to false AFTER user and flag are set

      if (typeof window !== 'undefined' && !isRestoringFromCookie) {
        document.cookie = "dev_admin_override=true; path=/; SameSite=Lax; Max-Age=" + (60 * 60 * 24);
        console.log("DEV MODE: Set dev_admin_override cookie.");
      }
      
      console.log("DEV MODE: User set as dev admin, loading is false. Attempting to redirect.");
      if (pathname === '/login' || pathname === '/register') {
        router.push('/');
      }
    } else {
      console.error("devLoginAsAdmin can only be used in development mode.");
    }
  }, [router, pathname]);

  // Effect for restoring dev admin session from cookie - SIMPLIFIED
  useEffect(() => {
    // This effect is for INITIALLY RESTORING a dev admin session from a cookie on page load.
    // It should not interfere with an already active dev admin session or a real Firebase session.
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
      // Only run if no user is currently set (neither real nor dev admin) and it's the initial loading phase.
      if (!user && !isDevAdminActive && loading) {
        const devCookie = document.cookie.split('; ').find(row => row.startsWith('dev_admin_override='));
        if (devCookie?.split('=')[1] === 'true') {
          console.log("DEV MODE: AuthContext initial useEffect found dev_admin_override cookie and no active session, calling devLoginAsAdmin(true).");
          if (devLoginAsAdmin) devLoginAsAdmin(true); // isRestoringFromCookie = true
        }
      }
    }
  }, [loading, user, isDevAdminActive, devLoginAsAdmin]);


  // Effect for Firebase auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
      console.log("AuthContext: onAuthStateChanged triggered. Firebase user:", firebaseUser, "Current isDevAdminActive:", isDevAdminActive);

      if (firebaseUser) {
        // Real Firebase user signed in
        if (isDevAdminActive) {
          console.log("AuthContext: Real Firebase user detected while dev admin mode was active. Disabling dev admin mode.");
          if (typeof window !== 'undefined') {
            document.cookie = "dev_admin_override=; path=/; Max-Age=0; SameSite=Lax"; // Clear dev cookie
          }
        }
        setIsDevAdminActive(false); // Turn off dev admin mode

        try {
          const userProfileDocRef = doc(db, "users", firebaseUser.uid); // Use UID for 'users' collection
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
            console.log("AuthContext: User profile found and set:", appUserInstance);
            if (pathname === '/login' || pathname === '/register') {
              router.push('/');
            }
          } else {
            console.error("AuthContext: User profile not found in Firestore for UID:", firebaseUser.uid, "Signing out.");
            await firebaseSignOut(auth); 
            // setUser(null); // onAuthStateChanged will fire again with null
          }
        } catch (error) {
            console.error("AuthContext: Error fetching user profile:", error);
            await firebaseSignOut(auth);
            // setUser(null);
        } finally {
            setLoading(false);
        }
      } else {
        // No Firebase user
        if (!isDevAdminActive) {
          // And not in dev admin mode, so truly no user
          console.log("AuthContext: No Firebase user and not in dev admin mode. Setting user to null and loading to false.");
          setUser(null);
          setLoading(false); 
        } else {
          // In dev admin mode, but no Firebase user. The dev admin state should persist.
          // setLoading(false) should have been handled by devLoginAsAdmin.
          console.log("AuthContext: No Firebase user, but dev admin mode is active. User state preserved. Ensuring loading is false.");
          if (loading) setLoading(false); 
        }
      }
    });

    return () => unsubscribe();
  }, [isDevAdminActive, devLoginAsAdmin, router, pathname, loading]); // Added loading to dep array

  const logout = async () => {
    console.log("AuthContext: logout called. Was dev admin active:", isDevAdminActive);
    
    if (typeof window !== 'undefined') {
      document.cookie = "dev_admin_override=; path=/; Max-Age=0; SameSite=Lax";
      console.log("DEV MODE: Cleared dev_admin_override cookie on logout.");
    }
    
    const wasDevAdmin = isDevAdminActive;
    setIsDevAdminActive(false); // Turn off dev admin mode first
    
    try {
      await firebaseSignOut(auth);
      console.log("AuthContext: Firebase signout successful (or no user was signed in).");
      // onAuthStateChanged will handle setting user to null and loading to false if a real user was signed out.
      // If it was only a dev admin, onAuthStateChanged might not do what we need if it sees null again.
    } catch (error) {
      console.error("Error signing out from Firebase: ", error);
    } finally {
        // Explicitly clear state and redirect, especially for dev admin or if signout failed
        setUser(null); 
        setLoading(false);
        if (pathname !== '/login') { // Avoid redirect loop if already there
            router.push('/login');
        }
    }
  };
  
  // Global loader for initial auth state resolution
  if (loading && !isDevAdminActive && !user) { 
    const isAuthPage = pathname === '/login' || pathname === '/register';
    if (!isAuthPage) { 
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
