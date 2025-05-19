
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
import { Shield } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext"; // Import useAuth

const loginSchema = z.object({
  soldierId: z.string().min(1, "מספר אישי הינו שדה חובה"),
  password: z.string().min(6, "סיסמה חייבת להכיל לפחות 6 תווים"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export function LoginClient() {
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const { devLoginAsAdmin } = useAuth(); // Get devLoginAsAdmin from context

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      soldierId: "",
      password: "",
    },
  });

  const onSubmit = async (data: LoginFormValues) => {
    setIsLoading(true);
    const email = `${data.soldierId}@tzahal.app`; 

    try {
      await signInWithEmailAndPassword(auth, email, data.password);
      toast({
        title: "התחברות הצליחה",
        description: "מיד תועבר למערכת.",
      });
      // No need to router.push here, AuthContext useEffect will handle it
      // router.push("/"); 
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
            errorMessage = `שגיאה לא צפויה. אנא נסה שנית מאוחר יותר.`;
        }
      }
      toast({
        variant: "destructive",
        title: "שגיאת התחברות",
        description: errorMessage,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDevAdminLogin = () => {
    if (devLoginAsAdmin) {
      setIsLoading(true); // Show loading state during mock login
      devLoginAsAdmin();
      // setIsLoading(false) will be handled by AuthContext or redirection
    }
  };

  return (
    <Card className="h-full max-w-md my-auto shadow-xl rounded-none border-none">
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
            {isLoading ? "מתחבר..." : "התחבר"}
          </Button>
        </form>
        {process.env.NODE_ENV === 'development' && devLoginAsAdmin && (
          <Button
            type="button"
            variant="outline"
            className="w-full mt-3 border-amber-500 text-amber-600 hover:bg-amber-100"
            onClick={handleDevAdminLogin}
            disabled={isLoading}
          >
            התחבר כמנהל (פיתוח)
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

    