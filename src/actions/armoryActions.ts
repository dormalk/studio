
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
    const dataToSaveForFirestore: any = {
      itemTypeId: itemData.itemTypeId,
      isUniqueItem: itemData.isUniqueItem, // This is sent by client based on selected type
      imageUrl: itemData.imageUrl,
      createdAt: serverTimestamp(),
    };

    if (itemData.isUniqueItem) {
      dataToSaveForFirestore.itemId = itemData.itemId; // itemId is already validated by client for unique
      dataToSaveForFirestore.linkedSoldierId = itemData.linkedSoldierId ? itemData.linkedSoldierId : null; // Store null if undefined/empty
    } else { // Non-unique item
      dataToSaveForFirestore.totalQuantity = itemData.totalQuantity; // totalQuantity validated by client for non-unique
      dataToSaveForFirestore.assignments = []; // Initialize assignments for non-unique items
    }

    const docRef = await addDoc(armoryCollection, dataToSaveForFirestore);
    revalidatePath("/armory");
    if (itemData.isUniqueItem && itemData.linkedSoldierId) {
        revalidatePath(`/soldiers/${itemData.linkedSoldierId}`);
    }

    // Construct the ArmoryItem to return to the client
    // This needs to be 100% compliant with the ArmoryItem type.
    const newArmoryItemToReturn: ArmoryItem = {
        id: docRef.id,
        itemTypeId: itemData.itemTypeId,
        isUniqueItem: itemData.isUniqueItem,
        imageUrl: itemData.imageUrl,
        // Conditional fields based on itemData.isUniqueItem
        itemId: itemData.isUniqueItem ? itemData.itemId : undefined,
        linkedSoldierId: itemData.isUniqueItem ? (itemData.linkedSoldierId || undefined) : undefined, // Ensure undefined if not provided for client state
        totalQuantity: !itemData.isUniqueItem ? itemData.totalQuantity : undefined,
        assignments: !itemData.isUniqueItem ? [] : undefined, // New non-unique items start with empty assignments

        // These will be enriched by the client or subsequent full fetches
        itemTypeName: "", // Placeholder
        linkedSoldierName: undefined, // Ensure undefined initially
        linkedSoldierDivisionName: undefined, // Ensure undefined initially
    };
    return newArmoryItemToReturn;
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
            isUniqueItem: data.isUniqueItem !== undefined ? data.isUniqueItem : itemTypeInfo.isUnique, // Prioritize DB field, then type's isUnique
            imageUrl: data.imageUrl,
            itemId: data.isUniqueItem ? data.itemId : undefined,
            totalQuantity: !data.isUniqueItem ? data.totalQuantity : undefined,
            linkedSoldierId: data.isUniqueItem ? data.linkedSoldierId : undefined,
            assignments: data.isUniqueItem ? undefined : (data.assignments || []).map((asgn: any) => {
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
            }),
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

    for (const item of allArmoryItems) {
      if (item.isUniqueItem && item.linkedSoldierId === soldierId) {
        soldierItems.push({
          ...item,
          linkedSoldierName: item.linkedSoldierName || soldierName,
          linkedSoldierDivisionName: item.linkedSoldierDivisionName || soldierDivisionName,
        });
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

    const dataToUpdate: any = { ...updates }; // Start with client updates

    // The client should always provide isUniqueItem based on the selected itemTypeId
    // If itemTypeId is being changed, updates.isUniqueItem reflects the NEW type's uniqueness
    const newIsUnique = updates.isUniqueItem;

    if (newIsUnique === undefined && updates.itemTypeId) { // Fallback if client didn't send isUniqueItem but sent itemTypeId
        const itemTypeDoc = await getDoc(doc(db, "armoryItemTypes", updates.itemTypeId));
        if (itemTypeDoc.exists()) {
            dataToUpdate.isUniqueItem = itemTypeDoc.data()!.isUnique;
        } else {
            throw new Error("סוג פריט לא חוקי בעדכון.");
        }
    } else if (newIsUnique !== undefined) {
         dataToUpdate.isUniqueItem = newIsUnique;
    } else {
        // isUniqueItem was not in updates, and itemTypeId was not in updates.
        // This means isUniqueItem itself is not being changed. Use oldData's value.
        dataToUpdate.isUniqueItem = oldData.isUniqueItem;
    }


    if (dataToUpdate.isUniqueItem === true) {
      dataToUpdate.itemId = updates.itemId !== undefined ? updates.itemId : oldData.itemId;

      if (updates.hasOwnProperty('linkedSoldierId')) {
        // If linkedSoldierId is in updates, respect it:
        // undefined means unlink (store as null), otherwise store the ID.
        dataToUpdate.linkedSoldierId = updates.linkedSoldierId === undefined ? null : updates.linkedSoldierId;
      } else {
        // linkedSoldierId was not in updates, so keep the old value.
        dataToUpdate.linkedSoldierId = oldData.linkedSoldierId;
      }

      dataToUpdate.totalQuantity = FieldValue.delete();
      dataToUpdate.assignments = FieldValue.delete();

    } else if (dataToUpdate.isUniqueItem === false) {
      dataToUpdate.totalQuantity = updates.totalQuantity !== undefined ? updates.totalQuantity : oldData.totalQuantity;

      dataToUpdate.itemId = FieldValue.delete();
      dataToUpdate.linkedSoldierId = FieldValue.delete(); // Non-unique items are not directly linked to a single soldier

      // Handle assignments:
      if (oldData.isUniqueItem === true && dataToUpdate.isUniqueItem === false) { // Switching from unique to non-unique
        dataToUpdate.assignments = updates.assignments !== undefined ? updates.assignments : []; // Initialize or use provided
      } else { // Was already non-unique, or assignments explicitly provided
        dataToUpdate.assignments = updates.assignments !== undefined ? updates.assignments : (oldData.assignments || []);
      }
    }

    await updateDoc(itemDocRef, dataToUpdate);
    revalidatePath("/armory");

    // Revalidate soldier pages if linking changes
    const newLinkedSoldierId = dataToUpdate.isUniqueItem ? dataToUpdate.linkedSoldierId : undefined;
    if (oldLinkedSoldierId !== newLinkedSoldierId) {
        if (oldLinkedSoldierId) revalidatePath(`/soldiers/${oldLinkedSoldierId}`);
        if (newLinkedSoldierId) revalidatePath(`/soldiers/${newLinkedSoldierId}`);
    }

    // If assignments were part of the update for a non-unique item, revalidate affected soldiers.
    // This is more complex if `updates.assignments` itself changes individual soldier assignments.
    // For now, a general revalidate of /soldiers might be acceptable, or if specific soldier IDs are affected.
    if (dataToUpdate.isUniqueItem === false && updates.assignments) {
        revalidatePath("/soldiers"); // Broad revalidation
        // Potentially loop through `updates.assignments` and `oldData.assignments` for more targeted revalidation.
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

    if (newQuantity < 0) newQuantity = 0;

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

    