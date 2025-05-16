
"use client";

import type { Soldier, ArmoryItem, SoldierDocument, Division, ArmoryItemType } from "@/types";
import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, FileText, Download, Trash2, PackageSearch, RefreshCw, Edit3, UserCircle, Camera, PlusCircle } from "lucide-react";
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
import { addArmoryItem, scanArmoryItemImage } from "@/actions/armoryActions"; // getArmoryItemTypes is passed as prop
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
import { useForm, Controller } from "react-hook-form";
import * as z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getDivisions } from "@/actions/divisionActions";


interface SoldierDetailClientProps {
  soldier: Soldier;
  initialArmoryItems: ArmoryItem[];
  initialArmoryItemTypes: ArmoryItemType[];
}

const soldierDetailsSchema = z.object({
  name: z.string().min(1, "שם הינו שדה חובה"),
  divisionId: z.string().min(1, "יש לבחור פלוגה"),
});
type SoldierDetailsFormData = z.infer<typeof soldierDetailsSchema>;

const armoryItemBaseSchemaOnSoldierPage = z.object({
  itemTypeId: z.string().min(1, "יש לבחור סוג פריט"),
  itemId: z.string().optional(), // Serial number, required if type is unique
  totalQuantity: z.number().int().positive("כמות חייבת להיות מספר חיובי").optional(), // Required if type is not unique
  photoDataUri: z.string().optional(),
});

const armoryItemSchemaOnSoldierPage = armoryItemBaseSchemaOnSoldierPage.superRefine((data, ctx) => {
  const isUnique = (window as any).__SELECTED_ITEM_TYPE_IS_UNIQUE_SOLDIER_PAGE__;
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
type ArmoryItemFormDataOnSoldierPage = z.infer<typeof armoryItemSchemaOnSoldierPage>;


export function SoldierDetailClient({ soldier: initialSoldier, initialArmoryItems, initialArmoryItemTypes }: SoldierDetailClientProps) {
  const [soldier, setSoldier] = useState<Soldier>(initialSoldier);
  const [armoryItems, setArmoryItems] = useState<ArmoryItem[]>(initialArmoryItems);
  const [allArmoryItemTypes, setAllArmoryItemTypes] = useState<ArmoryItemType[]>(initialArmoryItemTypes);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const armoryItemFileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const [isEditSoldierDialogOpen, setIsEditSoldierDialogOpen] = useState(false);
  const [isAddArmoryItemDialogOpen, setIsAddArmoryItemDialogOpen] = useState(false);
  const [selectedItemTypeForSoldierPageIsUnique, setSelectedItemTypeForSoldierPageIsUnique] = useState<boolean | null>(null);
  const [allDivisions, setAllDivisions] = useState<Division[]>([]);

  const [isScanningArmoryItem, setIsScanningArmoryItem] = useState(false);
  const [scannedArmoryImagePreview, setScannedArmoryImagePreview] = useState<string | null>(null);

  const soldierDetailsForm = useForm<SoldierDetailsFormData>({
    resolver: zodResolver(soldierDetailsSchema),
    defaultValues: {
      name: initialSoldier.name,
      divisionId: initialSoldier.divisionId,
    },
  });

  const addArmoryItemForm = useForm<ArmoryItemFormDataOnSoldierPage>({
    resolver: zodResolver(armoryItemSchemaOnSoldierPage),
    defaultValues: { itemTypeId: "", itemId: "", totalQuantity: 1 },
  });

  useEffect(() => {
    setSoldier(initialSoldier);
    soldierDetailsForm.reset({
        name: initialSoldier.name,
        divisionId: initialSoldier.divisionId,
    });
  }, [initialSoldier, soldierDetailsForm]);

  useEffect(() => {
    setArmoryItems(initialArmoryItems);
  }, [initialArmoryItems]);
  
  useEffect(() => {
    setAllArmoryItemTypes(initialArmoryItemTypes.sort((a,b) => a.name.localeCompare(b.name)));
  }, [initialArmoryItemTypes]);

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

  useEffect(() => {
    const itemTypeId = addArmoryItemForm.watch("itemTypeId");
    if (itemTypeId) {
      const type = allArmoryItemTypes.find(t => t.id === itemTypeId);
      setSelectedItemTypeForSoldierPageIsUnique(type ? type.isUnique : null);
      (window as any).__SELECTED_ITEM_TYPE_IS_UNIQUE_SOLDIER_PAGE__ = type ? type.isUnique : null;
    } else {
      setSelectedItemTypeForSoldierPageIsUnique(null);
      (window as any).__SELECTED_ITEM_TYPE_IS_UNIQUE_SOLDIER_PAGE__ = null;
    }
  }, [addArmoryItemForm.watch("itemTypeId"), allArmoryItemTypes]);


  useEffect(() => {
    if (!isAddArmoryItemDialogOpen) {
      addArmoryItemForm.reset({ itemTypeId: "", itemId: "", totalQuantity: 1 });
      setScannedArmoryImagePreview(null);
      setSelectedItemTypeForSoldierPageIsUnique(null);
      (window as any).__SELECTED_ITEM_TYPE_IS_UNIQUE_SOLDIER_PAGE__ = null;
      if (armoryItemFileInputRef.current) armoryItemFileInputRef.current.value = "";
    }
  }, [isAddArmoryItemDialogOpen, addArmoryItemForm]);


  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedFile(event.target.files?.[0] || null);
  };

  const handleDocumentUpload = async () => {
    if (!selectedFile || !soldier) return;
    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", selectedFile);

    try {
      const newDocument = await uploadSoldierDocument(soldier.id, formData);
      setSoldier(prev => {
        if (!prev) return prev; 
        const updatedDocs = [...(prev.documents || []), newDocument];
        return { ...prev, documents: updatedDocs };
      });
      toast({ title: "הצלחה", description: `מסמך '${newDocument.fileName}' הועלה בהצלחה.` });
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (error: any) {
      toast({ variant: "destructive", title: "שגיאת העלאה", description: error.message || "העלאת מסמך נכשלה." });
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
      toast({ variant: "destructive", title: "שגיאת מחיקה", description: error.message || "מחיקת מסמך נכשלה." });
    }
  };

  const handleUpdateSoldierDetails = async (values: SoldierDetailsFormData) => {
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
        addArmoryItemForm.setValue("photoDataUri", dataUri);
        try {
          const result = await scanArmoryItemImage(dataUri);
          const currentItemTypeId = addArmoryItemForm.getValues("itemTypeId");
          const currentItemType = allArmoryItemTypes.find(t => t.id === currentItemTypeId);

          if (currentItemType && currentItemType.isUnique) {
            addArmoryItemForm.setValue("itemId", result.itemId);
          } else if (!currentItemType) {
            addArmoryItemForm.setValue("itemId", result.itemId); // Tentatively set
          }
          
          const matchedType = allArmoryItemTypes.find(type => type.name.toLowerCase() === result.itemType.toLowerCase());
          if (matchedType) {
            addArmoryItemForm.setValue("itemTypeId", matchedType.id);
            toast({ title: "סריקה הושלמה", description: `זוהה סוג: ${matchedType.name}${matchedType.isUnique ? `, מספר סריאלי: ${result.itemId}` : ''}` });
          } else {
             toast({ variant: "default", title: "סריקה - נדרשת פעולה", description: `מספר סריאלי זוהה: ${result.itemId}. סוג פריט '${result.itemType}' לא נמצא ברשימה. אנא בחר סוג קיים.` });
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

  const handleAddNewArmoryItemToSoldier = async (values: ArmoryItemFormDataOnSoldierPage) => {
    const type = allArmoryItemTypes.find(t => t.id === values.itemTypeId);
    if (!type) {
      toast({ variant: "destructive", title: "שגיאה", description: "סוג פריט לא חוקי." });
      return;
    }
    const isUnique = type.isUnique;
    (window as any).__SELECTED_ITEM_TYPE_IS_UNIQUE_SOLDIER_PAGE__ = isUnique;

    const validationResult = armoryItemSchemaOnSoldierPage.safeParse(values);
     if (!validationResult.success) {
        validationResult.error.errors.forEach(err => {
            toast({ variant: "destructive", title: "שגיאת קלט", description: `${err.path.join('.')}: ${err.message}`});
        });
        return;
    }
    const validatedValues = validationResult.data;

    try {
      const dataToSave: Omit<ArmoryItem, 'id' | 'itemTypeName' | 'linkedSoldierName' | 'linkedSoldierDivisionName' | 'createdAt'> & { imageUrl?: string } = {
        itemTypeId: validatedValues.itemTypeId,
        isUniqueItem: isUnique,
        imageUrl: validatedValues.photoDataUri || undefined,
      };

      if (isUnique) {
        dataToSave.itemId = validatedValues.itemId;
        dataToSave.linkedSoldierId = soldier.id; // Link to current soldier
      } else {
        dataToSave.totalQuantity = validatedValues.totalQuantity;
        // For non-unique items, this creates new stock. Assignment is a separate step.
      }

      const newItemServer = await addArmoryItem(dataToSave);
      const itemTypeName = type.name;
      
      const newItemForState: ArmoryItem = {
        ...newItemServer,
        itemTypeName,
        isUniqueItem: isUnique,
        itemId: isUnique ? dataToSave.itemId : undefined,
        totalQuantity: !isUnique ? dataToSave.totalQuantity : undefined,
        linkedSoldierId: isUnique ? soldier.id : undefined,
        linkedSoldierName: isUnique ? soldier.name : undefined,
        linkedSoldierDivisionName: isUnique ? soldier.divisionName : undefined,
        imageUrl: dataToSave.imageUrl,
      };
      
      // Only add to local list if it's a unique item linked to this soldier
      // Or if we decide to show soldier-created stock (which is not the current design for non-unique items)
      if (isUnique) {
        setArmoryItems(prev => [...prev, newItemForState]);
      }
      
      toast({ title: "הצלחה", description: `פריט נשקייה (${itemTypeName}) נוסף ${isUnique ? 'ושויך לחייל' : 'למלאי הכללי'}.` });
      
      setIsAddArmoryItemDialogOpen(false);
      addArmoryItemForm.reset();
      setScannedArmoryImagePreview(null);
      if (armoryItemFileInputRef.current) armoryItemFileInputRef.current.value = "";

    } catch (error: any) {
      toast({ variant: "destructive", title: "שגיאה", description: error.message || "הוספת פריט נשקייה נכשלה." });
    }
  };


  const formatFileSize = (bytes: number, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  const formatDate = (timestamp: Timestamp | Date | undefined) => {
    if (!timestamp) return 'לא זמין';
    const date = timestamp instanceof Date ? timestamp : (timestamp as Timestamp)?.toDate();
    return date ? date.toLocaleDateString('he-IL') : 'לא זמין';
  }

  if (!soldier) return <p>טוען פרטי חייל...</p>;

  return (
    <div className="grid md:grid-cols-3 gap-8">
      {/* Soldier Details Card */}
      <Card className="md:col-span-1">
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
                <CardTitle className="flex items-center gap-2"><UserCircle className="w-7 h-7 text-primary"/> {soldier.name}</CardTitle>
                <CardDescription>ת.ז.: {soldier.id}</CardDescription>
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
          {/* Placeholder for more soldier details if needed */}
        </CardContent>
      </Card>

      {/* Documents Card */}
      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle>מסמכים מצורפים</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="soldierDocumentUpload">העלאת מסמך חדש</Label>
            <div className="flex items-center gap-2">
              <Input 
                id="soldierDocumentUpload" 
                type="file" 
                ref={fileInputRef}
                onChange={handleFileChange} 
                className="flex-grow"
              />
              <Button type="button" onClick={handleDocumentUpload} disabled={!selectedFile || isUploading}>
                {isUploading ? <RefreshCw className="animate-spin h-4 w-4 ms-2" /> : <Upload className="h-4 w-4 ms-2" />}
                העלה
              </Button>
            </div>
          </div>

          {soldier.documents && soldier.documents.length > 0 ? (
            <ScrollArea className="h-[250px] border rounded-md p-2">
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
            <p className="text-sm text-muted-foreground text-center py-4">אין מסמכים מצורפים לחייל זה.</p>
          )}
        </CardContent>
      </Card>

      {/* Linked Armory Items Card */}
      <Card className="md:col-span-3">
        <CardHeader className="flex flex-row items-center justify-between">
            <div>
                <CardTitle>פריטי נשקייה משויכים ({armoryItems.filter(item => item.isUniqueItem).length})</CardTitle>
                <CardDescription>רשימת פריטי הציוד הייחודיים מהנשקייה המשויכים לחייל זה.</CardDescription>
            </div>
            <Dialog open={isAddArmoryItemDialogOpen} onOpenChange={setIsAddArmoryItemDialogOpen}>
                <DialogTrigger asChild>
                    <Button><PlusCircle className="ms-2 h-4 w-4" /> הוסף פריט נשקייה</Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[525px]">
                    <DialogHeader>
                        <DialogTitle>הוסף פריט נשקייה</DialogTitle>
                        <DialogDescription>
                            {selectedItemTypeForSoldierPageIsUnique 
                                ? `הוסף פריט ייחודי ושייך אותו לחייל ${soldier.name}.`
                                : (selectedItemTypeForSoldierPageIsUnique === false 
                                    ? `הוסף פריט כמותי למלאי הכללי. לא יבוצע שיוך לחייל זה בשלב זה.`
                                    : "בחר סוג פריט כדי להמשיך.")
                            }
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={addArmoryItemForm.handleSubmit(handleAddNewArmoryItemToSoldier)} className="space-y-4 mt-4">
                        <div>
                            <Label htmlFor="armoryItemTypeIdSelectSoldierPage">סוג הפריט</Label>
                            <Controller
                            name="itemTypeId"
                            control={addArmoryItemForm.control}
                            render={({ field }) => (
                                <Select 
                                    onValueChange={(value) => {
                                        field.onChange(value);
                                        const type = allArmoryItemTypes.find(t => t.id === value);
                                        setSelectedItemTypeForSoldierPageIsUnique(type ? type.isUnique : null);
                                        (window as any).__SELECTED_ITEM_TYPE_IS_UNIQUE_SOLDIER_PAGE__ = type ? type.isUnique : null;
                                        if (type) {
                                            if (type.isUnique) addArmoryItemForm.setValue("totalQuantity", undefined);
                                            else addArmoryItemForm.setValue("itemId", "");
                                        }
                                        addArmoryItemForm.trigger();
                                    }} 
                                    value={field.value || ""}
                                >
                                <SelectTrigger id="armoryItemTypeIdSelectSoldierPage">
                                    <SelectValue placeholder="בחר סוג פריט..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {allArmoryItemTypes.map(type => (
                                    <SelectItem key={type.id} value={type.id}>{type.name} ({type.isUnique ? "ייחודי" : "כמותי"})</SelectItem>
                                    ))}
                                </SelectContent>
                                </Select>
                            )}
                            />
                            {addArmoryItemForm.formState.errors.itemTypeId && <p className="text-destructive text-sm">{addArmoryItemForm.formState.errors.itemTypeId.message}</p>}
                        </div>

                        {selectedItemTypeForSoldierPageIsUnique === true && (
                             <div>
                                <Label htmlFor="armoryItemIdSoldierPage">מספר סריאלי</Label>
                                <Input id="armoryItemIdSoldierPage" {...addArmoryItemForm.register("itemId")} />
                                {addArmoryItemForm.formState.errors.itemId && <p className="text-destructive text-sm">{addArmoryItemForm.formState.errors.itemId.message}</p>}
                            </div>
                        )}

                        {selectedItemTypeForSoldierPageIsUnique === false && (
                            <div>
                                <Label htmlFor="armoryItemTotalQuantitySoldierPage">כמות להוספה למלאי</Label>
                                 <Controller
                                    name="totalQuantity"
                                    control={addArmoryItemForm.control}
                                    render={({ field }) => (
                                        <Input 
                                            id="armoryItemTotalQuantitySoldierPage" 
                                            type="number" 
                                            {...field} 
                                            value={field.value || ""}
                                            onChange={(e) => field.onChange(parseInt(e.target.value, 10) || undefined)}
                                        />
                                    )}
                                />
                                {addArmoryItemForm.formState.errors.totalQuantity && <p className="text-destructive text-sm">{addArmoryItemForm.formState.errors.totalQuantity.message}</p>}
                            </div>
                        )}
                         
                        {selectedItemTypeForSoldierPageIsUnique !== null && (
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
                        <Button type="submit" disabled={isScanningArmoryItem || selectedItemTypeForSoldierPageIsUnique === null}>
                            {isScanningArmoryItem ? "סורק..." : "הוסף פריט"}
                        </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </CardHeader>
        <CardContent>
          {armoryItems.filter(item => item.isUniqueItem).length === 0 ? ( // Only show unique items linked to soldier for now
            <p className="text-sm text-muted-foreground text-center py-4">אין פריטי נשקייה ייחודיים המשויכים לחייל זה.</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {armoryItems.filter(item => item.isUniqueItem).map((item) => (
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
                  </CardHeader>
                  <CardFooter>
                    <Button variant="outline" size="sm" asChild className="w-full">
                      <Link href={`/armory?itemId=${item.id}`}> 
                        פרטי פריט בנשקייה
                      </Link>
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
