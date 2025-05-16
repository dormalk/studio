"use client";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Menu, Shield } from "lucide-react";
import Link from "next/link";
import { SidebarNav } from "./SidebarNav"; // Will be created next

export function AppHeader() {
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
              <div className="flex h-full flex-col p-4">
                <Link href="/" className="mb-4 flex items-center gap-2 text-lg font-semibold">
                  <Shield className="h-7 w-7 text-primary" />
                  <span>מנהל צה"ל</span>
                </Link>
                <SidebarNav isMobile={true} />
              </div>
            </SheetContent>
          </Sheet>
      </div>
      <div className="flex w-full items-center justify-end gap-4 md:ml-auto md:gap-2 lg:gap-4">
        {/* Placeholder for User Menu / Theme Toggle */}
        {/* <ModeToggle /> UserMenu /> */}
      </div>
    </header>
  );
}
