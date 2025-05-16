
"use server";

import { db } from "@/lib/firebase";
import type { Division } from "@/types"; // Type name remains Division
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc, query, where, writeBatch } from "firebase/firestore";
import { revalidatePath } from "next/cache";

const divisionsCollection = collection(db, "divisions"); // Collection name remains divisions

// Create a new pluga (conceptually)
export async function addDivision(divisionData: { name: string }): Promise<Division> {
  try {
    const docRef = await addDoc(divisionsCollection, divisionData);
    revalidatePath("/soldiers");
    revalidatePath("/divisions"); // If a dedicated divisions page exists
    return { id: docRef.id, ...divisionData };
  } catch (error) {
    console.error("Error adding pluga: ", error); // Log message updated
    throw new Error("הוספת פלוגה נכשלה."); // User facing error updated
  }
}

// Get all plugas (conceptually)
export async function getDivisions(): Promise<Division[]> {
  try {
    const querySnapshot = await getDocs(divisionsCollection);
    const divisions = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Division));
    return divisions;
  } catch (error) {
    console.error("Error fetching plugas: ", error); // Log message updated
    return []; 
  }
}

// Update a pluga (conceptually)
export async function updateDivision(id: string, updates: Partial<Division>): Promise<void> {
  try {
    const divisionDoc = doc(db, "divisions", id);
    await updateDoc(divisionDoc, updates);
    revalidatePath("/soldiers");
    revalidatePath(`/divisions`);
  } catch (error) {
    console.error("Error updating pluga: ", error); // Log message updated
    throw new Error("עדכון פלוגה נכשל."); // User facing error updated
  }
}

// Delete a pluga (conceptually)
export async function deleteDivision(id: string): Promise<void> {
  try {
    const soldiersRef = collection(db, "soldiers");
    const q = query(soldiersRef, where("divisionId", "==", id));
    const soldiersSnapshot = await getDocs(q);
    
    if (!soldiersSnapshot.empty) {
      throw new Error("לא ניתן למחוק פלוגה עם חיילים משויכים. יש להעביר את החיילים תחילה."); // User facing error updated
    }

    const divisionDoc = doc(db, "divisions", id);
    await deleteDoc(divisionDoc);
    revalidatePath("/soldiers");
    revalidatePath(`/divisions`);
  } catch (error) {
    console.error("Error deleting pluga: ", error); // Log message updated
    if (error instanceof Error && error.message === "לא ניתן למחוק פלוגה עם חיילים משויכים. יש להעביר את החיילים תחילה.") {
        throw error; // Re-throw the specific user-facing error
    }
    throw new Error("מחיקת פלוגה נכשלה."); // User facing error updated
  }
}

    