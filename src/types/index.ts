
import type { User as FirebaseUser, UserInfo, UserMetadata } from 'firebase/auth';
import type { Timestamp } from 'firebase/firestore';

// Define specific roles - ROLE_USER removed
export type Role =
  | 'ROLE_SOLDIER'
  | 'ROLE_DIVISION_MANAGER'
  | 'ROLE_ADMIN';

export interface SoldierProfileData {
  soldierId: string;
  name: string;
  divisionId: string;
  hashedPassword?: string; 
  roles: Role[]; 
  createdAt: Timestamp;
  lastLoginAt?: Timestamp;
  isActive?: boolean;
  email?: string; 
  photoURL?: string;
}

export interface AppUser extends Omit<FirebaseUser, 'role'> {
  soldierId: string; 
  primaryRole: Role;
  roles: Role[];
  divisionId: string | null;
  displayName: string; // Already non-nullable, good.
}

export interface Division {
  id: string;
  name: string;
}

export interface ArmoryCategory {
  id: string;
  name: string;
}

export interface ArmoryItemAssignment {
  soldierId: string;
  quantity: number;
  assignedAt: Timestamp;
  returnedAt?: Timestamp;
}

export interface ArmoryItem {
  id: string; 
  name: string;
  type: string; 
  category: string; 
  status: 'Available' | 'Assigned' | 'Maintenance' | 'Decommissioned';
  description?: string;
  quantity?: number; 
  isUnique: boolean; 
  
  assignedTo?: string; 
  assignmentHistory?: ArmoryItemAssignment[];

  totalQuantity?: number; 
  assignments?: ArmoryItemAssignment[]; 

  imageUrl?: string; 
  _currentSoldierAssignedQuantity?: number;
}

// This UserProfile might be legacy if 'soldiers' collection is the main source.
// If used, roles should also be Role[] and not reference ROLE_USER.
export interface UserProfile { 
  uid: string; 
  email: string | null;
  soldierId: string; 
  displayName: string; 
  divisionId: string;
  roles: Role[]; // Ensure this is Role[]
  createdAt: Timestamp;
}
