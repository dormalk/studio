
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
    const dataToSave: any = {
      itemTypeId: itemData.itemTypeId,
      isUniqueItem: itemData.isUniqueItem,
      imageUrl: itemData.imageUrl,
      createdAt: serverTimestamp(),
    };

    if (itemData.isUniqueItem) {
      dataToSave.itemId = itemData.itemId;
      if (itemData.linkedSoldierId) {
        dataToSave.linkedSoldierId = itemData.linkedSoldierId;
      }
    } else {
      dataToSave.totalQuantity = itemData.totalQuantity;
      dataToSave.assignments = []; // Initialize assignments for non-unique items
    }
    
    const docRef = await addDoc(armoryCollection, dataToSave);
    revalidatePath("/armory");
    if (itemData.isUniqueItem && itemData.linkedSoldierId) {
        revalidatePath(`/soldiers/${itemData.linkedSoldierId}`); 
    }
    
    return { 
        id: docRef.id, 
        ...itemData, 
        itemTypeName: "", 
        linkedSoldierName: "", 
        linkedSoldierDivisionName: "",
        assignments: itemData.isUniqueItem ? undefined : [],
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
        const itemTypeInfo = typesMap.get(data.itemTypeId) || { name: "סוג לא ידוע", isUnique: true };

        const armoryItem: ArmoryItem = {
            id: docSnapshot.id,
            itemTypeId: data.itemTypeId || "unknown_type_id",
            itemTypeName: itemTypeInfo.name,
            isUniqueItem: data.isUniqueItem !== undefined ? data.isUniqueItem : itemTypeInfo.isUnique,
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
    const allArmoryItems = await getArmoryItems(); // Re-use the full fetch and filter

    const soldierItems: ArmoryItem[] = [];

    // Get soldier details for name and division name (used for both unique and non-unique context)
    const soldierDocRef = doc(soldiersCollection, soldierId);
    const soldierDocSnap = await getDoc(soldierDocRef);
    let soldierName: string | undefined = undefined;
    let soldierDivisionName: string | undefined = undefined;
    let soldierDivisionId: string | undefined = undefined;

    if (soldierDocSnap.exists()) {
        const soldierData = soldierDocSnap.data() as Soldier;
        soldierName = soldierData.name;
        soldierDivisionId = soldierData.divisionId;
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
          // Ensure these are populated if `getArmoryItems` didn't already do it for this specific soldier context
          linkedSoldierName: item.linkedSoldierName || soldierName, 
          linkedSoldierDivisionName: item.linkedSoldierDivisionName || soldierDivisionName,
        });
      } else if (!item.isUniqueItem && item.assignments) {
        const assignment = item.assignments.find(asgn => asgn.soldierId === soldierId);
        if (assignment) {
          soldierItems.push({
            ...item,
            _currentSoldierAssignedQuantity: assignment.quantity, // Special field for client
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
    const oldData = itemSnapshot.data() as ArmoryItem | undefined;
    const oldLinkedSoldierId = oldData?.linkedSoldierId;

    const dataToUpdate: any = { ...updates };
    
    const isSwitchingToUnique = updates.isUniqueItem === true && oldData?.isUniqueItem === false;
    const isSwitchingToNonUnique = updates.isUniqueItem === false && oldData?.isUniqueItem === true;

    if (updates.isUniqueItem === true) { // Handling unique items or switch to unique
      dataToUpdate.itemId = updates.itemId !== undefined ? updates.itemId : oldData?.itemId;
      dataToUpdate.linkedSoldierId = updates.linkedSoldierId !== undefined ? updates.linkedSoldierId : oldData?.linkedSoldierId;
      if (updates.linkedSoldierId === null) dataToUpdate.linkedSoldierId = null;
      
      dataToUpdate.totalQuantity = undefined; // Firestore FieldValue.delete() if using object
      dataToUpdate.assignments = undefined; // Firestore FieldValue.delete() if using object
      
      // If switching, clear non-unique fields explicitly
      if (isSwitchingToUnique) {
        dataToUpdate.totalQuantity = deleteDoc; 
        dataToUpdate.assignments = deleteDoc;
      }

    } else if (updates.isUniqueItem === false) { // Handling non-unique items or switch to non-unique
      dataToUpdate.totalQuantity = updates.totalQuantity !== undefined ? updates.totalQuantity : oldData?.totalQuantity;
      
      dataToUpdate.itemId = undefined;
      dataToUpdate.linkedSoldierId = undefined;
      
      // If switching, clear unique fields and initialize assignments
      if (isSwitchingToNonUnique) {
        dataToUpdate.itemId = deleteDoc;
        dataToUpdate.linkedSoldierId = deleteDoc;
        dataToUpdate.assignments = []; // Initialize assignments
      } else {
        // Preserve existing assignments if not switching type, otherwise initialize
        dataToUpdate.assignments = updates.assignments !== undefined ? updates.assignments : (oldData?.assignments || []);
      }
    }


    await updateDoc(itemDocRef, dataToUpdate);
    revalidatePath("/armory");
    if (updates.linkedSoldierId && updates.isUniqueItem) { 
        revalidatePath(`/soldiers/${updates.linkedSoldierId}`);
    }
    if (oldLinkedSoldierId && oldLinkedSoldierId !== updates.linkedSoldierId && oldData?.isUniqueItem) {
      revalidatePath(`/soldiers/${oldLinkedSoldierId}`);
    }
    // Revalidate for all soldiers if assignments changed for a non-unique item
    if (updates.isUniqueItem === false && updates.assignments) {
        revalidatePath("/soldiers"); // Broad revalidation for soldier pages
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
        // Revalidate all soldier pages if a non-unique item with assignments is deleted
        // This is broad but ensures soldier detail pages reflect the change.
        itemData.assignments.forEach(asgn => revalidatePath(`/soldiers/${asgn.soldierId}`));
    }
  } catch (error) {
    console.error("Error deleting armory item: ", error);
    throw new Error("מחיקת פריט נכשל.");
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
    } else { // newQuantity is 0 or less, remove assignment
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
