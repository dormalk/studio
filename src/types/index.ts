
import type { Timestamp } from "firebase/firestore";

export interface Division {
  id: string;
  name: string;
}

export interface DivisionWithDetails extends Division {
  soldierCount: number;
  armoryItemCount: number;
}

export interface SoldierDocument {
  id: string; // Unique ID for this document record (e.g., UUID)
  fileName: string; // Display file name (can be custom)
  storagePath: string; // Full path in Firebase Storage: soldiers/{soldierId}/documents/{uniqueStorageFileName}
  downloadURL: string;
  fileType: string; // MIME type
  fileSize: number; // in bytes
  uploadedAt: string; // ISO string format for client-side (converted from Firestore Timestamp)
}

export interface Soldier {
  id: string; // Military ID number
  name:string;
  divisionId: string;
  divisionName?: string; // Optional: for display purposes, denormalized
  documents?: SoldierDocument[];
  assignedUniqueArmoryItemsDetails?: Array<{ id: string; itemTypeName: string; itemId: string; }>;
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
  soldierName?: string; // Denormalized for display
  soldierDivisionName?: string; // Denormalized for display
}

export interface ArmoryItem {
  id: string; // Firestore document ID
  itemTypeId: string; // Foreign key to ArmoryItemType
  itemTypeName?: string; // Denormalized for display
  isUniqueItem: boolean; // Denormalized from ArmoryItemType for easier client-side logic & queries

  // Fields for UNIQUE items
  itemId?: string; // Serial number: Mandatory if isUniqueItem is true, hidden/null otherwise
  linkedSoldierId?: string | null; // Optional: ID of the soldier this unique item is linked to. Use null for unlinked.
  linkedSoldierName?: string; // Optional: Denormalized for display
  linkedSoldierDivisionName?: string; // Optional: Denormalized division name of the linked soldier

  // Fields for NON-UNIQUE items
  totalQuantity?: number; // Total stock of this non-unique item: Mandatory if isUniqueItem is false
  assignments?: ArmoryItemAssignment[]; // For non-unique items, list of soldiers and quantities assigned

  imageUrl?: string; // URL of the scanned image, if stored

  // Client-side temporary field for SoldierDetail page
  _currentSoldierAssignedQuantity?: number;
}

