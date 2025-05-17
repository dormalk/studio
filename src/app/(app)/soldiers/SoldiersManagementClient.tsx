
"use client";
// This file is renamed to AllSoldiersClient.tsx and simplified.
// The old SoldiersManagementClient.tsx content is effectively replaced by AllSoldiersClient.tsx.
// If this file still exists, it should be deleted or its content replaced with AllSoldiersClient.tsx's content.
// For the purpose of this multi-file change, I will provide the content of the *new* AllSoldiersClient.tsx here
// assuming the file system operation is a rename or replace.

import type { Soldier, Division, SoldierDocument } from "@/types";
import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PlusCircle, Trash2, Edit3, Upload, FileText, Download, Eye, RefreshCw } from "lucide-react"; // Added RefreshCw
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
  DialogDescription,
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
  addSoldier, 
  deleteSoldier, 
  updateSoldier,
  uploadSoldierDocument,
  deleteSoldierDocument
} from "@/actions/soldierActions";
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

const soldierSchema = z.object({
  id: z.string().min(1, "מ.א. הינו שדה חובה").regex(/^\d+$/, "מ.א. חייבת להכיל מספרים בלבד"),
  name: z.string().min(1, "שם הינו שדה חובה"),
  divisionId: z.string().min(1, "יש לבחור פלוגה"),
});

interface AllSoldiersClientProps {
  initialSoldiers: Soldier[];
  initialDivisions: Division[]; 
}

export function AllSoldiersClient({ initialSoldiers, initialDivisions }: AllSoldiersClientProps) {
  const [soldiers, setSoldiers] = useState<Soldier[]>(initialSoldiers);
  const [divisions, setDivisions] = useState<Division[]>(initialDivisions);
  const [searchTerm, setSearchTerm] = useState("");
  const { toast } = useToast();

  const [isSoldierDialogOpen, setIsSoldierDialogOpen] = useState(false);
  const [editingSoldier, setEditingSoldier] = useState<Soldier | null>(null);
  
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const soldierForm = useForm<z.infer<typeof soldierSchema>>({
    resolver: zodResolver(soldierSchema),
    defaultValues: { id: "", name: "", divisionId: "" },
  });

  useEffect(() => {
    setSoldiers(initialSoldiers);
  }, [initialSoldiers]);

  useEffect(() => {
    setDivisions(initialDivisions.sort((a,b) => a.name.localeCompare(b.name)));
  }, [initialDivisions]);
  
  useEffect(() => {
    if (editingSoldier) {
      soldierForm.reset({
        id: editingSoldier.id,
        name: editingSoldier.name,
        divisionId: editingSoldier.divisionId,
      });
    } else {
      soldierForm.reset({ id: "", name: "", divisionId: "" });
    }
    setSelectedFile(null); 
    if (fileInputRef.current) fileInputRef.current.value = "";

  }, [editingSoldier, soldierForm, isSoldierDialogOpen]);

  const filteredSoldiers = useMemo(() => {
    return soldiers.filter(soldier =>
        soldier.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        soldier.id.includes(searchTerm)
    ).sort((a,b) => a.name.localeCompare(b.name));
  }, [soldiers, searchTerm]);

  const handleAddOrUpdateSoldier = async (values: z.infer<typeof soldierSchema>) => {
    try {
      let updatedOrNewSoldier: Soldier;
      const divisionName = divisions.find(d => d.id === values.divisionId)?.name || "לא משויך";

      if (editingSoldier) {
        await updateSoldier(editingSoldier.id, {name: values.name, divisionId: values.divisionId});
         updatedOrNewSoldier = { 
            ...editingSoldier, 
            ...values, 
            divisionName,
        };
        setSoldiers(prev => prev.map(s => s.id === updatedOrNewSoldier!.id ? updatedOrNewSoldier! : s));
        toast({ title: "הצלחה", description: "פרטי החייל עודכנו." });
      } else {
        const newSoldierServerData = await addSoldier({id: values.id, name: values.name, divisionId: values.divisionId});
        updatedOrNewSoldier = { 
            ...newSoldierServerData, 
            divisionName,
            documents: [] 
        };
        setSoldiers(prev => [...prev, updatedOrNewSoldier!]);
        toast({ title: "הצלחה", description: "חייל נוסף בהצלחה." });
        setEditingSoldier(updatedOrNewSoldier); 
      }
    } catch (error: any) {
      toast({ variant: "destructive", title: "שגיאה", description: error.message || "הוספת/עריכת חייל נכשלה." });
    }
  };
  
  const handleDeleteSoldier = async (soldierId: string) => {
    try {
      await deleteSoldier(soldierId);
      setSoldiers(prev => prev.filter(s => s.id !== soldierId));
      toast({ title: "הצלחה", description: "חייל נמחק בהצלחה." });
    } catch (error: any) {
      toast({ variant: "destructive", title: "שגיאה", description: error.message || "מחיקת חייל נכשלה." });
    }
  };

  const openEditSoldierDialog = (soldier: Soldier) => {
    setEditingSoldier(soldier);
    setIsSoldierDialogOpen(true);
  };
  
  const openAddNewSoldierDialog = () => {
    setEditingSoldier(null); // Make sure we are in "add" mode
    soldierForm.reset({ id: "", name: "", divisionId: divisions[0]?.id || "unassigned"}); // Reset and default division if possible
    setIsSoldierDialogOpen(true);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedFile(event.target.files?.[0] || null);
  };

  const handleDocumentUpload = async () => {
    if (!selectedFile || !editingSoldier) return;
    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", selectedFile);

    try {
      const newDocument = await uploadSoldierDocument(editingSoldier.id, formData);
      setEditingSoldier(prev => {
        if (!prev) return null;
        const updatedDocs = [...(prev.documents || []), newDocument];
        return { ...prev, documents: updatedDocs };
      });
      setSoldiers(prevSoldiers => prevSoldiers.map(s => 
        s.id === editingSoldier.id 
          ? { ...s, documents: [...(s.documents || []), newDocument] } 
          : s
      ));
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
    if (!editingSoldier) return;
    try {
      await deleteSoldierDocument(editingSoldier.id, documentId, storagePath);
      const updatedDocs = editingSoldier.documents?.filter(doc => doc.id !== documentId);
      setEditingSoldier(prev => prev ? { ...prev, documents: updatedDocs } : null);
      setSoldiers(prevSoldiers => prevSoldiers.map(s => 
        s.id === editingSoldier.id 
          ? { ...s, documents: updatedDocs } 
          : s
      ));
      toast({ title: "הצלחה", description: "המסמך נמחק." });
    } catch (error: any) {
      toast({ variant: "destructive", title: "שגיאת מחיקה", description: error.message || "מחיקת מסמך נכשלה." });
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

  const formatDate = (timestamp: Timestamp | Date) => {
    if (!timestamp) return 'N/A';
    const date = timestamp instanceof Date ? timestamp : (timestamp as Timestamp).toDate();
    return date.toLocaleDateString('he-IL');
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
        <h1 className="text-3xl font-bold">כל החיילים</h1>
        <Button onClick={openAddNewSoldierDialog}><PlusCircle className="ms-2 h-4 w-4" /> הוסף חייל</Button>
      </div>
        <Dialog 
          open={isSoldierDialogOpen} 
          onOpenChange={(isOpen) => { 
            setIsSoldierDialogOpen(isOpen); 
            if (!isOpen) {
              setEditingSoldier(null);
              soldierForm.reset();
              setSelectedFile(null);
              if (fileInputRef.current) fileInputRef.current.value = "";
            }
          }}
        >
          {/* DialogTrigger is now handled by the button above for adding, and Edit3 button for editing */}
          <DialogContent className="sm:max-w-[625px]">
            <DialogHeader>
              <DialogTitle>{editingSoldier ? "ערוך פרטי חייל" : "הוסף חייל חדש"}</DialogTitle>
              <DialogDescription>
                {editingSoldier ? "עדכן את פרטי החייל ונהל את מסמכיו." : "לאחר הוספת החייל, תוכל לנהל את מסמכיו בעריכה."}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={soldierForm.handleSubmit(handleAddOrUpdateSoldier)} className="space-y-4">
              <div>
                <Label htmlFor="soldierId">מ.א.</Label>
                <Input id="soldierId" {...soldierForm.register("id")} disabled={!!editingSoldier} />
                {soldierForm.formState.errors.id && <p className="text-destructive text-sm">{soldierForm.formState.errors.id.message}</p>}
              </div>
              <div>
                <Label htmlFor="soldierName">שם מלא</Label>
                <Input id="soldierName" {...soldierForm.register("name")} />
                {soldierForm.formState.errors.name && <p className="text-destructive text-sm">{soldierForm.formState.errors.name.message}</p>}
              </div>
              <div>
                <Label htmlFor="soldierDivision">פלוגה</Label>
                <Controller
                  name="divisionId"
                  control={soldierForm.control}
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value || ""} defaultValue={field.value || ""}>
                      <SelectTrigger>
                        <SelectValue placeholder="בחר פלוגה" />
                      </SelectTrigger>
                      <SelectContent>
                        {divisions.map(div => (
                          <SelectItem key={div.id} value={div.id}>{div.name}</SelectItem>
                        ))}
                        <SelectItem value="unassigned">לא משויך</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
                {soldierForm.formState.errors.divisionId && <p className="text-destructive text-sm">{soldierForm.formState.errors.divisionId.message}</p>}
              </div>
              <DialogFooter>
                <Button type="submit">{editingSoldier ? "שמור שינויים בפרטים" : "הוסף חייל והמשך למסמכים"}</Button>
              </DialogFooter>
            </form>

            {editingSoldier && (
              <>
                <Separator className="my-6" />
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">מסמכים מצורפים</h3>
                  <div className="space-y-2">
                    <Label htmlFor="soldierDocument">העלאת מסמך חדש</Label>
                    <div className="flex items-center gap-2">
                      <Input 
                        id="soldierDocument" 
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

                  {editingSoldier.documents && editingSoldier.documents.length > 0 ? (
                    <ScrollArea className="h-[200px] border rounded-md p-2">
                      <ul className="space-y-2">
                        {editingSoldier.documents.map((doc) => (
                          <li key={doc.id} className="flex items-center justify-between p-2 hover:bg-muted/50 rounded">
                            <div className="flex items-center gap-2">
                              <FileText className="h-5 w-5 text-muted-foreground" />
                              <div>
                                <a href={doc.downloadURL} target="_blank" rel="noopener noreferrer" className="font-medium hover:underline">
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
                    <p className="text-sm text-muted-foreground">אין מסמכים מצורפים לחייל זה.</p>
                  )}
                </div>
              </>
            )}
            <DialogFooter className="mt-6">
              <DialogClose asChild><Button variant="outline">סגור</Button></DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      <Input
        type="search"
        placeholder="חפש חייל לפי שם או מ.א..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="max-w-sm"
      />
    
      {filteredSoldiers.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">
          {searchTerm ? "לא נמצאו חיילים התואמים לחיפוש." : "אין חיילים להצגה."}
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredSoldiers.map(soldier => (
            <Card key={soldier.id} className="flex flex-col">
              <CardHeader>
                  <div className="flex items-center justify-between">
                      <CardTitle>{soldier.name}</CardTitle>
                      <div className="flex gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEditSoldierDialog(soldier)}><Edit3 className="w-4 h-4"/></Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon"><Trash2 className="w-4 h-4 text-destructive"/></Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>אישור מחיקה</AlertDialogTitle>
                                <AlertDialogDescription>
                                  האם אתה בטוח שברצונך למחוק את החייל "{soldier.name}"?
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>ביטול</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDeleteSoldier(soldier.id)} className="bg-destructive hover:bg-destructive/90">מחק</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                      </div>
                  </div>
                  <CardDescription>מ.א. {soldier.id}</CardDescription>
                  <CardDescription>פלוגה: {soldier.divisionName || "לא משויך"}</CardDescription>
              </CardHeader>
              <CardContent className="flex-grow">
                {soldier.documents && soldier.documents.length > 0 ? (
                  <>
                    <p className="text-xs font-medium mt-2 mb-1">מסמכים ({soldier.documents.length}):</p>
                    <ul className="space-y-1">
                      {soldier.documents.slice(0, 2).map(doc => ( 
                        <li key={doc.id} className="text-xs text-muted-foreground truncate">
                          <FileText className="inline h-3 w-3 me-1" />{doc.fileName}
                        </li>
                      ))}
                      {soldier.documents.length > 2 && <li className="text-xs text-muted-foreground">ועוד...</li>}
                    </ul>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground mt-2">אין מסמכים מצורפים.</p>
                )}
              </CardContent>
              <CardFooter>
                <Button variant="outline" size="sm" asChild className="w-full">
                  <Link href={`/soldiers/${soldier.id}`}>
                    <Eye className="ms-2 h-3.5 w-3.5" />
                    הצג פרטים
                  </Link>
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

