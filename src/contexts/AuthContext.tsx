
"use client";

import type { ReactNode } from 'react';
import { createContext, useContext, useEffect, useState } from 'react';
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
  devLoginAsAdmin?: () => void; // Optional: for development escape hatch
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Check for dev admin override cookie on initial load (client-side)
    if (process.env.NODE_ENV === 'development') {
      const devCookie = document.cookie.split('; ').find(row => row.startsWith('dev_admin_override='));
      if (devCookie?.split('=')[1] === 'true' && !user) { // Check !user to avoid loop if already set
        // If cookie exists and no user, simulate dev admin login
        // This is a simplified version, devLoginAsAdmin has more complete mock
        console.warn("DEV MODE: Restoring admin session from cookie.");
        const mockAdminUser: AppUser = {
            uid: 'dev-admin-uid-001',
            email: 'admin-dev@tzahal.app',
            emailVerified: true,
            displayName: 'מנהל מערכת (פיתוח)',
            isAnonymous: false,
            photoURL: null,
            providerData: [{
                providerId: 'password', uid: 'dev-admin-uid-001', displayName: 'מנהל מערכת (פיתוח)',
                email: 'admin-dev@tzahal.app', phoneNumber: null, photoURL: null,
            }],
            providerId: 'password',
            phoneNumber: null,
            tenantId: null,
            metadata: { creationTime: new Date().toISOString(), lastSignInTime: new Date().toISOString() } as unknown as import('firebase/auth').UserMetadata,
            getIdToken: async () => 'mock-dev-admin-id-token',
            getIdTokenResult: async () => ({ token: 'mock-dev-admin-id-token' } as any),
            reload: async () => {},
            delete: async () => {},
            toJSON: () => ({ uid: 'dev-admin-uid-001', email: 'admin-dev@tzahal.app' }),
            soldierId: '0000000',
            role: 'Admin',
            divisionId: 'dev-admin-division',
        };
        setUser(mockAdminUser);
        // No need to redirect here as onAuthStateChanged will handle page logic
      }
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
      // If dev admin override is active, don't process Firebase auth changes
      const devCookie = document.cookie.split('; ').find(row => row.startsWith('dev_admin_override='));
      if (process.env.NODE_ENV === 'development' && devCookie?.split('=')[1] === 'true' && user?.role === 'Admin' && user.uid === 'dev-admin-uid-001') {
        setLoading(false);
        return;
      }

      if (firebaseUser) {
        try {
          // Firestore uses UID from Auth as document ID in 'users' collection
          const userProfileDoc = await getDoc(doc(db, "users", firebaseUser.uid));
          if (userProfileDoc.exists()) {
            const userProfileData = userProfileDoc.data() as UserProfile;
            const appUserInstance: AppUser = {
              ...firebaseUser,
              soldierId: userProfileData.soldierId,
              role: userProfileData.role,
              divisionId: userProfileData.divisionId,
              displayName: userProfileData.displayName || firebaseUser.displayName, // Prioritize Firestore displayName
            };
            setUser(appUserInstance);

            if (pathname === '/login' || pathname === '/register') {
              router.push('/');
            }
          } else {
            console.error("User profile not found in Firestore for UID:", firebaseUser.uid, "Soldier ID:", (firebaseUser as any).soldierId);
            // This might happen if Firestore doc creation failed during registration
            // Or if using a Firebase user that doesn't have a corresponding Firestore profile
            await firebaseSignOut(auth); // Log out the user to prevent partial state
            setUser(null);
            if (pathname !== '/login' && pathname !== '/register') {
              router.push('/login');
            }
          }
        } catch (error) {
            console.error("Error fetching user profile:", error);
            await firebaseSignOut(auth);
            setUser(null);
            if (pathname !== '/login' && pathname !== '/register') {
              router.push('/login');
            }
        }
      } else {
        setUser(null);
        if (pathname !== '/login' && pathname !== '/register' && !pathname.startsWith('/api')) {
           router.push('/login');
        }
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [router, pathname, user]); // Added user to dependency array for dev admin cookie check logic

  const logout = async () => {
    setLoading(true);
    try {
      await firebaseSignOut(auth);
      if (process.env.NODE_ENV === 'development') {
        document.cookie = "dev_admin_override=; path=/; Max-Age=0; SameSite=Lax"; // Clear dev cookie
        console.log("DEV MODE: Cleared dev_admin_override cookie.");
      }
      setUser(null); // Clear user state immediately
      router.push('/login'); // Redirect to login
    } catch (error) {
      console.error("Error signing out: ", error);
    } finally {
      // setLoading(false); // setLoading(false) is handled by onAuthStateChanged
    }
  };

  const devLoginAsAdmin = () => {
    if (process.env.NODE_ENV === 'development') {
      console.warn("DEV MODE: Logging in as hardcoded admin.");
      const mockAdminUser: AppUser = {
        // FirebaseUser properties
        uid: 'dev-admin-uid-001',
        email: 'admin-dev@tzahal.app',
        emailVerified: true,
        displayName: 'מנהל מערכת (פיתוח)',
        isAnonymous: false,
        photoURL: null,
        providerData: [{
          providerId: 'password', // or 'dev-admin-provider'
          uid: 'dev-admin-uid-001', // Should match the main uid
          displayName: 'מנהל מערכת (פיתוח)',
          email: 'admin-dev@tzahal.app',
          phoneNumber: null,
          photoURL: null,
        }],
        providerId: 'password', // Typically 'firebase' for Firebase Auth users, using 'password' for mock clarity
        phoneNumber: null,
        tenantId: null,
        metadata: { // Mock UserMetadata
          creationTime: new Date().toISOString(),
          lastSignInTime: new Date().toISOString(),
        } as unknown as import('firebase/auth').UserMetadata, // Cast for UserMetadata type
        // Mock FirebaseUser methods
        getIdToken: async () => 'mock-dev-admin-id-token',
        getIdTokenResult: async () => ({ token: 'mock-dev-admin-id-token' } as any),
        reload: async () => { console.log('Mock reload called for dev admin'); },
        delete: async () => { console.log('Mock delete called for dev admin'); },
        toJSON: () => ({ uid: 'dev-admin-uid-001', email: 'admin-dev@tzahal.app' }),

        // AppUser specific fields
        soldierId: '0000000', // Mock soldier ID
        role: 'Admin',
        divisionId: 'dev-admin-division', // Mock division
      };
      setUser(mockAdminUser);
      document.cookie = "dev_admin_override=true; path=/; SameSite=Lax; Max-Age=" + (60 * 60 * 24); // Expires in 1 day
      console.log("DEV MODE: Set dev_admin_override cookie.");
      setLoading(false);
      router.push('/'); // Redirect to dashboard after mock login
    } else {
      console.error("devLoginAsAdmin can only be used in development mode.");
    }
  };


  if (loading && !user) { // Show loader only if truly loading and no user (including no dev admin)
    // Check again for dev admin override, in case onAuthStateChanged hasn't fired yet
    // or if it cleared the user due to no firebaseUser
    if (process.env.NODE_ENV === 'development') {
        const devCookie = document.cookie.split('; ').find(row => row.startsWith('dev_admin_override='));
        if (devCookie?.split('=')[1] === 'true') {
            // If cookie exists, but user is not set yet, attempt to set it.
            // This is a bit redundant but helps if initial onAuthStateChanged is slow or nullifies user
            if (!user && devLoginAsAdmin) devLoginAsAdmin(); // call devLoginAsAdmin if user is null
        }
    }
    // If still no user after trying dev admin, show loader
    if (!user) {
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

    