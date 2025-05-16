"use client";

import type { ArmoryItem } from "@/types";
import { useState, useEffect, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PlusCircle, Archive, Trash2, Edit3, Camera, ScanLine, Package, RefreshCw } from "lucide-react";
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
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { addArmoryItem, deleteArmoryItem, updateArmoryItem, scanArmoryItemImage } from "@/actions/armoryActions";
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


const armoryItemSchema = z.object({
  name: z.string().min(1, "שם פריט הינו שדה חובה"),
  type: z.string().min(1, "סוג פריט הינו שדה חובה"),
  itemId: z.string().optional(),
  description: z.string().optional(),
  photoDataUri: z.string().optional(), // For submitting to AI
});

type ArmoryItemFormData = z.infer<typeof armoryItemSchema>;

interface ArmoryManagementClientProps {
  initialArmoryItems: ArmoryItem[];
}

export function ArmoryManagementClient({ initialArmoryItems }: ArmoryManagementClientProps) {
  const [armoryItems, setArmoryItems] = useState<ArmoryItem[]>(initialArmoryItems);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scannedImagePreview, setScannedImagePreview] = useState<string | null>(null);

  const [isItemDialogOpen, setIsItemDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ArmoryItem | null>(null);

  const itemForm = useForm<ArmoryItemFormData>({
    resolver: zodResolver(armoryItemSchema),
    defaultValues: { name: "", type: "", itemId: "", description: "" },
  });

  useEffect(() => {
    setArmoryItems(initialArmoryItems);
  }, [initialArmoryItems]);

  useEffect(() => {
    if (editingItem) {
      itemForm.reset({
        name: editingItem.name,
        type: editingItem.type,
        itemId: editingItem.itemId || "",
        description: editingItem.description || "",
      });
      setScannedImagePreview(editingItem.imageUrl || null);
    } else {
      itemForm.reset({ name: "", type: "", itemId: "", description: "" });
      setScannedImagePreview(null);
    }
  }, [editingItem, itemForm, isItemDialogOpen]);

  const itemTypes = useMemo(() => {
    const types = new Set(armoryItems.map(item => item.type));
    return ["all", ...Array.from(types)];
  }, [armoryItems]);

  const filteredArmoryItems = useMemo(() => {
    return armoryItems.filter(item =>
      (item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.itemId && item.itemId.toLowerCase().includes(searchTerm.toLowerCase()))) &&
      (filterType === "all" || item.type === filterType)
    );
  }, [armoryItems, searchTerm, filterType]);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setIsScanning(true);
      const reader = new FileReader();
      reader.onloadend = async () => {
        const dataUri = reader.result as string;
        setScannedImagePreview(dataUri); // Show preview
        itemForm.setValue("photoDataUri", dataUri); // Set for potential submission if needed by AI
        try {
          const result = await scanArmoryItemImage(dataUri);
          itemForm.setValue("type", result.itemType);
          itemForm.setValue("itemId", result.itemId);
          toast({ title: "סריקה הושלמה", description: `זוהה: ${result.itemType}, מזהה: ${result.itemId}` });
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
      // Note: photoDataUri is for AI scanning, not typically stored in DB unless we want to keep the original scan
      const dataToSave: Omit<ArmoryItem, 'id' | 'imageUrl'> & { imageUrl?: string } = {
        name: values.name,
        type: values.type,
        itemId: values.itemId,
        description: values.description,
      };
      if (scannedImagePreview && scannedImagePreview.startsWith('data:image')) {
        // If we were to upload image and get a URL, it would be set here.
        // For this example, we'll just use the preview as a placeholder if editing.
        // dataToSave.imageUrl = "placeholder_url_after_upload"; 
      } else if (editingItem?.imageUrl) {
        dataToSave.imageUrl = editingItem.imageUrl;
      }


      if (editingItem) {
        await updateArmoryItem(editingItem.id, dataToSave);
        setArmoryItems(prev => prev.map(item => item.id === editingItem.id ? { ...item, ...dataToSave, id: editingItem.id } : item));
        toast({ title: "הצלחה", description: "פרטי הפריט עודכנו." });
      } else {
        const newItem = await addArmoryItem(dataToSave);
        setArmoryItems(prev => [...prev, newItem]);
        toast({ title: "הצלחה", description: "פריט נוסף בהצלחה." });
      }
      setIsItemDialogOpen(false);
      setEditingItem(null);
      itemForm.reset();
      setScannedImagePreview(null);
      if(fileInputRef.current) fileInputRef.current.value = ""; // Clear file input
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
        <h1 className="text-3xl font-bold">ניהול נשקייה</h1>
        <Dialog open={isItemDialogOpen} onOpenChange={(isOpen) => { 
            setIsItemDialogOpen(isOpen); 
            if (!isOpen) {
              setEditingItem(null); 
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
                  <Label htmlFor="itemName">שם הפריט</Label>
                  <Input id="itemName" {...itemForm.register("name")} />
                  {itemForm.formState.errors.name && <p className="text-destructive text-sm">{itemForm.formState.errors.name.message}</p>}
                </div>
                <div>
                  <Label htmlFor="itemType">סוג הפריט</Label>
                  <Input id="itemType" {...itemForm.register("type")} />
                  {itemForm.formState.errors.type && <p className="text-destructive text-sm">{itemForm.formState.errors.type.message}</p>}
                </div>
              </div>
              <div>
                <Label htmlFor="itemId">מזהה פריט (סריאלי)</Label>
                <Input id="itemId" {...itemForm.register("itemId")} />
                {itemForm.formState.errors.itemId && <p className="text-destructive text-sm">{itemForm.formState.errors.itemId.message}</p>}
              </div>
              <div>
                <Label htmlFor="itemDescription">תיאור</Label>
                <Textarea id="itemDescription" {...itemForm.register("description")} />
              </div>
              
              <div>
                <Label htmlFor="itemImage">תמונת פריט (לסריקה)</Label>
                <div className="flex items-center gap-2">
                  <Input id="itemImage" type="file" accept="image/*" ref={fileInputRef} onChange={handleFileChange} className="flex-grow"/>
                  <Button type="button" variant="outline" size="icon" onClick={() => fileInputRef.current?.click()} disabled={isScanning}>
                    {isScanning ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                  </Button>
                </div>
                {scannedImagePreview && (
                  <div className="mt-2 border rounded-md p-2 flex justify-center items-center h-32 overflow-hidden">
                    <Image src={scannedImagePreview} alt="תצוגה מקדימה" width={100} height={100} className="object-contain max-h-full" data-ai-hint="equipment military" />
                  </div>
                )}
              </div>

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

      <div className="flex flex-col sm:flex-row gap-4">
        <Input
          type="search"
          placeholder="חפש פריט לפי שם או מזהה..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="max-w-sm"
        />
        {/* Filter by type can be added here if needed */}
      </div>

      {filteredArmoryItems.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">לא נמצאו פריטים.</p>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredArmoryItems.map((item) => (
            <Card key={item.id} className="flex flex-col">
              <CardHeader>
                {item.imageUrl ? (
                  <div className="relative h-40 w-full mb-2 rounded-md overflow-hidden">
                    <Image src={item.imageUrl} alt={item.name} layout="fill" objectFit="cover" data-ai-hint="equipment military" />
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-40 w-full mb-2 rounded-md bg-muted">
                    <Package className="w-16 h-16 text-muted-foreground" />
                  </div>
                )}
                <CardTitle>{item.name}</CardTitle>
                <CardDescription>סוג: {item.type}</CardDescription>
              </CardHeader>
              <CardContent className="flex-grow">
                {item.itemId && <p className="text-sm">מזהה: <span className="font-semibold">{item.itemId}</span></p>}
                {item.description && <p className="text-sm text-muted-foreground mt-1">{item.description}</p>}
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
                            האם אתה בטוח שברצונך למחוק את הפריט "{item.name}"?
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
