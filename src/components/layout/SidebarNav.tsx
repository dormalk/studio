"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Users, Archive, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

interface SidebarNavProps extends HTMLAttributes<HTMLElement> {
  isMobile?: boolean;
}

export function SidebarNav({ className, isMobile = false, ...props }: SidebarNavProps) {
  const pathname = usePathname();

  const routes = [
    {
      href: "/soldiers",
      label: "חיילים",
      icon: Users,
      active: pathname === "/soldiers" || pathname.startsWith("/soldiers"),
    },
    {
      href: "/armory",
      label: "נשקייה",
      icon: Archive,
      active: pathname === "/armory" || pathname.startsWith("/armory"),
    },
  ];

  return (
    <nav
      className={cn(
        "flex flex-col gap-2 text-sm font-medium",
        isMobile ? "mt-6" : "px-2 lg:px-4",
        className
      )}
      {...props}
    >
      {routes.map((route) => (
        <Link
          key={route.href}
          href={route.href}
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2 transition-all hover:bg-accent hover:text-accent-foreground",
            route.active ? "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground" : "text-muted-foreground"
          )}
        >
          <route.icon className="h-5 w-5" />
          {route.label}
        </Link>
      ))}
    </nav>
  );
}
