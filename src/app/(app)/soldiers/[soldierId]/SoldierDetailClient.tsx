
"use client";

import type { Soldier, ArmoryItem, SoldierDocument, Division } from "@/types";
import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, FileText, Download, Trash2, PackageSearch, RefreshCw, Edit3, UserCircle } from "lucide-react";
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
}

const soldierDetailsSchema = z.object({
  name: z.string().min(1, "שם הינו שדה חובה"),
  divisionId: z.string().min(1, "יש לבחור פלוגה"),
});
type SoldierDetailsFormData = z.infer<typeof soldierDetailsSchema>;


export function SoldierDetailClient({ soldier: initialSoldier, initialArmoryItems }: SoldierDetailClientProps) {
  const [soldier, setSoldier] = useState<Soldier>(initialSoldier);
  const [armoryItems, setArmoryItems] = useState<ArmoryItem[]>(initialArmoryItems);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const [isEditSoldierDialogOpen, setIsEditSoldierDialogOpen] = useState(false);
  const [allDivisions, setAllDivisions] = useState<Division[]>([]);

  const soldierDetailsForm = useForm<SoldierDetailsFormData>({
    resolver: zodResolver(soldierDetailsSchema),
    defaultValues: {
      name: soldier.name,
      divisionId: soldier.divisionId,
    },
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
    async function fetchDivisions() {
        try {
            const divisions = await getDivisions();
            setAllDivisions(divisions.sort((a,b) => a.name.localeCompare(b.name)));
        } catch (error) {
            toast({ variant: "destructive", title: "שגיאה", description: "טעינת רשימת הפלוגות נכשלה." });
        }
    }
    if (isEditSoldierDialogOpen) {
        fetchDivisions();
    }
  }, [isEditSoldierDialogOpen, toast]);


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
        if (!prev) return prev; // Should not happen
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
      setSoldier(prev => prev ? { ...prev, documents: updatedDocs } : null); // prev should always exist
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
                    <form onSubmit={soldierDetailsForm.handleSubmit(handleUpdateSoldierDetails)} className="space-y-4">
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
        <CardHeader>
          <CardTitle>פריטי נשקייה משויכים ({armoryItems.length})</CardTitle>
          <CardDescription>רשימת פריטי הציוד מהנשקייה המשויכים לחייל זה.</CardDescription>
        </CardHeader>
        <CardContent>
          {armoryItems.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">אין פריטי נשקייה משויכים לחייל זה.</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {armoryItems.map((item) => (
                <Card key={item.id}>
                  <CardHeader className="pb-2">
                     {item.imageUrl ? (
                        <div className="relative h-32 w-full mb-2 rounded-md overflow-hidden">
                            <Image src={item.imageUrl} alt={item.itemTypeName || "Armory Item"} layout="fill" objectFit="cover" data-ai-hint="equipment military" />
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
                      <Link href={`/armory?itemId=${item.id}`}> {/* Or direct to item edit if available */}
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

    