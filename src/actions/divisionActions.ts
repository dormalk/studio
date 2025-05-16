
"use server";

import { db } from "@/lib/firebase";
import type { Division, DivisionWithDetails, Soldier, ArmoryItem } from "@/types";
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc, query, where, writeBatch, getDoc } from "firebase/firestore";
import { revalidatePath } from "next/cache";
import { getSoldiers } from "./soldierActions"; // For counting soldiers
import { getArmoryItems } from "./armoryActions"; // For counting armory items

const divisionsCollection = collection(db, "divisions");
const soldiersCollection = collection(db, "soldiers");

export async function addDivision(divisionData: { name: string }): Promise<Division> {
  try {
    const docRef = await addDoc(divisionsCollection, divisionData);
    revalidatePath("/divisions");
    return { id: docRef.id, ...divisionData };
  } catch (error) {
    console.error("Error adding pluga: ", error);
    throw new Error("הוספת פלוגה נכשלה.");
  }
}

export async function getDivisions(): Promise<Division[]> {
  try {
    const querySnapshot = await getDocs(divisionsCollection);
    const divisions = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Division));
    return divisions.sort((a,b) => a.name.localeCompare(b.name));
  } catch (error) {
    console.error("Error fetching plugas: ", error);
    return []; 
  }
}

export async function getDivisionById(id: string): Promise<Division | null> {
    try {
        const divisionDocRef = doc(db, "divisions", id);
        const divisionDocSnap = await getDoc(divisionDocRef);

        if (!divisionDocSnap.exists()) {
            return null;
        }
        return { id: divisionDocSnap.id, ...divisionDocSnap.data() } as Division;
    } catch (error) {
        console.error("Error fetching pluga by ID: ", error);
        return null;
    }
}

export async function getDivisionsWithDetails(): Promise<DivisionWithDetails[]> {
  try {
    const [divisions, soldiers, armoryItems] = await Promise.all([
      getDocs(divisionsCollection),
      getSoldiers(), // Fetch all soldiers
      getArmoryItems() // Fetch all armory items
    ]);

    const divisionsData = divisions.docs.map(doc => ({ id: doc.id, ...doc.data() } as Division));

    return divisionsData.map(division => {
      const soldiersInDivision = soldiers.filter(s => s.divisionId === division.id);
      const soldierCount = soldiersInDivision.length;
      
      let armoryItemCount = 0;
      soldiersInDivision.forEach(soldier => {
        armoryItemCount += armoryItems.filter(item => item.linkedSoldierId === soldier.id).length;
      });

      return {
        ...division,
        soldierCount,
        armoryItemCount
      };
    }).sort((a,b) => a.name.localeCompare(b.name));

  } catch (error) {
    console.error("Error fetching plugas with details: ", error);
    return [];
  }
}


export async function updateDivision(id: string, updates: Partial<Division>): Promise<void> {
  try {
    const divisionDoc = doc(db, "divisions", id);
    await updateDoc(divisionDoc, updates);
    revalidatePath("/divisions");
  } catch (error) {
    console.error("Error updating pluga: ", error);
    throw new Error("עדכון פלוגה נכשל.");
  }
}

export async function deleteDivision(id: string): Promise<void> {
  try {
    const q = query(soldiersCollection, where("divisionId", "==", id));
    const soldiersSnapshot = await getDocs(q);
    
    if (!soldiersSnapshot.empty) {
      throw new Error("לא ניתן למחוק פלוגה עם חיילים משויכים. יש להעביר את החיילים תחילה.");
    }

    const divisionDoc = doc(db, "divisions", id);
    await deleteDoc(divisionDoc);
    revalidatePath("/divisions");
  } catch (error) {
    console.error("Error deleting pluga: ", error);
    if (error instanceof Error && error.message.includes("חיילים משויכים")) {
        throw error;
    }
    throw new Error("מחיקת פלוגה נכשלה.");
  }
}
