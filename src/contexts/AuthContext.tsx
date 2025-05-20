
"use client";

import type { ReactNode } from 'react';
import { createContext, useContext, useEffect, useState } from 'react';
import { auth, db as firestoreClient } from '@/lib/firebase';
import type { User as FirebaseUser } from 'firebase/auth';
import { onAuthStateChanged, signOut as firebaseSignOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import type { AppUser, Role, SoldierProfileData } from '@/types'; 
import { useRouter, usePathname } from 'next/navigation';
import { Loader2 } from 'lucide-react';

interface AuthContextType {
  user: AppUser | null;
  loading: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function determinePrimaryRole(roles: Role[] | undefined | null): Role {
  if (!roles || roles.length === 0) return 'ROLE_SOLDIER';
  if (roles.includes('ROLE_ADMIN')) return 'ROLE_ADMIN';
  if (roles.includes('ROLE_DIVISION_MANAGER')) return 'ROLE_DIVISION_MANAGER';
  if (roles.includes('ROLE_SOLDIER')) return 'ROLE_SOLDIER';
  return 'ROLE_SOLDIER'; 
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
      console.log("AuthContext: onAuthStateChanged triggered. Firebase user UID (soldierId):", firebaseUser?.uid);

      if (firebaseUser && firebaseUser.uid) {
        const soldierId = firebaseUser.uid;
        try {
          const soldierDocRef = doc(firestoreClient, "soldiers", soldierId);
          const soldierDocSnap = await getDoc(soldierDocRef);

          if (soldierDocSnap.exists()) {
            const soldierData = soldierDocSnap.data() as SoldierProfileData;
            
            const appUserRoles: Role[] = (soldierData.roles && Array.isArray(soldierData.roles) && soldierData.roles.length > 0) 
                                          ? soldierData.roles 
                                          : ['ROLE_SOLDIER'];
            const primaryRole = determinePrimaryRole(appUserRoles);

            // Use spread operator for firebaseUser and then override/add custom fields
            const appUserInstance: AppUser = {
              ...firebaseUser, // Spread all properties from firebaseUser first
              uid: soldierId, // Explicitly ensure uid is our soldierId (already the case)
              soldierId: soldierId, 
              displayName: soldierData.name || firebaseUser.displayName || "חייל", // Override displayName
              // Custom application-specific fields from AppUser type
              primaryRole: primaryRole,
              roles: appUserRoles,
              divisionId: soldierData.divisionId || null,
              // Note: email, photoURL etc., if present in soldierData and different, can be overridden here too if needed
              // e.g. email: soldierData.email || firebaseUser.email || `${soldierId}@tzahal.app`,
            };
            setUser(appUserInstance);
            console.log("AuthContext: AppUser (Soldier) profile set:", appUserInstance);

            if (pathname === '/login' || pathname === '/register') {
              router.push('/');
            }
          } else {
            console.error(`AuthContext: Soldier profile not found in 'soldiers' collection for UID (soldierId): ${soldierId}. Signing out.`);
            await firebaseSignOut(auth);
            setUser(null);
          }
        } catch (error) {
            console.error("AuthContext: Error fetching soldier profile:", error);
            await firebaseSignOut(auth);
            setUser(null);
        } finally {
            setLoading(false);
        }
      } else {
        console.log("AuthContext: No Firebase user. Setting user to null.");
        setUser(null);
        setLoading(false);
      }
    });
    return () => unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, router]); 

  const logout = async () => {
    console.log("AuthContext: logout called.");
    setUser(null); 
    try {
      await firebaseSignOut(auth);
      console.log("AuthContext: Firebase signout successful.");
      if (pathname !== '/login') {
        router.push('/login'); 
      }
    } catch (error) {
      console.error("Error signing out from Firebase: ", error);
      setLoading(false); 
      if (pathname !== '/login') {
        router.push('/login'); 
      }
    }
  };

  if (loading && typeof window !== 'undefined') {
    const isAuthPage = pathname === '/login' || pathname === '/register';
    if (!isAuthPage && !user) { 
        console.log("AuthContext: Displaying initial global loader. Path:", pathname);
        return (
            <div className="flex justify-center items-center min-h-screen">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
            </div>
        );
    }
  }

  return (
    <AuthContext.Provider value={{ user, loading, logout }}>
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
