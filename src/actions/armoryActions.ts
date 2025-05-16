
"use server";

import { db } from "@/lib/firebase";
import type { ArmoryItem, ArmoryItemType } from "@/types";
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc, serverTimestamp, query, where, writeBatch } from "firebase/firestore";
import { revalidatePath } from "next/cache";
import { scanArmoryItem as scanArmoryItemAI } from "@/ai/flows/scan-armory-item";

const armoryCollection = collection(db, "armoryItems");
const armoryItemTypesCollection = collection(db, "armoryItemTypes");

// Armory Item Type Actions

// Add a new armory item type
export async function addArmoryItemType(itemTypeData: { name: string }): Promise<ArmoryItemType> {
  try {
    // Check if type with this name already exists (case insensitive for robustness)
    const q = query(armoryItemTypesCollection, where("name", "==", itemTypeData.name));
    const existingTypesSnapshot = await getDocs(q);
    if (!existingTypesSnapshot.empty) {
      // A more robust check would be to convert both to lowercase and compare
      // For simplicity, direct match or consider client-side validation for case.
      // This example allows duplicates if case is different, improve if needed.
      // throw new Error(`סוג פריט בשם "${itemTypeData.name}" כבר קיים.`);
    }

    const docRef = await addDoc(armoryItemTypesCollection, itemTypeData);
    revalidatePath("/armory");
    return { id: docRef.id, ...itemTypeData };
  } catch (error) {
    console.error("Error adding armory item type: ", error);
    if (error instanceof Error && error.message.includes("כבר קיים")) throw error;
    throw new Error("הוספת סוג פריט נכשלה.");
  }
}

// Get all armory item types
export async function getArmoryItemTypes(): Promise<ArmoryItemType[]> {
  try {
    const querySnapshot = await getDocs(armoryItemTypesCollection);
    const types = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ArmoryItemType));
    return types.sort((a, b) => a.name.localeCompare(b.name)); // Sort alphabetically
  } catch (error) {
    console.error("Error fetching armory item types: ", error);
    return [];
  }
}

// Update an armory item type
export async function updateArmoryItemType(id: string, updates: { name: string }): Promise<void> {
  try {
    // Optional: Check if new name conflicts with another existing type
    const itemTypeDoc = doc(db, "armoryItemTypes", id);
    await updateDoc(itemTypeDoc, updates);
    revalidatePath("/armory");
  } catch (error) {
    console.error("Error updating armory item type: ", error);
    throw new Error("עדכון סוג פריט נכשל.");
  }
}

// Delete an armory item type
export async function deleteArmoryItemType(id: string): Promise<void> {
  try {
    // Check if this type is used by any armory items
    const q = query(armoryCollection, where("itemTypeId", "==", id));
    const usageSnapshot = await getDocs(q);
    if (!usageSnapshot.empty) {
      throw new Error("לא ניתן למחוק סוג פריט שנמצא בשימוש.");
    }

    const itemTypeDoc = doc(db, "armoryItemTypes", id);
    await deleteDoc(itemTypeDoc);
    revalidatePath("/armory");
  } catch (error) {
    console.error("Error deleting armory item type: ", error);
    if (error instanceof Error && error.message.includes("בשימוש")) throw error;
    throw new Error("מחיקת סוג פריט נכשלה.");
  }
}


// Armory Item Actions

// Add a new armory item
export async function addArmoryItem(itemData: Omit<ArmoryItem, 'id' | 'itemTypeName' | 'createdAt'>): Promise<ArmoryItem> {
  try {
    const docRef = await addDoc(armoryCollection, {
      ...itemData,
      createdAt: serverTimestamp(),
    });
    revalidatePath("/armory");
    // itemTypeName will be populated by getArmoryItems or on client
    return { id: docRef.id, ...itemData, itemTypeName: "" }; // itemTypeName placeholder
  } catch (error) {
    console.error("Error adding armory item: ", error);
    throw new Error("הוספת פריט נכשלה.");
  }
}

// Get all armory items (itemTypeName will be enriched by the page component)
export async function getArmoryItems(): Promise<Omit<ArmoryItem, 'itemTypeName'>[]> {
  try {
    const querySnapshot = await getDocs(armoryCollection);
    // const items = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Omit<ArmoryItem, 'itemTypeName'>));
    const items = querySnapshot.docs.map(docSnapshot => {
        const data = docSnapshot.data();
        // Ensure itemTypeId is present, default to a placeholder if not (should not happen with proper data entry)
        return { 
            id: docSnapshot.id, 
            name: data.name || "שם לא ידוע",
            itemTypeId: data.itemTypeId || "unknown_type_id", 
            itemId: data.itemId,
            description: data.description,
            imageUrl: data.imageUrl,
            // photoDataUri is client-side only, createdAt is a Timestamp
        } as Omit<ArmoryItem, 'itemTypeName' | 'photoDataUri' | 'createdAt'>; 
    });
    return items;
  } catch (error) {
    console.error("Error fetching armory items: ", error);
    return [];
  }
}

// Update an armory item
export async function updateArmoryItem(id: string, updates: Partial<Omit<ArmoryItem, 'id' | 'itemTypeName' | 'createdAt'>>): Promise<void> {
  try {
    const itemDoc = doc(db, "armoryItems", id);
    await updateDoc(itemDoc, updates);
    revalidatePath("/armory");
  } catch (error) {
    console.error("Error updating armory item: ", error);
    throw new Error("עדכון פריט נכשל.");
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
    throw new Error("מחיקת פריט נכשלה.");
  }
}

// Scan armory item using AI
export async function scanArmoryItemImage(photoDataUri: string): Promise<{ itemType: string; itemId: string }> {
  try {
    const result = await scanArmoryItemAI({ photoDataUri });
    return result; // AI returns itemType (string name) and itemId
  } catch (error) {
    console.error("Error scanning armory item image: ", error);
    throw new Error("סריקת תמונת פריט נכשלה.");
  }
}
