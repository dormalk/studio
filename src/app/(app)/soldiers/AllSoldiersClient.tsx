
"use client";

import type { Soldier, Division } from "@/types";
import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"; // Added CardFooter
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PlusCircle, Trash2, Edit3, Eye, RefreshCw, FileUp, Package, Archive, FileText } from "lucide-react";
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
  importSoldiers,
  type SoldierImportData,
  type ImportResult
} from "@/actions/soldierActions";
import { useToast } from "@/hooks/use-toast";
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
import * as XLSX from 'xlsx';
import { Separator } from "@/components/ui/separator";

const soldierSchema = z.object({
  id: z.string().min(1, "מ.א. הינו שדה חובה").regex(/^\d+$/, "מ.א. חייבת להכיל מספרים בלבד"),
  name: z.string().min(1, "שם הינו שדה חובה"),
  divisionId: z.string().min(1, "יש לבחור פלוגה"),
});

interface AllSoldiersClientProps {
  initialSoldiers: Soldier[];
  initialDivisions: Division[];
}

const ITEMS_PER_PAGE = 8;

export function AllSoldiersClient({ initialSoldiers, initialDivisions }: AllSoldiersClientProps) {
  const [soldiers, setSoldiers] = useState<Soldier[]>(initialSoldiers);
  const [divisions, setDivisions] = useState<Division[]>(initialDivisions);
  const [searchTerm, setSearchTerm] = useState("");
  const { toast } = useToast();

  const [isSoldierDialogOpen, setIsSoldierDialogOpen] = useState(false);
  const [editingSoldier, setEditingSoldier] = useState<Soldier | null>(null);

  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const importFileInputRef = useRef<HTMLInputElement>(null);

  const [currentPage, setCurrentPage] = useState(1);


  const soldierForm = useForm<z.infer<typeof soldierSchema>>({
    resolver: zodResolver(soldierSchema),
    defaultValues: { id: "", name: "", divisionId: "unassigned" },
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
      soldierForm.reset({ id: "", name: "", divisionId: "unassigned" });
    }
  }, [editingSoldier, soldierForm, isSoldierDialogOpen]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const filteredSoldiers = useMemo(() => {
    return soldiers.filter(soldier =>
        soldier.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        soldier.id.includes(searchTerm)
    ).sort((a,b) => a.name.localeCompare(b.name));
  }, [soldiers, searchTerm]);

  const totalPages = Math.ceil(filteredSoldiers.length / ITEMS_PER_PAGE);
  const paginatedSoldiers = filteredSoldiers.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const handleAddOrUpdateSoldier = async (values: z.infer<typeof soldierSchema>) => {
    try {
      let updatedOrNewSoldier: Soldier;
      const divisionName = divisions.find(d => d.id === values.divisionId)?.name || "לא משויך";

      if (editingSoldier) {
        await updateSoldier(editingSoldier.id, {name: values.name, divisionId: values.divisionId});
         updatedOrNewSoldier = {
            ...editingSoldier, 
            name: values.name,
            divisionId: values.divisionId,
            divisionName,
        };
        setSoldiers(prev => prev.map(s => s.id === updatedOrNewSoldier!.id ? updatedOrNewSoldier! : s));
        toast({ title: "הצלחה", description: "פרטי החייל עודכנו." });
      } else {
        const newSoldierServerData = await addSoldier({id: values.id, name: values.name, divisionId: values.divisionId});
        updatedOrNewSoldier = {
            ...newSoldierServerData,
            divisionName,
            documents: newSoldierServerData.documents || [],
            assignedUniqueArmoryItemsDetails: [],
            assignedNonUniqueArmoryItemsSummary: [],
        };
        setSoldiers(prev => [...prev, updatedOrNewSoldier!].sort((a,b) => a.name.localeCompare(b.name)));
        toast({ title: "הצלחה", description: "חייל נוסף בהצלחה." });
      }
      setIsSoldierDialogOpen(false);
      setEditingSoldier(null);
      soldierForm.reset({ id: "", name: "", divisionId: "unassigned" });
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
    setEditingSoldier(null);
    soldierForm.reset({ id: "", name: "", divisionId: "unassigned"});
    setIsSoldierDialogOpen(true);
  };


  const handleImportFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
        setImportFile(event.target.files[0]);
    } else {
        setImportFile(null);
    }
  };

  const handleProcessImport = async () => {
    if (!importFile) {
      toast({ variant: "destructive", title: "שגיאה", description: "לא נבחר קובץ לייבוא." });
      return;
    }
    setIsImporting(true);
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const data = e.target?.result;
        if (!data) {
          toast({ variant: "destructive", title: "שגיאה", description: "קריאת הקובץ נכשלה." });
          setIsImporting(false);
          return;
        }
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        const jsonDataRaw = XLSX.utils.sheet_to_json(worksheet, {
          header: 1,
          defval: '',
          blankrows: false,
        }) as Array<any[]>;

        if (!jsonDataRaw || jsonDataRaw.length < 1) {
          toast({ variant: "destructive", title: "שגיאת מבנה קובץ", description: "הקובץ ריק או שאינו בפורמט Excel תקין (נדרשת שורת כותרות לפחות)." });
          setIsImporting(false);
          return;
        }

        const headers = jsonDataRaw[0].map(header => String(header).trim());
        const soldierNameHeader = "שם החייל";
        const soldierIdHeader = "מספר אישי";
        const divisionNameHeader = "שם הפלוגה";

        const nameIndex = headers.indexOf(soldierNameHeader);
        const idIndex = headers.indexOf(soldierIdHeader);
        const divisionIndex = headers.indexOf(divisionNameHeader);

        if (nameIndex === -1 || idIndex === -1 || divisionIndex === -1) {
          let missingHeaders = [];
          if (nameIndex === -1) missingHeaders.push(`"${soldierNameHeader}"`);
          if (idIndex === -1) missingHeaders.push(`"${soldierIdHeader}"`);
          if (divisionIndex === -1) missingHeaders.push(`"${divisionNameHeader}"`);

          toast({
            variant: "destructive",
            title: "שגיאת מבנה קובץ",
            description: (
              <>
                הכותרות הבאות חסרות או שגויות בשורה הראשונה של הקובץ: {missingHeaders.join(', ')}.
                <br />
                ודא שהכותרות תואמות בדיוק ונסה שנית.
              </>
            ),
            duration: 15000,
          });
          setIsImporting(false);
          return;
        }

        const dataRows = jsonDataRaw.slice(1).filter(row => row.some(cell => String(cell).trim() !== ''));
        if (dataRows.length === 0) {
            toast({ variant: "default", title: "ייבוא", description: "לא נמצאו שורות נתונים לייבוא בקובץ (לאחר שורת הכותרות)." });
            setIsImporting(false);
            return;
        }

        const soldiersToImport: SoldierImportData[] = dataRows
          .map((rowArray: any[]) => ({
            name: String(rowArray[nameIndex] || "").trim(),
            id: String(rowArray[idIndex] || "").trim(),
            divisionName: String(rowArray[divisionIndex] || "").trim(),
          }))
          .filter(soldier => soldier.id && soldier.name && soldier.divisionName);

        if (soldiersToImport.length === 0) {
            toast({ variant: "default", title: "ייבוא", description: "לא נמצאו שורות נתונים תקינות (עם כל השדות הנדרשים) לייבוא בקובץ." });
            setIsImporting(false);
            return;
        }

        const result: ImportResult = await importSoldiers(soldiersToImport);

        if (result.successCount > 0) {
          const enrichedAddedSoldiers = result.addedSoldiers.map(s => ({
            ...s,
            documents: s.documents || [],
            assignedUniqueArmoryItemsDetails: [],
            assignedNonUniqueArmoryItemsSummary: [],
          }));
          setSoldiers(prev => [...prev, ...enrichedAddedSoldiers].sort((a,b) => a.name.localeCompare(b.name)));
          toast({
            title: "ייבוא הושלם",
            description: `${result.successCount} חיילים נוספו בהצלחה.`,
          });
        }

        if (result.errorCount > 0) {
          console.error("Import errors:", result.errors);
          let errorDescriptionContent: React.ReactNode;
          if (result.errorCount === 1 && result.errors[0]) {
            const err = result.errors[0];
            errorDescriptionContent = `שגיאה בשורה ${err.rowNumber} (מ.א.: ${err.soldierId || 'לא צוין'}, שם: ${err.soldierName || 'לא צוין'}): ${err.reason}`;
          } else {
            const firstError = result.errors[0];
            errorDescriptionContent = (
              <>
                {`${result.errorCount} שגיאות בייבוא. `}
                {firstError ? `שגיאה ראשונה (שורה ${firstError.rowNumber}, מ.א.: ${firstError.soldierId || 'לא צוין'}): ${firstError.reason}. ` : ''}
                {'נא לבדוק את הקונסולה לפרטים נוספים על כל השגיאות.'}
              </>
            );
          }
          toast({
            variant: "destructive",
            title: `שגיאות בייבוא (${result.errorCount})`,
            description: errorDescriptionContent,
            duration: result.errorCount === 1 ? 10000 : 15000
          });
        }

        if (result.successCount === 0 && result.errorCount === 0 && soldiersToImport.length > 0) {
             toast({ variant: "default", title: "ייבוא", description: "לא נמצאו חיילים חדשים לייבוא בקובץ." });
        }


        setImportFile(null);
        if (importFileInputRef.current) importFileInputRef.current.value = "";
        setIsImportDialogOpen(false);
      };
      reader.onerror = () => {
        toast({ variant: "destructive", title: "שגיאה", description: "קריאת הקובץ נכשלה." });
        setIsImporting(false);
      }
      reader.readAsArrayBuffer(importFile);
    } catch (error: any) {
      toast({ variant: "destructive", title: "שגיאת ייבוא", description: error.message || "תהליך הייבוא נכשל." });
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
        <h1 className="text-3xl font-bold">כל החיילים</h1>
        <div className="flex gap-2">
            <Dialog open={isImportDialogOpen} onOpenChange={(isOpen) => {
                setIsImportDialogOpen(isOpen);
                if (!isOpen) {
                    setImportFile(null);
                    if (importFileInputRef.current) importFileInputRef.current.value = "";
                }
            }}>
                <DialogTrigger asChild>
                    <Button variant="outline"><FileUp className="ms-2 h-4 w-4" /> ייבא חיילים מ-Excel</Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>ייבוא חיילים מקובץ Excel</DialogTitle>
                        <DialogDescription>
                            בחר קובץ Excel (.xlsx, .xls) לייבוא.
                            השורה הראשונה בקובץ חייבת להכיל את הכותרות הבאות (סדר העמודות אינו משנה):
                            <ul className="list-disc list-inside my-2 text-sm">
                                <li className="font-semibold">שם החייל</li>
                                <li className="font-semibold">מספר אישי</li>
                                <li className="font-semibold">שם הפלוגה</li>
                            </ul>
                            ודא שהכותרות תואמות בדיוק לשמות אלו. המערכת תחפש פלוגות קיימות לפי השם שצוין.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div>
                            <Label htmlFor="importFile">בחר קובץ</Label>
                            <Input
                                id="importFile"
                                type="file"
                                accept=".xlsx, .xls"
                                ref={importFileInputRef}
                                onChange={handleImportFileChange}
                            />
                        </div>
                        {importFile && <p className="text-sm text-muted-foreground">קובץ נבחר: {importFile.name}</p>}
                    </div>
                    <DialogFooter>
                        <DialogClose asChild><Button type="button" variant="outline">ביטול</Button></DialogClose>
                        <Button type="button" onClick={handleProcessImport} disabled={!importFile || isImporting}>
                            {isImporting ? <RefreshCw className="animate-spin h-4 w-4 ms-2" /> : <FileUp className="h-4 w-4 ms-2" />}
                            {isImporting ? "מעבד..." : "התחל ייבוא"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            <Button onClick={openAddNewSoldierDialog}><PlusCircle className="ms-2 h-4 w-4" /> הוסף חייל</Button>
        </div>
      </div>
        <Dialog
          open={isSoldierDialogOpen}
          onOpenChange={(isOpen) => {
            setIsSoldierDialogOpen(isOpen);
            if (!isOpen) {
              setEditingSoldier(null);
              soldierForm.reset({ id: "", name: "", divisionId: "unassigned" });
            }
          }}
        >
          <DialogContent className="sm:max-w-[425px]"> {/* Simplified width for this dialog */}
            <DialogHeader>
              <DialogTitle>{editingSoldier ? "ערוך פרטי חייל" : "הוסף חייל חדש"}</DialogTitle>
              <DialogDescription>
                {editingSoldier ? "עדכן את פרטי החייל." : "הזן את פרטי החייל החדש."}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={soldierForm.handleSubmit(handleAddOrUpdateSoldier)} className="space-y-4 mt-4">
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
                    <Select
                        onValueChange={field.onChange}
                        value={field.value}
                    >
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
              <DialogFooter className="pt-4">
                 <DialogClose asChild><Button type="button" variant="outline">ביטול</Button></DialogClose>
                <Button type="submit">{editingSoldier ? "שמור שינויים" : "הוסף חייל"}</Button>
              </DialogFooter>
            </form>
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
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {paginatedSoldiers.map(soldier => (
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
                <CardContent className="flex-grow space-y-3">
                  <div>
                    <p className="text-xs font-medium mb-0.5">סיכום מסמכים:</p>
                    {soldier.documents && soldier.documents.length > 0 ? (
                      <>
                        <p className="text-xs text-muted-foreground flex items-center">
                            <FileText className="inline h-3.5 w-3.5 me-1.5" />
                            סה"כ מסמכים: {soldier.documents.length}
                        </p>
                         <ul className="space-y-0.5 ps-6 list-disc text-xs text-muted-foreground">
                        {soldier.documents.slice(0, 2).map(doc => (
                            <li key={doc.id} className="truncate">{doc.fileName}</li>
                        ))}
                        {soldier.documents.length > 2 && <li>ועוד...</li>}
                        </ul>
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground">אין מסמכים מצורפים.</p>
                    )}
                  </div>
                  <Separator className="my-2" />
                  <div>
                    <p className="text-xs font-medium mb-0.5">סיכום מחסן:</p>
                    {(!soldier.assignedUniqueArmoryItemsDetails || soldier.assignedUniqueArmoryItemsDetails.length === 0) &&
                     (!soldier.assignedNonUniqueArmoryItemsSummary || soldier.assignedNonUniqueArmoryItemsSummary.length === 0) ? (
                      <p className="text-xs text-muted-foreground">אין פריטי מחסן משויכים.</p>
                    ) : (
                      <>
                        {(soldier.assignedUniqueArmoryItemsDetails && soldier.assignedUniqueArmoryItemsDetails.length > 0) && (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            <p className="flex items-center font-medium"><Package className="inline h-3.5 w-3.5 me-1.5" />פריטים ייחודיים ({soldier.assignedUniqueArmoryItemsDetails.length}):</p>
                            <ul className="list-disc ps-6 space-y-0.5">
                              {soldier.assignedUniqueArmoryItemsDetails.slice(0, 2).map(detail => (
                                <li key={detail.id}>{detail.itemTypeName}: {detail.itemId}</li>
                              ))}
                              {soldier.assignedUniqueArmoryItemsDetails.length > 2 && (
                                <li>ועוד {soldier.assignedUniqueArmoryItemsDetails.length - 2}...</li>
                              )}
                            </ul>
                          </div>
                        )}
                        {soldier.assignedNonUniqueArmoryItemsSummary && soldier.assignedNonUniqueArmoryItemsSummary.length > 0 && (
                          <div className="text-xs text-muted-foreground mt-1">
                            <p className="flex items-center font-medium"><Archive className="inline h-3.5 w-3.5 me-1.5" />פריטים כמותיים:</p>
                            <ul className="list-disc ps-6 space-y-0.5">
                              {soldier.assignedNonUniqueArmoryItemsSummary.map(summary => (
                                <li key={summary.itemTypeName}>{summary.itemTypeName}: {summary.quantity}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </>
                    )}
                  </div>
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
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-6">
              <Button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                variant="outline"
              >
                הקודם
              </Button>
              <span className="text-sm">
                עמוד {currentPage} מתוך {totalPages}
              </span>
              <Button
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                variant="outline"
              >
                הבא
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

    