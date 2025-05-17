
"use client";

import type { DivisionWithDetails } from "@/types";
import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PlusCircle, Edit3, Trash2, Users, Package, ArrowRight } from "lucide-react";
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
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { addDivision, updateDivision, deleteDivision } from "@/actions/divisionActions";
import { useToast } from "@/hooks/use-toast";

const divisionSchema = z.object({
  name: z.string().min(1, "שם פלוגה הינו שדה חובה"),
});

type DivisionFormData = z.infer<typeof divisionSchema>;

interface DivisionsClientProps {
  initialDivisions: DivisionWithDetails[];
}

export function DivisionsClient({ initialDivisions }: DivisionsClientProps) {
  const [divisions, setDivisions] = useState<DivisionWithDetails[]>(initialDivisions);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingDivision, setEditingDivision] = useState<DivisionWithDetails | null>(null);
  const { toast } = useToast();

  const form = useForm<DivisionFormData>({
    resolver: zodResolver(divisionSchema),
    defaultValues: { name: "" },
  });

  useEffect(() => {
    setDivisions(initialDivisions);
  }, [initialDivisions]);

  useEffect(() => {
    if (editingDivision) {
      form.reset({ name: editingDivision.name });
    } else {
      form.reset({ name: "" });
    }
  }, [editingDivision, form, isDialogOpen]);

  const handleAddOrUpdateDivision = async (values: DivisionFormData) => {
    try {
      if (editingDivision) {
        await updateDivision(editingDivision.id, values);
        setDivisions(prev => 
          prev.map(d => d.id === editingDivision.id ? { ...d, ...values } : d)
          .sort((a,b) => a.name.localeCompare(b.name))
        );
        toast({ title: "הצלחה", description: "שם הפלוגה עודכן." });
      } else {
        const newDivision = await addDivision(values);
        // We don't have soldierCount or armoryItemCount for a new division yet from the action
        // So we add it with default 0 counts. It will update on next full load or if we re-fetch.
        setDivisions(prev => [...prev, { ...newDivision, soldierCount: 0, armoryItemCount: 0 }].sort((a,b) => a.name.localeCompare(b.name)));
        toast({ title: "הצלחה", description: "פלוגה נוספה בהצלחה." });
      }
      form.reset();
      setEditingDivision(null);
      setIsDialogOpen(false);
    } catch (error: any) {
      toast({ variant: "destructive", title: "שגיאה", description: error.message || "הפעולה נכשלה." });
    }
  };

  const handleDeleteDivision = async (divisionId: string) => {
    try {
      await deleteDivision(divisionId);
      setDivisions(prev => prev.filter(d => d.id !== divisionId));
      toast({ title: "הצלחה", description: "הפלוגה נמחקה." });
    } catch (error: any) {
      toast({ variant: "destructive", title: "שגיאה", description: error.message || "מחיקת פלוגה נכשלה." });
    }
  };

  const openEditDialog = (division: DivisionWithDetails) => {
    setEditingDivision(division);
    setIsDialogOpen(true);
  };
  
  const openAddDialog = () => {
    setEditingDivision(null);
    form.reset({ name: "" });
    setIsDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">ניהול פלוגות</h1>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openAddDialog}><PlusCircle className="ms-2 h-4 w-4" /> הוסף פלוגה</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{editingDivision ? "ערוך שם פלוגה" : "הוסף פלוגה חדשה"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={form.handleSubmit(handleAddOrUpdateDivision)} className="space-y-4">
              <div>
                <Label htmlFor="divisionName">שם הפלוגה</Label>
                <Input id="divisionName" {...form.register("name")} />
                {form.formState.errors.name && <p className="text-destructive text-sm">{form.formState.errors.name.message}</p>}
              </div>
              <DialogFooter>
                <DialogClose asChild><Button type="button" variant="outline">ביטול</Button></DialogClose>
                <Button type="submit">{editingDivision ? "שמור שינויים" : "הוסף פלוגה"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {divisions.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">לא נמצאו פלוגות. אפשר להתחיל על ידי הוספת פלוגה חדשה.</p>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {divisions.map((division) => (
            <Card key={division.id} className="flex flex-col">
              <CardHeader>
                <div className="flex justify-between items-start">
                  <CardTitle>{division.name}</CardTitle>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditDialog(division)}>
                      <Edit3 className="w-4 h-4" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8" disabled={division.soldierCount > 0}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>אישור מחיקה</AlertDialogTitle>
                          <AlertDialogDescription>
                            האם אתה בטוח שברצונך למחוק את הפלוגה "{division.name}"?
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>ביטול</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDeleteDivision(division.id)} className="bg-destructive hover:bg-destructive/90">מחק</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex-grow space-y-2">
                <p className="text-sm text-muted-foreground flex items-center">
                  <Users className="w-4 h-4 me-2" />
                  חיילים משויכים: <span className="font-semibold ms-1">{division.soldierCount}</span>
                </p>
                <p className="text-sm text-muted-foreground flex items-center">
                  <Package className="w-4 h-4 me-2" />
                  פריטי מחסן: <span className="font-semibold ms-1">{division.armoryItemCount}</span>
                </p>
              </CardContent>
              <CardFooter>
                <Button asChild variant="outline" className="w-full">
                  <Link href={`/divisions/${division.id}`}>
                    הצג חיילים בפלוגה <ArrowRight className="ms-2 h-4 w-4" />
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
