
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
export async function addSoldier(soldierData: Omit<Soldier, 'divisionName' | 'documents' | 'assignedUniqueArmoryItemsDetails' | 'assignedNonUniqueArmoryItemsSummary'>): Promise<Soldier> {
  try {
    const soldierDocRef = doc(db, "soldiers", soldierData.id);
    const soldierDocSnap = await getDoc(soldierDocRef);
    if (soldierDocSnap.exists()) {
      throw new Error(`חייל עם מ.א. ${soldierData.id} כבר קיים.`);
    }

    const newSoldierDataForFirestore = {
      ...soldierData,
      documents: [], // Initialize with an empty documents array
    };
    await setDoc(soldierDocRef, newSoldierDataForFirestore);
    revalidatePath("/soldiers");
    if (soldierData.divisionId && soldierData.divisionId !== "unassigned") {
        revalidatePath(`/divisions/${soldierData.divisionId}`);
    }


    let divisionName = "לא משויך";
    if (soldierData.divisionId && soldierData.divisionId !== "unassigned") {
        const divisionDoc = await getDoc(doc(db, "divisions", soldierData.divisionId));
        if (divisionDoc.exists()) {
            divisionName = (divisionDoc.data() as Division).name;
        }
    }
    
    // Construct the Soldier object to return, including all necessary fields initialized
    const returnedSoldier: Soldier = {
        ...soldierData, // This includes id, name, divisionId
        divisionName: divisionName,
        documents: [],
        assignedUniqueArmoryItemsDetails: [], // Initialize as empty
        assignedNonUniqueArmoryItemsSummary: [], // Initialize as empty
    };

    return returnedSoldier;

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
        documents: (data.documents || []).map((docData: any) => ({
          ...docData,
          uploadedAt: docData.uploadedAt instanceof Timestamp
            ? docData.uploadedAt.toDate().toISOString()
            : (docData.uploadedAt && typeof docData.uploadedAt === 'object' && docData.uploadedAt.seconds)
                ? new Date(docData.uploadedAt.seconds * 1000 + (docData.uploadedAt.nanoseconds || 0) / 1000000).toISOString()
                : (typeof docData.uploadedAt === 'string' ? docData.uploadedAt : new Date().toISOString())
        }))
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
      documents: (soldierData.documents || []).map(docData => ({
        ...docData,
        uploadedAt: docData.uploadedAt instanceof Timestamp
          ? docData.uploadedAt.toDate().toISOString()
          : (docData.uploadedAt && typeof docData.uploadedAt === 'object' && docData.uploadedAt.seconds)
              ? new Date(docData.uploadedAt.seconds * 1000 + (docData.uploadedAt.nanoseconds || 0) / 1000000).toISOString()
              : (typeof docData.uploadedAt === 'string' ? docData.uploadedAt : new Date().toISOString())
      }))
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
            divisionName = "פלוגה לא ידועה"; // Should ideally not happen if divisionId is valid
        }
    }

    const q = query(soldiersCollection, where("divisionId", "==", divisionId));
    const querySnapshot = await getDocs(q);
    const soldiers = querySnapshot.docs.map(docSnap => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        ...data,
        divisionName: divisionName, // Use the fetched divisionName
        documents: (data.documents || []).map((docData: any) => ({
            ...docData,
           uploadedAt: docData.uploadedAt instanceof Timestamp
            ? docData.uploadedAt.toDate().toISOString()
            : (docData.uploadedAt && typeof docData.uploadedAt === 'object' && docData.uploadedAt.seconds)
                ? new Date(docData.uploadedAt.seconds * 1000 + (docData.uploadedAt.nanoseconds || 0) / 1000000).toISOString()
                : (typeof docData.uploadedAt === 'string' ? docData.uploadedAt : new Date().toISOString())
        })),
      } as Soldier;
    });
    return soldiers.sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    console.error(`Error fetching soldiers for division ${divisionId}: `, error);
    return [];
  }
}


export async function updateSoldier(soldierId: string, updates: Partial<Omit<Soldier, 'id' | 'divisionName' | 'documents' | 'assignedUniqueArmoryItemsDetails' | 'assignedNonUniqueArmoryItemsSummary'>>): Promise<void> {
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
        if (docToDelete.storagePath) {
          const storageRef = ref(storage, docToDelete.storagePath);
          try {
            await deleteObject(storageRef);
          } catch (storageError: any) {
            // Log warning but continue deletion from Firestore
            console.warn(`Error deleting document ${docToDelete.fileName} from storage for soldier ${soldierId}: `, storageError.message || storageError);
          }
        }
      }
    }
    
    // Unlink armory items
    const armoryItemsRef = collection(db, "armoryItems");
    const batch = writeBatch(db);

    // Handle unique items linked to this soldier
    const qArmoryUnique = query(armoryItemsRef, where("linkedSoldierId", "==", soldierId), where("isUniqueItem", "==", true));
    const armorySnapshotUnique = await getDocs(qArmoryUnique);
    armorySnapshotUnique.forEach(itemDoc => {
        batch.update(itemDoc.ref, { linkedSoldierId: null }); // Or set to a specific "unassigned" status if needed
    });

    // Handle non-unique items assignments for this soldier
    // This is more complex as assignments are an array within each non-unique item.
    // We need to fetch all non-unique items, check their assignments array, and update if necessary.
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
    revalidatePath("/divisions"); // Revalidate the main divisions page as soldier counts might change
    revalidatePath("/armory"); // Revalidate armory page as item links might change

  } catch (error) {
    console.error("Error deleting soldier: ", error);
    throw new Error("מחיקת חייל נכשלה.");
  }
}


// Upload a document for a soldier
export async function uploadSoldierDocument(soldierId: string, formData: FormData): Promise<SoldierDocument> {
  const file = formData.get("file");
  const customFileName = formData.get("customFileName") as string | null;

  if (!(file instanceof File) || file.size === 0) {
    console.error("uploadSoldierDocument: Invalid or empty file received.", file);
    throw new Error("קובץ לא תקין או ריק. יש לבחור קובץ להעלאה.");
  }

  const displayFileName = customFileName && customFileName.trim() !== "" ? customFileName.trim() : file.name;
  const uniqueStorageFileName = `${uuidv4()}-${file.name}`; 
  const storagePath = `soldiers/${soldierId}/documents/${uniqueStorageFileName}`;
  const storageRef = ref(storage, storagePath);

  try {
    const uploadTaskSnapshot = await uploadBytesResumable(storageRef, file);
    const downloadURL = await getDownloadURL(uploadTaskSnapshot.ref);

    const firestoreTimestamp = Timestamp.now(); // Use client/server-generated timestamp for arrayUnion

    const documentDataForFirestore = { 
      id: uuidv4(),
      fileName: displayFileName,
      storagePath: storagePath, 
      downloadURL: downloadURL,
      fileType: file.type,
      fileSize: file.size,
      uploadedAt: firestoreTimestamp // This is a Firestore Timestamp object
    };
    
    // For returning to client, convert timestamp to ISO string
    const documentDataToReturn: SoldierDocument = {
        id: documentDataForFirestore.id,
        fileName: displayFileName,
        storagePath: storagePath,
        downloadURL: downloadURL,
        fileType: file.type,
        fileSize: file.size,
        uploadedAt: firestoreTimestamp.toDate().toISOString() // Convert to ISO string for client
    };

    const soldierDocRef = doc(db, "soldiers", soldierId);
    await updateDoc(soldierDocRef, {
      documents: arrayUnion(documentDataForFirestore)
    });

    revalidatePath(`/soldiers/${soldierId}`);
    revalidatePath("/soldiers"); 

    return documentDataToReturn;

  } catch (error: any) {
    console.error("--- SERVER ACTION ERROR (uploadSoldierDocument) ---");
    console.error("Full raw error object during upload/DB update:", error);
    if (typeof error === 'object' && error !== null) {
      console.error("Error name:", error.name);
      console.error("Error message:", error.message);
      console.error("Error code (if any):", (error as any).code);
      console.error("Error stack (if any):", error.stack);
    }
    console.error("--------------------------------------------------");

    let simpleMessage = "העלאת מסמך נכשלה. נא לבדוק את הלוגים בצד השרת לפרטים נוספים.";
    if (error && typeof error === 'object') {
        if ((error as any).code) { 
            switch((error as any).code) {
                case 'storage/unauthorized':
                    simpleMessage = "שגיאת הרשאות באחסון. ודא שיש לך הרשאה להעלות קבצים."; break;
                case 'storage/object-not-found':
                    simpleMessage = "אובייקט לא נמצא באחסון."; break;
                case 'storage/canceled':
                    simpleMessage = "העלאת הקובץ בוטלה."; break;
                case 'permission-denied': // Firestore permission error
                    simpleMessage = "שגיאת הרשאות במסד הנתונים. ודא שיש הרשאה לעדכן את פרטי החייל."; break;
                default:
                    simpleMessage = `שגיאה (${(error as any).code}): ${error.message || 'פרטים נוספים בלוג השרת.'}`;
            }
        } else if (error.message && typeof error.message === 'string') {
            simpleMessage = error.message;
        }
    } else if (typeof error === 'string') {
        simpleMessage = error;
    }
    throw new Error(simpleMessage);
  }
}

// Delete a document for a soldier
export async function deleteSoldierDocument(soldierId: string, documentId: string, docStoragePath: string): Promise<void> {
  try {
    // Ensure docStoragePath is a non-empty string before attempting deletion
    if (docStoragePath && typeof docStoragePath === 'string' && docStoragePath.trim() !== '') {
        const storageRefToDelete = ref(storage, docStoragePath);
        try {
            await deleteObject(storageRefToDelete);
        } catch (storageError: any) {
            // If the object doesn't exist, it's fine, we still want to remove the Firestore entry.
            // For other storage errors, log them but proceed with Firestore deletion.
            if (storageError.code === "storage/object-not-found") {
                console.warn(`Document not found in Storage at path: ${docStoragePath}. Proceeding to remove Firestore entry.`);
            } else {
                // For other errors (like permission issues), log them and potentially re-throw or handle.
                // For now, we'll log and continue to ensure the Firestore entry can be removed if possible.
                console.error(`Error deleting document from Storage (path: ${docStoragePath}):`, storageError);
                // Optionally, you could re-throw here if Storage deletion failure should halt the process:
                // throw new Error("מחיקת קובץ מהאחסון נכשלה. " + (storageError.message || ""));
            }
        }
    } else {
        console.warn(`Missing or invalid storagePath for document ID ${documentId} of soldier ${soldierId}. Cannot delete from Storage.`);
    }

    const soldierDocRef = doc(db, "soldiers", soldierId);
    const soldierSnap = await getDoc(soldierDocRef);
    if (!soldierSnap.exists()) {
      throw new Error("חייל לא נמצא במסד הנתונים.");
    }
    const soldierData = soldierSnap.data() as Omit<Soldier, 'documents' | 'divisionName'> & { documents?: Array<any> };
    // Filter out the document to be deleted
    const updatedDocuments = soldierData.documents?.filter(docEntry => docEntry.id !== documentId) || [];

    await updateDoc(soldierDocRef, {
      documents: updatedDocuments
    });

    revalidatePath(`/soldiers/${soldierId}`);
    revalidatePath("/soldiers"); // Revalidate all soldiers page if needed
  } catch (error: any) {
    console.error("Error deleting document (action): ", error);
    let simpleMessage = "מחיקת מסמך נכשלה.";
    if (error instanceof Error) {
        simpleMessage = error.message;
    } else if (typeof error === 'string') {
        simpleMessage = error;
    } else if ((error as any).code) { 
        // Attempt to create a more user-friendly message from Firebase error codes
        switch((error as any).code) {
            case 'storage/unauthorized':
                simpleMessage = "שגיאת הרשאות במחיקת הקובץ מהאחסון."; break;
            case 'permission-denied': // Firestore permission error
                simpleMessage = "שגיאת הרשאות בעת ניסיון מחיקה ממסד הנתונים."; break;
            default:
                simpleMessage = `שגיאת שרת (${(error as any).code}) בעת מחיקת המסמך.`;
        }
    }
    throw new Error(simpleMessage);
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
    const rowNumber = i + 2; // Assuming Excel row numbers start from 1 and row 1 is header

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
      // Call addSoldier which now returns a complete Soldier object
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

    

    
