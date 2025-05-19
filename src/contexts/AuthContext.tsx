
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
      setLoading(false); // Set loading to false immediately

      if (typeof window !== 'undefined' && !isRestoringFromCookie) {
        document.cookie = "dev_admin_override=true; path=/; SameSite=Lax; Max-Age=" + (60 * 60 * 24);
        console.log("DEV MODE: Set dev_admin_override cookie.");
      }
      
      console.log("DEV MODE: User set as dev admin, loading is false. Attempting to redirect.");
      // Push router.push to the next event loop tick
      setTimeout(() => {
        if (pathname === '/login' || pathname === '/register') {
          router.push('/');
        }
      }, 0);
    } else {
      console.error("devLoginAsAdmin can only be used in development mode.");
    }
  }, [router, pathname]);

  // Effect for restoring dev admin session from cookie
  useEffect(() => {
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
      if (!user && !isDevAdminActive && loading) { // Only try to restore if no user/dev session and still in initial load
        const devCookie = document.cookie.split('; ').find(row => row.startsWith('dev_admin_override='));
        if (devCookie?.split('=')[1] === 'true') {
          console.warn("DEV MODE: AuthContext initial useEffect found dev_admin_override cookie, attempting to restore dev admin session.");
          if (devLoginAsAdmin) devLoginAsAdmin(true);
        }
      }
    }
  }, [user, isDevAdminActive, loading, devLoginAsAdmin]);


  // Effect for Firebase auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
      console.log("AuthContext: onAuthStateChanged triggered. Firebase user:", firebaseUser, "Current isDevAdminActive:", isDevAdminActive);

      if (isDevAdminActive && firebaseUser === null) {
        console.log("AuthContext: In dev admin mode and no real Firebase user. Preserving dev admin session. Ensuring loading is false.");
        if (loading) setLoading(false); // Ensure loading is false if dev admin is active
        return; // Do not proceed further to avoid overwriting dev admin user
      }

      if (firebaseUser) {
        // Real Firebase user signed in
        console.log("AuthContext: Real Firebase user detected. Disabling dev admin mode if it was active.");
        if (isDevAdminActive) {
          if (typeof window !== 'undefined') {
            document.cookie = "dev_admin_override=; path=/; Max-Age=0; SameSite=Lax";
          }
        }
        setIsDevAdminActive(false);

        try {
          // For real users, user document ID in 'users' is their Firebase UID
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
            console.log("AuthContext: User profile found and set for real user:", appUserInstance);
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
        // No Firebase user AND not in dev admin mode (due to the check at the beginning of this callback)
        console.log("AuthContext: No Firebase user and not in dev admin mode. Setting user to null and loading to false.");
        setUser(null);
        setLoading(false); 
      }
    });

    return () => unsubscribe();
  }, [isDevAdminActive, router, pathname, loading]); // Removed devLoginAsAdmin, added loading

  const logout = async () => {
    console.log("AuthContext: logout called. Was dev admin active:", isDevAdminActive);
    
    if (typeof window !== 'undefined') {
      document.cookie = "dev_admin_override=; path=/; Max-Age=0; SameSite=Lax";
      console.log("DEV MODE: Cleared dev_admin_override cookie on logout.");
    }
    
    setIsDevAdminActive(false);
    setUser(null); 
    
    try {
      await firebaseSignOut(auth);
      console.log("AuthContext: Firebase signout successful (or no user was signed in).");
    } catch (error) {
      console.error("Error signing out from Firebase: ", error);
    } finally {
        setLoading(false); // Ensure loading is false after all logout operations
        if (pathname !== '/login') {
            router.push('/login');
        }
    }
  };
  
  if (loading) { 
    const isAuthPage = pathname === '/login' || pathname === '/register';
    // Show loader on non-auth pages during initial load or if dev admin is active but user not yet set (brief moment)
    if (!isAuthPage || (isDevAdminActive && !user)) { 
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
