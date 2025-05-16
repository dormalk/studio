
"use client";

import type { ArmoryItem, ArmoryItemType, Soldier } from "@/types";
import { useState, useEffect, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PlusCircle, Trash2, Edit3, Camera, RefreshCw, ListChecks, User, PackageSearch, Building } from "lucide-react";
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


const armoryItemSchema = z.object({
  itemTypeId: z.string().min(1, "יש לבחור סוג פריט"),
  itemId: z.string().min(1, "מספר סריאלי הינו שדה חובה"),
  photoDataUri: z.string().optional(),
  linkedSoldierId: z.string().optional(),
});

const armoryItemTypeSchema = z.object({
  name: z.string().min(1, "שם סוג פריט הינו שדה חובה"),
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

  const [isItemTypeDialogOpen, setIsItemTypeDialogOpen] = useState(false);
  const [editingItemType, setEditingItemType] = useState<ArmoryItemType | null>(null);

  const itemForm = useForm<ArmoryItemFormData>({
    resolver: zodResolver(armoryItemSchema),
    defaultValues: { itemTypeId: "", itemId: "", linkedSoldierId: "" },
  });

  const itemTypeForm = useForm<ArmoryItemTypeFormData>({
    resolver: zodResolver(armoryItemTypeSchema),
    defaultValues: { name: "" },
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
    if (editingItem) {
      itemForm.reset({
        itemTypeId: editingItem.itemTypeId,
        itemId: editingItem.itemId,
        linkedSoldierId: editingItem.linkedSoldierId || "",
      });
      setScannedImagePreview(editingItem.imageUrl || null);
    } else {
      itemForm.reset({ itemTypeId: "", itemId: "", linkedSoldierId: "" });
      setScannedImagePreview(null);
    }
  }, [editingItem, itemForm, isItemDialogOpen]);

  useEffect(() => {
    if (editingItemType) {
      itemTypeForm.reset({ name: editingItemType.name });
    } else {
      itemTypeForm.reset({ name: "" });
    }
  }, [editingItemType, itemTypeForm, isItemTypeDialogOpen]);


  const filteredArmoryItems = useMemo(() => {
    return armoryItems.filter(item =>
      (item.itemId && item.itemId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.itemTypeName && item.itemTypeName.toLowerCase().includes(searchTerm.toLowerCase()))) &&
      (filterItemTypeId === "all" || item.itemTypeId === filterItemTypeId)
    );
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
          itemForm.setValue("itemId", result.itemId);

          const matchedType = armoryItemTypes.find(type => type.name.toLowerCase() === result.itemType.toLowerCase());
          if (matchedType) {
            itemForm.setValue("itemTypeId", matchedType.id);
            toast({ title: "סריקה הושלמה", description: `זוהה סוג: ${matchedType.name}, מספר סריאלי: ${result.itemId}` });
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
    try {
      let soldierIdToSave: string | undefined;
      if (values.linkedSoldierId === NO_SOLDIER_LINKED_VALUE || !values.linkedSoldierId) {
        soldierIdToSave = undefined;
      } else {
        soldierIdToSave = values.linkedSoldierId;
      }

      const dataToSave: Omit<ArmoryItem, 'id' | 'itemTypeName' | 'linkedSoldierName' | 'linkedSoldierDivisionName' | 'imageUrl' | 'createdAt'> & { imageUrl?: string } = {
        itemTypeId: values.itemTypeId,
        itemId: values.itemId,
        linkedSoldierId: soldierIdToSave,
      };
      
      if (values.photoDataUri && !editingItem) { 
         // For now, assuming imageUrl is either pre-existing or not set by scan for simplicity.
      } else if (editingItem?.imageUrl) {
        dataToSave.imageUrl = editingItem.imageUrl;
      }

      let updatedOrNewItemClient: ArmoryItem;
      const itemTypeName = armoryItemTypes.find(t => t.id === dataToSave.itemTypeId)?.name || "לא ידוע";
      let linkedSoldierName: string | undefined = undefined;
      let linkedSoldierDivisionName: string | undefined = undefined;

      if (dataToSave.linkedSoldierId) {
          const soldier = soldiers.find(s => s.id === dataToSave.linkedSoldierId);
          if (soldier) {
              linkedSoldierName = soldier.name;
              linkedSoldierDivisionName = soldier.divisionName; // Assuming soldier.divisionName is populated
          }
      }


      if (editingItem) {
        await updateArmoryItem(editingItem.id, dataToSave);
        updatedOrNewItemClient = { 
            ...editingItem, 
            ...dataToSave, 
            itemTypeName, 
            linkedSoldierName, 
            linkedSoldierDivisionName, 
            imageUrl: dataToSave.imageUrl 
        };
        setArmoryItems(prev => prev.map(item => item.id === editingItem.id ? updatedOrNewItemClient : item));
        toast({ title: "הצלחה", description: "פרטי הפריט עודכנו." });
      } else {
        const newItemServer = await addArmoryItem(dataToSave);
        updatedOrNewItemClient = { 
            ...newItemServer, 
            itemTypeName, 
            linkedSoldierName, 
            linkedSoldierDivisionName,
            imageUrl: dataToSave.imageUrl 
        }; 
        setArmoryItems(prev => [...prev, updatedOrNewItemClient]);
        toast({ title: "הצלחה", description: "פריט נוסף בהצלחה." });
      }
      setIsItemDialogOpen(false);
      setEditingItem(null);
      itemForm.reset();
      setScannedImagePreview(null);
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
        setArmoryItems(prevItems => prevItems.map(item => 
            item.itemTypeId === editingItemType.id ? { ...item, itemTypeName: values.name } : item
        ));
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
    itemTypeForm.reset({ name: itemType.name });
    setIsItemTypeDialogOpen(true); 
  };


  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
        <h1 className="text-3xl font-bold">ניהול נשקייה</h1>
        <div className="flex gap-2">
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
                <DialogTitle>ניהול סוגי פריטים</DialogTitle>
                <DialogDescription>הוסף, ערוך או מחק סוגי פריטים מהרשימה.</DialogDescription>
              </DialogHeader>
              <form onSubmit={itemTypeForm.handleSubmit(handleAddOrUpdateItemType)} className="space-y-3">
                <div className="flex gap-2 items-end">
                  <div className="flex-grow">
                    <Label htmlFor="itemTypeNameInput" className="sr-only">שם סוג פריט</Label>
                    <Input 
                      id="itemTypeNameInput" 
                      placeholder={editingItemType ? "ערוך שם סוג פריט" : "הוסף שם סוג פריט חדש"} 
                      {...itemTypeForm.register("name")} 
                    />
                  </div>
                  <Button type="submit" size="sm">
                    {editingItemType ? "עדכן סוג" : "הוסף סוג"}
                  </Button>
                  {editingItemType && (
                    <Button type="button" variant="outline" size="sm" onClick={() => { setEditingItemType(null); itemTypeForm.reset(); }}>
                      בטל עריכה
                    </Button>
                  )}
                </div>
                {itemTypeForm.formState.errors.name && <p className="text-destructive text-sm">{itemTypeForm.formState.errors.name.message}</p>}
              </form>
              <div className="mt-4">
                <h3 className="text-sm font-medium mb-2">סוגים קיימים:</h3>
                {armoryItemTypes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">אין סוגי פריטים מוגדרים.</p>
                ) : (
                  <ScrollArea className="h-[200px] border rounded-md">
                    <div className="p-2 space-y-1">
                    {armoryItemTypes.map((type) => (
                      <div key={type.id} className="flex justify-between items-center p-2 rounded hover:bg-muted/50">
                        <span>{type.name}</span>
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
                itemForm.reset();
                setScannedImagePreview(null);
                if(fileInputRef.current) fileInputRef.current.value = "";
              }
            }}>
            <DialogTrigger asChild>
              <Button><PlusCircle className="ms-2 h-4 w-4" /> הוסף פריט</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[525px]">
              <DialogHeader>
                <DialogTitle>{editingItem ? "ערוך פריט" : "הוסף פריט חדש"}</DialogTitle>
                <DialogDescription>
                  {editingItem ? "עדכן את פרטי הפריט." : "מלא את פרטי הפריט. ניתן לסרוק פריט באמצעות המצלמה."}
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={itemForm.handleSubmit(handleAddOrUpdateItem)} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="itemTypeIdSelect">סוג הפריט</Label>
                    <Controller
                      name="itemTypeId"
                      control={itemForm.control}
                      render={({ field }) => (
                        <Select onValueChange={field.onChange} value={field.value || ""} defaultValue={field.value || ""}>
                          <SelectTrigger id="itemTypeIdSelect">
                            <SelectValue placeholder="בחר סוג פריט..." />
                          </SelectTrigger>
                          <SelectContent>
                            {armoryItemTypes.map(type => (
                              <SelectItem key={type.id} value={type.id}>{type.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                    {itemForm.formState.errors.itemTypeId && <p className="text-destructive text-sm">{itemForm.formState.errors.itemTypeId.message}</p>}
                  </div>
                  <div>
                    <Label htmlFor="itemId">מספר סריאלי</Label>
                    <Input id="itemId" {...itemForm.register("itemId")} />
                    {itemForm.formState.errors.itemId && <p className="text-destructive text-sm">{itemForm.formState.errors.itemId.message}</p>}
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                   <div>
                    <Label htmlFor="linkedSoldierIdSelect">שייך לחייל</Label>
                    <Controller
                      name="linkedSoldierId"
                      control={itemForm.control}
                      render={({ field }) => (
                        <Select onValueChange={field.onChange} value={field.value || ""} defaultValue={field.value || ""}>
                          <SelectTrigger id="linkedSoldierIdSelect">
                            <SelectValue placeholder="בחר חייל (אופציונלי)..." />
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
                  <div>
                    <Label htmlFor="itemImage">תמונת פריט (לסריקה)</Label>
                    <div className="flex items-center gap-2">
                      <Input id="itemImage" type="file" accept="image/*" ref={fileInputRef} onChange={handleFileChange} className="flex-grow"/>
                      <Button type="button" variant="outline" size="icon" onClick={() => fileInputRef.current?.click()} disabled={isScanning}>
                        {isScanning ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                </div>
                                
                {scannedImagePreview && (
                  <div className="mt-2 border rounded-md p-2 flex justify-center items-center h-32 overflow-hidden">
                    <Image src={scannedImagePreview} alt="תצוגה מקדימה" width={100} height={100} className="object-contain max-h-full" data-ai-hint="equipment military" />
                  </div>
                )}

                <DialogFooter>
                  <DialogClose asChild><Button type="button" variant="outline">ביטול</Button></DialogClose>
                  <Button type="submit" disabled={isScanning}>
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
          placeholder="חפש פריט לפי מס' סריאלי או סוג..."
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
          {filteredArmoryItems.map((item) => (
            <Card key={item.id} className="flex flex-col">
              <CardHeader>
                {item.imageUrl ? (
                  <div className="relative h-40 w-full mb-2 rounded-md overflow-hidden">
                    <Image src={item.imageUrl} alt={item.itemTypeName || "Armory Item"} layout="fill" objectFit="cover" data-ai-hint="equipment military" />
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-40 w-full mb-2 rounded-md bg-muted">
                    <PackageSearch className="w-16 h-16 text-muted-foreground" />
                  </div>
                )}
                <CardTitle>{item.itemTypeName || "פריט לא מסווג"}</CardTitle>
                <CardDescription>מספר סריאלי: <span className="font-semibold">{item.itemId}</span></CardDescription>
              </CardHeader>
              <CardContent className="flex-grow space-y-1">
                {item.linkedSoldierId ? (
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
                ) : (
                  <p className="text-sm text-muted-foreground flex items-center"><User className="w-3.5 h-3.5 me-1.5 text-muted-foreground" />לא משויך לחייל</p>
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
                            האם אתה בטוח שברצונך למחוק את הפריט מסוג "{item.itemTypeName || 'לא ידוע'}" (סריאלי: {item.itemId})?
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
          ))}
        </div>
      )}
    </div>
  );
}

