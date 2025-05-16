
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

export async function addArmoryItemType(itemTypeData: { name: string; isUnique: boolean }): Promise<ArmoryItemType> {
  try {
    const q = query(armoryItemTypesCollection, where("name", "==", itemTypeData.name));
    const existingTypesSnapshot = await getDocs(q);
    if (!existingTypesSnapshot.empty) {
      // Consider if same name but different isUnique is allowed. For now, name is unique.
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

export async function updateArmoryItemType(id: string, updates: { name: string; isUnique: boolean }): Promise<void> {
  try {
    // Future: Consider implications if isUnique changes for existing items.
    // For now, this action only updates the type definition.
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

export async function addArmoryItem(
  itemData: Omit<ArmoryItem, 'id' | 'itemTypeName' | 'linkedSoldierName' | 'linkedSoldierDivisionName' | 'createdAt'>
): Promise<ArmoryItem> {
  try {
    const dataToSave: any = {
      itemTypeId: itemData.itemTypeId,
      isUniqueItem: itemData.isUniqueItem,
      imageUrl: itemData.imageUrl, // Retain imageUrl if provided (e.g. from scan)
      createdAt: serverTimestamp(),
    };

    if (itemData.isUniqueItem) {
      dataToSave.itemId = itemData.itemId;
      if (itemData.linkedSoldierId) {
        dataToSave.linkedSoldierId = itemData.linkedSoldierId;
      }
    } else {
      dataToSave.totalQuantity = itemData.totalQuantity;
      // linkedSoldierId is not applicable for non-unique items in this simplified model
    }
    
    const docRef = await addDoc(armoryCollection, dataToSave);
    revalidatePath("/armory");
    if (itemData.isUniqueItem && itemData.linkedSoldierId) {
        revalidatePath(`/soldiers/${itemData.linkedSoldierId}`); 
    }

    // Construct what the client expects, including potentially denormalized fields
    // This part is tricky as full denormalization (soldier name, etc.) happens in getArmoryItems
    return { 
        id: docRef.id, 
        ...itemData, // This includes what was passed (itemTypeId, isUniqueItem, itemId OR totalQuantity, linkedSoldierId if unique)
        itemTypeName: "", // Will be enriched by client or getArmoryItems
        linkedSoldierName: "", // Will be enriched by client or getArmoryItems
        linkedSoldierDivisionName: "" // Will be enriched by client or getArmoryItems
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
        getDocs(divisionsCollection)
    ]);
    
    const typesMap = new Map(typesSnapshot.docs.map(doc => {
        const data = doc.data();
        return [doc.id, { name: data.name as string, isUnique: data.isUnique as boolean }];
    }));

    const soldiersDataMap = new Map(soldiersSnapshot.docs.map(docSnap => {
        const data = docSnap.data() as Omit<Soldier, 'id' | 'divisionName' | 'documents'> & { id: string };
        return [docSnap.id, { name: data.name, divisionId: data.divisionId }];
    }));
    const divisionsMap = new Map(divisionsSnapshot.docs.map(docSnap => [docSnap.id, docSnap.data().name as string]));

    const items = itemsSnapshot.docs.map(docSnapshot => {
        const data = docSnapshot.data();
        const itemTypeInfo = typesMap.get(data.itemTypeId) || { name: "סוג לא ידוע", isUnique: true }; // Default to unique if type not found

        const armoryItem: ArmoryItem = {
            id: docSnapshot.id,
            itemTypeId: data.itemTypeId || "unknown_type_id",
            itemTypeName: itemTypeInfo.name,
            isUniqueItem: data.isUniqueItem !== undefined ? data.isUniqueItem : itemTypeInfo.isUnique, // Prefer stored, fallback to type's
            imageUrl: data.imageUrl,
            // Conditional fields
            itemId: data.isUniqueItem ? data.itemId : undefined,
            totalQuantity: !data.isUniqueItem ? data.totalQuantity : undefined,
            linkedSoldierId: data.isUniqueItem ? data.linkedSoldierId : undefined,
        };

        if (armoryItem.isUniqueItem && armoryItem.linkedSoldierId) {
            const soldierData = soldiersDataMap.get(armoryItem.linkedSoldierId);
            if (soldierData) {
                armoryItem.linkedSoldierName = soldierData.name;
                if (soldierData.divisionId && soldierData.divisionId !== "unassigned") {
                    armoryItem.linkedSoldierDivisionName = divisionsMap.get(soldierData.divisionId) || "פלוגה לא ידועה";
                } else if (soldierData.divisionId === "unassigned") {
                    armoryItem.linkedSoldierDivisionName = "לא משויך לפלוגה";
                }
            }
        }
        return armoryItem;
    });
    return items;
  } catch (error) {
    console.error("Error fetching armory items: ", error);
    return [];
  }
}

export async function getArmoryItemsBySoldierId(soldierId: string): Promise<ArmoryItem[]> {
  try {
    // This function needs significant change if non-unique items can be assigned by quantity.
    // For now, it will only fetch items where linkedSoldierId (for unique items) matches.
    const q = query(armoryCollection, where("linkedSoldierId", "==", soldierId), where("isUniqueItem", "==", true));
    const itemsSnapshot = await getDocs(q);
    
    if (itemsSnapshot.empty) return [];

    const itemTypeIds = new Set<string>();
    itemsSnapshot.docs.forEach(doc => {
      const itemTypeId = doc.data().itemTypeId;
      if (itemTypeId) itemTypeIds.add(itemTypeId);
    });

    const typesData = await getArmoryItemTypes();
    const typesMap = new Map(typesData.map(type => [type.id, type]));
    
    const soldierDocRef = doc(soldiersCollection, soldierId);
    const soldierDocSnap = await getDoc(soldierDocRef);
    
    let soldierName: string | undefined = undefined;
    let soldierDivisionName: string | undefined = undefined;

    if (soldierDocSnap.exists()) {
        const soldierData = soldierDocSnap.data() as Soldier;
        soldierName = soldierData.name;
        if (soldierData.divisionId && soldierData.divisionId !== "unassigned") {
            const divisionDocRef = doc(divisionsCollection, soldierData.divisionId);
            const divisionDocSnap = await getDoc(divisionDocRef);
            if (divisionDocSnap.exists()) {
                soldierDivisionName = (divisionDocSnap.data() as Division).name;
            } else {
                soldierDivisionName = "פלוגה לא ידועה";
            }
        } else if (soldierData.divisionId === "unassigned") {
            soldierDivisionName = "לא משויך לפלוגה";
        }
    }

    const items = itemsSnapshot.docs.map(docSnapshot => {
        const data = docSnapshot.data();
        const itemType = typesMap.get(data.itemTypeId);
        return { 
            id: docSnapshot.id, 
            itemTypeId: data.itemTypeId || "unknown_type_id", 
            isUniqueItem: true, // Queried for unique items
            itemId: data.itemId || "N/A",
            imageUrl: data.imageUrl,
            linkedSoldierId: data.linkedSoldierId,
            itemTypeName: itemType ? itemType.name : "סוג לא ידוע",
            linkedSoldierName: soldierName, 
            linkedSoldierDivisionName: soldierDivisionName,
        } as ArmoryItem; 
    });
    // TODO: Future - fetch non-unique items assigned to this soldier
    return items;
  } catch (error) {
    console.error(`Error fetching armory items for soldier ${soldierId}: `, error);
    return [];
  }
}

export async function updateArmoryItem(
  id: string, 
  updates: Partial<Omit<ArmoryItem, 'id' | 'itemTypeName' | 'linkedSoldierName' | 'linkedSoldierDivisionName' | 'createdAt'>>
): Promise<void> {
  try {
    const itemDocRef = doc(db, "armoryItems", id);
    const itemSnapshot = await getDoc(itemDocRef);
    const oldData = itemSnapshot.data();
    const oldLinkedSoldierId = oldData?.linkedSoldierId;

    const dataToUpdate: any = { ...updates };
    // Ensure isUniqueItem is part of updates if it's there, or preserve existing
    dataToUpdate.isUniqueItem = updates.isUniqueItem !== undefined ? updates.isUniqueItem : oldData?.isUniqueItem;


    if (dataToUpdate.isUniqueItem) {
      if (updates.itemId !== undefined) dataToUpdate.itemId = updates.itemId;
      if (updates.linkedSoldierId !== undefined) dataToUpdate.linkedSoldierId = updates.linkedSoldierId;
      else if (updates.linkedSoldierId === null) dataToUpdate.linkedSoldierId = null; // Explicitly unlinking
      dataToUpdate.totalQuantity = deleteDoc; // Remove totalQuantity if switching to unique
    } else {
      if (updates.totalQuantity !== undefined) dataToUpdate.totalQuantity = updates.totalQuantity;
      dataToUpdate.itemId = deleteDoc; // Remove itemId if switching to non-unique
      dataToUpdate.linkedSoldierId = deleteDoc; // Remove linkedSoldierId
    }


    await updateDoc(itemDocRef, dataToUpdate);
    revalidatePath("/armory");
    if (updates.linkedSoldierId) { // This applies if it's a unique item being linked/re-linked
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
    const itemData = itemSnapshot.data();

    await deleteDoc(itemDocRef);
    revalidatePath("/armory");
    if (itemData?.isUniqueItem && itemData?.linkedSoldierId) {
      revalidatePath(`/soldiers/${itemData.linkedSoldierId}`);
    }
    // TODO: If non-unique items have assignments, those might need revalidation too.
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
