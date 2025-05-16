
"use server";

import { db, storage } from "@/lib/firebase";
import type { Soldier, SoldierDocument, Division, ArmoryItem } from "@/types";
import {
  collection,
  doc,
  setDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  getDoc,
  arrayUnion,
  Timestamp,
  query,
  where,
  writeBatch
} from "firebase/firestore";
import {
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject
} from "firebase/storage";
import { revalidatePath } from "next/cache";
import { v4 as uuidv4 } from 'uuid';
import { getDivisions } from "./divisionActions";

const soldiersCollection = collection(db, "soldiers");
const divisionsCollection = collection(db, "divisions");

// Add a new soldier (using soldier's unique ID as document ID)
export async function addSoldier(soldierData: Omit<Soldier, 'divisionName' | 'documents'>): Promise<Soldier> {
  try {
    const soldierDocRef = doc(db, "soldiers", soldierData.id);
    const soldierDocSnap = await getDoc(soldierDocRef);
    if (soldierDocSnap.exists()) {
      throw new Error(`חייל עם ת.ז. ${soldierData.id} כבר קיים.`);
    }

    const newSoldierData = {
      ...soldierData,
      documents: [], // Initialize with an empty documents array
    };
    await setDoc(soldierDocRef, newSoldierData);
    revalidatePath("/soldiers");
    if (soldierData.divisionId) revalidatePath(`/divisions/${soldierData.divisionId}`);

    let divisionName = "לא משויך";
    if (soldierData.divisionId && soldierData.divisionId !== "unassigned") {
        const divisionDoc = await getDoc(doc(db, "divisions", soldierData.divisionId));
        if (divisionDoc.exists()) {
            divisionName = (divisionDoc.data() as Division).name;
        }
    }

    return { ...newSoldierData, divisionName, documents: [] };
  } catch (error) {
    console.error("Error adding soldier: ", error);
    if (error instanceof Error) throw error;
    throw new Error("הוספת חייל נכשלה.");
  }
}

// Get all soldiers
export async function getSoldiers(): Promise<Soldier[]> {
  try {
    const [soldiersSnapshot, divisionsSnapshot] = await Promise.all([
        getDocs(soldiersCollection),
        getDocs(divisionsCollection)
    ]);

    const divisionsMap = new Map(divisionsSnapshot.docs.map(docSnap => [docSnap.id, docSnap.data().name as string]));

    const soldiers = soldiersSnapshot.docs.map(docSnap => {
      const data = docSnap.data();
      const divisionName = data.divisionId === "unassigned" ? "לא משויך" : (divisionsMap.get(data.divisionId) || "פלוגה לא ידועה");
      return {
        id: docSnap.id,
        ...data,
        divisionName,
        documents: data.documents?.map((docData: any) => ({
          ...docData,
          // Ensure uploadedAt from Firestore (which is a Timestamp) is converted to ISO string
          uploadedAt: docData.uploadedAt instanceof Timestamp
            ? docData.uploadedAt.toDate().toISOString()
            : (docData.uploadedAt && typeof docData.uploadedAt === 'object' && docData.uploadedAt.seconds) // Handle if it's already an object from a previous fetch
                ? new Date(docData.uploadedAt.seconds * 1000 + (docData.uploadedAt.nanoseconds || 0) / 1000000).toISOString()
                : (typeof docData.uploadedAt === 'string' ? docData.uploadedAt : new Date().toISOString()) // Fallback if it's already a string or unknown
        })) || []
      } as Soldier;
    });
    return soldiers;
  } catch (error) {
    console.error("Error fetching soldiers: ", error);
    return [];
  }
}

// Get a single soldier by ID
export async function getSoldierById(soldierId: string): Promise<Soldier | null> {
  try {
    const soldierDocRef = doc(db, "soldiers", soldierId);
    const soldierDocSnap = await getDoc(soldierDocRef);

    if (!soldierDocSnap.exists()) {
      return null;
    }

    const soldierData = soldierDocSnap.data() as Omit<Soldier, 'divisionName' | 'documents'> & { documents?: Array<any> };
    let divisionName = "לא משויך";
    if (soldierData.divisionId && soldierData.divisionId !== "unassigned") {
      const divisionDocRef = doc(db, "divisions", soldierData.divisionId);
      const divisionDocSnap = await getDoc(divisionDocRef);
      if (divisionDocSnap.exists()) {
        divisionName = (divisionDocSnap.data() as Division).name;
      }
    }

    return {
      ...soldierData,
      id: soldierDocSnap.id,
      divisionName,
      documents: soldierData.documents?.map(docData => ({
        ...docData,
        uploadedAt: docData.uploadedAt instanceof Timestamp
          ? docData.uploadedAt.toDate().toISOString()
          : (docData.uploadedAt && typeof docData.uploadedAt === 'object' && docData.uploadedAt.seconds)
              ? new Date(docData.uploadedAt.seconds * 1000 + (docData.uploadedAt.nanoseconds || 0) / 1000000).toISOString()
              : (typeof docData.uploadedAt === 'string' ? docData.uploadedAt : new Date().toISOString())
      })) || []
    } as Soldier;
  } catch (error) {
    console.error(`Error fetching soldier ${soldierId}: `, error);
    return null;
  }
}


// Get soldiers by division ID
export async function getSoldiersByDivisionId(divisionId: string): Promise<Soldier[]> {
  try {
    let divisionName = "לא משויך";
    if (divisionId !== "unassigned") {
        const divisionDoc = await getDoc(doc(db, "divisions", divisionId));
        if (divisionDoc.exists()) {
            divisionName = (divisionDoc.data() as Division).name;
        } else {
            divisionName = "פלוגה לא ידועה";
        }
    }

    const q = query(soldiersCollection, where("divisionId", "==", divisionId));
    const querySnapshot = await getDocs(q);
    const soldiers = querySnapshot.docs.map(docSnap => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        ...data,
        divisionName: divisionName,
        documents: data.documents?.map((docData: any) => ({
            ...docData,
            uploadedAt: docData.uploadedAt instanceof Timestamp
            ? docData.uploadedAt.toDate().toISOString()
            : (docData.uploadedAt && typeof docData.uploadedAt === 'object' && docData.uploadedAt.seconds)
                ? new Date(docData.uploadedAt.seconds * 1000 + (docData.uploadedAt.nanoseconds || 0) / 1000000).toISOString()
                : (typeof docData.uploadedAt === 'string' ? docData.uploadedAt : new Date().toISOString())
        })) || [],
      } as Soldier;
    });
    return soldiers.sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    console.error(`Error fetching soldiers for division ${divisionId}: `, error);
    return [];
  }
}


export async function updateSoldier(soldierId: string, updates: Partial<Omit<Soldier, 'id' | 'divisionName' | 'documents'>>): Promise<void> {
  try {
    const soldierDoc = doc(db, "soldiers", soldierId);
    const oldSoldierDataSnap = await getDoc(soldierDoc);
    const oldSoldierData = oldSoldierDataSnap.data();


    await updateDoc(soldierDoc, updates);
    revalidatePath("/soldiers");
    revalidatePath(`/soldiers/${soldierId}`);

    if (updates.divisionId && oldSoldierData?.divisionId !== updates.divisionId) {
        revalidatePath(`/divisions/${updates.divisionId}`);
        if (oldSoldierData?.divisionId && oldSoldierData.divisionId !== "unassigned") {
            revalidatePath(`/divisions/${oldSoldierData.divisionId}`);
        }
    } else if (updates.divisionId === undefined && oldSoldierData?.divisionId) {
        revalidatePath(`/divisions/${oldSoldierData.divisionId}`);
    }
    revalidatePath("/divisions");
  } catch (error) {
    console.error("Error updating soldier: ", error);
    throw new Error("עדכון פרטי חייל נכשל.");
  }
}

// Delete a soldier
export async function deleteSoldier(soldierId: string): Promise<void> {
  try {
    const soldierDocRef = doc(db, "soldiers", soldierId);
    const soldierSnap = await getDoc(soldierDocRef);
    if (!soldierSnap.exists()) {
      throw new Error("חייל לא נמצא.");
    }
    const soldierData = soldierSnap.data() as Soldier;

    if (soldierData.documents && soldierData.documents.length > 0) {
      for (const docToDelete of soldierData.documents) {
        const storageRef = ref(storage, docToDelete.storagePath);
        try {
          await deleteObject(storageRef);
        } catch (storageError) {
          console.error(`Error deleting document ${docToDelete.fileName} from storage: `, storageError);
          // Do not re-throw here, try to remove Firestore entry anyway
        }
      }
    }

    const armoryItemsRef = collection(db, "armoryItems");
    const batch = writeBatch(db);

    const qArmoryUnique = query(armoryItemsRef, where("linkedSoldierId", "==", soldierId));
    const armorySnapshotUnique = await getDocs(qArmoryUnique);
    armorySnapshotUnique.forEach(itemDoc => {
        batch.update(itemDoc.ref, { linkedSoldierId: null });
    });

    const allNonUniqueItemsSnapshot = await getDocs(query(armoryItemsRef, where("isUniqueItem", "==", false)));
    allNonUniqueItemsSnapshot.forEach(itemDoc => {
        const itemData = itemDoc.data() as ArmoryItem;
        if (itemData.assignments && itemData.assignments.some(asgn => asgn.soldierId === soldierId)) {
            const updatedAssignments = itemData.assignments.filter(asgn => asgn.soldierId !== soldierId);
            batch.update(itemDoc.ref, { assignments: updatedAssignments });
        }
    });

    await batch.commit();


    await deleteDoc(soldierDocRef);
    revalidatePath("/soldiers");
    if (soldierData.divisionId && soldierData.divisionId !== "unassigned") {
      revalidatePath(`/divisions/${soldierData.divisionId}`);
    }
    revalidatePath("/divisions");
    revalidatePath("/armory");
  } catch (error) {
    console.error("Error deleting soldier: ", error);
    throw new Error("מחיקת חייל נכשלה.");
  }
}


// Upload a document for a soldier
export async function uploadSoldierDocument(soldierId: string, formData: FormData): Promise<SoldierDocument> {
  const file = formData.get("file") as File;
  if (!file || !(file instanceof File) || file.size === 0) {
    throw new Error("לא נבחר קובץ, או שהקובץ ריק.");
  }

  const uniqueFileName = `${uuidv4()}-${file.name}`;
  const storagePath = `soldiers/${soldierId}/documents/${uniqueFileName}`;
  const storageRef = ref(storage, storagePath);

  try {
    const uploadTaskSnapshot = await uploadBytesResumable(storageRef, file);
    const downloadURL = await getDownloadURL(uploadTaskSnapshot.ref);

    const firestoreTimestamp = Timestamp.now(); // Timestamp for Firestore

    const documentDataForFirestore = {
      id: uuidv4(),
      fileName: file.name,
      storagePath: storagePath,
      downloadURL: downloadURL,
      fileType: file.type,
      fileSize: file.size,
      uploadedAt: firestoreTimestamp // This is a Firestore Timestamp object
    };

    const soldierDocRef = doc(db, "soldiers", soldierId);
    await updateDoc(soldierDocRef, {
      documents: arrayUnion(documentDataForFirestore)
    });

    revalidatePath(`/soldiers/${soldierId}`);
    revalidatePath("/soldiers");

    // Return SoldierDocument with uploadedAt as ISO string for client
    return {
        ...documentDataForFirestore,
        uploadedAt: firestoreTimestamp.toDate().toISOString() // Convert to ISO string for client
    };

  } catch (error: any) {
    console.error("Error uploading document: ", error);
    // More detailed error logging
    if (error.code) { // Firebase errors often have a 'code' property
        console.error("Firebase error code:", error.code);
    }
    if (error instanceof Error) {
        if ((error as any).code === 'storage/unauthorized') {
            throw new Error("שגיאת הרשאות בהעלאת הקובץ. אנא בדוק את חוקי האבטחה של Firebase Storage.");
        }
        if ((error as any).code === 'storage/canceled') {
            throw new Error("העלאת הקובץ בוטלה.");
        }
        if (error.message.includes("arrayUnion() called with invalid data") || error.message.includes("serverTimestamp() can only be used with update() and set()")) {
            throw new Error("שגיאת Firestore: נתונים לא תקינים בעת ניסיון הוספת המסמך למערך. נסה שוב.");
        }
        throw error; // Re-throw other errors
    }
    throw new Error("העלאת מסמך נכשלה עקב שגיאה לא צפויה.");
  }
}

// Delete a document for a soldier
export async function deleteSoldierDocument(soldierId: string, documentId: string, docStoragePath: string): Promise<void> {
  try {
    const storageRefToDelete = ref(storage, docStoragePath);
    await deleteObject(storageRefToDelete);

    const soldierDocRef = doc(db, "soldiers", soldierId);
    const soldierSnap = await getDoc(soldierDocRef);
    if (!soldierSnap.exists()) {
      throw new Error("חייל לא נמצא.");
    }
    // The documents array in Firestore contains Firestore Timestamps for uploadedAt
    const soldierData = soldierSnap.data() as Omit<Soldier, 'documents' | 'divisionName'> & { documents?: Array<any> };
    const updatedDocuments = soldierData.documents?.filter(docEntry => docEntry.id !== documentId) || [];

    await updateDoc(soldierDocRef, {
      documents: updatedDocuments
    });

    revalidatePath(`/soldiers/${soldierId}`);
    revalidatePath("/soldiers");
  } catch (error) {
    console.error("Error deleting document: ", error);
    if (error instanceof Error && (error as any).code === "storage/object-not-found") {
        console.warn(`File not found in storage at path: ${docStoragePath}, attempting to remove Firestore entry.`);
        // Attempt to remove Firestore entry even if file not found in storage
        const soldierDocRef = doc(db, "soldiers", soldierId);
        const soldierSnap = await getDoc(soldierDocRef);
        if (soldierSnap.exists()) {
            const soldierData = soldierSnap.data() as Omit<Soldier, 'documents'| 'divisionName'> & { documents?: Array<any> };
            const updatedDocuments = soldierData.documents?.filter(d => d.id !== documentId) || [];
            await updateDoc(soldierDocRef, { documents: updatedDocuments });
            revalidatePath(`/soldiers/${soldierId}`);
            revalidatePath("/soldiers");
            return; // Successfully removed Firestore entry
        } else {
            throw new Error("חייל לא נמצא, לא ניתן להסיר את רשומת המסמך.");
        }
    }
    throw new Error("מחיקת מסמך נכשלה.");
  }
}

// Import soldiers from Excel
export interface SoldierImportData {
  name: string;
  id: string; // Soldier's personal ID
  divisionName: string;
}

export interface ImportResult {
  successCount: number;
  errorCount: number;
  errors: Array<{ soldierName?: string; soldierId?: string; rowNumber: number; reason: string }>;
  addedSoldiers: Soldier[];
}

export async function importSoldiers(soldiersData: SoldierImportData[]): Promise<ImportResult> {
  const allDivisions = await getDivisions();
  const divisionMapByName = new Map(allDivisions.map(div => [div.name.trim().toLowerCase(), div.id]));

  let successCount = 0;
  let errorCount = 0;
  const errors: Array<{ soldierName?: string; soldierId?: string; rowNumber: number; reason: string }> = [];
  const addedSoldiers: Soldier[] = [];

  for (let i = 0; i < soldiersData.length; i++) {
    const soldierRow = soldiersData[i];
    const rowNumber = i + 2; // Assuming data starts from row 2 (after header)

    if (!soldierRow.id || !soldierRow.name || !soldierRow.divisionName) {
      errorCount++;
      errors.push({
        soldierId: soldierRow.id || "N/A",
        soldierName: soldierRow.name || "N/A",
        rowNumber,
        reason: "שדות חסרים (מספר אישי, שם או שם פלוגה)."
      });
      continue;
    }

    const soldierId = String(soldierRow.id).trim();
    const soldierName = String(soldierRow.name).trim();
    const divisionName = String(soldierRow.divisionName).trim();

    const divisionId = divisionMapByName.get(divisionName.toLowerCase());

    if (!divisionId) {
      errorCount++;
      errors.push({ soldierName, soldierId, rowNumber, reason: `פלוגה בשם '${divisionName}' לא נמצאה במערכת.` });
      continue;
    }

    try {
      // addSoldier returns a Soldier object which already has uploadedAt converted to string if necessary
      const newSoldier = await addSoldier({
        id: soldierId,
        name: soldierName,
        divisionId: divisionId,
      });
      addedSoldiers.push(newSoldier);
      successCount++;
    } catch (error: any) {
      errorCount++;
      errors.push({ soldierName, soldierId, rowNumber, reason: error.message || "שגיאה לא ידועה בהוספת חייל." });
    }
  }

  if (successCount > 0) {
    revalidatePath("/soldiers");
    revalidatePath("/divisions");
  }

  return { successCount, errorCount, errors, addedSoldiers };
}
