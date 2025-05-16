
"use server";

import { db, storage } from "@/lib/firebase";
import type { Soldier, SoldierDocument, Division } from "@/types";
import { 
  collection, 
  doc, 
  setDoc, 
  getDocs, 
  updateDoc, 
  deleteDoc, 
  getDoc, 
  serverTimestamp, 
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
import { getDivisions } from "./divisionActions"; // For import

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
    return { ...newSoldierData, divisionName: "לא משויך" }; // divisionName will be enriched on client or by getSoldiers
  } catch (error) {
    console.error("Error adding soldier: ", error);
    if (error instanceof Error) throw error;
    throw new Error("הוספת חייל נכשלה.");
  }
}

// Get all soldiers
export async function getSoldiers(): Promise<Soldier[]> {
  try {
    const querySnapshot = await getDocs(soldiersCollection);
    const soldiers = querySnapshot.docs.map(docSnap => {
      const data = docSnap.data();
      return { 
        id: docSnap.id, 
        ...data,
        documents: data.documents?.map((doc: SoldierDocument) => ({
          ...doc,
          // uploadedAt will be a Firestore Timestamp, client can convert if needed
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

    const soldierData = soldierDocSnap.data() as Omit<Soldier, 'divisionName'>;
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
      documents: soldierData.documents?.map(doc => ({
        ...doc,
        // uploadedAt will be a Firestore Timestamp
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
    const q = query(soldiersCollection, where("divisionId", "==", divisionId));
    const querySnapshot = await getDocs(q);
    const soldiers = querySnapshot.docs.map(docSnap => {
      const data = docSnap.data();
      // Enrich with divisionName if needed here, though for a single division context it's often redundant
      return { 
        id: docSnap.id, 
        ...data,
        documents: data.documents?.map((doc: SoldierDocument) => ({ ...doc })) || [],
      } as Soldier;
    });
    return soldiers.sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    console.error(`Error fetching soldiers for division ${divisionId}: `, error);
    return [];
  }
}

// Update soldier's division (for drag and drop - potentially deprecated if not used)
export async function transferSoldier(soldierId: string, newDivisionId: string): Promise<void> {
  try {
    const soldierDoc = doc(db, "soldiers", soldierId);
    await updateDoc(soldierDoc, { divisionId: newDivisionId });
    revalidatePath("/soldiers");
    revalidatePath(`/divisions/${newDivisionId}`); // Revalidate the specific division page
    revalidatePath("/divisions"); // Revalidate the main divisions page
  } catch (error) {
    console.error("Error transferring soldier: ", error);
    throw new Error("העברת חייל נכשלה.");
  }
}

// Update soldier details (excluding documents, handled by separate actions)
export async function updateSoldier(soldierId: string, updates: Partial<Omit<Soldier, 'id' | 'divisionName' | 'documents'>>): Promise<void> {
  try {
    const soldierDoc = doc(db, "soldiers", soldierId);
    const oldSoldierData = (await getDoc(soldierDoc)).data();


    await updateDoc(soldierDoc, updates);
    revalidatePath("/soldiers"); // Revalidate all soldiers list
    revalidatePath(`/soldiers/${soldierId}`); // Revalidate specific soldier detail page

    if (updates.divisionId && oldSoldierData?.divisionId !== updates.divisionId) {
        revalidatePath(`/divisions/${updates.divisionId}`); // Revalidate new division page
        if (oldSoldierData?.divisionId) {
            revalidatePath(`/divisions/${oldSoldierData.divisionId}`); // Revalidate old division page
        }
    }
    revalidatePath("/divisions"); // Revalidate main divisions page due to potential count changes
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

    // Delete associated documents from Firebase Storage
    if (soldierData.documents && soldierData.documents.length > 0) {
      for (const docToDelete of soldierData.documents) {
        const storageRef = ref(storage, docToDelete.storagePath);
        try {
          await deleteObject(storageRef);
        } catch (storageError) {
          console.error(`Error deleting document ${docToDelete.fileName} from storage: `, storageError);
        }
      }
    }

    // Unlink armory items
    const armoryItemsRef = collection(db, "armoryItems");
    const qArmory = query(armoryItemsRef, where("linkedSoldierId", "==", soldierId));
    const armorySnapshot = await getDocs(qArmory);
    const batch = writeBatch(db);
    armorySnapshot.forEach(itemDoc => {
        batch.update(itemDoc.ref, { linkedSoldierId: null }); 
    });
    await batch.commit();


    await deleteDoc(soldierDocRef);
    revalidatePath("/soldiers");
    if (soldierData.divisionId) {
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

    const newDocument: SoldierDocument = {
      id: uuidv4(), 
      fileName: file.name,
      storagePath: storagePath,
      downloadURL: downloadURL,
      fileType: file.type,
      fileSize: file.size,
      uploadedAt: serverTimestamp() as Timestamp 
    };

    const soldierDocRef = doc(db, "soldiers", soldierId);
    await updateDoc(soldierDocRef, {
      documents: arrayUnion(newDocument)
    });

    revalidatePath(`/soldiers/${soldierId}`);
    revalidatePath("/soldiers");
     return {
      ...newDocument,
      uploadedAt: Timestamp.now() // For immediate UI update
    };

  } catch (error) {
    console.error("Error uploading document: ", error);
    throw new Error("העלאת מסמך נכשלה.");
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
    const soldierData = soldierSnap.data() as Soldier;
    const updatedDocuments = soldierData.documents?.filter(docEntry => docEntry.id !== documentId) || [];
    
    await updateDoc(soldierDocRef, {
      documents: updatedDocuments
    });

    revalidatePath(`/soldiers/${soldierId}`);
    revalidatePath("/soldiers");
  } catch (error) {
    console.error("Error deleting document: ", error);
    if (error instanceof Error && (error as any).code === "storage/object-not-found") {
        console.warn("File not found in storage, attempting to remove from Firestore entry.");
        const soldierDocRef = doc(db, "soldiers", soldierId);
        const soldierSnap = await getDoc(soldierDocRef);
        if (soldierSnap.exists()) {
            const soldierData = soldierSnap.data() as Soldier;
            const updatedDocuments = soldierData.documents?.filter(d => d.id !== documentId) || [];
            await updateDoc(soldierDocRef, { documents: updatedDocuments });
            revalidatePath(`/soldiers/${soldierId}`);
            revalidatePath("/soldiers");
            return;
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
  const divisionMapByName = new Map(allDivisions.map(div => [div.name.toLowerCase(), div.id]));

  let successCount = 0;
  let errorCount = 0;
  const errors: Array<{ soldierName?: string; soldierId?: string; rowNumber: number; reason: string }> = [];
  const addedSoldiers: Soldier[] = [];

  for (let i = 0; i < soldiersData.length; i++) {
    const soldierRow = soldiersData[i];
    const rowNumber = i + 2; // Assuming Excel row numbers start from 1 and header is row 1

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
      errors.push({ soldierName, soldierId, rowNumber, reason: `פלוגה בשם '${divisionName}' לא נמצאה.` });
      continue;
    }

    try {
      const newSoldier = await addSoldier({
        id: soldierId,
        name: soldierName,
        divisionId: divisionId,
      });
      // Enrich with division name for immediate use in UI if needed
      const fullNewSoldier = { ...newSoldier, divisionName, documents: [] };
      addedSoldiers.push(fullNewSoldier);
      successCount++;
    } catch (error: any) {
      errorCount++;
      errors.push({ soldierName, soldierId, rowNumber, reason: error.message || "שגיאה לא ידועה בהוספת חייל." });
    }
  }

  if (successCount > 0) {
    revalidatePath("/soldiers");
    revalidatePath("/divisions"); // In case soldier counts changed for divisions
  }

  return { successCount, errorCount, errors, addedSoldiers };
}

