
"use client";

import type { Soldier, ArmoryItem, SoldierDocument, Division, ArmoryItemType } from "@/types";
import { useState, useEffect, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, FileText, Download, Trash2, PackageSearch, RefreshCw, Edit3, UserCircle, Camera, PlusCircle, MinusCircle, Edit, Link2, Archive, PackageCheck, PackageX, MapPin, Unlink2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { Timestamp } from "firebase/firestore";
import { uploadSoldierDocument, deleteSoldierDocument, updateSoldier } from "@/actions/soldierActions";
import {
    addArmoryItem,
    scanArmoryItemImage,
    manageSoldierAssignmentToNonUniqueItem,
    getArmoryItemsBySoldierId,
    getArmoryItems,
    updateArmoryItem,
} from "@/actions/armoryActions";
import Link from "next/link";
import Image from "next/image";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    DialogClose,
    DialogTrigger
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { useForm, Controller, useWatch } from "react-hook-form";
import * as z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getDivisions } from "@/actions/divisionActions";
import { Checkbox } from "@/components/ui/checkbox";


interface SoldierDetailClientProps {
  soldier: Soldier;
  initialArmoryItems: ArmoryItem[];
  initialArmoryItemTypes: ArmoryItemType[];
  availableNonUniqueItems: Array<ArmoryItem & { availableQuantity: number }>;
  initialAllExistingArmoryItems: ArmoryItem[];
}

const soldierDetailsSchema = z.object({
  name: z.string().min(1, "שם הינו שדה חובה"),
  divisionId: z.string().min(1, "יש לבחור פלוגה"),
});
type SoldierDetailsFormData = z.infer<typeof soldierDetailsSchema>;

const armoryItemBaseSchemaOnSoldierPage = z.object({
  itemTypeId: z.string().min(1, "יש לבחור סוג פריט"),
  itemId: z.string().optional(), // Serial number
  photoDataUri: z.string().optional(),
  isStored: z.boolean().optional().default(true),
  shelfNumber: z.string().optional(),
});

const armoryItemSchemaOnSoldierPage = armoryItemBaseSchemaOnSoldierPage.superRefine((data, ctx) => {
  const currentDialogMode = (window as any).__SOLDIER_PAGE_ARMORY_DIALOG_MODE__;
  if (currentDialogMode === 'create') {
    const isUnique = (window as any).__SELECTED_ITEM_TYPE_IS_UNIQUE_SOLDIER_PAGE__;
    if (isUnique === true) {
      if (!data.itemId || data.itemId.trim() === "") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["itemId"],
          message: "מספר סריאלי הינו שדה חובה עבור פריט ייחודי",
        });
      }
      if (data.isStored === false && data.shelfNumber && data.shelfNumber.trim() !== "") {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["shelfNumber"],
            message: "לא ניתן להזין מספר מדף אם הפריט אינו מאוחסן",
        });
      }
      if (data.isStored === false && isUnique) { // No need to check linkedSoldierId here as it's auto-linked
        // This validation is mostly for the main armory page.
        // Here, the item is always linked to the current soldier if not stored.
      }
    }
  }
});
type ArmoryItemFormDataOnSoldierPage = z.infer<typeof armoryItemSchemaOnSoldierPage>;

const assignNonUniqueSchema = z.object({
    selectedArmoryItemId: z.string().min(1, "יש לבחור פריט מחסן"),
    quantityToAssign: z.number().int().min(1, "כמות חייבת להיות מספר חיובי גדול מאפס"),
});
type AssignNonUniqueFormData = z.infer<typeof assignNonUniqueSchema>;

const updateAssignedQuantitySchema = z.object({
    newQuantity: z.number().int().min(0, "כמות חייבת להיות אפס או יותר"),
});
type UpdateAssignedQuantityFormData = z.infer<typeof updateAssignedQuantitySchema>;

const linkExistingItemSchema = z.object({
  existingArmoryItemIdToLink: z.string().min(1, "יש לבחור פריט קיים לקשירה"),
});
type LinkExistingItemFormData = z.infer<typeof linkExistingItemSchema>;


export function SoldierDetailClient({
    soldier: initialSoldier,
    initialArmoryItems,
    initialArmoryItemTypes,
    availableNonUniqueItems: initialAvailableNonUniqueItems,
    initialAllExistingArmoryItems
}: SoldierDetailClientProps) {
  const [soldier, setSoldier] = useState<Soldier>(initialSoldier);
  const [armoryItemsForSoldier, setArmoryItemsForSoldier] = useState<ArmoryItem[]>(initialArmoryItems);
  const [allArmoryItemTypes, setAllArmoryItemTypes] = useState<ArmoryItemType[]>(initialArmoryItemTypes);
  const [availableNonUniqueItems, setAvailableNonUniqueItems] = useState(initialAvailableNonUniqueItems);
  const [allExistingArmoryItems, setAllExistingArmoryItems] = useState<ArmoryItem[]>(initialAllExistingArmoryItems);


  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileNameBase, setFileNameBase] = useState<string>("");
  const [fileNameExt, setFileNameExt] = useState<string>("");
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const armoryItemFileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const [isEditSoldierDialogOpen, setIsEditSoldierDialogOpen] = useState(false);
  const [isAddOrLinkUniqueArmoryItemDialogOpen, setIsAddOrLinkUniqueArmoryItemDialogOpen] = useState(false);
  const [selectedItemTypeForSoldierPageIsUnique, setSelectedItemTypeForSoldierPageIsUnique] = useState<boolean | null>(null);
  const [allDivisions, setAllDivisions] = useState<Division[]>([]);

  const [isScanningArmoryItem, setIsScanningArmoryItem] = useState(false);
  const [scannedArmoryImagePreview, setScannedArmoryImagePreview] = useState<string | null>(null);

  const [isAssignNonUniqueDialogOpen, setIsAssignNonUniqueDialogOpen] = useState(false);
  const [isUpdateQuantityDialogOpen, setIsUpdateQuantityDialogOpen] = useState(false);
  const [itemToUpdateAssignment, setItemToUpdateAssignment] = useState<ArmoryItem | null>(null);

  const [addOrLinkDialogMode, setAddOrLinkDialogMode] = useState<'create' | 'link'>('create');
  const [linkItemSearchTerm, setLinkItemSearchTerm] = useState('');

  const soldierDetailsForm = useForm<SoldierDetailsFormData>({
    resolver: zodResolver(soldierDetailsSchema),
    defaultValues: {
      name: initialSoldier.name,
      divisionId: initialSoldier.divisionId,
    },
  });

  const addUniqueArmoryItemForm = useForm<ArmoryItemFormDataOnSoldierPage>({
    resolver: zodResolver(armoryItemSchemaOnSoldierPage),
    defaultValues: { itemTypeId: "", itemId: "", photoDataUri: undefined, isStored: true, shelfNumber: ""},
  });
  
  const linkExistingItemForm = useForm<LinkExistingItemFormData>({
    resolver: zodResolver(linkExistingItemSchema),
    defaultValues: { existingArmoryItemIdToLink: "" },
  });

  const watchedItemIdToLinkForButton = useWatch({
    control: linkExistingItemForm.control,
    name: "existingArmoryItemIdToLink",
  });

  const assignNonUniqueForm = useForm<AssignNonUniqueFormData>({
    resolver: zodResolver(assignNonUniqueSchema),
    defaultValues: { selectedArmoryItemId: "", quantityToAssign: 1}
  });
  const selectedArmoryItemIdForAssignment = useWatch({control: assignNonUniqueForm.control, name: "selectedArmoryItemId"});
  const selectedNonUniqueItemForDialog = availableNonUniqueItems.find(item => item.id === selectedArmoryItemIdForAssignment);


  const updateAssignedQuantityForm = useForm<UpdateAssignedQuantityFormData>({
    resolver: zodResolver(updateAssignedQuantitySchema),
    defaultValues: { newQuantity: 1}
  });

  const addUniqueFormIsStored = addUniqueArmoryItemForm.watch("isStored");


  useEffect(() => {
    setSoldier(initialSoldier);
    soldierDetailsForm.reset({
        name: initialSoldier.name,
        divisionId: initialSoldier.divisionId,
    });
  }, [initialSoldier, soldierDetailsForm]);

  useEffect(() => {
    setArmoryItemsForSoldier(initialArmoryItems);
  }, [initialArmoryItems]);

  useEffect(() => {
    setAllArmoryItemTypes(initialArmoryItemTypes.sort((a,b) => a.name.localeCompare(b.name)));
  }, [initialArmoryItemTypes]);

  useEffect(() => {
    setAvailableNonUniqueItems(initialAvailableNonUniqueItems);
  }, [initialAvailableNonUniqueItems]);
  
  useEffect(() => {
    setAllExistingArmoryItems(initialAllExistingArmoryItems);
  }, [initialAllExistingArmoryItems]);


  useEffect(() => {
    async function fetchDivisionsData() {
        if (isEditSoldierDialogOpen) {
            try {
                const divisions = await getDivisions();
                setAllDivisions(divisions.sort((a,b) => a.name.localeCompare(b.name)));
            } catch (error) {
                toast({ variant: "destructive", title: "שגיאה", description: "טעינת רשימת הפלוגות נכשלה." });
            }
        }
    }
    fetchDivisionsData();
  }, [isEditSoldierDialogOpen, toast]);

  const currentItemTypeId = addUniqueArmoryItemForm.watch("itemTypeId");
  useEffect(() => {
    if (currentItemTypeId) {
      const type = allArmoryItemTypes.find(t => t.id === currentItemTypeId);
      const isUnique = type ? type.isUnique : null;
      setSelectedItemTypeForSoldierPageIsUnique(isUnique);
      (window as any).__SELECTED_ITEM_TYPE_IS_UNIQUE_SOLDIER_PAGE__ = isUnique;
      if (type && type.isUnique) {
        const currentIsStored = addUniqueArmoryItemForm.getValues("isStored");
        addUniqueArmoryItemForm.setValue("isStored", currentIsStored === undefined ? true : currentIsStored); 
        if (currentIsStored === false) {
            addUniqueArmoryItemForm.setValue("shelfNumber", "");
        }
      } else {
        addUniqueArmoryItemForm.setValue("shelfNumber", "");
      }
    } else {
      setSelectedItemTypeForSoldierPageIsUnique(null);
      (window as any).__SELECTED_ITEM_TYPE_IS_UNIQUE_SOLDIER_PAGE__ = null;
      addUniqueArmoryItemForm.setValue("shelfNumber", "");
    }
  }, [currentItemTypeId, addUniqueFormIsStored, allArmoryItemTypes, addUniqueArmoryItemForm]);


  useEffect(() => {
    if (!isAddOrLinkUniqueArmoryItemDialogOpen) {
      addUniqueArmoryItemForm.reset({ itemTypeId: "", itemId: "", photoDataUri: undefined, isStored: true, shelfNumber: ""});
      linkExistingItemForm.reset({ existingArmoryItemIdToLink: "" });
      setScannedArmoryImagePreview(null);
      setSelectedItemTypeForSoldierPageIsUnique(null);
      (window as any).__SELECTED_ITEM_TYPE_IS_UNIQUE_SOLDIER_PAGE__ = null;
      (window as any).__SOLDIER_PAGE_ARMORY_DIALOG_MODE__ = 'create'; 
      setAddOrLinkDialogMode('create');
      setLinkItemSearchTerm('');
      if (armoryItemFileInputRef.current) armoryItemFileInputRef.current.value = "";
    } else {
        if (addOrLinkDialogMode === 'create') {
            linkExistingItemForm.reset({ existingArmoryItemIdToLink: "" });
            setLinkItemSearchTerm('');
            addUniqueArmoryItemForm.reset({ itemTypeId: "", itemId: "", photoDataUri: undefined, isStored: true, shelfNumber: ""}); 
        } else if (addOrLinkDialogMode === 'link') {
            addUniqueArmoryItemForm.reset({ itemTypeId: "", itemId: "", photoDataUri: undefined, isStored: true, shelfNumber: ""});
            setScannedArmoryImagePreview(null);
            setSelectedItemTypeForSoldierPageIsUnique(null);
            linkExistingItemForm.reset({ existingArmoryItemIdToLink: "" }); 
            setLinkItemSearchTerm('');
        }
    }
  }, [isAddOrLinkUniqueArmoryItemDialogOpen, addOrLinkDialogMode, addUniqueArmoryItemForm, linkExistingItemForm]);

  useEffect(() => {
    if(!isAssignNonUniqueDialogOpen) {
        assignNonUniqueForm.reset({selectedArmoryItemId: "", quantityToAssign: 1});
    }
  }, [isAssignNonUniqueDialogOpen, assignNonUniqueForm]);

  useEffect(() => {
    if (isUpdateQuantityDialogOpen && itemToUpdateAssignment) {
        const currentQty = itemToUpdateAssignment._currentSoldierAssignedQuantity || 1;
        updateAssignedQuantityForm.reset({ newQuantity: currentQty });
    } else if (!isUpdateQuantityDialogOpen) {
        setItemToUpdateAssignment(null);
        updateAssignedQuantityForm.reset({newQuantity: 1});
    }
  }, [isUpdateQuantityDialogOpen, itemToUpdateAssignment, updateAssignedQuantityForm]);
  
  useEffect(() => {
    (window as any).__SOLDIER_PAGE_ARMORY_DIALOG_MODE__ = addOrLinkDialogMode;
  }, [addOrLinkDialogMode]);


  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
        const file = event.target.files[0];
        setSelectedFile(file);
        
        const nameParts = file.name.split('.');
        const ext = nameParts.length > 1 ? "." + nameParts.pop() : "";
        const base = nameParts.join('.');
        
        setFileNameBase(""); 
        setFileNameExt(ext);
    } else {
        setSelectedFile(null);
        setFileNameBase("");
        setFileNameExt("");
    }
  };

  const handleDocumentUpload = async () => {
    if (!selectedFile || !soldier) {
        toast({ variant: "destructive", title: "שגיאה", description: "יש לבחור חייל וקובץ להעלאה."});
        return;
    }
    if (!fileNameBase.trim()) {
        toast({ variant: "destructive", title: "שגיאה", description: "שם הקובץ (ללא סיומת) הינו שדה חובה."});
        return;
    }
    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", selectedFile);
    const finalFileName = fileNameBase.trim() + fileNameExt;
    formData.append("customFileName", finalFileName);

    try {
      const newDocument = await uploadSoldierDocument(soldier.id, formData);
      setSoldier(prev => {
        if (!prev) return prev; 
        const updatedDocs = [...(prev.documents || []), newDocument];
        return { ...prev, documents: updatedDocs };
      });
      toast({ title: "הצלחה", description: `מסמך '${newDocument.fileName}' הועלה בהצלחה.` });
      setSelectedFile(null);
      setFileNameBase("");
      setFileNameExt("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (error: any) {
      console.error("--- CLIENT-SIDE ERROR (handleDocumentUpload SoldierDetailClient) ---");
      console.error("Error object received by client:", error);
      if (error && typeof error === 'object' && error.message) {
        console.error("Client-side error message:", error.message);
      } else {
        console.error("Raw error:", error);
      }
      console.error("---------------------------------------------------------------------");
      toast({ variant: "destructive", title: "שגיאת העלאה", description: error.message || "העלאת מסמך נכשלה. בדוק את הלוגים לפרטים נוספים." });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDocumentDelete = async (documentId: string, storagePath: string) => {
    if (!soldier) return;
    try {
      await deleteSoldierDocument(soldier.id, documentId, storagePath);
      const updatedDocs = soldier.documents?.filter(doc => doc.id !== documentId);
      setSoldier(prev => prev ? { ...prev, documents: updatedDocs } : null); 
      toast({ title: "הצלחה", description: "המסמך נמחק." });
    } catch (error: any) {
      console.error("Client-side document delete error details (SoldierDetailClient):", error);
      toast({ variant: "destructive", title: "שגיאת מחיקה", description: error.message || "מחיקת מסמך נכשלה." });
    }
  };

  const handleUpdateSoldierDetails = async (values: SoldierDetailsFormData) => {
    if (!soldier) return;
    try {
        await updateSoldier(soldier.id, { name: values.name, divisionId: values.divisionId });
        const updatedDivision = allDivisions.find(d => d.id === values.divisionId);
        setSoldier(prev => ({
            ...prev!, 
            name: values.name,
            divisionId: values.divisionId,
            divisionName: updatedDivision?.name || "לא משויך"
        }));
        toast({ title: "הצלחה", description: "פרטי החייל עודכנו."});
        setIsEditSoldierDialogOpen(false);
    } catch (error: any) {
        toast({ variant: "destructive", title: "שגיאה", description: error.message || "עדכון פרטי חייל נכשל." });
    }
  };

  const handleArmoryItemFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setIsScanningArmoryItem(true);
      const reader = new FileReader();
      reader.onloadend = async () => {
        const dataUri = reader.result as string;
        setScannedArmoryImagePreview(dataUri);
        addUniqueArmoryItemForm.setValue("photoDataUri", dataUri);
        try {
          const result = await scanArmoryItemImage(dataUri);

          const currentItemTypeId = addUniqueArmoryItemForm.getValues("itemTypeId");
          const currentItemType = allArmoryItemTypes.find(t => t.id === currentItemTypeId);

          if (currentItemType && currentItemType.isUnique) {
            addUniqueArmoryItemForm.setValue("itemId", result.itemId);
          } else if (!currentItemType && selectedItemTypeForSoldierPageIsUnique === true) { 
             addUniqueArmoryItemForm.setValue("itemId", result.itemId);
          }

          const matchedType = allArmoryItemTypes.find(type => type.name.toLowerCase() === result.itemType.toLowerCase());
          if (matchedType) {
            if (matchedType.isUnique) { 
                addUniqueArmoryItemForm.setValue("itemTypeId", matchedType.id);
                setSelectedItemTypeForSoldierPageIsUnique(matchedType.isUnique);
                (window as any).__SELECTED_ITEM_TYPE_IS_UNIQUE_SOLDIER_PAGE__ = matchedType.isUnique;
                if (matchedType.isUnique) { 
                    addUniqueArmoryItemForm.setValue("itemId", result.itemId);
                    addUniqueArmoryItemForm.setValue("isStored", true); // Default to stored on scan success for unique
                }
                addUniqueArmoryItemForm.trigger(["itemTypeId", "itemId", "isStored"]);
                toast({ title: "סריקה הושלמה", description: `זוהה סוג: ${matchedType.name}, מספר סריאלי: ${result.itemId}` });
            } else {
                toast({ variant: "default", title: "סריקה - מידע נוסף", description: `זוהה מספר סריאלי: ${result.itemId}. סוג הפריט '${result.itemType}' שזוהה אינו ייחודי. יש לבחור סוג פריט ייחודי מהרשימה.` });
            }
          } else {
             toast({ variant: "default", title: "סריקה - נדרשת פעולה", description: `מספר סריאלי זוהה: ${result.itemId}. סוג פריט '${result.itemType}' לא נמצא ברשימה. אנא בחר סוג ייחודי קיים.` });
          }
        } catch (error: any) {
          toast({ variant: "destructive", title: "שגיאת סריקה", description: error.message || "זיהוי הפריט נכשל." });
        } finally {
          setIsScanningArmoryItem(false);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCreateNewUniqueArmoryItem = async (values: ArmoryItemFormDataOnSoldierPage) => {
    if (!soldier) return;
    const type = allArmoryItemTypes.find(t => t.id === values.itemTypeId);
    if (!type || !type.isUnique) {
      toast({ variant: "destructive", title: "שגיאה", description: "יש לבחור סוג פריט ייחודי חוקי." });
      return;
    }
    (window as any).__SELECTED_ITEM_TYPE_IS_UNIQUE_SOLDIER_PAGE__ = type.isUnique; 
    (window as any).__SOLDIER_PAGE_ARMORY_DIALOG_MODE__ = 'create';


    const validationResult = armoryItemSchemaOnSoldierPage.safeParse(values);
     if (!validationResult.success) {
        validationResult.error.errors.forEach(err => {
            toast({ variant: "destructive", title: "שגיאת קלט", description: `${err.path.join('.')}: ${err.message}`});
        });
        return;
    }
    const validatedValues = validationResult.data;

    try {
      const dataToSave: Omit<ArmoryItem, 'id' | 'itemTypeName' | 'linkedSoldierName' | 'linkedSoldierDivisionName' | 'createdAt' | 'totalQuantity' | 'assignments' | '_currentSoldierAssignedQuantity'> = {
        itemTypeId: validatedValues.itemTypeId,
        isUniqueItem: true, 
        itemId: validatedValues.itemId,
        linkedSoldierId: soldier.id,
        imageUrl: validatedValues.photoDataUri || undefined,
        isStored: validatedValues.isStored !== undefined ? validatedValues.isStored : true,
        shelfNumber: (validatedValues.isStored && validatedValues.shelfNumber && validatedValues.shelfNumber.trim() !== "") ? validatedValues.shelfNumber.trim() : undefined,
      };
       if (dataToSave.isStored === false) dataToSave.shelfNumber = undefined;


      const newItemServer = await addArmoryItem(dataToSave);

      const newItemForState: ArmoryItem = {
        id: newItemServer.id,
        itemTypeId: newItemServer.itemTypeId,
        itemTypeName: type.name,
        isUniqueItem: true,
        itemId: newItemServer.itemId,
        linkedSoldierId: soldier.id,
        linkedSoldierName: soldier.name,
        linkedSoldierDivisionName: soldier.divisionName,
        imageUrl: newItemServer.imageUrl,
        isStored: newItemServer.isStored,
        shelfNumber: (newItemServer.isStored && newItemServer.shelfNumber) ? newItemServer.shelfNumber : undefined,
      };

      setArmoryItemsForSoldier(prev => [...prev, newItemForState]);
      setAllExistingArmoryItems(prev => [...prev, newItemForState]); 

      toast({ title: "הצלחה", description: `פריט מחסן (${type.name}) נוסף ושויך לחייל.` });
      setIsAddOrLinkUniqueArmoryItemDialogOpen(false);

    } catch (error: any) {
      toast({ variant: "destructive", title: "שגיאה", description: error.message || "הוספת פריט מחסן נכשלה." });
    }
  };
  
  const handleLinkExistingUniqueArmoryItem = async (values: LinkExistingItemFormData) => {
    if (!soldier) return;
    const itemIdToLink = values.existingArmoryItemIdToLink;
    const itemToLink = allExistingArmoryItems.find(item => item.id === itemIdToLink);

    if (!itemToLink || !itemToLink.isUniqueItem || itemToLink.linkedSoldierId) {
        toast({variant: "destructive", title: "שגיאה", description: "הפריט הנבחר אינו פריט ייחודי פנוי."});
        return;
    }
    
    try {
        const updatesForItem: Partial<ArmoryItem> = {
            linkedSoldierId: soldier.id,
        };
        
        updatesForItem.isStored = false; 
        updatesForItem.shelfNumber = undefined;


        await updateArmoryItem(itemIdToLink, updatesForItem);
        
        const updatedItemForSoldierList: ArmoryItem = {
            ...itemToLink,
            linkedSoldierId: soldier.id,
            linkedSoldierName: soldier.name,
            linkedSoldierDivisionName: soldier.divisionName,
            isStored: updatesForItem.isStored,
            shelfNumber: updatesForItem.shelfNumber,
        };
        setArmoryItemsForSoldier(prev => [...prev, updatedItemForSoldierList]);

        setAllExistingArmoryItems(prev => prev.map(item => 
            item.id === itemIdToLink 
            ? { ...item, 
                linkedSoldierId: soldier.id, 
                linkedSoldierName: soldier.name, 
                linkedSoldierDivisionName: soldier.divisionName,
                isStored: updatesForItem.isStored,
                shelfNumber: updatesForItem.shelfNumber,
              } 
            : item
        ));
        
        toast({ title: "הצלחה", description: `פריט "${itemToLink.itemTypeName} - ${itemToLink.itemId}" קושר לחייל.`});
        setIsAddOrLinkUniqueArmoryItemDialogOpen(false);
    } catch (error: any) {
        toast({ variant: "destructive", title: "שגיאה", description: error.message || "קשירת פריט קיים נכשלה."});
    }
  };

  const handleUnlinkUniqueItemAndStore = async (armoryItemId: string) => {
    if (!soldier) return;
    try {
        await updateArmoryItem(armoryItemId, { 
            linkedSoldierId: null,
            isStored: true 
        });

        setArmoryItemsForSoldier(prev => prev.filter(item => item.id !== armoryItemId));
        
        setAllExistingArmoryItems(prev => prev.map(item => 
            item.id === armoryItemId 
            ? { 
                ...item, 
                linkedSoldierId: null, 
                linkedSoldierName: undefined, 
                linkedSoldierDivisionName: undefined,
                isStored: true 
              } 
            : item
        ));

        toast({ title: "הצלחה", description: "הפריט נותק מהחייל ואוחסן." });
    } catch (error: any) {
        toast({ variant: "destructive", title: "שגיאה", description: error.message || "ביטול שיוך ואחסון הפריט נכשל." });
    }
  };

  const handleAssignNonUniqueItem = async (values: AssignNonUniqueFormData) => {
    if (!soldier) return;
    try {
        await manageSoldierAssignmentToNonUniqueItem(values.selectedArmoryItemId, soldier.id, values.quantityToAssign);

        const updatedSoldierItems = await getArmoryItemsBySoldierId(soldier.id);
        setArmoryItemsForSoldier(updatedSoldierItems);

        const allItems = await getArmoryItems(); 
        const updatedAvailableNonUnique = allItems.filter(item => !item.isUniqueItem).map(item => {
            const totalAssigned = item.assignments?.reduce((sum, asgn) => sum + asgn.quantity, 0) || 0;
            return { ...item, availableQuantity: (item.totalQuantity || 0) - totalAssigned };
        }).filter(item => (item.availableQuantity !== undefined && item.availableQuantity > 0) || (item.assignments && item.assignments.some(a => a.soldierId === soldier.id && a.quantity > 0)));
        setAvailableNonUniqueItems(updatedAvailableNonUnique as Array<ArmoryItem & { availableQuantity: number }>);

        toast({title: "הצלחה", description: "הפריט הוקצה לחייל."});
        setIsAssignNonUniqueDialogOpen(false);
    } catch (error: any) {
        toast({ variant: "destructive", title: "שגיאת הקצאה", description: error.message || "הקצאת הפריט נכשלה." });
    }
  };

  const handleUpdateAssignedQuantity = async (values: UpdateAssignedQuantityFormData) => {
    if (!itemToUpdateAssignment || !soldier) return;
    try {
        await manageSoldierAssignmentToNonUniqueItem(itemToUpdateAssignment.id, soldier.id, values.newQuantity);
        const updatedSoldierItems = await getArmoryItemsBySoldierId(soldier.id);
        setArmoryItemsForSoldier(updatedSoldierItems);

        const allItems = await getArmoryItems();
        const updatedAvailableNonUnique = allItems.filter(item => !item.isUniqueItem).map(item => {
            const totalAssigned = item.assignments?.reduce((sum,a)=> a.soldierId !== soldier.id ? sum + a.quantity : sum, 0) || 0;
            return { ...item, availableQuantity: (item.totalQuantity || 0) - totalAssigned };
        }).filter(item => (item.availableQuantity !== undefined && item.availableQuantity > 0) || (item.assignments && item.assignments.some(a => a.soldierId === soldier.id && a.quantity > 0)));
        setAvailableNonUniqueItems(updatedAvailableNonUnique as Array<ArmoryItem & { availableQuantity: number }>);

        toast({title: "הצלחה", description: "כמות הפריט עודכנה."});
        setIsUpdateQuantityDialogOpen(false);
    } catch (error: any) {
        toast({ variant: "destructive", title: "שגיאת עדכון", description: error.message || "עדכון כמות נכשל." });
    }
  };

  const handleUnassignNonUniqueItem = async (itemIdToUnassign: string) => {
     if (!soldier) return;
     try {
        await manageSoldierAssignmentToNonUniqueItem(itemIdToUnassign, soldier.id, 0); 
        const updatedSoldierItems = await getArmoryItemsBySoldierId(soldier.id);
        setArmoryItemsForSoldier(updatedSoldierItems);

        const allItems = await getArmoryItems();
        const updatedAvailableNonUnique = allItems.filter(item => !item.isUniqueItem).map(item => {
            const totalAssigned = item.assignments?.reduce((sum, asgn) => sum + asgn.quantity, 0) || 0;
            return { ...item, availableQuantity: (item.totalQuantity || 0) - totalAssigned };
        }).filter(item => (item.availableQuantity !== undefined && item.availableQuantity > 0) || (item.assignments && item.assignments.some(a => a.soldierId === soldier.id && a.quantity > 0)));
        setAvailableNonUniqueItems(updatedAvailableNonUnique as Array<ArmoryItem & { availableQuantity: number }>);

        toast({title: "הצלחה", description: "הקצאת הפריט בוטלה."});
    } catch (error: any) {
        toast({ variant: "destructive", title: "שגיאת ביטול הקצאה", description: error.message || "ביטול הקצאה נכשל." });
    }
  }


  const formatFileSize = (bytes: number, decimals = 2) => {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  const formatDate = (timestampInput: string | Date | Timestamp | undefined): string => {
    if (!timestampInput) return 'לא זמין';
    let date: Date;

    if (typeof timestampInput === 'string') {
      date = new Date(timestampInput);
    } else if (timestampInput instanceof Date) {
      date = timestampInput;
    } else if (timestampInput && typeof (timestampInput as any).toDate === 'function') { // For Firestore Timestamps
      date = (timestampInput as any).toDate();
    } else if (typeof timestampInput === 'object' && 'seconds' in timestampInput && 'nanoseconds' in timestampInput) { // For Firestore-like Timestamp objects from server
      date = new Date((timestampInput as any).seconds * 1000 + (timestampInput as any).nanoseconds / 1000000);
    }
     else {
      console.warn("Invalid date input to formatDate (SoldierDetailClient):", timestampInput);
      return 'תאריך לא תקין';
    }

    if (isNaN(date.getTime())) {
      console.warn("Parsed date is invalid in formatDate (SoldierDetailClient):", date, "from input:", timestampInput);
      return 'תאריך לא תקין';
    }
    return date.toLocaleDateString('he-IL', { year: 'numeric', month: '2-digit', day: '2-digit' });
  };
  
  const availableUniqueItemsToLink = useMemo(() => {
    return allExistingArmoryItems
        .filter(item => 
            item.isUniqueItem && 
            !item.linkedSoldierId &&
            (!linkItemSearchTerm || (item.itemId || '').toLowerCase().includes(linkItemSearchTerm.toLowerCase()) || (item.itemTypeName || '').toLowerCase().includes(linkItemSearchTerm.toLowerCase()) || (item.shelfNumber && item.isStored && item.shelfNumber.toLowerCase().includes(linkItemSearchTerm.toLowerCase())))
        )
        .sort((a,b) => (a.itemTypeName || "").localeCompare(b.itemTypeName || "") || (a.itemId || "").localeCompare(b.itemId || ""));
  }, [allExistingArmoryItems, linkItemSearchTerm]);

  if (!soldier) return <p>טוען פרטי חייל...</p>;

  const uniqueItemsAssigned = armoryItemsForSoldier.filter(item => item.isUniqueItem);
  const nonUniqueItemsAssigned = armoryItemsForSoldier.filter(item => !item.isUniqueItem && item._currentSoldierAssignedQuantity && item._currentSoldierAssignedQuantity > 0);


  return (
    <div className="grid md:grid-cols-3 gap-8">
      <Card className="md:col-span-1">
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
                <CardTitle className="flex items-center gap-2"><UserCircle className="w-7 h-7 text-primary"/> {soldier.name}</CardTitle>
                <CardDescription>מ.א.: {soldier.id}</CardDescription>
                <CardDescription>פלוגה: {soldier.divisionName || "לא משויך"}</CardDescription>
            </div>
            <Dialog open={isEditSoldierDialogOpen} onOpenChange={setIsEditSoldierDialogOpen}>
                <DialogTrigger asChild>
                    <Button variant="ghost" size="icon"><Edit3 className="w-4 h-4" /></Button>
                </DialogTrigger>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>ערוך פרטי חייל</DialogTitle>
                        <DialogDescription>עדכן את שם החייל או הפלוגה אליה הוא משויך.</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={soldierDetailsForm.handleSubmit(handleUpdateSoldierDetails)} className="space-y-4 mt-4">
                        <div>
                            <Label htmlFor="editSoldierName">שם מלא</Label>
                            <Input id="editSoldierName" {...soldierDetailsForm.register("name")} />
                            {soldierDetailsForm.formState.errors.name && <p className="text-destructive text-sm">{soldierDetailsForm.formState.errors.name.message}</p>}
                        </div>
                        <div>
                            <Label htmlFor="editSoldierDivision">פלוגה</Label>
                            <Controller
                            name="divisionId"
                            control={soldierDetailsForm.control}
                            render={({ field }) => (
                                <Select onValueChange={field.onChange} value={field.value || ""} defaultValue={field.value || ""}>
                                <SelectTrigger>
                                    <SelectValue placeholder="בחר פלוגה..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {allDivisions.map(div => (
                                    <SelectItem key={div.id} value={div.id}>{div.name}</SelectItem>
                                    ))}
                                    <SelectItem value="unassigned">לא משויך</SelectItem>
                                </SelectContent>
                                </Select>
                            )}
                            />
                            {soldierDetailsForm.formState.errors.divisionId && <p className="text-destructive text-sm">{soldierDetailsForm.formState.errors.divisionId.message}</p>}
                        </div>
                        <DialogFooter>
                            <DialogClose asChild><Button type="button" variant="outline">ביטול</Button></DialogClose>
                            <Button type="submit">שמור שינויים</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
        </CardContent>
      </Card>

      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle>מסמכים מצורפים</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="soldierDocumentUpload">העלאת מסמך חדש</Label>
            <div className="flex items-center gap-2 mt-1">
              <Input
                id="soldierDocumentUpload"
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                className="flex-grow"
              />
            </div>
          </div>
          {selectedFile && (
            <div className="mt-2 space-y-1">
                <Label htmlFor="editableFileNameSoldierPage">שם הקובץ (ללא סיומת) - חובה</Label>
                <Input
                    id="editableFileNameSoldierPage"
                    type="text"
                    value={fileNameBase}
                    onChange={(e) => setFileNameBase(e.target.value)}
                    placeholder="הכנס שם קובץ"
                    className="mt-1"
                />
                {fileNameExt && (
                    <p className="text-xs text-muted-foreground">סיומת: {fileNameExt}</p>
                )}
                {fileNameBase.trim() && fileNameExt && (
                     <p className="text-xs text-muted-foreground">שם קובץ מלא צפוי: {fileNameBase.trim() + fileNameExt}</p>
                )}
            </div>
          )}
          <Button
            type="button"
            onClick={handleDocumentUpload}
            disabled={!selectedFile || isUploading || !fileNameBase.trim()}
            className="mt-2"
          >
            {isUploading ? <RefreshCw className="animate-spin h-4 w-4 ms-2" /> : <Upload className="h-4 w-4 ms-2" />}
            העלה מסמך
          </Button>

          {soldier.documents && soldier.documents.length > 0 ? (
            <ScrollArea className="h-[250px] border rounded-md p-2 mt-4">
              <ul className="space-y-2">
                {soldier.documents.map((doc) => (
                  <li key={doc.id} className="flex items-center justify-between p-2 hover:bg-muted/50 rounded">
                    <div className="flex items-center gap-2">
                      <FileText className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <a href={doc.downloadURL} target="_blank" rel="noopener noreferrer" className="font-medium hover:underline text-sm">
                          {doc.fileName}
                        </a>
                        <p className="text-xs text-muted-foreground">
                          {formatFileSize(doc.fileSize)} | {doc.fileType} | הועלה: {formatDate(doc.uploadedAt)}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" asChild className="h-7 w-7">
                        <a href={doc.downloadURL} target="_blank" rel="noopener noreferrer" download={doc.fileName}>
                          <Download className="h-4 w-4" />
                        </a>
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>אישור מחיקת מסמך</AlertDialogTitle>
                            <AlertDialogDescription>
                              האם אתה בטוח שברצונך למחוק את המסמך "{doc.fileName}"? פעולה זו אינה הפיכה.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>ביטול</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDocumentDelete(doc.id, doc.storagePath)} className="bg-destructive hover:bg-destructive/90">מחק</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4 mt-4">אין מסמכים מצורפים לחייל זה.</p>
          )}
        </CardContent>
      </Card>

      <Card className="md:col-span-3">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle>פריטי מחסן משויכים</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
            <div>
                <div className="flex justify-between items-center mb-2">
                    <h3 className="text-lg font-semibold">פריטים ייחודיים ({uniqueItemsAssigned.length})</h3>
                    <Dialog open={isAddOrLinkUniqueArmoryItemDialogOpen} onOpenChange={setIsAddOrLinkUniqueArmoryItemDialogOpen}>
                        <DialogTrigger asChild>
                            <Button size="sm"><PlusCircle className="ms-2 h-4 w-4" /> הוסף/קשר פריט ייחודי</Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[525px]">
                            <DialogHeader>
                                <DialogTitle>הוסף או קשר פריט מחסן ייחודי</DialogTitle>
                                <DialogDescription>צור פריט ייחודי חדש או קשר פריט ייחודי קיים לחייל {soldier.name}.</DialogDescription>
                            </DialogHeader>
                            <RadioGroup defaultValue="create" className="my-4" value={addOrLinkDialogMode} onValueChange={(value: 'create' | 'link') => {
                                setAddOrLinkDialogMode(value);
                                if (value === 'create') {
                                    linkExistingItemForm.reset({ existingArmoryItemIdToLink: "" });
                                    setLinkItemSearchTerm('');
                                    addUniqueArmoryItemForm.reset({ itemTypeId: "", itemId: "", photoDataUri: undefined, isStored: true, shelfNumber: ""}); 
                                } else {
                                    addUniqueArmoryItemForm.reset({ itemTypeId: "", itemId: "", photoDataUri: undefined, isStored: true, shelfNumber: ""});
                                    setScannedArmoryImagePreview(null);
                                    setSelectedItemTypeForSoldierPageIsUnique(null);
                                    linkExistingItemForm.reset({ existingArmoryItemIdToLink: "" }); 
                                    setLinkItemSearchTerm('');
                                }
                            }}>
                                <div className="flex items-center space-x-2 rtl:space-x-reverse">
                                    <RadioGroupItem value="create" id="modeCreate" />
                                    <Label htmlFor="modeCreate">צור פריט חדש</Label>
                                </div>
                                <div className="flex items-center space-x-2 rtl:space-x-reverse">
                                    <RadioGroupItem value="link" id="modeLink" />
                                    <Label htmlFor="modeLink">קשר פריט קיים</Label>
                                </div>
                            </RadioGroup>

                            {addOrLinkDialogMode === 'create' && (
                                <form onSubmit={addUniqueArmoryItemForm.handleSubmit(handleCreateNewUniqueArmoryItem)} className="space-y-4 mt-4">
                                    <div>
                                        <Label htmlFor="armoryItemTypeIdSelectSoldierPage">סוג הפריט</Label>
                                        <Controller
                                            name="itemTypeId"
                                            control={addUniqueArmoryItemForm.control}
                                            render={({ field }) => (
                                                <Select
                                                    onValueChange={(value) => {
                                                        field.onChange(value);
                                                        const type = allArmoryItemTypes.find(t => t.id === value);
                                                        setSelectedItemTypeForSoldierPageIsUnique(type ? type.isUnique : null);
                                                        (window as any).__SELECTED_ITEM_TYPE_IS_UNIQUE_SOLDIER_PAGE__ = type ? type.isUnique : null;
                                                        if (type && !type.isUnique) {
                                                            addUniqueArmoryItemForm.setValue("itemTypeId", ""); 
                                                            toast({variant: "destructive", title: "שגיאה", description: "יש לבחור סוג פריט ייחודי בלבד."})
                                                            setSelectedItemTypeForSoldierPageIsUnique(null);
                                                            (window as any).__SELECTED_ITEM_TYPE_IS_UNIQUE_SOLDIER_PAGE__ = null;
                                                        } else if (type && type.isUnique) {
                                                            const currentIsStored = addUniqueArmoryItemForm.getValues("isStored");
                                                            addUniqueArmoryItemForm.setValue("isStored", currentIsStored === undefined ? true : currentIsStored); 
                                                            if (!currentIsStored) { // If not stored (i.e. false), clear shelf number
                                                                addUniqueArmoryItemForm.setValue("shelfNumber", "");
                                                            }
                                                        }
                                                        addUniqueArmoryItemForm.trigger();
                                                    }}
                                                    value={field.value || ""}
                                                >
                                                <SelectTrigger id="armoryItemTypeIdSelectSoldierPage">
                                                    <SelectValue placeholder="בחר סוג פריט ייחודי..." />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {allArmoryItemTypes.filter(type => type.isUnique).map(type => (
                                                    <SelectItem key={type.id} value={type.id}>{type.name} (ייחודי)</SelectItem>
                                                    ))}
                                                </SelectContent>
                                                </Select>
                                            )}
                                        />
                                        {addUniqueArmoryItemForm.formState.errors.itemTypeId && <p className="text-destructive text-sm">{addUniqueArmoryItemForm.formState.errors.itemTypeId.message}</p>}
                                    </div>

                                    {selectedItemTypeForSoldierPageIsUnique === true && (
                                      <>
                                        <div>
                                            <Label htmlFor="armoryItemIdSoldierPage">מספר סריאלי</Label>
                                            <Input id="armoryItemIdSoldierPage" {...addUniqueArmoryItemForm.register("itemId")} />
                                            {addUniqueArmoryItemForm.formState.errors.itemId && <p className="text-destructive text-sm">{addUniqueArmoryItemForm.formState.errors.itemId.message}</p>}
                                        </div>
                                         <div className="flex items-center space-x-2 rtl:space-x-reverse">
                                            <Controller
                                                name="isStored"
                                                control={addUniqueArmoryItemForm.control}
                                                render={({ field }) => (
                                                    <Checkbox
                                                        id="isStoredNewItemSoldierPage"
                                                        checked={!!field.value} 
                                                        onCheckedChange={(checked) => {
                                                            field.onChange(checked);
                                                            if (checked === false) {
                                                                addUniqueArmoryItemForm.setValue("shelfNumber", "");
                                                            }
                                                            addUniqueArmoryItemForm.trigger("shelfNumber");
                                                        }}
                                                    />
                                                )}
                                            />
                                            <Label htmlFor="isStoredNewItemSoldierPage" className="text-sm font-normal">הפריט מאוחסן</Label>
                                        </div>
                                        {addUniqueFormIsStored && selectedItemTypeForSoldierPageIsUnique === true && (
                                            <div>
                                                <Label htmlFor="shelfNumberSoldierPage">מספר מדף (אופציונלי)</Label>
                                                <Input id="shelfNumberSoldierPage" {...addUniqueArmoryItemForm.register("shelfNumber")} />
                                                {addUniqueArmoryItemForm.formState.errors.shelfNumber && <p className="text-destructive text-sm">{addUniqueArmoryItemForm.formState.errors.shelfNumber.message}</p>}
                                            </div>
                                        )}
                                      </>
                                    )}

                                    {selectedItemTypeForSoldierPageIsUnique === true && ( 
                                        <div>
                                            <Label htmlFor="armoryItemImageSoldierPage">תמונת פריט (לסריקה)</Label>
                                            <div className="flex items-center gap-2">
                                            <Input id="armoryItemImageSoldierPage" type="file" accept="image/*" ref={armoryItemFileInputRef} onChange={handleArmoryItemFileChange} className="flex-grow"/>
                                            <Button type="button" variant="outline" size="icon" onClick={() => armoryItemFileInputRef.current?.click()} disabled={isScanningArmoryItem}>
                                                {isScanningArmoryItem ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                                            </Button>
                                            </div>
                                        </div>
                                    )}
                                    {scannedArmoryImagePreview && (
                                    <div className="mt-2 border rounded-md p-2 flex justify-center items-center h-32 overflow-hidden">
                                        <Image src={scannedArmoryImagePreview} alt="תצוגה מקדימה" width={100} height={100} className="object-contain max-h-full" data-ai-hint="equipment military"/>
                                    </div>
                                    )}
                                    <DialogFooter>
                                    <DialogClose asChild><Button type="button" variant="outline">ביטול</Button></DialogClose>
                                    <Button type="submit" disabled={isScanningArmoryItem || selectedItemTypeForSoldierPageIsUnique !== true}>
                                        {isScanningArmoryItem ? "סורק..." : "הוסף פריט"}
                                    </Button>
                                    </DialogFooter>
                                </form>
                            )}
                            {addOrLinkDialogMode === 'link' && (
                                <form onSubmit={linkExistingItemForm.handleSubmit(handleLinkExistingUniqueArmoryItem)} className="space-y-4 mt-4">
                                    <div>
                                        <Label htmlFor="existingArmoryItemIdToLinkSelect">בחר פריט קיים (ייחודי, לא משויך)</Label>
                                        <Controller
                                            name="existingArmoryItemIdToLink"
                                            control={linkExistingItemForm.control}
                                            render={({ field }) => (
                                                <Select
                                                    onValueChange={(value) => {
                                                        field.onChange(value);
                                                    }}
                                                    value={field.value || ""}
                                                >
                                                    <SelectTrigger id="existingArmoryItemIdToLinkSelect">
                                                        <SelectValue placeholder="בחר פריט לקשירה..." />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <div className="p-2 sticky top-0 bg-background z-10">
                                                            <Input 
                                                                placeholder="סנן לפי סוג/מספר סריאלי/מדף..."
                                                                value={linkItemSearchTerm} 
                                                                onChange={(e) => {
                                                                    e.stopPropagation();
                                                                    setLinkItemSearchTerm(e.target.value);
                                                                }}
                                                                onKeyDown={(e) => e.stopPropagation()} 
                                                                className="w-full"
                                                            />
                                                        </div>
                                                        {availableUniqueItemsToLink.length === 0 ? (
                                                            <div className="p-2 text-sm text-muted-foreground text-center">לא נמצאו פריטים ייחודיים פנויים התואמים לחיפוש.</div>
                                                        ) : (
                                                            availableUniqueItemsToLink.map(item => (
                                                                <SelectItem key={item.id} value={item.id}>
                                                                    {item.itemTypeName} - {item.itemId} {item.isStored && item.shelfNumber ? `(מדף: ${item.shelfNumber})` : ""} {item.isStored ? "(מאוחסן)" : ""}
                                                                </SelectItem>
                                                            ))
                                                        )}
                                                    </SelectContent>
                                                </Select>
                                            )}
                                        />
                                        {linkExistingItemForm.formState.errors.existingArmoryItemIdToLink && <p className="text-destructive text-sm">{linkExistingItemForm.formState.errors.existingArmoryItemIdToLink.message}</p>}
                                    </div>
                                    <DialogFooter>
                                        <DialogClose asChild><Button type="button" variant="outline">ביטול</Button></DialogClose>
                                        <Button type="submit" disabled={!watchedItemIdToLinkForButton}>קשר פריט זה</Button>
                                    </DialogFooter>
                                </form>
                            )}
                        </DialogContent>
                    </Dialog>
                </div>
                 {uniqueItemsAssigned.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">אין פריטי מחסן ייחודיים המשויכים לחייל זה.</p>
                ) : (
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {uniqueItemsAssigned.map((item) => (
                        <Card key={item.id}>
                        <CardHeader className="pb-2">
                            {item.imageUrl ? (
                                <div className="relative h-32 w-full mb-2 rounded-md overflow-hidden">
                                    <Image src={item.imageUrl} alt={item.itemTypeName || "Armory Item"} layout="fill" objectFit="cover" data-ai-hint="equipment military"/>
                                </div>
                                ) : (
                                <div className="flex items-center justify-center h-32 w-full mb-2 rounded-md bg-muted">
                                    <PackageSearch className="w-12 h-12 text-muted-foreground" />
                                </div>
                            )}
                            <CardTitle className="text-lg">{item.itemTypeName || "פריט לא מסווג"}</CardTitle>
                            <CardDescription>מס' סריאלי: {item.itemId}</CardDescription>
                            <CardDescription className="flex items-center">
                                {item.isStored ? <PackageX className="w-3.5 h-3.5 me-1.5 text-orange-500" /> : <PackageCheck className="w-3.5 h-3.5 me-1.5 text-green-600" />}
                                סטטוס: {item.isStored ? "מאוחסן" : "מונפק"}
                            </CardDescription>
                            {item.isStored && item.shelfNumber && (
                                <CardDescription className="flex items-center">
                                    <MapPin className="w-3.5 h-3.5 me-1.5 text-muted-foreground" />
                                    מדף: {item.shelfNumber}
                                </CardDescription>
                            )}
                        </CardHeader>
                        <CardFooter className="flex flex-row items-center gap-2">
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button variant="destructive" size="sm" className="flex-1"><Unlink2 className="me-2 h-3.5 w-3.5"/> בטל שיוך ואחסן</Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>אישור ביטול שיוך ואחסון</AlertDialogTitle>
                                        <AlertDialogDescription>
                                            האם אתה בטוח שברצונך לבטל את שיוך הפריט "{item.itemTypeName} ({item.itemId})" מחייל זה ולהעביר אותו למצב "מאוחסן"?
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>לא</AlertDialogCancel>
                                        <AlertDialogAction onClick={() => handleUnlinkUniqueItemAndStore(item.id)} className="bg-destructive hover:bg-destructive/90">כן, בטל שיוך ואחסן</AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                            <Button variant="outline" size="sm" asChild className="flex-1">
                            <Link href={`/armory`}>
                                הצג במחסן
                            </Link>
                            </Button>
                        </CardFooter>
                        </Card>
                    ))}
                    </div>
                )}
            </div>

            <Separator />

            <div>
                <div className="flex justify-between items-center mb-2">
                    <h3 className="text-lg font-semibold">פריטים כמותיים שהוקצו ({nonUniqueItemsAssigned.length})</h3>
                     <Dialog open={isAssignNonUniqueDialogOpen} onOpenChange={setIsAssignNonUniqueDialogOpen}>
                        <DialogTrigger asChild>
                            <Button size="sm"><PlusCircle className="ms-2 h-4 w-4" /> הקצה פריט כמותי</Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-md">
                            <DialogHeader>
                                <DialogTitle>הקצה פריט כמותי לחייל {soldier.name}</DialogTitle>
                            </DialogHeader>
                            <form onSubmit={assignNonUniqueForm.handleSubmit(handleAssignNonUniqueItem)} className="space-y-4 mt-4">
                                <div>
                                    <Label htmlFor="selectedArmoryItemId">בחר פריט (לא ייחודי)</Label>
                                    <Controller
                                        name="selectedArmoryItemId"
                                        control={assignNonUniqueForm.control}
                                        render={({ field }) => (
                                            <Select onValueChange={field.onChange} value={field.value}>
                                                <SelectTrigger id="selectedArmoryItemId">
                                                    <SelectValue placeholder="בחר פריט מהמלאי..." />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {availableNonUniqueItems.length > 0 ? availableNonUniqueItems.map(item => (
                                                        <SelectItem key={item.id} value={item.id}>
                                                            {item.itemTypeName} (זמין: {item.availableQuantity ?? '0'}, סה"כ במלאי: {item.totalQuantity})
                                                        </SelectItem>
                                                    )) : <p className="p-2 text-sm text-muted-foreground">אין פריטים כמותיים זמינים להקצאה.</p>}
                                                </SelectContent>
                                            </Select>
                                        )}
                                    />
                                    {assignNonUniqueForm.formState.errors.selectedArmoryItemId && <p className="text-destructive text-sm">{assignNonUniqueForm.formState.errors.selectedArmoryItemId.message}</p>}
                                </div>
                                <div>
                                    <Label htmlFor="quantityToAssign">כמות להקצאה</Label>
                                    <Input id="quantityToAssign" type="number" {...assignNonUniqueForm.register("quantityToAssign", { valueAsNumber: true })} />
                                    {assignNonUniqueForm.formState.errors.quantityToAssign && <p className="text-destructive text-sm">{assignNonUniqueForm.formState.errors.quantityToAssign.message}</p>}
                                    {selectedNonUniqueItemForDialog && <p className="text-xs text-muted-foreground mt-1">זמין במלאי פריט זה: {selectedNonUniqueItemForDialog.availableQuantity ?? 'N/A'}</p>}
                                </div>
                                <DialogFooter>
                                    <DialogClose asChild><Button type="button" variant="outline">ביטול</Button></DialogClose>
                                    <Button type="submit" disabled={!selectedArmoryItemIdForAssignment}>הקצה פריט</Button>
                                </DialogFooter>
                            </form>
                        </DialogContent>
                    </Dialog>
                </div>
                {nonUniqueItemsAssigned.length === 0 ? (
                     <p className="text-sm text-muted-foreground text-center py-4">לא הוקצו פריטים כמותיים לחייל זה.</p>
                ) : (
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {nonUniqueItemsAssigned.map(item => (
                            <Card key={item.id + "_assigned"}>
                                <CardHeader className="pb-2">
                                     {item.imageUrl ? (
                                        <div className="relative h-32 w-full mb-2 rounded-md overflow-hidden">
                                            <Image src={item.imageUrl} alt={item.itemTypeName || "Armory Item"} layout="fill" objectFit="cover" data-ai-hint="equipment military"/>
                                        </div>
                                        ) : (
                                        <div className="flex items-center justify-center h-32 w-full mb-2 rounded-md bg-muted">
                                            <PackageSearch className="w-12 h-12 text-muted-foreground" />
                                        </div>
                                    )}
                                    <CardTitle className="text-lg">{item.itemTypeName}</CardTitle>
                                    <CardDescription>כמות שהוקצתה: {item._currentSoldierAssignedQuantity}</CardDescription>
                                    <CardDescription className="text-xs">סה"כ במלאי פריט זה: {item.totalQuantity}</CardDescription>
                                </CardHeader>
                                <CardFooter className="flex-col items-stretch gap-2">
                                    <Dialog
                                        open={isUpdateQuantityDialogOpen && itemToUpdateAssignment?.id === item.id}
                                        onOpenChange={(isOpen) => {
                                            if (isOpen) setItemToUpdateAssignment(item);
                                            else setItemToUpdateAssignment(null);
                                            setIsUpdateQuantityDialogOpen(isOpen);
                                        }}
                                    >
                                        <DialogTrigger asChild>
                                            <Button variant="outline" size="sm" className="w-full"><Edit className="me-2 h-3.5 w-3.5" /> שנה כמות</Button>
                                        </DialogTrigger>
                                        <DialogContent className="sm:max-w-xs">
                                            <DialogHeader>
                                                <DialogTitle>עדכן כמות עבור {item.itemTypeName}</DialogTitle>
                                            </DialogHeader>
                                            <form onSubmit={updateAssignedQuantityForm.handleSubmit(handleUpdateAssignedQuantity)} className="space-y-3 mt-2">
                                                <div>
                                                    <Label htmlFor="newQuantity">כמות חדשה (0 לביטול הקצאה)</Label>
                                                    <Input id="newQuantity" type="number" {...updateAssignedQuantityForm.register("newQuantity", { valueAsNumber: true })} />
                                                    {updateAssignedQuantityForm.formState.errors.newQuantity && <p className="text-destructive text-sm">{updateAssignedQuantityForm.formState.errors.newQuantity.message}</p>}
                                                    <p className="text-xs text-muted-foreground mt-1">
                                                        זמין במלאי (לא כולל הקצאה זו): {(item.totalQuantity || 0) - ((item.assignments?.reduce((sum,a)=> a.soldierId !== soldier.id ? sum + a.quantity : sum, 0)) || 0)}
                                                    </p>
                                                </div>
                                                <DialogFooter>
                                                    <DialogClose asChild><Button type="button" variant="ghost">ביטול</Button></DialogClose>
                                                    <Button type="submit">עדכן כמות</Button>
                                                </DialogFooter>
                                            </form>
                                        </DialogContent>
                                    </Dialog>
                                     <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                            <Button variant="destructive" size="sm" className="w-full"><MinusCircle className="me-2 h-3.5 w-3.5"/> בטל הקצאה</Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                            <AlertDialogHeader>
                                            <AlertDialogTitle>אישור ביטול הקצאה</AlertDialogTitle>
                                            <AlertDialogDescription>
                                                האם אתה בטוח שברצונך לבטל את הקצאת הפריט "{item.itemTypeName}" מחייל זה?
                                            </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                            <AlertDialogCancel>לא</AlertDialogCancel>
                                            <AlertDialogAction onClick={() => handleUnassignNonUniqueItem(item.id)} className="bg-destructive hover:bg-destructive/90">כן, בטל הקצאה</AlertDialogAction>
                                            </AlertDialogFooter>
                                        </AlertDialogContent>
                                    </AlertDialog>
                                </CardFooter>
                            </Card>
                        ))}
                    </div>
                )}
            </div>
        </CardContent>
      </Card>
    </div>
  );
}

