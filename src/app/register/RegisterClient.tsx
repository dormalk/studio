
"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { db } from "@/lib/firebase"; 
import { collection, getDocs } from "firebase/firestore"; 
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast"; // Used for redirect action
import { ShieldAlert, Loader2 } from "lucide-react";
import type { Division } from "@/types";

const registerSchema = z.object({
  soldierId: z.string().length(7, "מספר אישי חייב להכיל 7 ספרות בדיוק"),
  fullName: z.string().min(2, "שם מלא הינו שדה חובה"),
  divisionId: z.string().min(1, "חובה לבחור אוגדה"),
  password: z.string().min(6, "סיסמה חייבת להכיל לפחות 6 תווים"),
  confirmPassword: z.string().min(6, "אימות סיסמה הינו שדה חובה"),
}).refine((data) => data.password === data.confirmPassword, {
  message: "הסיסמאות אינן תואמות",
  path: ["confirmPassword"],
});

type RegisterFormValues = z.infer<typeof registerSchema>;

export function RegisterClient() {
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [divisions, setDivisions] = useState<Division[]>([]);

  useEffect(() => {
    const fetchDivisions = async () => {
      try {
        const divisionsCollectionRef = collection(db, "divisions");
        const divisionsSnapshot = await getDocs(divisionsCollectionRef);
        const divisionsList = divisionsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Division));
        setDivisions(divisionsList);
      } catch (error) {
        console.error("Error fetching divisions:", error);
        toast({ variant: "destructive", title: "שגיאת טעינת אוגדות", description: "לא ניתן היה לטעון את רשימת האוגדות." });
      }
    };
    fetchDivisions();
  }, [toast]);

  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      soldierId: "",
      fullName: "",
      divisionId: "",
      password: "",
      confirmPassword: "",
    },
  });

  const onSubmit = async (data: RegisterFormValues) => {
    setIsLoading(true);
    let userAlreadyExistsErrorThrown = false; // Flag to track specific error

    try {
      const response = await fetch('/api/auth/custom-register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
            soldierId: data.soldierId,
            fullName: data.fullName,
            divisionId: data.divisionId,
            password: data.password 
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        if (result.errorType === 'USER_ALREADY_EXISTS') {
             userAlreadyExistsErrorThrown = true; // Set flag
             toast({
                title: "משתמש כבר רשום",
                description: result.error || "מספר אישי זה כבר רשום במערכת. נסה להתחבר.",
                action: <ToastAction altText="התחבר" onClick={() => router.push('/login')}>התחבר</ToastAction>,
                duration: 5000,
             });
        } else {
            // For other non-ok responses, throw an error to be caught by the catch block
            throw new Error(result.error || "שגיאת הרשמה מהשרת");
        }
      } else {
         // Successful registration
         toast({
            title: "הרשמה הצליחה!",
            description: result.message || "מיד תועבר למסך ההתחברות.",
            duration: 3000,
         });
         router.push("/login");
      }

    } catch (error: any) {
      console.error("Custom Registration error:", error);
      // Only show generic error toast if the specific user_already_exists toast wasn't shown
      if (!userAlreadyExistsErrorThrown) {
        toast({
          variant: "destructive",
          title: "שגיאת הרשמה",
          description: error.message || "ההרשמה נכשלה. אנא נסה שנית.",
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-lg mx-auto my-auto shadow-xl sm:rounded-lg border-none sm:border">
      <CardHeader className="items-center text-center">
        <ShieldAlert className="h-12 w-12 text-primary mb-2" />
        <CardTitle className="text-2xl">הרשמה למערכת</CardTitle>
        <CardDescription>הזן את פרטיך כדי ליצור משתמש חדש</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="soldierId">מספר אישי (7 ספרות)</Label>
            <Input id="soldierId" placeholder="הקלד מספר אישי" {...form.register("soldierId")} />
            {form.formState.errors.soldierId && <p className="text-sm text-destructive">{form.formState.errors.soldierId.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="fullName">שם מלא</Label>
            <Input id="fullName" placeholder="הקלד שם מלא" {...form.register("fullName")} />
            {form.formState.errors.fullName && <p className="text-sm text-destructive">{form.formState.errors.fullName.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="divisionId">אוגדה</Label>
            <Select onValueChange={(value) => form.setValue("divisionId", value)} defaultValue={form.getValues("divisionId")}>
              <SelectTrigger id="divisionId">
                <SelectValue placeholder="בחר אוגדה..." />
              </SelectTrigger>
              <SelectContent>
                {divisions.map((div) => (
                  <SelectItem key={div.id} value={div.id}>{div.name} ({div.id})</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.formState.errors.divisionId && <p className="text-sm text-destructive">{form.formState.errors.divisionId.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">סיסמה</Label>
            <Input id="password" type="password" placeholder="הקלד סיסמה" {...form.register("password")} />
            {form.formState.errors.password && <p className="text-sm text-destructive">{form.formState.errors.password.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">אימות סיסמה</Label>
            <Input id="confirmPassword" type="password" placeholder="הקלד סיסמה שוב" {...form.register("confirmPassword")} />
            {form.formState.errors.confirmPassword && <p className="text-sm text-destructive">{form.formState.errors.confirmPassword.message}</p>}
          </div>
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? <Loader2 className="animate-spin" /> : "הירשם"}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="flex flex-col items-center space-y-2">
        <p className="text-sm text-muted-foreground">
          משתמש רשום?{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            התחבר כאן
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}
