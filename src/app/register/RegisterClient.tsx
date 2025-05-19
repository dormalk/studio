
"use client";

import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { doc, setDoc, getDoc, Timestamp } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import type { Division, Soldier, UserProfile } from "@/types";
import { Shield } from "lucide-react";
import { checkSoldierExists } from "@/actions/soldierActions"; // Assuming this function exists

const registerSchema = z.object({
  fullName: z.string().min(2, "שם מלא הינו שדה חובה"),
  soldierId: z.string().min(1, "מספר אישי הינו שדה חובה").regex(/^\d+$/, "מספר אישי חייב להכיל ספרות בלבד"),
  divisionId: z.string().min(1, "יש לבחור פלוגה"),
  password: z.string().min(6, "סיסמה חייבת להכיל לפחות 6 תווים"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "הסיסמאות אינן תואמות",
  path: ["confirmPassword"],
});

type RegisterFormValues = z.infer<typeof registerSchema>;

interface RegisterClientProps {
  divisions: Division[];
}

export function RegisterClient({ divisions }: RegisterClientProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      fullName: "",
      soldierId: "",
      divisionId: "",
      password: "",
      confirmPassword: "",
    },
  });

  const onSubmit = async (data: RegisterFormValues) => {
    setIsLoading(true);
    const email = `${data.soldierId}@tzahal.app`; // Construct the email

    try {
      // 1. Check if soldier with this soldierId already exists in 'soldiers' collection
      const soldierDocRef = doc(db, "soldiers", data.soldierId);
      const soldierDocSnap = await getDoc(soldierDocRef);

      if (soldierDocSnap.exists()) {
        // Soldier exists, check if already registered in 'users'
        const userDocRef = doc(db, "users", data.soldierId); // Assuming user doc ID is soldierId
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          toast({ variant: "destructive", title: "שגיאת הרשמה", description: "משתמש עם מספר אישי זה כבר רשום במערכת." });
          setIsLoading(false);
          return;
        }
        // Soldier exists and not registered - proceed with auth creation
      } else {
         toast({ variant: "destructive", title: "שגיאת הרשמה", description: "חייל עם מספר אישי זה אינו קיים במערכת. פנה למנהל." });
         setIsLoading(false);
         return;
      }
      
      // 2. Create user in Firebase Authentication
      const userCredential = await createUserWithEmailAndPassword(auth, email, data.password);
      const firebaseUser = userCredential.user;

      // 3. Create user profile in Firestore 'users' collection
      // The document ID in 'users' will be the soldierId for easier querying.
      const userProfile: UserProfile = {
        uid: firebaseUser.uid, // Firebase Auth UID
        email: firebaseUser.email,
        soldierId: data.soldierId,
        displayName: data.fullName, // This comes from the form now
        divisionId: data.divisionId,
        role: "User", // Default role
        createdAt: Timestamp.now(),
      };
      await setDoc(doc(db, "users", data.soldierId), userProfile);
      
      // Optional: Update soldier document if form name is different (or ensure they match)
      // This part depends on whether you want the registration form to also update the 'soldiers' collection.
      // For now, we assume the soldier's name in 'soldiers' is the source of truth and the form name is for the 'users' profile.
      // If soldierDocSnap.data()?.name !== data.fullName, consider an update strategy.

      toast({
        title: "הרשמה הצליחה",
        description: "מיד תועבר למערכת.",
      });
      router.push("/"); // Redirect to main app page
    } catch (error: any) {
      console.error("Registration error:", error);
      let errorMessage = "ההרשמה נכשלה. נסה שנית מאוחר יותר.";
      if (error.code) {
        switch (error.code) {
          case "auth/email-already-in-use":
            errorMessage = "מספר אישי זה כבר רשום במערכת (כאימייל).";
            break;
          case "auth/invalid-email":
            errorMessage = "המספר האישי שהוזן אינו תקין ליצירת אימייל.";
            break;
          case "auth/weak-password":
            errorMessage = "הסיסמה חלשה מדי.";
            break;
          default:
            errorMessage = `שגיאה: ${error.message}`;
        }
      }
      toast({
        variant: "destructive",
        title: "שגיאת הרשמה",
        description: errorMessage,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md shadow-xl">
      <CardHeader className="items-center text-center">
        <Shield className="h-12 w-12 text-primary mb-2" />
        <CardTitle className="text-2xl">הרשמה למערכת</CardTitle>
        <CardDescription>הזן את פרטיך כדי ליצור משתמש חדש</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="fullName">שם מלא</Label>
            <Input id="fullName" placeholder="הקלד שם מלא" {...form.register("fullName")} disabled={isLoading} />
            {form.formState.errors.fullName && <p className="text-sm text-destructive">{form.formState.errors.fullName.message}</p>}
          </div>
          <div className="space-y-1">
            <Label htmlFor="soldierId">מספר אישי</Label>
            <Input id="soldierId" placeholder="הקלד מספר אישי" {...form.register("soldierId")} disabled={isLoading} />
            {form.formState.errors.soldierId && <p className="text-sm text-destructive">{form.formState.errors.soldierId.message}</p>}
          </div>
          <div className="space-y-1">
            <Label htmlFor="divisionId">פלוגה</Label>
            <Controller
              name="divisionId"
              control={form.control}
              render={({ field }) => (
                <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value} disabled={isLoading}>
                  <SelectTrigger id="divisionId">
                    <SelectValue placeholder="בחר פלוגה..." />
                  </SelectTrigger>
                  <SelectContent>
                    {divisions.map((division) => (
                      <SelectItem key={division.id} value={division.id}>
                        {division.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {form.formState.errors.divisionId && <p className="text-sm text-destructive">{form.formState.errors.divisionId.message}</p>}
          </div>
          <div className="space-y-1">
            <Label htmlFor="password">סיסמה</Label>
            <Input id="password" type="password" placeholder="הקלד סיסמה" {...form.register("password")} disabled={isLoading} />
            {form.formState.errors.password && <p className="text-sm text-destructive">{form.formState.errors.password.message}</p>}
          </div>
          <div className="space-y-1">
            <Label htmlFor="confirmPassword">אימות סיסמה</Label>
            <Input id="confirmPassword" type="password" placeholder="הקלד סיסמה שנית" {...form.register("confirmPassword")} disabled={isLoading} />
            {form.formState.errors.confirmPassword && <p className="text-sm text-destructive">{form.formState.errors.confirmPassword.message}</p>}
          </div>
          <Button type="submit" className="w-full !mt-6" disabled={isLoading}>
            {isLoading ? "מרשם..." : "הירשם"}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="flex flex-col items-center space-y-2">
        <p className="text-sm text-muted-foreground">
          יש לך כבר משתמש?{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            התחבר כאן
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}
