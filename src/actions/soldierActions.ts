"use server";

import { db } from "@/lib/firebase";
import type { Soldier } from "@/types";
import { collection, doc, setDoc, getDocs, updateDoc, deleteDoc, getDoc, query, where, writeBatch } from "firebase/firestore";
import { revalidatePath } from "next/cache";

const soldiersCollection = collection(db, "soldiers");

// Add a new soldier (using soldier's unique ID as document ID)
export async function addSoldier(soldierData: Omit<Soldier, 'divisionName'>): Promise<Soldier> {
  try {
    // Check if soldier with this ID already exists
    const soldierDocRef = doc(db, "soldiers", soldierData.id);
    const soldierDocSnap = await getDoc(soldierDocRef);
    if (soldierDocSnap.exists()) {
      throw new Error(`חייל עם ת.ז. ${soldierData.id} כבר קיים.`);
    }

    await setDoc(soldierDocRef, soldierData);
    revalidatePath("/soldiers");
    return { ...soldierData };
  } catch (error) {
    console.error("Error adding soldier: ", error);
    if (error instanceof Error) throw error;
    throw new Error("Failed to add soldier.");
  }
}

// Get all soldiers
export async function getSoldiers(): Promise<Soldier[]> {
  try {
    const querySnapshot = await getDocs(soldiersCollection);
    const soldiers = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Soldier));
    return soldiers;
  } catch (error) {
    console.error("Error fetching soldiers: ", error);
    return [];
  }
}

// Update soldier's division (for drag and drop)
export async function transferSoldier(soldierId: string, newDivisionId: string): Promise<void> {
  try {
    const soldierDoc = doc(db, "soldiers", soldierId);
    await updateDoc(soldierDoc, { divisionId: newDivisionId });
    revalidatePath("/soldiers");
  } catch (error) {
    console.error("Error transferring soldier: ", error);
    throw new Error("Failed to transfer soldier.");
  }
}

// Update soldier details
export async function updateSoldier(soldierId: string, updates: Partial<Omit<Soldier, 'id' | 'divisionName'>>): Promise<void> {
  try {
    const soldierDoc = doc(db, "soldiers", soldierId);
    await updateDoc(soldierDoc, updates);
    revalidatePath("/soldiers");
  } catch (error) {
    console.error("Error updating soldier: ", error);
    throw new Error("Failed to update soldier.");
  }
}

// Delete a soldier
export async function deleteSoldier(soldierId: string): Promise<void> {
  try {
    const soldierDoc = doc(db, "soldiers", soldierId);
    await deleteDoc(soldierDoc);
    revalidatePath("/soldiers");
  } catch (error) {
    console.error("Error deleting soldier: ", error);
    throw new Error("Failed to delete soldier.");
  }
}
