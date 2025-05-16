
"use client";

import type { Soldier, Division } from "@/types";
import { useState, useEffect, useMemo, type DragEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PlusCircle, User, Trash2, Edit3, GripVertical, Users, Undo2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import { addSoldier, transferSoldier, deleteSoldier, updateSoldier } from "@/actions/soldierActions";
import { addDivision, deleteDivision, updateDivision } from "@/actions/divisionActions";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
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

const soldierSchema = z.object({
  id: z.string().min(1, "ת.ז. הינו שדה חובה").regex(/^\d+$/, "ת.ז. חייבת להכיל מספרים בלבד"),
  name: z.string().min(1, "שם הינו שדה חובה"),
  divisionId: z.string().min(1, "יש לבחור פלוגה"),
});

const divisionSchema = z.object({
  name: z.string().min(1, "שם פלוגה הינו שדה חובה"),
});

interface SoldiersManagementClientProps {
  initialSoldiers: Soldier[];
  initialDivisions: Division[];
}

export function SoldiersManagementClient({ initialSoldiers, initialDivisions }: SoldiersManagementClientProps) {
  const [soldiers, setSoldiers] = useState<Soldier[]>(initialSoldiers);
  const [divisions, setDivisions] = useState<Division[]>(initialDivisions);
  const [searchTerm, setSearchTerm] = useState("");
  const [draggedSoldier, setDraggedSoldier] = useState<Soldier | null>(null);
  const { toast } = useToast();

  const [isSoldierDialogOpen, setIsSoldierDialogOpen] = useState(false);
  const [isDivisionDialogOpen, setIsDivisionDialogOpen] = useState(false);
  const [editingSoldier, setEditingSoldier] = useState<Soldier | null>(null);
  const [editingDivision, setEditingDivision] = useState<Division | null>(null);

  const [focusedSourceId, setFocusedSourceId] = useState<string | null>(null); // Can be divisionId or "unassigned"

  const soldierForm = useForm<z.infer<typeof soldierSchema>>({
    resolver: zodResolver(soldierSchema),
    defaultValues: { id: "", name: "", divisionId: "" },
  });

  const divisionForm = useForm<z.infer<typeof divisionSchema>>({
    resolver: zodResolver(divisionSchema),
    defaultValues: { name: "" },
  });

  useEffect(() => {
    setSoldiers(initialSoldiers);
  }, [initialSoldiers]);

  useEffect(() => {
    setDivisions(initialDivisions);
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
  }, [editingSoldier, soldierForm, isSoldierDialogOpen]);

  useEffect(() => {
    if (editingDivision) {
      divisionForm.reset({ name: editingDivision.name });
    } else {
      divisionForm.reset({ name: "" });
    }
  }, [editingDivision, divisionForm, isDivisionDialogOpen]);

  const soldiersByDivision = useMemo(() => {
    const grouped: Record<string, Soldier[]> = {};
    divisions.forEach(div => {
      grouped[div.id] = [];
    });
    grouped["unassigned"] = [];

    // Apply global search term filter first if not focused
    const soldiersToGroup = focusedSourceId ? soldiers : soldiers.filter(soldier =>
        soldier.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        soldier.id.includes(searchTerm)
    );

    soldiersToGroup.forEach(soldier => {
      if (grouped[soldier.divisionId]) {
        grouped[soldier.divisionId].push(soldier);
      } else {
         grouped["unassigned"].push(soldier);
      }
    });
    return grouped;
  }, [soldiers, divisions, searchTerm, focusedSourceId]); // searchTerm dependency removed here, will be applied in focused view or globally

  const focusedSourceDetails = useMemo(() => {
    if (!focusedSourceId || focusedSourceId === "unassigned") return null;
    return divisions.find(d => d.id === focusedSourceId);
  }, [divisions, focusedSourceId]);

  const focusedSourceName = useMemo(() => {
    if (!focusedSourceId) return "";
    if (focusedSourceId === "unassigned") return "לא משויכים";
    return focusedSourceDetails?.name || "";
  }, [focusedSourceId, focusedSourceDetails]);

  const soldiersInFocusedSource = useMemo(() => {
    if (!focusedSourceId) return [];
    const sourceSoldiers = soldiersByDivision[focusedSourceId] || [];
    if (!searchTerm) return sourceSoldiers; // If no search term, return all from focused source
    return sourceSoldiers.filter(soldier => // Apply search term if present
      soldier.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      soldier.id.includes(searchTerm)
    );
  }, [soldiersByDivision, focusedSourceId, searchTerm]);


  const handleAddOrUpdateSoldier = async (values: z.infer<typeof soldierSchema>) => {
    try {
      let updatedSoldier;
      if (editingSoldier) {
        await updateSoldier(editingSoldier.id, values);
        updatedSoldier = { ...editingSoldier, ...values };
        setSoldiers(prev => prev.map(s => s.id === updatedSoldier!.id ? updatedSoldier! : s));
        toast({ title: "הצלחה", description: "פרטי החייל עודכנו." });
      } else {
        const newSoldier = await addSoldier(values);
        updatedSoldier = { ...newSoldier, divisionName: divisions.find(d => d.id === newSoldier.divisionId)?.name || "לא משויך" };
        setSoldiers(prev => [...prev, updatedSoldier!]);
        toast({ title: "הצלחה", description: "חייל נוסף בהצלחה." });
      }
      setIsSoldierDialogOpen(false);
      setEditingSoldier(null);
      soldierForm.reset();
    } catch (error: any) {
      toast({ variant: "destructive", title: "שגיאה", description: error.message || "הוספת/עריכת חייל נכשלה." });
    }
  };
  
  const handleAddOrUpdateDivision = async (values: z.infer<typeof divisionSchema>) => {
    try {
      if (editingDivision) {
        await updateDivision(editingDivision.id, values);
        setDivisions(prev => prev.map(d => d.id === editingDivision.id ? { ...d, ...values } : d));
        setSoldiers(prevSoldiers => prevSoldiers.map(s => 
            s.divisionId === editingDivision.id ? { ...s, divisionName: values.name } : s
        ));
        toast({ title: "הצלחה", description: "שם הפלוגה עודכן." });
      } else {
        const newDivision = await addDivision(values);
        setDivisions(prev => [...prev, newDivision]);
        toast({ title: "הצלחה", description: "פלוגה נוספה בהצלחה." });
      }
      setIsDivisionDialogOpen(false);
      setEditingDivision(null);
      divisionForm.reset();
    } catch (error: any) {
      toast({ variant: "destructive", title: "שגיאה", description: error.message || "הוספת/עריכת פלוגה נכשלה." });
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

  const handleDeleteDivision = async (divisionId: string) => {
     if (soldiersByDivision[divisionId]?.length > 0) {
      toast({ variant: "destructive", title: "שגיאה", description: "לא ניתן למחוק פלוגה עם חיילים משויכים. יש להעביר את החיילים תחילה."});
      return;
    }
    try {
      await deleteDivision(divisionId);
      setDivisions(prev => prev.filter(d => d.id !== divisionId));
      setSoldiers(prevSoldiers => 
        prevSoldiers.map(s => 
          s.divisionId === divisionId ? { ...s, divisionId: "unassigned", divisionName: "לא משויך" } : s
        )
      );
      toast({ title: "הצלחה", description: "פלוגה נמחקה בהצלחה." });
    } catch (error: any) {
      toast({ variant: "destructive", title: "שגיאה", description: (error as Error).message || "מחיקת פלוגה נכשלה." });
    }
  };

  const handleDragStart = (e: DragEvent<HTMLDivElement>, soldier: Soldier) => {
    setDraggedSoldier(soldier);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault(); 
  };

  const handleDrop = async (e: DragEvent<HTMLDivElement>, targetDivisionId: string) => {
    e.preventDefault();
    if (draggedSoldier && draggedSoldier.divisionId !== targetDivisionId) {
      try {
        await transferSoldier(draggedSoldier.id, targetDivisionId);
        const divisionName = divisions.find(d => d.id === targetDivisionId)?.name || (targetDivisionId === "unassigned" ? "לא משויך" : "");
        setSoldiers(prev => prev.map(s => s.id === draggedSoldier.id ? { ...s, divisionId: targetDivisionId, divisionName } : s));
        toast({ title: "הצלחה", description: `חייל ${draggedSoldier.name} הועבר לפלוגה ${divisionName}.` });
      } catch (error) {
        toast({ variant: "destructive", title: "שגיאה", description: "העברת חייל נכשלה." });
      }
    }
    setDraggedSoldier(null);
  };

  const openEditSoldierDialog = (soldier: Soldier) => {
    setEditingSoldier(soldier);
    setIsSoldierDialogOpen(true);
  };
  
  const openEditDivisionDialog = (division: Division) => {
    setEditingDivision(division);
    setIsDivisionDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
        <h1 className="text-3xl font-bold">
          {focusedSourceId ? (focusedSourceId === "unassigned" ? "חיילים לא משויכים" : `פלוגה: ${focusedSourceName}`) : "ניהול חיילים ופלוגות"}
        </h1>
        <div className="flex gap-2">
          {focusedSourceId && (
            <Button variant="outline" onClick={() => setFocusedSourceId(null)}>
              <Undo2 className="ms-2 h-4 w-4" />
              חזור לכל הפלוגות
            </Button>
          )}
          <Dialog open={isSoldierDialogOpen} onOpenChange={(isOpen) => { setIsSoldierDialogOpen(isOpen); if (!isOpen) setEditingSoldier(null); }}>
            <DialogTrigger asChild>
              <Button><PlusCircle className="ms-2 h-4 w-4" /> הוסף חייל</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingSoldier ? "ערוך פרטי חייל" : "הוסף חייל חדש"}</DialogTitle>
              </DialogHeader>
              <form onSubmit={soldierForm.handleSubmit(handleAddOrUpdateSoldier)} className="space-y-4">
                <div>
                  <Label htmlFor="soldierId">ת.ז.</Label>
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
                      <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value || ""}>
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
                  <DialogClose asChild><Button type="button" variant="outline">ביטול</Button></DialogClose>
                  <Button type="submit">{editingSoldier ? "שמור שינויים" : "הוסף חייל"}</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog open={isDivisionDialogOpen} onOpenChange={(isOpen) => { setIsDivisionDialogOpen(isOpen); if (!isOpen) setEditingDivision(null); }}>
            <DialogTrigger asChild>
              <Button variant="outline"><Users className="ms-2 h-4 w-4" /> נהל פלוגות</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingDivision ? "ערוך שם פלוגה" : "הוסף פלוגה חדשה"}</DialogTitle>
              </DialogHeader>
              <form onSubmit={divisionForm.handleSubmit(handleAddOrUpdateDivision)} className="space-y-4">
                <div>
                  <Label htmlFor="divisionName">שם הפלוגה</Label>
                  <Input id="divisionName" {...divisionForm.register("name")} />
                  {divisionForm.formState.errors.name && <p className="text-destructive text-sm">{divisionForm.formState.errors.name.message}</p>}
                </div>
                <DialogFooter>
                  <DialogClose asChild><Button type="button" variant="outline">ביטול</Button></DialogClose>
                  <Button type="submit">{editingDivision ? "שמור שינויים" : "הוסף פלוגה"}</Button>
                </DialogFooter>
              </form>
              <div className="mt-6">
                <h3 className="text-lg font-medium mb-2">פלוגות קיימות</h3>
                {divisions.length === 0 && <p className="text-sm text-muted-foreground">אין פלוגות להצגה.</p>}
                <ScrollArea className="max-h-60">
                  <ul className="space-y-2 ">
                    {divisions.map(div => (
                      <li key={div.id} className="flex justify-between items-center p-2 border rounded-md">
                        <span>{div.name}</span>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEditDivisionDialog(div)}><Edit3 className="w-4 h-4" /></Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" disabled={soldiersByDivision[div.id]?.length > 0}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>אישור מחיקה</AlertDialogTitle>
                                <AlertDialogDescription>
                                  האם אתה בטוח שברצונך למחוק את הפלוגה "{div.name}"?
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>ביטול</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDeleteDivision(div.id)} className="bg-destructive hover:bg-destructive/90">מחק</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </li>
                    ))}
                  </ul>
                </ScrollArea>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Input
        type="search"
        placeholder={
          focusedSourceId 
            ? `חפש חייל ב"${focusedSourceName}"...` 
            : "חפש חייל לפי שם או ת.ז. (בכל הפלוגות)..."
        }
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="max-w-sm"
      />
    
      {focusedSourceId ? (
        // Focused View
        <div>
          {soldiersInFocusedSource.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              {searchTerm ? `לא נמצאו חיילים התואמים לחיפוש ב"${focusedSourceName}".` : `אין חיילים המשויכים ל"${focusedSourceName}".`}
            </p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {soldiersInFocusedSource.map(soldier => (
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
                      <CardDescription>ת.ז. {soldier.id}</CardDescription>
                  </CardHeader>
                  {/* Add CardContent if more details are to be shown */}
                </Card>
              ))}
            </div>
          )}
        </div>
      ) : (
        // Main Kanban View
        <ScrollArea className="w-full whitespace-nowrap pb-4">
          <div className="flex space-x-6"> {/* Use space-x for RTL due to dir="rtl" on html */}
            {divisions.map(division => (
              <div
                key={division.id}
                className="min-w-[300px] flex-shrink-0"
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, division.id)}
              >
                <Card>
                  <CardHeader 
                    onClick={() => setFocusedSourceId(division.id)}
                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                  >
                    <CardTitle className="flex justify-between items-center">
                      {division.name}
                      <span className="text-sm font-normal text-muted-foreground">({(soldiersByDivision[division.id] || []).length} חיילים)</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="min-h-[200px] space-y-2">
                    {(soldiersByDivision[division.id] || []).length === 0 && <p className="text-sm text-muted-foreground text-center pt-8">אין חיילים בפלוגה זו.</p>}
                    {(soldiersByDivision[division.id] || []).map(soldier => (
                      <Card 
                        key={soldier.id} 
                        draggable 
                        onDragStart={(e) => handleDragStart(e, soldier)}
                        className="p-3 cursor-grab active:cursor-grabbing flex items-center justify-between"
                      >
                        <div>
                          <p className="font-medium">{soldier.name}</p>
                          <p className="text-xs text-muted-foreground">ת.ז. {soldier.id}</p>
                        </div>
                        <div className="flex gap-1 items-center">
                          <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); openEditSoldierDialog(soldier);}}><Edit3 className="w-3 h-3"/></Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" onClick={(e) => e.stopPropagation()}><Trash2 className="w-3 h-3 text-destructive"/></Button>
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
                           <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab" />
                        </div>
                      </Card>
                    ))}
                  </CardContent>
                </Card>
              </div>
            ))}
            {/* Unassigned Soldiers Column */}
            <div
              key="unassigned"
              className="min-w-[300px] flex-shrink-0"
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, "unassigned")}
            >
              <Card>
                <CardHeader
                  onClick={() => setFocusedSourceId("unassigned")}
                  className="cursor-pointer hover:bg-muted/50 transition-colors"
                >
                  <CardTitle className="flex justify-between items-center">
                    לא משויכים
                    <span className="text-sm font-normal text-muted-foreground">({(soldiersByDivision["unassigned"] || []).length} חיילים)</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="min-h-[200px] space-y-2">
                  {(soldiersByDivision["unassigned"] || []).length === 0 && <p className="text-sm text-muted-foreground text-center pt-8">אין חיילים לא משויכים.</p>}
                  {(soldiersByDivision["unassigned"] || []).map(soldier => (
                    <Card 
                      key={soldier.id} 
                      draggable 
                      onDragStart={(e) => handleDragStart(e, soldier)}
                      className="p-3 cursor-grab active:cursor-grabbing flex items-center justify-between"
                    >
                      <div>
                        <p className="font-medium">{soldier.name}</p>
                        <p className="text-xs text-muted-foreground">ת.ז. {soldier.id}</p>
                      </div>
                      <div className="flex gap-1 items-center">
                        <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); openEditSoldierDialog(soldier); }}><Edit3 className="w-3 h-3"/></Button>
                         <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" onClick={(e) => e.stopPropagation()}><Trash2 className="w-3 h-3 text-destructive"/></Button>
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
                        <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab" />
                      </div>
                    </Card>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      )}
    </div>
  );
}
