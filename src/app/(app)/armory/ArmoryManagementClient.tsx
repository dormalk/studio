
"use client";

import type { ArmoryItem, ArmoryItemType, Soldier } from "@/types";
import { useState, useEffect, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PlusCircle, Trash2, Edit3, Camera, RefreshCw, ListChecks, User, PackageSearch, Building, FileSpreadsheet, Users2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  addArmoryItem,
  deleteArmoryItem,
  updateArmoryItem,
  scanArmoryItemImage,
  addArmoryItemType,
  deleteArmoryItemType,
  updateArmoryItemType,
} from "@/actions/armoryActions";
import { useToast } from "@/hooks/use-toast";
import Image from "next/image";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import * as XLSX from 'xlsx';


const armoryItemBaseSchema = z.object({
  itemTypeId: z.string().min(1, "יש לבחור סוג פריט"),
  itemId: z.string().optional(),
  totalQuantity: z.number().int().positive("כמות חייבת להיות מספר חיובי").optional(),
  photoDataUri: z.string().optional(),
  linkedSoldierId: z.string().optional(),
});

const armoryItemSchema = armoryItemBaseSchema.superRefine((data, ctx) => {
  const isUnique = (window as any).__SELECTED_ITEM_TYPE_IS_UNIQUE__;

  if (isUnique === true) {
    if (!data.itemId || data.itemId.trim() === "") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["itemId"],
        message: "מספר סריאלי הינו שדה חובה עבור פריט ייחודי",
      });
    }
  } else if (isUnique === false) {
    if (data.totalQuantity === undefined || data.totalQuantity === null || data.totalQuantity <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["totalQuantity"],
        message: "כמות במלאי הינה שדה חובה וחייבת להיות גדולה מאפס עבור פריט לא ייחודי",
      });
    }
  }
});


const armoryItemTypeSchema = z.object({
  name: z.string().min(1, "שם סוג פריט הינו שדה חובה"),
  isUnique: z.boolean().default(true),
});

type ArmoryItemFormData = z.infer<typeof armoryItemSchema>;
type ArmoryItemTypeFormData = z.infer<typeof armoryItemTypeSchema>;

interface ArmoryManagementClientProps {
  initialArmoryItems: ArmoryItem[];
  initialArmoryItemTypes: ArmoryItemType[];
  initialSoldiers: Soldier[];
}

const NO_SOLDIER_LINKED_VALUE = "__NO_SOLDIER_LINKED__";

export function ArmoryManagementClient({ initialArmoryItems, initialArmoryItemTypes, initialSoldiers }: ArmoryManagementClientProps) {
  const [armoryItems, setArmoryItems] = useState<ArmoryItem[]>(initialArmoryItems);
  const [armoryItemTypes, setArmoryItemTypes] = useState<ArmoryItemType[]>(initialArmoryItemTypes);
  const [soldiers, setSoldiers] = useState<Soldier[]>(initialSoldiers);

  const [searchTerm, setSearchTerm] = useState("");
  const [filterItemTypeId, setFilterItemTypeId] = useState<string>("all");
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scannedImagePreview, setScannedImagePreview] = useState<string | null>(null);

  const [isItemDialogOpen, setIsItemDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ArmoryItem | null>(null);
  const [selectedItemTypeIsUnique, setSelectedItemTypeIsUnique] = useState<boolean | null>(null);


  const [isItemTypeDialogOpen, setIsItemTypeDialogOpen] = useState(false);
  const [editingItemType, setEditingItemType] = useState<ArmoryItemType | null>(null);

  const itemForm = useForm<ArmoryItemFormData>({
    resolver: zodResolver(armoryItemSchema),
    defaultValues: { itemTypeId: "", itemId: "", totalQuantity: 1, linkedSoldierId: NO_SOLDIER_LINKED_VALUE },
  });

  const itemTypeForm = useForm<ArmoryItemTypeFormData>({
    resolver: zodResolver(armoryItemTypeSchema),
    defaultValues: { name: "", isUnique: true },
  });

  useEffect(() => {
    setArmoryItems(initialArmoryItems);
  }, [initialArmoryItems]);

  useEffect(() => {
    setArmoryItemTypes(initialArmoryItemTypes.sort((a, b) => a.name.localeCompare(b.name)));
  }, [initialArmoryItemTypes]);

  useEffect(() => {
    setSoldiers(initialSoldiers.sort((a,b) => a.name.localeCompare(b.name)));
  }, [initialSoldiers]);

  useEffect(() => {
    const watchedItemTypeId = itemForm.watch("itemTypeId");
    if (watchedItemTypeId) {
      const type = armoryItemTypes.find(t => t.id === watchedItemTypeId);
      setSelectedItemTypeIsUnique(type ? type.isUnique : null);
      (window as any).__SELECTED_ITEM_TYPE_IS_UNIQUE__ = type ? type.isUnique : null;
    } else {
      setSelectedItemTypeIsUnique(null);
      (window as any).__SELECTED_ITEM_TYPE_IS_UNIQUE__ = null;
    }
  }, [itemForm.watch("itemTypeId"), armoryItemTypes, itemForm]);


  useEffect(() => {
    if (editingItem) {
      const type = armoryItemTypes.find(t => t.id === editingItem.itemTypeId);
      const isUnique = type ? type.isUnique : editingItem.isUniqueItem; // Fallback to item's own isUniqueItem if type somehow not found
      setSelectedItemTypeIsUnique(isUnique);
      (window as any).__SELECTED_ITEM_TYPE_IS_UNIQUE__ = isUnique;

      itemForm.reset({
        itemTypeId: editingItem.itemTypeId,
        itemId: isUnique ? editingItem.itemId || "" : "",
        totalQuantity: !isUnique ? editingItem.totalQuantity || 1 : 1,
        linkedSoldierId: isUnique ? (editingItem.linkedSoldierId || NO_SOLDIER_LINKED_VALUE) : NO_SOLDIER_LINKED_VALUE,
        photoDataUri: editingItem.imageUrl || undefined,
      });
      setScannedImagePreview(editingItem.imageUrl || null);
    } else {
      itemForm.reset({ itemTypeId: "", itemId: "", totalQuantity: 1, linkedSoldierId: NO_SOLDIER_LINKED_VALUE, photoDataUri: undefined });
      setSelectedItemTypeIsUnique(null);
      (window as any).__SELECTED_ITEM_TYPE_IS_UNIQUE__ = null;
      setScannedImagePreview(null);
    }
  }, [editingItem, itemForm, isItemDialogOpen, armoryItemTypes]);


  useEffect(() => {
    if (editingItemType) {
      itemTypeForm.reset({ name: editingItemType.name, isUnique: editingItemType.isUnique });
    } else {
      itemTypeForm.reset({ name: "", isUnique: true });
    }
  }, [editingItemType, itemTypeForm, isItemTypeDialogOpen]);


  const filteredArmoryItems = useMemo(() => {
    let itemsToFilter = armoryItems;

    if (filterItemTypeId !== "all") {
        itemsToFilter = itemsToFilter.filter(item => item.itemTypeId === filterItemTypeId);
    }

    if (searchTerm) {
        itemsToFilter = itemsToFilter.filter(item => {
            const term = searchTerm.toLowerCase();
            const typeNameMatch = item.itemTypeName?.toLowerCase().includes(term);
            if (item.isUniqueItem) {
                const itemIdMatch = item.itemId?.toLowerCase().includes(term);
                const soldierNameMatch = item.linkedSoldierName?.toLowerCase().includes(term);
                return typeNameMatch || itemIdMatch || soldierNameMatch;
            }
            // For non-unique, search by type name and potentially assigned soldier names (if available in item.assignments)
            const assignmentsMatch = !item.isUniqueItem && item.assignments?.some(asgn => asgn.soldierName?.toLowerCase().includes(term));
            return typeNameMatch || assignmentsMatch;
        });
    }
    return itemsToFilter;
  }, [armoryItems, searchTerm, filterItemTypeId]);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setIsScanning(true);
      const reader = new FileReader();
      reader.onloadend = async () => {
        const dataUri = reader.result as string;
        setScannedImagePreview(dataUri);
        itemForm.setValue("photoDataUri", dataUri);
        try {
          const result = await scanArmoryItemImage(dataUri);
          const currentItemTypeId = itemForm.getValues("itemTypeId");
          const currentItemType = armoryItemTypes.find(t => t.id === currentItemTypeId);

          if (currentItemType && currentItemType.isUnique) {
            itemForm.setValue("itemId", result.itemId);
          } else if (!currentItemType) { // If no type is selected yet, still populate itemId
             itemForm.setValue("itemId", result.itemId);
          }

          const matchedType = armoryItemTypes.find(type => type.name.toLowerCase() === result.itemType.toLowerCase());
          if (matchedType) {
            itemForm.setValue("itemTypeId", matchedType.id);
            const typeForForm = armoryItemTypes.find(t => t.id === matchedType.id); // Re-fetch to ensure
            setSelectedItemTypeIsUnique(typeForForm ? typeForForm.isUnique : null);
            (window as any).__SELECTED_ITEM_TYPE_IS_UNIQUE__ = typeForForm ? typeForForm.isUnique : null;
            itemForm.trigger(); // Re-validate form based on new type

            toast({ title: "סריקה הושלמה", description: `זוהה סוג: ${matchedType.name}${matchedType.isUnique ? `, מספר סריאלי: ${result.itemId}` : ''}` });
          } else {
            toast({ variant: "default", title: "סריקה - נדרשת פעולה", description: `מספר סריאלי זוהה: ${result.itemId}. סוג פריט '${result.itemType}' לא נמצא ברשימה. אנא בחר סוג קיים או הוסף אותו.` });
          }
        } catch (error: any) {
          toast({ variant: "destructive", title: "שגיאת סריקה", description: error.message || "זיהוי הפריט נכשל." });
        } finally {
          setIsScanning(false);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAddOrUpdateItem = async (values: ArmoryItemFormData) => {
    const type = armoryItemTypes.find(t => t.id === values.itemTypeId);
    if (!type) {
      toast({ variant: "destructive", title: "שגיאה", description: "סוג פריט לא חוקי." });
      return;
    }

    (window as any).__SELECTED_ITEM_TYPE_IS_UNIQUE__ = type.isUnique;
    const validationResult = armoryItemSchema.safeParse(values);
    if (!validationResult.success) {
        validationResult.error.errors.forEach(err => {
            toast({ variant: "destructive", title: "שגיאת קלט", description: `${err.path.join('.')}: ${err.message}`});
        });
        return;
    }
    const validatedValues = validationResult.data;

    try {
      // Data to be sent to the server action
      const dataToSave: Omit<ArmoryItem, 'id' | 'itemTypeName' | 'linkedSoldierName' | 'linkedSoldierDivisionName' | 'createdAt' | 'assignments' | '_currentSoldierAssignedQuantity'> = {
        itemTypeId: validatedValues.itemTypeId,
        isUniqueItem: type.isUnique,
        imageUrl: validatedValues.photoDataUri || (editingItem?.imageUrl && !validatedValues.photoDataUri ? editingItem.imageUrl : undefined),
        // Conditional fields based on type.isUnique
        itemId: type.isUnique ? validatedValues.itemId : undefined,
        linkedSoldierId: type.isUnique ? ((validatedValues.linkedSoldierId === NO_SOLDIER_LINKED_VALUE || !validatedValues.linkedSoldierId) ? undefined : validatedValues.linkedSoldierId) : undefined,
        totalQuantity: !type.isUnique ? validatedValues.totalQuantity : undefined,
      };


      if (editingItem) { // Updating existing item
        await updateArmoryItem(editingItem.id, dataToSave); // dataToSave includes isUniqueItem

        // Construct the updated item for client state with full structure
        const updatedItemForClientState: ArmoryItem = {
            id: editingItem.id,
            itemTypeId: validatedValues.itemTypeId,
            isUniqueItem: type.isUnique,
            itemTypeName: type.name,
            imageUrl: dataToSave.imageUrl,

            itemId: type.isUnique ? validatedValues.itemId : undefined,
            linkedSoldierId: type.isUnique ? dataToSave.linkedSoldierId : undefined, // dataToSave.linkedSoldierId is already processed
            linkedSoldierName: undefined, // Will be set below if applicable
            linkedSoldierDivisionName: undefined, // Will be set below if applicable

            totalQuantity: !type.isUnique ? validatedValues.totalQuantity : undefined,
            assignments: undefined, // Will be set below if applicable
        };

        if (updatedItemForClientState.isUniqueItem && updatedItemForClientState.linkedSoldierId) {
            const soldier = soldiers.find(s => s.id === updatedItemForClientState.linkedSoldierId);
            if (soldier) {
                updatedItemForClientState.linkedSoldierName = soldier.name;
                updatedItemForClientState.linkedSoldierDivisionName = soldier.divisionName || "פלוגה לא משויכת";
            }
        }
        if (!updatedItemForClientState.isUniqueItem) {
            // If type changed from unique to non-unique, assignments should be fresh []
            // Otherwise, preserve existing assignments
            updatedItemForClientState.assignments = (editingItem.isUniqueItem && !type.isUnique) ? [] : (editingItem.assignments || []);
        }

        setArmoryItems(prev => prev.map(item => item.id === editingItem.id ? updatedItemForClientState : item));
        toast({ title: "הצלחה", description: "פרטי הפריט עודכנו." });

      } else { // Adding new item
        const newItemFromServer = await addArmoryItem(dataToSave); // newItemFromServer is correctly structured by server

        // Enrich newItemFromServer for client state
        const enrichedNewItem: ArmoryItem = {
            ...newItemFromServer, // Contains id, itemTypeId, isUniqueItem, imageUrl, and conditionally itemId, linkedSoldierId, totalQuantity, assignments
            itemTypeName: type.name, // Add client-known type name
            linkedSoldierName: undefined, // Will be set below if applicable
            linkedSoldierDivisionName: undefined, // Will be set below if applicable
        };
        if (enrichedNewItem.isUniqueItem && enrichedNewItem.linkedSoldierId) {
          const soldier = soldiers.find(s => s.id === enrichedNewItem.linkedSoldierId);
          if (soldier) {
              enrichedNewItem.linkedSoldierName = soldier.name;
              enrichedNewItem.linkedSoldierDivisionName = soldier.divisionName || "פלוגה לא משויכת";
          }
        }
        // Ensure mutually exclusive fields are correctly undefined based on newItemFromServer.isUniqueItem
        if (enrichedNewItem.isUniqueItem) {
            enrichedNewItem.totalQuantity = undefined;
            enrichedNewItem.assignments = undefined;
        } else {
            enrichedNewItem.itemId = undefined;
            enrichedNewItem.linkedSoldierId = undefined;
        }

        setArmoryItems(prev => [...prev, enrichedNewItem]);
        toast({ title: "הצלחה", description: "פריט נוסף בהצלחה." });
      }
      setIsItemDialogOpen(false);
      setEditingItem(null);
      if(fileInputRef.current) fileInputRef.current.value = "";
    } catch (error: any) {
      toast({ variant: "destructive", title: "שגיאה", description: error.message || "הוספת/עריכת פריט נכשלה." });
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    try {
      await deleteArmoryItem(itemId);
      setArmoryItems(prev => prev.filter(item => item.id !== itemId));
      toast({ title: "הצלחה", description: "פריט נמחק בהצלחה." });
    } catch (error: any) {
      toast({ variant: "destructive", title: "שגיאה", description: error.message || "מחיקת פריט נכשלה." });
    }
  };

  const openEditItemDialog = (item: ArmoryItem) => {
    setEditingItem(item);
    setIsItemDialogOpen(true);
  };

  const handleAddOrUpdateItemType = async (values: ArmoryItemTypeFormData) => {
    try {
      if (editingItemType) {
        await updateArmoryItemType(editingItemType.id, values);
        setArmoryItemTypes(prev =>
          prev.map(t => t.id === editingItemType.id ? { ...t, ...values } : t).sort((a,b) => a.name.localeCompare(b.name))
        );
        toast({ title: "הצלחה", description: "סוג פריט עודכן." });
      } else {
        const newType = await addArmoryItemType(values);
        setArmoryItemTypes(prev => [...prev, newType].sort((a,b) => a.name.localeCompare(b.name)));
        toast({ title: "הצלחה", description: "סוג פריט נוסף." });
      }
      itemTypeForm.reset();
      setEditingItemType(null);
      setIsItemTypeDialogOpen(false);
    } catch (error: any) {
      toast({ variant: "destructive", title: "שגיאה", description: error.message || "פעולה נכשלה." });
    }
  };

  const handleDeleteItemType = async (typeId: string) => {
    try {
      await deleteArmoryItemType(typeId);
      setArmoryItemTypes(prev => prev.filter(t => t.id !== typeId));
      toast({ title: "הצלחה", description: "סוג פריט נמחק." });
    } catch (error: any) {
      toast({ variant: "destructive", title: "שגיאה", description: error.message || "מחיקת סוג פריט נכשלה." });
    }
  };

  const openEditItemTypeDialog = (itemType: ArmoryItemType) => {
    setEditingItemType(itemType);
    itemTypeForm.reset({ name: itemType.name, isUnique: itemType.isUnique });
    setIsItemTypeDialogOpen(true);
  };

  const handleExportToExcel = () => {
    const dataToExport = filteredArmoryItems.map(item => {
      return {
        "סוג הפריט": item.itemTypeName || "לא ידוע",
        "ייחודי": item.isUniqueItem ? "כן" : "לא",
        "מספר סידורי": item.isUniqueItem ? item.itemId : "N/A",
        "כמות במלאי (אם לא ייחודי)": !item.isUniqueItem ? item.totalQuantity : "N/A",
        "חייל מקושר (אם ייחודי)": item.isUniqueItem && item.linkedSoldierName ? item.linkedSoldierName : (item.isUniqueItem ? "לא משויך" : "N/A"),
        "מספר אישי (חייל)": item.isUniqueItem && item.linkedSoldierId ? item.linkedSoldierId : "",
        "פלוגה מקושרת (חייל)": item.isUniqueItem && item.linkedSoldierDivisionName ? item.linkedSoldierDivisionName : "",
        "הקצאות (אם לא ייחודי)": !item.isUniqueItem && item.assignments && item.assignments.length > 0
            ? item.assignments.map(asgn => `${asgn.soldierName || 'חייל לא ידוע'} (${asgn.soldierDivisionName || 'פלוגה לא ידועה'}): ${asgn.quantity}`).join('; ')
            : (!item.isUniqueItem ? "אין הקצאות" : "N/A"),
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "פריטי נשקייה");
    XLSX.writeFile(workbook, "armory_items_export.xlsx");
    toast({ title: "הצלחה", description: "נתוני הנשקייה יוצאו ל-Excel."});
  };


  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
        <h1 className="text-3xl font-bold">ניהול נשקייה</h1>
        <div className="flex flex-wrap gap-2 justify-center sm:justify-end">
          <Button variant="outline" onClick={handleExportToExcel} disabled={filteredArmoryItems.length === 0}>
            <FileSpreadsheet className="ms-2 h-4 w-4" /> ייצא ל-Excel
          </Button>
          <Dialog open={isItemTypeDialogOpen} onOpenChange={(isOpen) => {
            setIsItemTypeDialogOpen(isOpen);
            if (!isOpen) {
              setEditingItemType(null);
              itemTypeForm.reset();
            }
          }}>
            <DialogTrigger asChild>
              <Button variant="outline"><ListChecks className="ms-2 h-4 w-4" /> נהל סוגי פריט</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>{editingItemType ? "ערוך סוג פריט" : "הוסף סוג פריט חדש"}</DialogTitle>
              </DialogHeader>
              <form onSubmit={itemTypeForm.handleSubmit(handleAddOrUpdateItemType)} className="space-y-3 mt-4">
                <div>
                  <Label htmlFor="itemTypeNameInput">שם סוג פריט</Label>
                  <Input
                    id="itemTypeNameInput"
                    placeholder="הכנס שם סוג פריט"
                    {...itemTypeForm.register("name")}
                  />
                  {itemTypeForm.formState.errors.name && <p className="text-destructive text-sm">{itemTypeForm.formState.errors.name.message}</p>}
                </div>
                <div className="flex items-center space-x-2 rtl:space-x-reverse">
                  <Controller
                    name="isUnique"
                    control={itemTypeForm.control}
                    render={({ field }) => (
                        <Checkbox
                            id="isUniqueItemType"
                            checked={field.value}
                            onCheckedChange={field.onChange}
                        />
                    )}
                  />
                  <Label htmlFor="isUniqueItemType" className="text-sm font-normal">פריט ייחודי (דורש מספר סריאלי)</Label>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                    <DialogClose asChild><Button type="button" variant="outline">ביטול</Button></DialogClose>
                    <Button type="submit">
                        {editingItemType ? "עדכן סוג" : "הוסף סוג"}
                    </Button>
                </div>
              </form>
              <div className="mt-6">
                <h3 className="text-sm font-medium mb-2">סוגים קיימים:</h3>
                {armoryItemTypes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">אין סוגי פריטים מוגדרים.</p>
                ) : (
                  <ScrollArea className="h-[200px] border rounded-md">
                    <div className="p-2 space-y-1">
                    {armoryItemTypes.map((type) => (
                      <div key={type.id} className="flex justify-between items-center p-2 rounded hover:bg-muted/50">
                        <div>
                            <span>{type.name}</span>
                            <span className="text-xs text-muted-foreground ms-2">({type.isUnique ? "ייחודי" : "כמותי"})</span>
                        </div>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditItemTypeDialog(type)}>
                            <Edit3 className="w-3.5 h-3.5" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7"><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>אישור מחיקה</AlertDialogTitle>
                                <AlertDialogDescription>
                                  האם אתה בטוח שברצונך למחוק את סוג הפריט "{type.name}"?
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>ביטול</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDeleteItemType(type.id)} className="bg-destructive hover:bg-destructive/90">מחק</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                    ))}
                    </div>
                  </ScrollArea>
                )}
              </div>
              <DialogFooter className="mt-4">
                <DialogClose asChild><Button variant="outline">סגור</Button></DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={isItemDialogOpen} onOpenChange={(isOpen) => {
              setIsItemDialogOpen(isOpen);
              if (!isOpen) {
                setEditingItem(null);
                setScannedImagePreview(null);
                setSelectedItemTypeIsUnique(null);
                (window as any).__SELECTED_ITEM_TYPE_IS_UNIQUE__ = null;
                if(fileInputRef.current) fileInputRef.current.value = "";
                itemForm.reset({ itemTypeId: "", itemId: "", totalQuantity: 1, linkedSoldierId: NO_SOLDIER_LINKED_VALUE, photoDataUri: undefined });
              }
            }}>
            <DialogTrigger asChild>
              <Button><PlusCircle className="ms-2 h-4 w-4" /> הוסף פריט</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[525px]">
              <DialogHeader>
                <DialogTitle>{editingItem ? "ערוך פריט" : "הוסף פריט חדש"}</DialogTitle>
              </DialogHeader>
              <form onSubmit={itemForm.handleSubmit(handleAddOrUpdateItem)} className="space-y-4 mt-4">
                <div>
                  <Label htmlFor="itemTypeIdSelect">סוג הפריט</Label>
                  <Controller
                    name="itemTypeId"
                    control={itemForm.control}
                    render={({ field }) => (
                      <Select
                        onValueChange={(value) => {
                            field.onChange(value);
                            const type = armoryItemTypes.find(t => t.id === value);
                            setSelectedItemTypeIsUnique(type ? type.isUnique : null);
                            (window as any).__SELECTED_ITEM_TYPE_IS_UNIQUE__ = type ? type.isUnique : null;
                            if (type) { // If a type is selected
                                if (type.isUnique) { // If new type is unique
                                    itemForm.setValue("totalQuantity", undefined); // Clear totalQuantity
                                    // Keep existing itemId or clear if needed, keep linkedSoldierId
                                } else { // If new type is not unique
                                    itemForm.setValue("itemId", ""); // Clear itemId
                                    itemForm.setValue("linkedSoldierId", NO_SOLDIER_LINKED_VALUE); // Clear linkedSoldierId
                                    // Keep existing totalQuantity or set default if needed
                                    if(itemForm.getValues("totalQuantity") === undefined || itemForm.getValues("totalQuantity")! <=0 ) {
                                        itemForm.setValue("totalQuantity",1);
                                    }
                                }
                            }
                            itemForm.trigger(); // Trigger validation for all fields
                        }}
                        value={field.value || ""}
                      >
                        <SelectTrigger id="itemTypeIdSelect">
                          <SelectValue placeholder="בחר סוג פריט..." />
                        </SelectTrigger>
                        <SelectContent>
                          {armoryItemTypes.map(type => (
                            <SelectItem key={type.id} value={type.id}>{type.name} ({type.isUnique ? "ייחודי" : "כמותי"})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  {itemForm.formState.errors.itemTypeId && <p className="text-destructive text-sm">{itemForm.formState.errors.itemTypeId.message}</p>}
                </div>

                {selectedItemTypeIsUnique === true && (
                  <>
                    <div>
                      <Label htmlFor="itemId">מספר סריאלי</Label>
                      <Input id="itemId" {...itemForm.register("itemId")} />
                      {itemForm.formState.errors.itemId && <p className="text-destructive text-sm">{itemForm.formState.errors.itemId.message}</p>}
                    </div>
                    <div>
                      <Label htmlFor="linkedSoldierIdSelect">שייך לחייל (אופציונלי)</Label>
                      <Controller
                        name="linkedSoldierId"
                        control={itemForm.control}
                        render={({ field }) => (
                          <Select onValueChange={field.onChange} value={field.value || NO_SOLDIER_LINKED_VALUE}>
                            <SelectTrigger id="linkedSoldierIdSelect">
                              <SelectValue placeholder="בחר חייל..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={NO_SOLDIER_LINKED_VALUE}>ללא שיוך</SelectItem>
                              {soldiers.map(soldier => (
                                <SelectItem key={soldier.id} value={soldier.id}>{soldier.name} ({soldier.id})</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                    </div>
                  </>
                )}

                {selectedItemTypeIsUnique === false && (
                  <div>
                    <Label htmlFor="totalQuantity">כמות במלאי</Label>
                    <Controller
                        name="totalQuantity"
                        control={itemForm.control}
                        render={({ field }) => (
                            <Input
                                id="totalQuantity"
                                type="number"
                                {...field}
                                value={field.value === undefined ? "" : String(field.value)} // Ensure string for input
                                onChange={(e) => field.onChange(e.target.value === "" ? undefined : parseInt(e.target.value, 10))}
                            />
                        )}
                    />
                    {itemForm.formState.errors.totalQuantity && <p className="text-destructive text-sm">{itemForm.formState.errors.totalQuantity.message}</p>}
                  </div>
                )}

                {selectedItemTypeIsUnique !== null && (
                    <div>
                        <Label htmlFor="itemImage">תמונת פריט (לסריקה)</Label>
                        <div className="flex items-center gap-2">
                        <Input id="itemImage" type="file" accept="image/*" ref={fileInputRef} onChange={handleFileChange} className="flex-grow"/>
                        <Button type="button" variant="outline" size="icon" onClick={() => fileInputRef.current?.click()} disabled={isScanning}>
                            {isScanning ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                        </Button>
                        </div>
                    </div>
                )}

                {scannedImagePreview && (
                  <div className="mt-2 border rounded-md p-2 flex justify-center items-center h-32 overflow-hidden">
                    <Image src={scannedImagePreview} alt="תצוגה מקדימה" width={100} height={100} className="object-contain max-h-full" data-ai-hint="equipment military"/>
                  </div>
                )}

                <DialogFooter>
                  <DialogClose asChild><Button type="button" variant="outline">ביטול</Button></DialogClose>
                  <Button type="submit" disabled={isScanning || selectedItemTypeIsUnique === null}>
                    {isScanning ? "סורק..." : (editingItem ? "שמור שינויים" : "הוסף פריט")}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 items-center">
        <Input
          type="search"
          placeholder="חפש לפי מס' סריאלי, סוג או שם חייל..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="max-w-xs"
        />
         <Select value={filterItemTypeId} onValueChange={setFilterItemTypeId}>
            <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="סנן לפי סוג..." />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="all">כל הסוגים</SelectItem>
                {armoryItemTypes.map(type => (
                    <SelectItem key={type.id} value={type.id}>{type.name}</SelectItem>
                ))}
            </SelectContent>
        </Select>
      </div>

      {filteredArmoryItems.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">לא נמצאו פריטים התואמים לחיפוש או לסינון.</p>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredArmoryItems.map((item) => {
            const totalAssigned = !item.isUniqueItem && item.assignments
                ? item.assignments.reduce((sum, asgn) => sum + asgn.quantity, 0)
                : 0;
            return (
            <Card key={item.id} className="flex flex-col">
              <CardHeader>
                {item.imageUrl ? (
                  <div className="relative h-40 w-full mb-2 rounded-md overflow-hidden">
                    <Image src={item.imageUrl} alt={item.itemTypeName || "Armory Item"} layout="fill" objectFit="cover" data-ai-hint="equipment military"/>
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-40 w-full mb-2 rounded-md bg-muted">
                    <PackageSearch className="w-16 h-16 text-muted-foreground" />
                  </div>
                )}
                <CardTitle>{item.itemTypeName || "פריט לא מסווג"}</CardTitle>
                {item.isUniqueItem ? (
                    <CardDescription>מספר סריאלי: <span className="font-semibold">{item.itemId || "N/A"}</span></CardDescription>
                ) : (
                    <CardDescription>
                        סה"כ במלאי: <span className="font-semibold">{item.totalQuantity ?? 0}</span>
                        {item.assignments && item.assignments.length > 0 && (
                             <span className="text-xs block text-muted-foreground"> (מוקצה: {totalAssigned} מתוך {item.totalQuantity ?? 0})</span>
                        )}
                         {item.assignments && item.assignments.length === 0 && (
                             <span className="text-xs block text-muted-foreground"> (מוקצה: 0 מתוך {item.totalQuantity ?? 0})</span>
                        )}
                    </CardDescription>
                )}
              </CardHeader>
              <CardContent className="flex-grow space-y-1">
                {item.isUniqueItem && item.linkedSoldierId ? (
                  <>
                    {item.linkedSoldierName && (
                      <p className="text-sm flex items-center">
                        <User className="w-3.5 h-3.5 me-1.5 text-muted-foreground" /> שייך ל: <span className="font-semibold ms-1">{item.linkedSoldierName}</span>
                      </p>
                    )}
                    {item.linkedSoldierDivisionName && (
                      <p className="text-sm flex items-center">
                        <Building className="w-3.5 h-3.5 me-1.5 text-muted-foreground" /> פלוגה: <span className="font-semibold ms-1">{item.linkedSoldierDivisionName}</span>
                      </p>
                    )}
                  </>
                ) : item.isUniqueItem ? (
                  <p className="text-sm text-muted-foreground flex items-center"><User className="w-3.5 h-3.5 me-1.5 text-muted-foreground" />לא משויך לחייל</p>
                ) : item.assignments && item.assignments.length > 0 ? (
                  <div className="text-sm">
                    <p className="font-medium flex items-center"><Users2 className="w-3.5 h-3.5 me-1.5 text-muted-foreground"/>הקצאות לחיילים:</p>
                    <ScrollArea className="h-[60px] pr-2">
                        <ul className="list-disc ps-5 text-xs space-y-0.5">
                            {item.assignments.map(asgn => (
                                <li key={asgn.soldierId}>
                                    {asgn.soldierName || `חייל (${asgn.soldierId.substring(0,4)}...)`}: {asgn.quantity} יח'
                                    {asgn.soldierDivisionName && <span className="text-muted-foreground"> ({asgn.soldierDivisionName})</span>}
                                </li>
                            ))}
                        </ul>
                    </ScrollArea>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">פריט כמותי, אין הקצאות פעילות.</p>
                )}
              </CardContent>
              <CardFooter className="flex justify-end gap-2">
                 <Button variant="ghost" size="icon" onClick={() => openEditItemDialog(item)}>
                    <Edit3 className="w-4 h-4" />
                 </Button>
                 <AlertDialog>
                    <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon"><Trash2 className="w-4 h-4 text-destructive" /></Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                        <AlertDialogTitle>אישור מחיקה</AlertDialogTitle>
                        <AlertDialogDescription>
                            האם אתה בטוח שברצונך למחוק את הפריט מסוג "{item.itemTypeName || 'לא ידוע'}"
                            {item.isUniqueItem && item.itemId ? ` (סריאלי: ${item.itemId})` : (!item.isUniqueItem ? ` (סה"כ: ${item.totalQuantity})`: '')}?
                        </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                        <AlertDialogCancel>ביטול</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDeleteItem(item.id)} className="bg-destructive hover:bg-destructive/90">מחק</AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
              </CardFooter>
            </Card>
          )})}
        </div>
      )}
    </div>
  );
}

    