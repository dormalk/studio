
import type { Timestamp } from "firebase/firestore";
import type { User as FirebaseUser } from "firebase/auth";

export interface Division {
  id: string;
  name: string;
}

export interface DivisionWithDetails extends Division {
  soldierCount: number;
  armoryItemCount: number;
}

export interface DivisionArmorySummary {
  totalUniqueItemsInDivision: number;
  nonUniqueItemsSummaryInDivision: Array<{ itemTypeName: string; totalQuantityAssigned: number }>;
}

export interface SoldierDocument {
  id: string; 
  fileName: string; 
  storagePath: string; 
  downloadURL: string;
  fileType: string; 
  fileSize: number; 
  uploadedAt: string; 
}

export interface Soldier {
  id: string; 
  name:string;
  divisionId: string;
  divisionName?: string; 
  documents?: SoldierDocument[];
  assignedUniqueArmoryItemsDetails?: Array<{ id: string; itemTypeName: string; itemId: string; isStored?: boolean; shelfNumber?: string; }>;
  assignedNonUniqueArmoryItemsSummary?: Array<{ itemTypeName: string; quantity: number }>;
}

export interface ArmoryItemType {
  id: string;
  name: string;
  isUnique: boolean;
}

export interface ArmoryItemAssignment {
  soldierId: string;
  quantity: number;
  soldierName?: string; 
  soldierDivisionName?: string; 
}

export interface ArmoryItem {
  id: string; 
  itemTypeId: string; 
  itemTypeName?: string; 
  isUniqueItem: boolean; 

  // Fields for UNIQUE items
  itemId?: string; 
  linkedSoldierId?: string | null; 
  linkedSoldierName?: string; 
  linkedSoldierDivisionName?: string; 
  isStored?: boolean; 
  shelfNumber?: string; 

  // Fields for NON-UNIQUE items
  totalQuantity?: number; 
  assignments?: ArmoryItemAssignment[]; 

  imageUrl?: string; 

  _currentSoldierAssignedQuantity?: number;
}

// Auth related types
export interface AppUser extends FirebaseUser {
  soldierId?: string; // Personal ID of the soldier
  role?: string; // e.g., "Admin", "User"
  divisionId?: string;
}

export interface UserProfile { // Stored in Firestore /users/{uid}
  uid: string;
  email: string | null;
  soldierId: string; // Personal ID, also used as username part
  displayName: string; // Soldier's full name
  divisionId: string;
  role: "Admin" | "User"; // Add more roles as needed
  createdAt: Timestamp;
}
