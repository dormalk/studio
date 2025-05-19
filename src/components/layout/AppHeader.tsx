
"use client";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetHeader } from "@/components/ui/sheet"; // Added SheetTitle, SheetHeader
import { Menu, Shield, LogOut } from "lucide-react"; // Added LogOut
import Link from "next/link";
import { SidebarNav } from "./SidebarNav";
import { useAuth } from "@/contexts/AuthContext"; // Import useAuth

export function AppHeader() {
  const { user, logout } = useAuth(); // Get user and logout function

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background/80 backdrop-blur-sm px-4 md:px-6 shadow-sm">
      <div className="md:hidden">
         <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon">
                <Menu className="h-5 w-5" />
                <span className="sr-only">פתח תפריט ניווט</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="p-0">
              <SheetHeader className="border-b"> {/* Added SheetHeader */}
                <SheetTitle> {/* Radix UI expects a DialogTitle (SheetTitle) for accessibility */}
                  <Link href="/" className="flex items-center gap-2 px-4 py-5 text-lg font-semibold">
                    <Shield className="h-7 w-7 text-primary" />
                    <span>מנהל צה"ל</span>
                  </Link>
                </SheetTitle>
              </SheetHeader>
              <div className="flex h-full flex-col p-4">
                <SidebarNav isMobile={true} />
                {user && (
                   <Button onClick={logout} variant="outline" className="mt-auto">
                    <LogOut className="ms-2 h-4 w-4" />
                    התנתק
                  </Button>
                )}
              </div>
            </SheetContent>
          </Sheet>
      </div>
      <div className="flex w-full items-center justify-end gap-4 md:ml-auto md:gap-2 lg:gap-4">
        {user && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground hidden sm:inline">
              שלום, {auth.currentUser?.displayName || user.email}
            </span>
            <Button onClick={logout} variant="ghost" size="icon" title="התנתק">
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        )}
      </div>
    </header>
  );
}
