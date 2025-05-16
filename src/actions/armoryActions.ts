"use server";

import { db } from "@/lib/firebase";
import type { ArmoryItem } from "@/types";
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { revalidatePath } from "next/cache";
import { scanArmoryItem as scanArmoryItemAI } from "@/ai/flows/scan-armory-item";

const armoryCollection = collection(db, "armoryItems");

// Add a new armory item
export async function addArmoryItem(itemData: Omit<ArmoryItem, 'id'>): Promise<ArmoryItem> {
  try {
    const docRef = await addDoc(armoryCollection, {
      ...itemData,
      createdAt: serverTimestamp(), // Optional: add a timestamp
    });
    revalidatePath("/armory");
    return { id: docRef.id, ...itemData };
  } catch (error) {
    console.error("Error adding armory item: ", error);
    throw new Error("Failed to add armory item.");
  }
}

// Get all armory items
export async function getArmoryItems(): Promise<ArmoryItem[]> {
  try {
    const querySnapshot = await getDocs(armoryCollection);
    const items = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ArmoryItem));
    return items;
  } catch (error) {
    console.error("Error fetching armory items: ", error);
    return [];
  }
}

// Update an armory item
export async function updateArmoryItem(id: string, updates: Partial<ArmoryItem>): Promise<void> {
  try {
    const itemDoc = doc(db, "armoryItems", id);
    await updateDoc(itemDoc, updates);
    revalidatePath("/armory");
  } catch (error) {
    console.error("Error updating armory item: ", error);
    throw new Error("Failed to update armory item.");
  }
}

// Delete an armory item
export async function deleteArmoryItem(id: string): Promise<void> {
  try {
    const itemDoc = doc(db, "armoryItems", id);
    await deleteDoc(itemDoc);
    revalidatePath("/armory");
  } catch (error) {
    console.error("Error deleting armory item: ", error);
    throw new Error("Failed to delete armory item.");
  }
}

// Scan armory item using AI
export async function scanArmoryItemImage(photoDataUri: string): Promise<{ itemType: string; itemId: string }> {
  try {
    // The AI flow is already a server action, so we call it directly.
    const result = await scanArmoryItemAI({ photoDataUri });
    return result;
  } catch (error) {
    console.error("Error scanning armory item image: ", error);
    throw new Error("Failed to scan armory item image.");
  }
}
