"use server";

import { db, storage } from "@/lib/firebase";
import type { Soldier, SoldierDocument } from "@/types";
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
  Timestamp
} from "firebase/firestore";
import { 
  ref, 
  uploadBytesResumable, 
  getDownloadURL, 
  deleteObject 
} from "firebase/storage";
import { revalidatePath } from "next/cache";
import { v4 as uuidv4 } from 'uuid';

const soldiersCollection = collection(db, "soldiers");

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
    return { ...newSoldierData };
  } catch (error) {
    console.error("Error adding soldier: ", error);
    if (error instanceof Error) throw error;
    throw new Error("Failed to add soldier.");
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
          // Ensure uploadedAt is a client-side Date object if needed, or handle Timestamp directly
          // For now, pass as is, client can convert doc.uploadedAt.toDate()
        })) || []
      } as Soldier;
    });
    return soldiers;
  } catch (error) {
    console.error("Error fetching soldiers: ", error);
    return [];
  }
}

// Update soldier's division (for drag and drop)
export async function transferSoldier(soldierId: string, newDivisionId: string): Promise<void> {
  try {
    const soldierDoc = doc(db, "soldiers", soldierId);
    await updateDoc(soldierDoc, { divisionId: newDivisionId });
    revalidatePath("/soldiers");
  } catch (error) {
    console.error("Error transferring soldier: ", error);
    throw new Error("Failed to transfer soldier.");
  }
}

// Update soldier details (excluding documents, handled by separate actions)
export async function updateSoldier(soldierId: string, updates: Partial<Omit<Soldier, 'id' | 'divisionName' | 'documents'>>): Promise<void> {
  try {
    const soldierDoc = doc(db, "soldiers", soldierId);
    await updateDoc(soldierDoc, updates);
    revalidatePath("/soldiers");
  } catch (error) {
    console.error("Error updating soldier: ", error);
    throw new Error("Failed to update soldier.");
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
          // Log error but continue, as Firestore doc deletion is primary
          console.error(`Error deleting document ${docToDelete.fileName} from storage: `, storageError);
        }
      }
    }

    await deleteDoc(soldierDocRef);
    revalidatePath("/soldiers");
  } catch (error) {
    console.error("Error deleting soldier: ", error);
    throw new Error("Failed to delete soldier.");
  }
}


// Upload a document for a soldier
export async function uploadSoldierDocument(soldierId: string, formData: FormData): Promise<SoldierDocument> {
  const file = formData.get("file") as File;
  if (!file) {
    throw new Error("לא נבחר קובץ.");
  }

  const uniqueFileName = `${uuidv4()}-${file.name}`;
  const storagePath = `soldiers/${soldierId}/documents/${uniqueFileName}`;
  const storageRef = ref(storage, storagePath);

  try {
    const uploadTaskSnapshot = await uploadBytesResumable(storageRef, file);
    const downloadURL = await getDownloadURL(uploadTaskSnapshot.ref);

    const newDocument: SoldierDocument = {
      id: uuidv4(), // Unique ID for the metadata entry
      fileName: file.name,
      storagePath: storagePath,
      downloadURL: downloadURL,
      fileType: file.type,
      fileSize: file.size,
      uploadedAt: serverTimestamp() as Timestamp // Cast to Timestamp for type safety
    };

    const soldierDocRef = doc(db, "soldiers", soldierId);
    await updateDoc(soldierDocRef, {
      documents: arrayUnion(newDocument)
    });

    revalidatePath("/soldiers");
    // Return the document with a placeholder for uploadedAt or convert serverTimestamp
    // For simplicity, client might need to handle the Timestamp object after fetch.
    // Or, we can create a client-compatible version here if needed.
    // For now, let's assume client can handle it or refetch soldier data.
    // To make it immediately usable, create a version with Date for uploadedAt
     return {
      ...newDocument,
      uploadedAt: Timestamp.now() // This is a client-side timestamp, for immediate UI update. Firestore has the server one.
    };

  } catch (error) {
    console.error("Error uploading document: ", error);
    throw new Error("העלאת מסמך נכשלה.");
  }
}

// Delete a document for a soldier
export async function deleteSoldierDocument(soldierId: string, documentId: string, docStoragePath: string): Promise<void> {
  try {
    // Delete from Firebase Storage
    const storageRef = ref(storage, docStoragePath);
    await deleteObject(storageRef);

    // Delete from Firestore
    const soldierDocRef = doc(db, "soldiers", soldierId);
    const soldierSnap = await getDoc(soldierDocRef);
    if (!soldierSnap.exists()) {
      throw new Error("חייל לא נמצא.");
    }
    const soldierData = soldierSnap.data() as Soldier;
    const updatedDocuments = soldierData.documents?.filter(doc => doc.id !== documentId) || [];
    
    await updateDoc(soldierDocRef, {
      documents: updatedDocuments
    });

    revalidatePath("/soldiers");
  } catch (error) {
    console.error("Error deleting document: ", error);
    if (error instanceof Error && error.message.includes("storage/object-not-found")) {
        // If file not found in storage, proceed to remove from Firestore if desired
        console.warn("File not found in storage, attempting to remove from Firestore entry.");
        const soldierDocRef = doc(db, "soldiers", soldierId);
        const soldierSnap = await getDoc(soldierDocRef);
        if (soldierSnap.exists()) {
            const soldierData = soldierSnap.data() as Soldier;
            const updatedDocuments = soldierData.documents?.filter(d => d.id !== documentId) || [];
            await updateDoc(soldierDocRef, { documents: updatedDocuments });
            revalidatePath("/soldiers");
            return;
        }
    }
    throw new Error("מחיקת מסמך נכשלה.");
  }
}
