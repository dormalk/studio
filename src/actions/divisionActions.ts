"use server";

import { db } from "@/lib/firebase";
import type { Division } from "@/types";
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc, query, where, writeBatch } from "firebase/firestore";
import { revalidatePath } from "next/cache";

const divisionsCollection = collection(db, "divisions");

// Create a new division
export async function addDivision(divisionData: { name: string }): Promise<Division> {
  try {
    const docRef = await addDoc(divisionsCollection, divisionData);
    revalidatePath("/soldiers");
    revalidatePath("/divisions"); // If a dedicated divisions page exists
    return { id: docRef.id, ...divisionData };
  } catch (error) {
    console.error("Error adding division: ", error);
    throw new Error("Failed to add division.");
  }
}

// Get all divisions
export async function getDivisions(): Promise<Division[]> {
  try {
    const querySnapshot = await getDocs(divisionsCollection);
    const divisions = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Division));
    return divisions;
  } catch (error) {
    console.error("Error fetching divisions: ", error);
    return []; // Return empty array on error
  }
}

// Update a division
export async function updateDivision(id: string, updates: Partial<Division>): Promise<void> {
  try {
    const divisionDoc = doc(db, "divisions", id);
    await updateDoc(divisionDoc, updates);
    revalidatePath("/soldiers");
    revalidatePath(`/divisions`);
  } catch (error) {
    console.error("Error updating division: ", error);
    throw new Error("Failed to update division.");
  }
}

// Delete a division and reassign its soldiers to a default/unassigned division (optional)
// For simplicity, this example will just delete the division.
// A more robust solution would handle soldier reassignment.
export async function deleteDivision(id: string): Promise<void> {
  try {
    // Before deleting a division, ensure soldiers are handled (e.g., moved to 'Unassigned')
    // This example keeps it simple:
    // Advanced: Query soldiers in this division and update their divisionId
    const soldiersRef = collection(db, "soldiers");
    const q = query(soldiersRef, where("divisionId", "==", id));
    const soldiersSnapshot = await getDocs(q);
    
    if (!soldiersSnapshot.empty) {
      // For now, prevent deletion if soldiers exist. User should reassign first.
      // Or, implement automatic reassignment.
      throw new Error("לא ניתן למחוק אוגדה עם חיילים משויכים. יש להעביר את החיילים תחילה.");
    }

    const divisionDoc = doc(db, "divisions", id);
    await deleteDoc(divisionDoc);
    revalidatePath("/soldiers");
    revalidatePath(`/divisions`);
  } catch (error) {
    console.error("Error deleting division: ", error);
    if (error instanceof Error) {
        throw error;
    }
    throw new Error("Failed to delete division.");
  }
}
