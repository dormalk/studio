
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
  fileName: string; // Original file name
  storagePath: string; // Full path in Firebase Storage: soldiers/{soldierId}/documents/{uniqueFileName}
  downloadURL: string;
  fileType: string; // MIME type
  fileSize: number; // in bytes
  uploadedAt: Timestamp;
}

export interface Soldier {
  id: string; // Military ID number
  name:string;
  divisionId: string;
  divisionName?: string; // Optional: for display purposes, denormalized
  documents?: SoldierDocument[];
}

export interface ArmoryItemType {
  id: string;
  name: string;
  isUnique: boolean; // New field: true if items of this type are unique (require serial)
}

export interface ArmoryItem {
  id: string; // Firestore document ID
  itemTypeId: string; // Foreign key to ArmoryItemType
  itemTypeName?: string; // Denormalized for display
  isUniqueItem?: boolean; // Denormalized from ArmoryItemType for easier client-side logic & queries

  // Fields for UNIQUE items
  itemId?: string; // Serial number: Mandatory if isUniqueItem is true, hidden/null otherwise
  linkedSoldierId?: string; // Optional: ID of the soldier this unique item is linked to
  linkedSoldierName?: string; // Optional: Denormalized for display
  linkedSoldierDivisionName?: string; // Optional: Denormalized division name of the linked soldier

  // Fields for NON-UNIQUE items
  totalQuantity?: number; // Total stock of this non-unique item: Mandatory if isUniqueItem is false

  imageUrl?: string; // URL of the scanned image, if stored
  // photoDataUri is a form-only field
}
