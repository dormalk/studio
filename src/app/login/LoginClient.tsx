
"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import Link from "next/link";
// useRouter is not used here for navigation, AuthContext handles it
// import { useRouter } from "next/navigation"; 
import { signInWithCustomToken } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Shield, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

const loginSchema = z.object({
  soldierId: z.string().min(1, "מספר אישי הינו שדה חובה"),
  password: z.string().min(6, "סיסמה חייבת להכיל לפחות 6 תווים"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export function LoginClient() {
  // const router = useRouter(); // Not used here, AuthContext handles navigation
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { loading: authContextLoading } = useAuth();

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      soldierId: "",
      password: "",
    },
  });

  const onSubmit = async (data: LoginFormValues) => {
    setIsSubmitting(true);
    try {
      const response = await fetch('/api/auth/custom-login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "שגיאת התחברות מהשרת");
      }

      if (!result.token) {
        throw new Error("שרת לא החזיר טוקן להתחברות");
      }

      await signInWithCustomToken(auth, result.token);
      toast({
        title: "התחברות הצליחה",
        description: "מיד תועבר למערכת.",
      });
      // AuthContext's onAuthStateChanged will handle redirection
    } catch (error: any) {
      console.error("Custom Login error:", error);
      toast({
        variant: "destructive",
        title: "שגיאת התחברות",
        description: error.message || "פרטי ההתחברות שגויים או שגיאה לא צפויה.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const isLoading = isSubmitting || authContextLoading;

  return (
    <Card className="w-full h-full max-w-md my-auto shadow-xl sm:rounded-lg border-none sm:border">
      <CardHeader className="items-center text-center">
        <Shield className="h-12 w-12 text-primary mb-2" />
        <CardTitle className="text-2xl">התחברות למערכת</CardTitle>
        <CardDescription>הזן מספר אישי וסיסמה כדי להתחבר</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="soldierId">מספר אישי</Label>
            <Input
              id="soldierId"
              type="text"
              placeholder="הקלד מספר אישי"
              {...form.register("soldierId")}
              disabled={isLoading}
            />
            {form.formState.errors.soldierId && (
              <p className="text-sm text-destructive">{form.formState.errors.soldierId.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">סיסמה</Label>
            <Input
              id="password"
              type="password"
              placeholder="הקלד סיסמה"
              {...form.register("password")}
              disabled={isLoading}
            />
            {form.formState.errors.password && (
              <p className="text-sm text-destructive">{form.formState.errors.password.message}</p>
            )}
          </div>
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isSubmitting ? <Loader2 className="animate-spin" /> : "התחבר"}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="flex flex-col items-center space-y-2">
        <p className="text-sm text-muted-foreground">
          אין לך עדיין משתמש?{" "}
          <Link href="/register" className="font-medium text-primary hover:underline">
            הירשם כאן
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}
