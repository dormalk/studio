
"use server";

import { db } from "@/lib/firebase";
import type { ArmoryItem, ArmoryItemType, Soldier, Division } from "@/types";
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc, serverTimestamp, query, where, writeBatch, getDoc } from "firebase/firestore";
import { revalidatePath } from "next/cache";
import { scanArmoryItem as scanArmoryItemAI } from "@/ai/flows/scan-armory-item";

const armoryCollection = collection(db, "armoryItems");
const armoryItemTypesCollection = collection(db, "armoryItemTypes");
const soldiersCollection = collection(db, "soldiers");
const divisionsCollection = collection(db, "divisions");

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

export async function addArmoryItem(itemData: Omit<ArmoryItem, 'id' | 'itemTypeName' | 'linkedSoldierName' | 'linkedSoldierDivisionName' | 'createdAt'>): Promise<ArmoryItem> {
  try {
    const docRef = await addDoc(armoryCollection, {
      ...itemData,
      createdAt: serverTimestamp(),
    });
    revalidatePath("/armory");
    if (itemData.linkedSoldierId) {
        revalidatePath(`/soldiers/${itemData.linkedSoldierId}`); 
    }
    return { 
        id: docRef.id, 
        ...itemData, 
        itemTypeName: "", 
        linkedSoldierName: "", 
        linkedSoldierDivisionName: "" 
    }; 
  } catch (error) {
    console.error("Error adding armory item: ", error);
    throw new Error("הוספת פריט נכשלה.");
  }
}

export async function getArmoryItems(): Promise<ArmoryItem[]> {
  try {
    const [itemsSnapshot, typesSnapshot, soldiersSnapshot, divisionsSnapshot] = await Promise.all([
        getDocs(armoryCollection),
        getDocs(armoryItemTypesCollection),
        getDocs(soldiersCollection),
        getDocs(divisionsCollection) // Fetch divisions
    ]);
    
    const typesMap = new Map(typesSnapshot.docs.map(doc => [doc.id, doc.data().name as string]));
    const soldiersDataMap = new Map(soldiersSnapshot.docs.map(doc => {
        const data = doc.data() as Omit<Soldier, 'id' | 'divisionName' | 'documents'> & { id: string };
        return [doc.id, { name: data.name, divisionId: data.divisionId }];
    }));
    const divisionsMap = new Map(divisionsSnapshot.docs.map(doc => [doc.id, doc.data().name as string]));

    const items = itemsSnapshot.docs.map(docSnapshot => {
        const data = docSnapshot.data();
        let linkedSoldierName: string | undefined = undefined;
        let linkedSoldierDivisionName: string | undefined = undefined;

        if (data.linkedSoldierId) {
            const soldierData = soldiersDataMap.get(data.linkedSoldierId);
            if (soldierData) {
                linkedSoldierName = soldierData.name;
                if (soldierData.divisionId && soldierData.divisionId !== "unassigned") {
                    linkedSoldierDivisionName = divisionsMap.get(soldierData.divisionId) || "פלוגה לא ידועה";
                } else if (soldierData.divisionId === "unassigned") {
                    linkedSoldierDivisionName = "לא משויך לפלוגה";
                }
            }
        }

        return { 
            id: docSnapshot.id, 
            itemTypeId: data.itemTypeId || "unknown_type_id", 
            itemId: data.itemId || "N/A",
            imageUrl: data.imageUrl,
            linkedSoldierId: data.linkedSoldierId,
            itemTypeName: typesMap.get(data.itemTypeId) || "סוג לא ידוע",
            linkedSoldierName: linkedSoldierName,
            linkedSoldierDivisionName: linkedSoldierDivisionName,
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
    
    const soldierDocRef = doc(soldiersCollection, soldierId);
    const soldierDocSnap = await getDoc(soldierDocRef);
    
    let soldierName: string | undefined = undefined;
    let soldierDivisionId: string | undefined = undefined;
    let soldierDivisionName: string | undefined = undefined;

    if (soldierDocSnap.exists()) {
        const soldierData = soldierDocSnap.data() as Soldier;
        soldierName = soldierData.name;
        soldierDivisionId = soldierData.divisionId;
        if (soldierDivisionId && soldierDivisionId !== "unassigned") {
            const divisionDocRef = doc(divisionsCollection, soldierDivisionId);
            const divisionDocSnap = await getDoc(divisionDocRef);
            if (divisionDocSnap.exists()) {
                soldierDivisionName = (divisionDocSnap.data() as Division).name;
            } else {
                soldierDivisionName = "פלוגה לא ידועה";
            }
        } else if (soldierDivisionId === "unassigned") {
            soldierDivisionName = "לא משויך לפלוגה";
        }
    }

    const items = itemsSnapshot.docs.map(docSnapshot => {
        const data = docSnapshot.data();
        return { 
            id: docSnapshot.id, 
            itemTypeId: data.itemTypeId || "unknown_type_id", 
            itemId: data.itemId || "N/A",
            imageUrl: data.imageUrl,
            linkedSoldierId: data.linkedSoldierId, // Should always be the soldierId passed to function
            itemTypeName: typesMap.get(data.itemTypeId) || "סוג לא ידוע",
            linkedSoldierName: soldierName, 
            linkedSoldierDivisionName: soldierDivisionName,
        } as ArmoryItem; 
    });
    return items;
  } catch (error) {
    console.error(`Error fetching armory items for soldier ${soldierId}: `, error);
    return [];
  }
}

export async function updateArmoryItem(id: string, updates: Partial<Omit<ArmoryItem, 'id' | 'itemTypeName' | 'linkedSoldierName' | 'linkedSoldierDivisionName' | 'createdAt'>>): Promise<void> {
  try {
    const itemDocRef = doc(db, "armoryItems", id);
    const itemSnapshot = await getDoc(itemDocRef);
    const oldLinkedSoldierId = itemSnapshot.data()?.linkedSoldierId;

    await updateDoc(itemDocRef, updates);
    revalidatePath("/armory");
    if (updates.linkedSoldierId) {
        revalidatePath(`/soldiers/${updates.linkedSoldierId}`);
    }
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

    
