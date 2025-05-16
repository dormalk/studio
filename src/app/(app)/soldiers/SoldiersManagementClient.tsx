"use client";

import type { Soldier, Division } from "@/types";
import { useState, useEffect, useMemo, type DragEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PlusCircle, User, Trash2, Edit3, GripVertical, Users } from "lucide-react";
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
  divisionId: z.string().min(1, "יש לבחור אוגדה"),
});

const divisionSchema = z.object({
  name: z.string().min(1, "שם אוגדה הינו שדה חובה"),
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


  const filteredSoldiers = useMemo(() => {
    return soldiers.filter(soldier =>
      soldier.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      soldier.id.includes(searchTerm)
    );
  }, [soldiers, searchTerm]);

  const soldiersByDivision = useMemo(() => {
    const grouped: Record<string, Soldier[]> = {};
    divisions.forEach(div => {
      grouped[div.id] = [];
    });
    // For soldiers not in any current division (e.g. if a division was deleted)
    grouped["unassigned"] = [];


    filteredSoldiers.forEach(soldier => {
      if (grouped[soldier.divisionId]) {
        grouped[soldier.divisionId].push(soldier);
      } else {
         grouped["unassigned"].push(soldier);
      }
    });
    return grouped;
  }, [filteredSoldiers, divisions]);

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
        // Update soldier division names if division name changed
        setSoldiers(prevSoldiers => prevSoldiers.map(s => 
            s.divisionId === editingDivision.id ? { ...s, divisionName: values.name } : s
        ));
        toast({ title: "הצלחה", description: "שם האוגדה עודכן." });
      } else {
        const newDivision = await addDivision(values);
        setDivisions(prev => [...prev, newDivision]);
        toast({ title: "הצלחה", description: "אוגדה נוספה בהצלחה." });
      }
      setIsDivisionDialogOpen(false);
      setEditingDivision(null);
      divisionForm.reset();
    } catch (error: any) {
      toast({ variant: "destructive", title: "שגיאה", description: error.message || "הוספת/עריכת אוגדה נכשלה." });
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
      toast({ variant: "destructive", title: "שגיאה", description: "לא ניתן למחוק אוגדה עם חיילים משויכים. יש להעביר את החיילים תחילה."});
      return;
    }
    try {
      await deleteDivision(divisionId);
      setDivisions(prev => prev.filter(d => d.id !== divisionId));
      // Optionally, reassign soldiers from the deleted division to "unassigned"
      // This is handled by revalidatePath on the server, or client-side update needed
      setSoldiers(prevSoldiers => 
        prevSoldiers.map(s => 
          s.divisionId === divisionId ? { ...s, divisionId: "unassigned", divisionName: "לא משויך" } : s
        )
      );
      toast({ title: "הצלחה", description: "אוגדה נמחקה בהצלחה." });
    } catch (error: any) {
      toast({ variant: "destructive", title: "שגיאה", description: error.message || "מחיקת אוגדה נכשלה." });
    }
  };

  const onDragStart = (e: DragEvent<HTMLDivElement>, soldier: Soldier) => {
    setDraggedSoldier(soldier);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", soldier.id); // Necessary for Firefox
  };

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const onDrop = async (e: DragEvent<HTMLDivElement>, targetDivisionId: string) => {
    e.preventDefault();
    if (!draggedSoldier || draggedSoldier.divisionId === targetDivisionId) {
      setDraggedSoldier(null);
      return;
    }
    try {
      await transferSoldier(draggedSoldier.id, targetDivisionId);
      const targetDivision = divisions.find(d => d.id === targetDivisionId);
      setSoldiers(prev => prev.map(s => s.id === draggedSoldier.id ? { ...s, divisionId: targetDivisionId, divisionName: targetDivision?.name || "לא משויך" } : s));
      toast({ title: "הצלחה", description: `חייל ${draggedSoldier.name} הועבר בהצלחה.` });
    } catch (error: any) {
      toast({ variant: "destructive", title: "שגיאה", description: error.message || "העברת חייל נכשלה." });
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
        <h1 className="text-3xl font-bold">ניהול חיילים</h1>
        <div className="flex gap-2">
           <Dialog open={isDivisionDialogOpen} onOpenChange={(isOpen) => { setIsDivisionDialogOpen(isOpen); if (!isOpen) setEditingDivision(null); }}>
            <DialogTrigger asChild>
              <Button><PlusCircle className="ms-2 h-4 w-4" /> הוסף אוגדה</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingDivision ? "ערוך אוגדה" : "הוסף אוגדה חדשה"}</DialogTitle>
              </DialogHeader>
              <form onSubmit={divisionForm.handleSubmit(handleAddOrUpdateDivision)} className="space-y-4">
                <div>
                  <Label htmlFor="divisionName">שם האוגדה</Label>
                  <Input id="divisionName" {...divisionForm.register("name")} />
                  {divisionForm.formState.errors.name && <p className="text-destructive text-sm">{divisionForm.formState.errors.name.message}</p>}
                </div>
                <DialogFooter>
                  <DialogClose asChild><Button type="button" variant="outline">ביטול</Button></DialogClose>
                  <Button type="submit">{editingDivision ? "שמור שינויים" : "הוסף אוגדה"}</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

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
                  <Label htmlFor="divisionId">אוגדה</Label>
                  <Controller
                    name="divisionId"
                    control={soldierForm.control}
                    render={({ field }) => (
                      <Select onValueChange={field.onChange} value={field.value}>
                        <SelectTrigger>
                          <SelectValue placeholder="בחר אוגדה" />
                        </SelectTrigger>
                        <SelectContent>
                          {divisions.map(div => (
                            <SelectItem key={div.id} value={div.id}>{div.name}</SelectItem>
                          ))}
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
        </div>
      </div>

      <Input
        type="search"
        placeholder="חפש חייל לפי שם או ת.ז..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="max-w-sm"
      />
      
      <ScrollArea className="w-full whitespace-nowrap pb-4">
        <div className="flex gap-6">
          {divisions.map((division) => (
            <Card
              key={division.id}
              className="min-w-[300px] w-[300px] flex-shrink-0 h-auto flex flex-col border-2 border-dashed border-transparent"
              onDragOver={onDragOver}
              onDrop={(e) => onDrop(e, division.id)}
              data-division-id={division.id}
            >
              <CardHeader className="bg-muted/50">
                <div className="flex justify-between items-center">
                  <CardTitle className="flex items-center gap-2">
                    <Users className="w-5 h-5 text-primary" />
                    {division.name} ({soldiersByDivision[division.id]?.length || 0})
                  </CardTitle>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEditDivisionDialog(division)}>
                      <Edit3 className="w-4 h-4" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" disabled={(soldiersByDivision[division.id]?.length || 0) > 0}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>אישור מחיקה</AlertDialogTitle>
                          <AlertDialogDescription>
                            האם אתה בטוח שברצונך למחוק את אוגדת "{division.name}"? פעולה זו אינה הפיכה.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>ביטול</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDeleteDivision(division.id)} className="bg-destructive hover:bg-destructive/90">
                            מחק
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-4 space-y-3 overflow-y-auto flex-grow min-h-[200px]">
                {(soldiersByDivision[division.id] || []).map((soldier) => (
                  <Card 
                    key={soldier.id} 
                    className="p-3 shadow-sm hover:shadow-md transition-shadow cursor-grab bg-card"
                    draggable
                    onDragStart={(e) => onDragStart(e, soldier)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab" />
                        <User className="w-5 h-5 text-primary" />
                        <div>
                          <p className="font-semibold">{soldier.name}</p>
                          <p className="text-xs text-muted-foreground">ת.ז. {soldier.id}</p>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEditSoldierDialog(soldier)}>
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
                  </Card>
                ))}
                {soldiersByDivision[division.id]?.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">אין חיילים באוגדה זו.</p>
                )}
              </CardContent>
            </Card>
          ))}
          {/* Unassigned Soldiers Column */}
          {soldiersByDivision["unassigned"]?.length > 0 && (
            <Card
                className="min-w-[300px] w-[300px] flex-shrink-0 h-auto flex flex-col border-2 border-dashed border-transparent"
                onDragOver={onDragOver}
                onDrop={(e) => onDrop(e, "unassigned")} // This drop target might need special handling or be disabled
                data-division-id="unassigned"
              >
                <CardHeader className="bg-muted/50">
                  <CardTitle className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-muted-foreground" />
                    לא משויכים ({soldiersByDivision["unassigned"]?.length || 0})
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 space-y-3 overflow-y-auto flex-grow min-h-[200px]">
                  {soldiersByDivision["unassigned"].map((soldier) => (
                    <Card 
                      key={soldier.id} 
                      className="p-3 shadow-sm hover:shadow-md transition-shadow cursor-grab bg-card"
                      draggable
                      onDragStart={(e) => onDragStart(e, soldier)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab" />
                          <User className="w-5 h-5 text-primary" />
                          <div>
                            <p className="font-semibold">{soldier.name}</p>
                            <p className="text-xs text-muted-foreground">ת.ז. {soldier.id}</p>
                          </div>
                        </div>
                         <div className="flex gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEditSoldierDialog(soldier)}>
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
                    </Card>
                  ))}
                </CardContent>
              </Card>
          )}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
}
