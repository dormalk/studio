
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
      setLoading(false); // Set loading to false *after* setting user

      if (typeof window !== 'undefined' && !isRestoringFromCookie) {
        document.cookie = "dev_admin_override=true; path=/; SameSite=Lax; Max-Age=" + (60 * 60 * 24); // Expires in 1 day
        console.log("DEV MODE: Set dev_admin_override cookie.");
      }
      console.log("DEV MODE: User set, attempting to redirect to /");
      router.push('/'); 
    } else {
      console.error("devLoginAsAdmin can only be used in development mode.");
    }
  }, [router]);


  useEffect(() => {
    let devCookieRestored = false;
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
      const devCookie = document.cookie.split('; ').find(row => row.startsWith('dev_admin_override='));
      if (devCookie?.split('=')[1] === 'true' && !user) {
        console.warn("DEV MODE: AuthContext useEffect found dev cookie, attempting to restore admin session.");
        if (devLoginAsAdmin) {
            devLoginAsAdmin(true); // Pass true to indicate it's a restore, prevent re-setting cookie
            devCookieRestored = true;
        }
      }
    }

    if (devCookieRestored) {
        // If restored via dev cookie, Firebase auth listener might not be needed or could conflict.
        // However, we still want to ensure loading is false.
        setLoading(false); 
        return; // Skip Firebase listener if dev admin is restored
    }
    
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
      console.log("AuthContext: onAuthStateChanged triggered. Firebase user:", firebaseUser);
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
              console.log("AuthContext: User on auth page, redirecting to /");
              router.push('/');
            }
          } else {
            console.error("AuthContext: User profile not found in Firestore for UID:", firebaseUser.uid);
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
      } else {
        setUser(null);
        console.log("AuthContext: No Firebase user, user set to null.");
        const isDevOverrideActive = typeof window !== 'undefined' && document.cookie.includes('dev_admin_override=true');
        if (!isDevOverrideActive && pathname !== '/login' && pathname !== '/register' && !pathname.startsWith('/api')) {
           console.log("AuthContext: Not on auth page and no dev override, redirecting to /login");
           router.push('/login');
        }
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [router, pathname, user, devLoginAsAdmin]); // Added user and devLoginAsAdmin to dependency array


  const logout = async () => {
    console.log("AuthContext: logout called");
    setLoading(true);
    try {
      await firebaseSignOut(auth);
      if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
        document.cookie = "dev_admin_override=; path=/; Max-Age=0; SameSite=Lax";
        console.log("DEV MODE: Cleared dev_admin_override cookie.");
      }
      setUser(null);
      router.push('/login');
    } catch (error) {
      console.error("Error signing out: ", error);
       setLoading(false); // Ensure loading is false even on error
    }
    // setLoading(false) is also handled by onAuthStateChanged after sign out
  };
  
  if (loading) {
    let isDevStillActive = false;
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
        const devCookie = document.cookie.split('; ').find(row => row.startsWith('dev_admin_override='));
        if (devCookie?.split('=')[1] === 'true' && !user) { // if cookie exists but user isn't set yet
            isDevStillActive = true; // We might be in the process of restoring
        }
    }

    // Only show loader if not a dev admin session being restored OR if user is already set (meaning regular auth is loading)
    if (!isDevStillActive && !user ) {
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
