
"use server";

import { db } from "@/lib/firebase";
import type { ArmoryItem, ArmoryItemType, Soldier, Division, ArmoryItemAssignment } from "@/types";
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc, serverTimestamp, query, where, writeBatch, getDoc, FieldValue } from "firebase/firestore";
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
      // Consider if you want to throw an error or return the existing one
      // For now, let's assume unique names are desired and throw an error.
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

export async function updateArmoryItemType(id: string, updates: Partial<Omit<ArmoryItemType, 'id'>>): Promise<void> {
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

export async function addArmoryItem(
  itemData: Omit<ArmoryItem, 'id' | 'itemTypeName' | 'linkedSoldierName' | 'linkedSoldierDivisionName' | 'createdAt' | 'assignments' | '_currentSoldierAssignedQuantity'>
): Promise<ArmoryItem> {
  try {
    const isUnique = itemData.isUniqueItem;

    const dataToSaveForFirestore: any = {
      itemTypeId: itemData.itemTypeId,
      isUniqueItem: isUnique,
      imageUrl: itemData.imageUrl || null,
      createdAt: serverTimestamp(),
    };

    if (isUnique) {
      if (!itemData.itemId || String(itemData.itemId).trim() === "") {
        throw new Error("מספר סריאלי הינו שדה חובה עבור פריט ייחודי.");
      }
      dataToSaveForFirestore.itemId = String(itemData.itemId).trim();
      dataToSaveForFirestore.linkedSoldierId = itemData.linkedSoldierId ? itemData.linkedSoldierId : null;
    } else {
      if (itemData.totalQuantity === undefined || itemData.totalQuantity === null || itemData.totalQuantity <= 0) {
        throw new Error("כמות במלאי חייבת להיות גדולה מאפס עבור פריט לא ייחודי.");
      }
      dataToSaveForFirestore.totalQuantity = itemData.totalQuantity;
      dataToSaveForFirestore.assignments = []; // Initialize assignments for non-unique items
    }

    const docRef = await addDoc(armoryCollection, dataToSaveForFirestore);
    revalidatePath("/armory");
    if (isUnique && dataToSaveForFirestore.linkedSoldierId) {
        revalidatePath(`/soldiers/${dataToSaveForFirestore.linkedSoldierId}`);
    }

    // Construct the object to return to the client
    const newArmoryItemToReturn: ArmoryItem = {
        id: docRef.id,
        itemTypeId: itemData.itemTypeId,
        isUniqueItem: isUnique,
        imageUrl: itemData.imageUrl || undefined,
        // Conditionally include fields based on isUnique
        itemId: isUnique ? dataToSaveForFirestore.itemId : undefined,
        linkedSoldierId: isUnique ? dataToSaveForFirestore.linkedSoldierId : undefined,
        totalQuantity: !isUnique ? dataToSaveForFirestore.totalQuantity : undefined,
        assignments: !isUnique ? [] : undefined,
        // These will be enriched client-side or by getArmoryItems
        itemTypeName: "", 
        linkedSoldierName: undefined,
        linkedSoldierDivisionName: undefined,
    };
    return newArmoryItemToReturn;

  } catch (error) {
    console.error("Error adding armory item: ", error);
    if (error instanceof Error) {
        throw error;
    }
    throw new Error("הוספת פריט נשקייה נכשלה עקב שגיאה לא צפויה.");
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
        const itemTypeInfo = typesMap.get(data.itemTypeId) || { name: "סוג לא ידוע", isUnique: true }; 

        const isActuallyUnique = data.isUniqueItem !== undefined ? data.isUniqueItem : itemTypeInfo.isUnique;

        const armoryItem: ArmoryItem = {
            id: docSnapshot.id,
            itemTypeId: data.itemTypeId || "unknown_type_id",
            itemTypeName: itemTypeInfo.name,
            isUniqueItem: isActuallyUnique,
            imageUrl: data.imageUrl, // Will be null if Firestore has null, or undefined if not present
            itemId: isActuallyUnique ? data.itemId : undefined,
            totalQuantity: !isActuallyUnique ? data.totalQuantity : undefined,
            linkedSoldierId: isActuallyUnique ? (data.linkedSoldierId === null ? null : data.linkedSoldierId || undefined) : undefined,
            assignments: !isActuallyUnique ? (data.assignments || []).map((asgn: any) => {
                const soldierData = soldiersDataMap.get(asgn.soldierId);
                let soldierDivisionName;
                if (soldierData && soldierData.divisionId && soldierData.divisionId !== "unassigned") {
                    soldierDivisionName = divisionsMap.get(soldierData.divisionId) || "פלוגה לא ידועה";
                } else if (soldierData && soldierData.divisionId === "unassigned") {
                    soldierDivisionName = "לא משויך לפלוגה";
                }
                return {
                    ...asgn,
                    soldierName: soldierData ? soldierData.name : "חייל לא ידוע",
                    soldierDivisionName: soldierDivisionName
                };
            }) : undefined,
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
    const allArmoryItems = await getArmoryItems(); 

    const soldierItems: ArmoryItem[] = [];
    
    for (const item of allArmoryItems) {
      if (item.isUniqueItem && item.linkedSoldierId === soldierId) {
        soldierItems.push(item);
      } else if (!item.isUniqueItem && item.assignments) {
        const assignment = item.assignments.find(asgn => asgn.soldierId === soldierId);
        if (assignment) {
          soldierItems.push({
            ...item, 
            _currentSoldierAssignedQuantity: assignment.quantity,
          });
        }
      }
    }
    return soldierItems;
  } catch (error) {
    console.error(`Error fetching armory items for soldier ${soldierId}: `, error);
    return [];
  }
}


export async function updateArmoryItem(
  id: string,
  updates: Partial<Omit<ArmoryItem, 'id' | 'itemTypeName' | 'linkedSoldierName' | 'linkedSoldierDivisionName' | 'createdAt' | '_currentSoldierAssignedQuantity'>>
): Promise<void> {
  try {
    const itemDocRef = doc(db, "armoryItems", id);
    const itemSnapshot = await getDoc(itemDocRef);
    if (!itemSnapshot.exists()) {
        throw new Error("פריט לא נמצא.");
    }
    const oldData = itemSnapshot.data() as ArmoryItem; 
    const oldLinkedSoldierId = oldData.linkedSoldierId;

    const dataToUpdate: any = { ...updates }; 

    // Determine the 'isUniqueItem' status for the update
    if (updates.isUniqueItem !== undefined) {
         dataToUpdate.isUniqueItem = updates.isUniqueItem;
    } else if (updates.itemTypeId && updates.itemTypeId !== oldData.itemTypeId) { 
        const itemTypeDoc = await getDoc(doc(db, "armoryItemTypes", updates.itemTypeId));
        if (itemTypeDoc.exists()) {
            dataToUpdate.isUniqueItem = itemTypeDoc.data()!.isUnique;
        } else {
            throw new Error("סוג פריט לא חוקי בעדכון.");
        }
    } else {
        dataToUpdate.isUniqueItem = oldData.isUniqueItem;
    }

    // Handle fields based on whether the item is unique or non-unique
    if (dataToUpdate.isUniqueItem === true) {
      if (updates.itemId === undefined && oldData.isUniqueItem === false) {
          throw new Error("מספר סריאלי הינו חובה בעת שינוי לסוג פריט ייחודי.");
      }
      dataToUpdate.itemId = updates.itemId !== undefined ? String(updates.itemId).trim() : oldData.itemId;
      if (!dataToUpdate.itemId || String(dataToUpdate.itemId).trim() === "") {
          throw new Error("מספר סריאלי הינו חובה עבור פריט ייחודי.");
      }

      // Explicitly handle linkedSoldierId:
      // If linkedSoldierId is part of 'updates', use its value (undefined/null becomes null).
      // If not in 'updates' (e.g., only itemId changed), retain old value.
      if (updates.hasOwnProperty('linkedSoldierId')) {
        dataToUpdate.linkedSoldierId = (updates.linkedSoldierId === undefined || updates.linkedSoldierId === null) ? null : updates.linkedSoldierId;
      } else {
        // If not in updates, retain the old value or default to null if it was undefined
        dataToUpdate.linkedSoldierId = oldData.linkedSoldierId === undefined ? null : oldData.linkedSoldierId;
      }
      
      dataToUpdate.totalQuantity = FieldValue.delete();
      dataToUpdate.assignments = FieldValue.delete();

    } else if (dataToUpdate.isUniqueItem === false) {
      if (updates.totalQuantity === undefined && oldData.isUniqueItem === true) {
          throw new Error("כמות במלאי הינה חובה בעת שינוי לסוג פריט לא ייחודי.");
      }
      dataToUpdate.totalQuantity = updates.totalQuantity !== undefined ? updates.totalQuantity : oldData.totalQuantity;
      if (dataToUpdate.totalQuantity === undefined || dataToUpdate.totalQuantity === null || dataToUpdate.totalQuantity <=0) {
          throw new Error("כמות במלאי חייבת להיות גדולה מאפס עבור פריט לא ייחודי.");
      }
      
      dataToUpdate.itemId = FieldValue.delete();
      dataToUpdate.linkedSoldierId = FieldValue.delete(); 

      if (oldData.isUniqueItem === true && dataToUpdate.isUniqueItem === false) { 
        dataToUpdate.assignments = updates.assignments !== undefined ? updates.assignments : []; 
      } else { 
        dataToUpdate.assignments = updates.assignments !== undefined ? updates.assignments : (oldData.assignments || []);
      }
    }
    
    // Clean up undefined fields from dataToUpdate, except for specific ones that can be null
    Object.keys(dataToUpdate).forEach(key => {
        if (dataToUpdate[key] === undefined && key !== 'linkedSoldierId' && key !== 'imageUrl') {
            delete dataToUpdate[key];
        }
    });
    if (dataToUpdate.imageUrl === undefined) dataToUpdate.imageUrl = null;
    // Final safeguard: if linkedSoldierId is still undefined here (should have been converted to null for unique items), set it to null.
    // For non-unique items, it should have been deleted by FieldValue.delete().
    if (dataToUpdate.isUniqueItem === true && dataToUpdate.linkedSoldierId === undefined) {
        dataToUpdate.linkedSoldierId = null;
    }

    await updateDoc(itemDocRef, dataToUpdate);
    revalidatePath("/armory");

    const newLinkedSoldierIdAfterUpdate = dataToUpdate.isUniqueItem ? dataToUpdate.linkedSoldierId : undefined;

    // Revalidate old soldier path if they were unlinked or item changed
    if (oldLinkedSoldierId && oldLinkedSoldierId !== newLinkedSoldierIdAfterUpdate) {
        revalidatePath(`/soldiers/${oldLinkedSoldierId}`);
    }
    // Revalidate new soldier path if they were linked
    if (newLinkedSoldierIdAfterUpdate && newLinkedSoldierIdAfterUpdate !== oldLinkedSoldierId) {
        revalidatePath(`/soldiers/${newLinkedSoldierIdAfterUpdate}`);
    }
    // If it was a non-unique item and assignments might have changed (e.g. item type changed)
    if (dataToUpdate.isUniqueItem === false) {
        const affectedSoldierIds = new Set<string>();
        (oldData.assignments || []).forEach((asgn: ArmoryItemAssignment) => affectedSoldierIds.add(asgn.soldierId));
        (dataToUpdate.assignments || []).forEach((asgn: ArmoryItemAssignment) => affectedSoldierIds.add(asgn.soldierId));
        affectedSoldierIds.forEach(soldierId => revalidatePath(`/soldiers/${soldierId}`));
        if (affectedSoldierIds.size > 0) revalidatePath("/soldiers"); // General revalidate for soldier list
    }

  } catch (error) {
    console.error("Error updating armory item: ", error);
    if (error instanceof Error) throw error;
    throw new Error("עדכון פריט נכשל.");
  }
}

export async function deleteArmoryItem(id: string): Promise<void> {
  try {
    const itemDocRef = doc(db, "armoryItems", id);
    const itemSnapshot = await getDoc(itemDocRef);
    const itemData = itemSnapshot.data() as ArmoryItem | undefined;

    await deleteDoc(itemDocRef);
    revalidatePath("/armory");
    if (itemData?.isUniqueItem && itemData?.linkedSoldierId) {
      revalidatePath(`/soldiers/${itemData.linkedSoldierId}`);
    }
    if (!itemData?.isUniqueItem && itemData?.assignments && itemData.assignments.length > 0) {
        itemData.assignments.forEach(asgn => revalidatePath(`/soldiers/${asgn.soldierId}`));
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

export async function manageSoldierAssignmentToNonUniqueItem(
  armoryItemId: string,
  soldierId: string,
  newQuantity: number
): Promise<void> {
  const itemDocRef = doc(db, "armoryItems", armoryItemId);
  const soldierDocRef = doc(db, "soldiers", soldierId);

  try {
    const itemSnap = await getDoc(itemDocRef);
    if (!itemSnap.exists()) {
      throw new Error("פריט הנשקייה לא נמצא.");
    }
    const itemData = itemSnap.data() as ArmoryItem;

    if (itemData.isUniqueItem) {
      throw new Error("לא ניתן להקצות כמויות לפריט ייחודי. יש לשייך את הפריט כולו לחייל.");
    }

    const soldierSnap = await getDoc(soldierDocRef);
    if (!soldierSnap.exists()) {
      throw new Error("חייל לא נמצא.");
    }
    const soldierData = soldierSnap.data() as Soldier;

    let soldierDivisionName = "לא משויך לפלוגה";
    if (soldierData.divisionId && soldierData.divisionId !== "unassigned") {
        const divisionSnap = await getDoc(doc(db, "divisions", soldierData.divisionId));
        if (divisionSnap.exists()) {
            soldierDivisionName = (divisionSnap.data() as Division).name;
        } else {
            soldierDivisionName = "פלוגה לא ידועה";
        }
    }

    let currentAssignments = itemData.assignments || [];
    let totalAssignedToOthers = 0;
    currentAssignments.forEach(asgn => {
      if (asgn.soldierId !== soldierId) {
        totalAssignedToOthers += asgn.quantity;
      }
    });

    if (newQuantity < 0) newQuantity = 0; // Cannot assign negative quantity

    if (totalAssignedToOthers + newQuantity > (itemData.totalQuantity || 0)) {
      throw new Error(`הכמות המבוקשת (${newQuantity}) חורגת מהכמות הפנויה במלאי (${(itemData.totalQuantity || 0) - totalAssignedToOthers}).`);
    }

    const existingAssignmentIndex = currentAssignments.findIndex(asgn => asgn.soldierId === soldierId);

    if (newQuantity > 0) {
      const newAssignment: ArmoryItemAssignment = {
        soldierId,
        quantity: newQuantity,
        soldierName: soldierData.name, 
        soldierDivisionName: soldierDivisionName, 
      };
      if (existingAssignmentIndex > -1) {
        currentAssignments[existingAssignmentIndex] = newAssignment;
      } else {
        currentAssignments.push(newAssignment);
      }
    } else { 
      if (existingAssignmentIndex > -1) {
        currentAssignments.splice(existingAssignmentIndex, 1);
      }
    }

    await updateDoc(itemDocRef, { assignments: currentAssignments });

    revalidatePath("/armory");
    revalidatePath(`/soldiers/${soldierId}`);

  } catch (error) {
    console.error("Error managing soldier assignment: ", error);
    if (error instanceof Error) throw error;
    throw new Error("פעולת הקצאת/עדכון כמות נכשלה.");
  }
}


    