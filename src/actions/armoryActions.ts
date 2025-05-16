
"use server";

import { db } from "@/lib/firebase";
import type { ArmoryItem, ArmoryItemType, Soldier } from "@/types";
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc, serverTimestamp, query, where, writeBatch, getDoc } from "firebase/firestore";
import { revalidatePath } from "next/cache";
import { scanArmoryItem as scanArmoryItemAI } from "@/ai/flows/scan-armory-item";

const armoryCollection = collection(db, "armoryItems");
const armoryItemTypesCollection = collection(db, "armoryItemTypes");
const soldiersCollection = collection(db, "soldiers"); // For fetching soldier names

// Armory Item Type Actions

export async function addArmoryItemType(itemTypeData: { name: string }): Promise<ArmoryItemType> {
  try {
    const q = query(armoryItemTypesCollection, where("name", "==", itemTypeData.name));
    const existingTypesSnapshot = await getDocs(q);
    if (!existingTypesSnapshot.empty) {
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

export async function getArmoryItemTypes(): Promise<ArmoryItemType[]> {
  try {
    const querySnapshot = await getDocs(armoryItemTypesCollection);
    const types = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ArmoryItemType));
    return types.sort((a, b) => a.name.localeCompare(b.name)); 
  } catch (error) {
    console.error("Error fetching armory item types: ", error);
    return [];
  }
}

export async function updateArmoryItemType(id: string, updates: { name: string }): Promise<void> {
  try {
    const itemTypeDoc = doc(db, "armoryItemTypes", id);
    await updateDoc(itemTypeDoc, updates);
    revalidatePath("/armory");
  } catch (error) {
    console.error("Error updating armory item type: ", error);
    throw new Error("עדכון סוג פריט נכשל.");
  }
}

export async function deleteArmoryItemType(id: string): Promise<void> {
  try {
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

export async function addArmoryItem(itemData: Omit<ArmoryItem, 'id' | 'itemTypeName' | 'linkedSoldierName' | 'createdAt'>): Promise<ArmoryItem> {
  try {
    const docRef = await addDoc(armoryCollection, {
      ...itemData,
      createdAt: serverTimestamp(),
    });
    revalidatePath("/armory");
    revalidatePath(`/soldiers/${itemData.linkedSoldierId}`); // Revalidate soldier detail page
    return { id: docRef.id, ...itemData, itemTypeName: "", linkedSoldierName: "" }; 
  } catch (error) {
    console.error("Error adding armory item: ", error);
    throw new Error("הוספת פריט נכשלה.");
  }
}

export async function getArmoryItems(): Promise<ArmoryItem[]> {
  try {
    const [itemsSnapshot, typesSnapshot, soldiersSnapshot] = await Promise.all([
        getDocs(armoryCollection),
        getDocs(armoryItemTypesCollection),
        getDocs(soldiersCollection)
    ]);
    
    const typesMap = new Map(typesSnapshot.docs.map(doc => [doc.id, doc.data().name]));
    const soldiersMap = new Map(soldiersSnapshot.docs.map(doc => [doc.id, doc.data().name]));

    const items = itemsSnapshot.docs.map(docSnapshot => {
        const data = docSnapshot.data();
        return { 
            id: docSnapshot.id, 
            itemTypeId: data.itemTypeId || "unknown_type_id", 
            itemId: data.itemId || "N/A",
            imageUrl: data.imageUrl,
            linkedSoldierId: data.linkedSoldierId,
            itemTypeName: typesMap.get(data.itemTypeId) || "סוג לא ידוע",
            linkedSoldierName: data.linkedSoldierId ? soldiersMap.get(data.linkedSoldierId) : undefined,
            // photoDataUri is client-side only, createdAt is a Timestamp
        } as ArmoryItem; 
    });
    return items;
  } catch (error) {
    console.error("Error fetching armory items: ", error);
    return [];
  }
}

export async function getArmoryItemsBySoldierId(soldierId: string): Promise<ArmoryItem[]> {
  try {
    const q = query(armoryCollection, where("linkedSoldierId", "==", soldierId));
    const itemsSnapshot = await getDocs(q);
    
    if (itemsSnapshot.empty) return [];

    const itemTypeIds = new Set<string>();
    itemsSnapshot.docs.forEach(doc => {
      const itemTypeId = doc.data().itemTypeId;
      if (itemTypeId) itemTypeIds.add(itemTypeId);
    });

    const typesMap = new Map<string, string>();
    if (itemTypeIds.size > 0) {
      const typesQuery = query(armoryItemTypesCollection, where("__name__", "in", Array.from(itemTypeIds)));
      const typesSnapshot = await getDocs(typesQuery);
      typesSnapshot.docs.forEach(doc => typesMap.set(doc.id, doc.data().name));
    }
    
    const soldierDoc = await getDoc(doc(soldiersCollection, soldierId));
    const soldierName = soldierDoc.exists() ? (soldierDoc.data() as Soldier).name : undefined;

    const items = itemsSnapshot.docs.map(docSnapshot => {
        const data = docSnapshot.data();
        return { 
            id: docSnapshot.id, 
            itemTypeId: data.itemTypeId || "unknown_type_id", 
            itemId: data.itemId || "N/A",
            imageUrl: data.imageUrl,
            linkedSoldierId: data.linkedSoldierId,
            itemTypeName: typesMap.get(data.itemTypeId) || "סוג לא ידוע",
            linkedSoldierName: soldierName, // All items here are linked to this soldier
        } as ArmoryItem; 
    });
    return items;
  } catch (error) {
    console.error(`Error fetching armory items for soldier ${soldierId}: `, error);
    return [];
  }
}

export async function updateArmoryItem(id: string, updates: Partial<Omit<ArmoryItem, 'id' | 'itemTypeName' | 'linkedSoldierName' | 'createdAt'>>): Promise<void> {
  try {
    const itemDocRef = doc(db, "armoryItems", id);
    const itemSnapshot = await getDoc(itemDocRef);
    const oldLinkedSoldierId = itemSnapshot.data()?.linkedSoldierId;

    await updateDoc(itemDocRef, updates);
    revalidatePath("/armory");
    revalidatePath(`/soldiers/${updates.linkedSoldierId}`);
    if (oldLinkedSoldierId && oldLinkedSoldierId !== updates.linkedSoldierId) {
      revalidatePath(`/soldiers/${oldLinkedSoldierId}`);
    }
  } catch (error) {
    console.error("Error updating armory item: ", error);
    throw new Error("עדכון פריט נכשל.");
  }
}

export async function deleteArmoryItem(id: string): Promise<void> {
  try {
    const itemDocRef = doc(db, "armoryItems", id);
    const itemSnapshot = await getDoc(itemDocRef);
    const linkedSoldierId = itemSnapshot.data()?.linkedSoldierId;

    await deleteDoc(itemDocRef);
    revalidatePath("/armory");
    if (linkedSoldierId) {
      revalidatePath(`/soldiers/${linkedSoldierId}`);
    }
  } catch (error) {
    console.error("Error deleting armory item: ", error);
    throw new Error("מחיקת פריט נכשלה.");
  }
}

export async function scanArmoryItemImage(photoDataUri: string): Promise<{ itemType: string; itemId: string }> {
  try {
    const result = await scanArmoryItemAI({ photoDataUri });
    return result; 
  } catch (error) {
    console.error("Error scanning armory item image: ", error);
    throw new Error("סריקת תמונת פריט נכשלה.");
  }
}

    