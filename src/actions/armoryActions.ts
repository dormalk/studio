
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

    // Server-side validation and sanitization
    const sanitizedItemId = isUnique ? itemData.itemId : undefined;
    const sanitizedLinkedSoldierId = isUnique ? (itemData.linkedSoldierId || undefined) : undefined;
    const sanitizedTotalQuantity = !isUnique ? itemData.totalQuantity : undefined;

    const dataToSaveForFirestore: any = {
      itemTypeId: itemData.itemTypeId,
      isUniqueItem: isUnique,
      imageUrl: itemData.imageUrl || null, // Store null if undefined or empty for consistency
      createdAt: serverTimestamp(),
    };

    if (isUnique) {
      if (!sanitizedItemId || String(sanitizedItemId).trim() === "") {
        throw new Error("מספר סריאלי הינו שדה חובה עבור פריט ייחודי.");
      }
      dataToSaveForFirestore.itemId = sanitizedItemId;
      dataToSaveForFirestore.linkedSoldierId = sanitizedLinkedSoldierId ? sanitizedLinkedSoldierId : null;
    } else { // Non-unique item
      if (sanitizedTotalQuantity === undefined || sanitizedTotalQuantity === null || sanitizedTotalQuantity <= 0) {
        throw new Error("כמות במלאי חייבת להיות גדולה מאפס עבור פריט לא ייחודי.");
      }
      dataToSaveForFirestore.totalQuantity = sanitizedTotalQuantity;
      dataToSaveForFirestore.assignments = []; // Initialize assignments for non-unique items
    }

    const docRef = await addDoc(armoryCollection, dataToSaveForFirestore);
    revalidatePath("/armory");
    if (isUnique && sanitizedLinkedSoldierId) {
        revalidatePath(`/soldiers/${sanitizedLinkedSoldierId}`);
    }

    const newArmoryItemToReturn: ArmoryItem = {
        id: docRef.id,
        itemTypeId: itemData.itemTypeId,
        isUniqueItem: isUnique,
        imageUrl: itemData.imageUrl || undefined, // Return undefined if was null/empty
        itemId: sanitizedItemId,
        linkedSoldierId: sanitizedLinkedSoldierId,
        totalQuantity: sanitizedTotalQuantity,
        assignments: !isUnique ? [] : undefined,
        itemTypeName: "", // Placeholder, client will enrich
        linkedSoldierName: undefined, // Placeholder, client will enrich
        linkedSoldierDivisionName: undefined, // Placeholder, client will enrich
    };
    return newArmoryItemToReturn;

  } catch (error) {
    console.error("Error adding armory item: ", error);
    if (error instanceof Error) { // Re-throw known errors or specific validation errors
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
            imageUrl: data.imageUrl,
            itemId: isActuallyUnique ? data.itemId : undefined,
            totalQuantity: !isActuallyUnique ? data.totalQuantity : undefined,
            linkedSoldierId: isActuallyUnique ? data.linkedSoldierId : undefined,
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
    const allArmoryItems = await getArmoryItems(); // Leverages the enriched items

    const soldierItems: ArmoryItem[] = [];
    // Soldier details are already part of enriched allArmoryItems if linked
    // We just need to filter them and add _currentSoldierAssignedQuantity for non-unique

    for (const item of allArmoryItems) {
      if (item.isUniqueItem && item.linkedSoldierId === soldierId) {
        soldierItems.push(item); // Item already enriched
      } else if (!item.isUniqueItem && item.assignments) {
        const assignment = item.assignments.find(asgn => asgn.soldierId === soldierId);
        if (assignment) {
          soldierItems.push({
            ...item, // Item already enriched
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
    const oldData = itemSnapshot.data() as ArmoryItem; // Assuming ArmoryItem structure is correct in DB
    const oldLinkedSoldierId = oldData.linkedSoldierId;

    const dataToUpdate: any = { ...updates }; 

    const newIsUniqueCandidate = updates.isUniqueItem;

    if (newIsUniqueCandidate !== undefined) {
         dataToUpdate.isUniqueItem = newIsUniqueCandidate;
    } else if (updates.itemTypeId) { 
        const itemTypeDoc = await getDoc(doc(db, "armoryItemTypes", updates.itemTypeId));
        if (itemTypeDoc.exists()) {
            dataToUpdate.isUniqueItem = itemTypeDoc.data()!.isUnique;
        } else {
            throw new Error("סוג פריט לא חוקי בעדכון.");
        }
    } else {
        dataToUpdate.isUniqueItem = oldData.isUniqueItem;
    }

    if (dataToUpdate.isUniqueItem === true) {
      // Ensure itemId is present if switching to unique or updating a unique item
      if (updates.itemId === undefined && oldData.isUniqueItem === false) { // Switched to unique, itemId must be provided
          throw new Error("מספר סריאלי הינו חובה בעת שינוי לסוג פריט ייחודי.");
      }
      dataToUpdate.itemId = updates.itemId !== undefined ? updates.itemId : oldData.itemId;
      if (!dataToUpdate.itemId || String(dataToUpdate.itemId).trim() === "") {
          throw new Error("מספר סריאלי הינו חובה עבור פריט ייחודי.");
      }


      if (updates.hasOwnProperty('linkedSoldierId')) {
        dataToUpdate.linkedSoldierId = updates.linkedSoldierId === undefined || updates.linkedSoldierId === null ? null : updates.linkedSoldierId;
      } else {
        dataToUpdate.linkedSoldierId = oldData.linkedSoldierId !== undefined ? oldData.linkedSoldierId : null;
      }

      dataToUpdate.totalQuantity = FieldValue.delete();
      dataToUpdate.assignments = FieldValue.delete();

    } else if (dataToUpdate.isUniqueItem === false) {
      // Ensure totalQuantity is present if switching to non-unique or updating a non-unique item
      if (updates.totalQuantity === undefined && oldData.isUniqueItem === true) { // Switched to non-unique, quantity must be provided
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
    
    // Remove undefined fields from dataToUpdate to prevent Firestore errors for 'undefined' values
    Object.keys(dataToUpdate).forEach(key => {
        if (dataToUpdate[key] === undefined && key !== 'linkedSoldierId' && key !== 'imageUrl') { // Allow undefined for these if explicitly set to unlink/remove
            delete dataToUpdate[key];
        }
    });
    if (dataToUpdate.imageUrl === undefined) dataToUpdate.imageUrl = null; // Ensure imageUrl is null if removed


    await updateDoc(itemDocRef, dataToUpdate);
    revalidatePath("/armory");

    const newLinkedSoldierId = dataToUpdate.isUniqueItem ? dataToUpdate.linkedSoldierId : undefined;
    if (oldLinkedSoldierId !== newLinkedSoldierId) {
        if (oldLinkedSoldierId) revalidatePath(`/soldiers/${oldLinkedSoldierId}`);
        if (newLinkedSoldierId) revalidatePath(`/soldiers/${newLinkedSoldierId}`);
    }

    if (dataToUpdate.isUniqueItem === false && (updates.assignments || oldData.isUniqueItem === true)) { // If assignments changed or switched to non-unique
        revalidatePath("/soldiers"); 
        // More targeted: loop through old and new assignments to revalidate specific soldiers
        const affectedSoldierIds = new Set<string>();
        (oldData.assignments || []).forEach((asgn: ArmoryItemAssignment) => affectedSoldierIds.add(asgn.soldierId));
        (dataToUpdate.assignments || []).forEach((asgn: ArmoryItemAssignment) => affectedSoldierIds.add(asgn.soldierId));
        affectedSoldierIds.forEach(soldierId => revalidatePath(`/soldiers/${soldierId}`));
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
        soldierName: soldierData.name, // Store name for easier display
        soldierDivisionName: soldierDivisionName, // Store division name for easier display
      };
      if (existingAssignmentIndex > -1) {
        currentAssignments[existingAssignmentIndex] = newAssignment;
      } else {
        currentAssignments.push(newAssignment);
      }
    } else { // newQuantity is 0 or less (invalid, but we treat as 0 for unassignment)
      if (existingAssignmentIndex > -1) {
        currentAssignments.splice(existingAssignmentIndex, 1);
      }
      // If quantity is 0 and no existing assignment, do nothing.
    }

    await updateDoc(itemDocRef, { assignments: currentAssignments });

    revalidatePath("/armory");
    revalidatePath(`/soldiers/${soldierId}`);

  } catch (error) {
    console.error("Error managing soldier assignment: ", error);
    if (error instanceof Error) throw error; // Re-throw specific errors
    throw new Error("פעולת הקצאת/עדכון כמות נכשלה.");
  }
}
