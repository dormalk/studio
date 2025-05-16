export interface Division {
  id: string;
  name: string;
}

export interface Soldier {
  id: string; // Military ID number
  name: string;
  divisionId: string;
  divisionName?: string; // Optional: for display purposes, denormalized
}

export interface ArmoryItem {
  id: string; // Firestore document ID
  itemId?: string; // Scanned/manual ID, e.g., serial number
  name: string;
  type: string; // e.g., "נשק", "אפוד", "קסדה"
  description?: string;
  imageUrl?: string; // URL of the scanned image, if stored
  photoDataUri?: string; // Temporary, for AI scanning
}
