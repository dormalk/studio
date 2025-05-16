
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
  writeBatch,
  FieldValue
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

    return { 
        ...newSoldierData, 
        divisionName, 
        documents: [] // Ensure documents is an array in the returned object
    };
  } catch (error: any) {
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
          uploadedAt: docData.uploadedAt instanceof Timestamp
            ? docData.uploadedAt.toDate().toISOString()
            : (docData.uploadedAt && typeof docData.uploadedAt === 'object' && docData.uploadedAt.seconds) 
                ? new Date(docData.uploadedAt.seconds * 1000 + (docData.uploadedAt.nanoseconds || 0) / 1000000).toISOString()
                : (typeof docData.uploadedAt === 'string' ? docData.uploadedAt : new Date().toISOString()) 
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
            divisionName = "פלוגה לא ידועה"; // Or handle as an error, e.g., throw new Error("Division not found");
        }
    }

    const q = query(soldiersCollection, where("divisionId", "==", divisionId));
    const querySnapshot = await getDocs(q);
    const soldiers = querySnapshot.docs.map(docSnap => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        ...data,
        divisionName: divisionName, // Use the fetched division name
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
        if (updates.divisionId !== "unassigned") revalidatePath(`/divisions/${updates.divisionId}`);
        if (oldSoldierData?.divisionId && oldSoldierData.divisionId !== "unassigned") {
            revalidatePath(`/divisions/${oldSoldierData.divisionId}`);
        }
    } else if (updates.divisionId === undefined && oldSoldierData?.divisionId && oldSoldierData.divisionId !== "unassigned") {
        // If divisionId was not part of updates, but existed before
        revalidatePath(`/divisions/${oldSoldierData.divisionId}`);
    }
    revalidatePath("/divisions"); // General revalidation for divisions page counts
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

    // Delete associated documents from Storage
    if (soldierData.documents && soldierData.documents.length > 0) {
      for (const docToDelete of soldierData.documents) {
        if (docToDelete.storagePath) { // Ensure storagePath exists
          const storageRef = ref(storage, docToDelete.storagePath);
          try {
            await deleteObject(storageRef);
          } catch (storageError: any) {
            // Log if deletion from storage fails but continue to delete Firestore record
            console.warn(`Error deleting document ${docToDelete.fileName} from storage for soldier ${soldierId}: `, storageError.message || storageError);
          }
        }
      }
    }

    // Remove soldier's link from unique armory items and assignments from non-unique items
    const armoryItemsRef = collection(db, "armoryItems");
    const batch = writeBatch(db);

    // For unique items linked to this soldier
    const qArmoryUnique = query(armoryItemsRef, where("linkedSoldierId", "==", soldierId), where("isUniqueItem", "==", true));
    const armorySnapshotUnique = await getDocs(qArmoryUnique);
    armorySnapshotUnique.forEach(itemDoc => {
        batch.update(itemDoc.ref, { linkedSoldierId: null }); // Or FieldValue.delete() if you prefer
    });

    // For non-unique items assigned to this soldier
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
    revalidatePath("/soldiers"); // Revalidate all soldiers list
    if (soldierData.divisionId && soldierData.divisionId !== "unassigned") {
      revalidatePath(`/divisions/${soldierData.divisionId}`); // Revalidate specific division
    }
    revalidatePath("/divisions"); // Revalidate divisions list (for counts)
    revalidatePath("/armory"); // Revalidate armory (for linked items)

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

    const firestoreTimestamp = Timestamp.now();

    const documentDataForFirestore = {
      id: uuidv4(),
      fileName: file.name,
      storagePath: storagePath,
      downloadURL: downloadURL,
      fileType: file.type,
      fileSize: file.size,
      uploadedAt: firestoreTimestamp
    };
    
    const documentDataToReturn: SoldierDocument = {
        id: documentDataForFirestore.id,
        fileName: file.name,
        storagePath: storagePath,
        downloadURL: downloadURL,
        fileType: file.type,
        fileSize: file.size,
        uploadedAt: firestoreTimestamp.toDate().toISOString()
    };

    const soldierDocRef = doc(db, "soldiers", soldierId);
    await updateDoc(soldierDocRef, {
      documents: arrayUnion(documentDataForFirestore)
    });

    revalidatePath(`/soldiers/${soldierId}`);
    revalidatePath("/soldiers");

    return documentDataToReturn;

  } catch (error: any) {
    console.error("Full error during document upload in action: ", error); // Log the original error
    
    let simpleMessage = "העלאת מסמך נכשלה עקב שגיאת שרת."; // Default user-facing message

    if (error.code) { // Firebase error
        switch (error.code) {
            case 'storage/unauthorized':
                simpleMessage = "שגיאת הרשאות בהעלאת הקובץ. אנא בדוק את חוקי האבטחה של Firebase Storage.";
                break;
            case 'storage/canceled':
                simpleMessage = "העלאת הקובץ בוטלה.";
                break;
            case 'storage/object-not-found':
                 simpleMessage = "שגיאה: הנתיב או האובייקט לא נמצא ב-Storage.";
                 break;
            case 'storage/quota-exceeded':
                simpleMessage = "שגיאה: חריגה ממכסת האחסון בפרויקט.";
                break;
            case 'permission-denied': // Firestore permission error
                simpleMessage = "שגיאת הרשאות בעדכון מסד הנתונים של החייל.";
                break;
            case 'not-found': // Firestore document not found
                simpleMessage = "שגיאה: מסמך החייל לא נמצא במסד הנתונים.";
                break;
            default:
                simpleMessage = `שגיאת שרת (${error.code}).`;
        }
    } else if (typeof error?.message === 'string') { // Standard JavaScript error
        simpleMessage = error.message;
    } else if (typeof error === 'string') { // If the error itself is a string
        simpleMessage = error;
    }
    
    throw new Error(simpleMessage); // Always throw a new Error with a plain string message
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
    const soldierData = soldierSnap.data() as Omit<Soldier, 'documents' | 'divisionName'> & { documents?: Array<any> };
    const updatedDocuments = soldierData.documents?.filter(docEntry => docEntry.id !== documentId) || [];

    await updateDoc(soldierDocRef, {
      documents: updatedDocuments
    });

    revalidatePath(`/soldiers/${soldierId}`);
    revalidatePath("/soldiers");
  } catch (error: any) {
    console.error("Error deleting document: ", error);
    if (error instanceof Error && (error as any).code === "storage/object-not-found") {
        console.warn(`File not found in storage at path: ${docStoragePath}, attempting to remove Firestore entry.`);
        const soldierDocRef = doc(db, "soldiers", soldierId);
        const soldierSnap = await getDoc(soldierDocRef);
        if (soldierSnap.exists()) {
            const soldierData = soldierSnap.data() as Omit<Soldier, 'documents'| 'divisionName'> & { documents?: Array<any> };
            const updatedDocuments = soldierData.documents?.filter(d => d.id !== documentId) || [];
            await updateDoc(soldierDocRef, { documents: updatedDocuments });
            revalidatePath(`/soldiers/${soldierId}`);
            revalidatePath("/soldiers");
            return; 
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
    const rowNumber = i + 2; // Assuming row 1 is header, so data starts from row 2 in Excel

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
      const newSoldier = await addSoldier({
        id: soldierId,
        name: soldierName,
        divisionId: divisionId,
      });
      addedSoldiers.push(newSoldier); // newSoldier includes documents: []
      successCount++;
    } catch (error: any) {
      errorCount++;
      errors.push({ soldierName, soldierId, rowNumber, reason: error.message || "שגיאה לא ידועה בהוספת חייל." });
    }
  }

  if (successCount > 0) {
    revalidatePath("/soldiers");
    revalidatePath("/divisions"); // Revalidate divisions for potential count changes
  }

  return { successCount, errorCount, errors, addedSoldiers };
}
