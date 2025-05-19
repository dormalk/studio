
"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Shield, Loader2 } from "lucide-react"; // Added Loader2
import { useAuth } from "@/contexts/AuthContext";

const loginSchema = z.object({
  soldierId: z.string().min(1, "מספר אישי הינו שדה חובה"),
  password: z.string().min(6, "סיסמה חייבת להכיל לפחות 6 תווים"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export function LoginClient() {
  const router = useRouter();
  const { toast } = useToast();
  const [isSubmittingRealLogin, setIsSubmittingRealLogin] = useState(false); // Renamed for clarity
  const { devLoginAsAdmin, loading: authContextLoading } = useAuth();

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      soldierId: "",
      password: "",
    },
  });

  const onSubmit = async (data: LoginFormValues) => {
    setIsSubmittingRealLogin(true);
    const email = `${data.soldierId}@tzahal.app`;

    try {
      await signInWithEmailAndPassword(auth, email, data.password);
      toast({
        title: "התחברות הצליחה",
        description: "מיד תועבר למערכת.",
      });
      // AuthContext's useEffect watching onAuthStateChanged will handle redirect
    } catch (error: any) {
      console.error("Login error:", error);
      let errorMessage = "התחברות נכשלה. אנא בדוק את פרטיך ונסה שנית.";
      if (error.code) {
        switch (error.code) {
          case "auth/user-not-found":
          case "auth/wrong-password":
          case "auth/invalid-credential":
            errorMessage = "מספר אישי או סיסמה שגויים.";
            break;
          case "auth/invalid-email":
             errorMessage = "המספר האישי שהוזן אינו תקין.";
            break;
          default:
            errorMessage = `שגיאה (${error.code}). נסה שנית מאוחר יותר.`;
        }
      }
      toast({
        variant: "destructive",
        title: "שגיאת התחברות",
        description: errorMessage,
      });
    } finally {
      setIsSubmittingRealLogin(false);
    }
  };

  const handleDevAdminLogin = () => {
    if (devLoginAsAdmin) {
      // We don't set local loading state here.
      // devLoginAsAdmin in AuthContext will set its own loading to false
      // and trigger navigation if successful.
      devLoginAsAdmin();
    }
  };

  // Overall loading state for disabling UI elements
  const isLoading = isSubmittingRealLogin || authContextLoading;

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
            {isSubmittingRealLogin ? <Loader2 className="animate-spin" /> : "התחבר"}
          </Button>
        </form>
        {process.env.NODE_ENV === 'development' && devLoginAsAdmin && (
          <Button
            type="button"
            variant="outline"
            className="w-full mt-3 border-amber-500 text-amber-600 hover:bg-amber-100 hover:text-amber-700"
            onClick={handleDevAdminLogin}
            disabled={authContextLoading} // Only disable if AuthContext is globally loading
          >
            {authContextLoading && !isSubmittingRealLogin ? <Loader2 className="animate-spin" /> : "התחבר כמנהל (פיתוח)"}
          </Button>
        )}
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

    