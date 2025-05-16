import type { Timestamp } from "firebase/firestore";

export interface Division {
  id: string;
  name: string;
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
  name: string;
  divisionId: string;
  divisionName?: string; // Optional: for display purposes, denormalized
  documents?: SoldierDocument[];
}

export interface ArmoryItemType {
  id: string;
  name: string;
}

export interface ArmoryItem {
  id: string; // Firestore document ID
  itemId?: string; // Scanned/manual ID, e.g., serial number
  name: string;
  itemTypeId: string; // Foreign key to ArmoryItemType
  itemTypeName?: string; // Denormalized for display
  description?: string;
  imageUrl?: string; // URL of the scanned image, if stored
  photoDataUri?: string; // Temporary, for AI scanning
}
