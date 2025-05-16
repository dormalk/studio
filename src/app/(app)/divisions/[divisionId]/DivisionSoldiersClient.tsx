
"use client";

import type { Soldier } from "@/types";
import { useState, useMemo } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Eye, UserCircle } from "lucide-react";

interface DivisionSoldiersClientProps {
  initialSoldiers: Soldier[];
  divisionName: string; // divisionName is passed as a prop
}

export function DivisionSoldiersClient({ initialSoldiers, divisionName }: DivisionSoldiersClientProps) {
  const [soldiers, setSoldiers] = useState(initialSoldiers);
  const [searchTerm, setSearchTerm] = useState("");

  // Update local state if initialSoldiers prop changes
  useState(() => {
    setSoldiers(initialSoldiers);
  });

  const filteredSoldiers = useMemo(() => {
    return soldiers.filter(soldier =>
        soldier.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        soldier.id.includes(searchTerm)
    ).sort((a,b) => a.name.localeCompare(b.name));
  }, [soldiers, searchTerm]);

  return (
    <div className="space-y-6">
      <Input
        type="search"
        placeholder="חפש חייל לפי שם או ת.ז..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="max-w-sm"
      />

      {filteredSoldiers.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">
          {searchTerm ? `לא נמצאו חיילים התואמים לחיפוש בפלוגה "${divisionName}".` : `אין חיילים משויכים לפלוגה "${divisionName}".`}
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredSoldiers.map((soldier) => (
            <Card key={soldier.id} className="flex flex-col">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <UserCircle className="h-8 w-8 text-muted-foreground" />
                  <div>
                    <CardTitle>{soldier.name}</CardTitle>
                    <CardDescription>ת.ז. {soldier.id}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex-grow">
                {/* Placeholder for additional brief soldier info if needed */}
              </CardContent>
              <CardFooter>
                <Button variant="outline" size="sm" asChild className="w-full">
                  <Link href={`/soldiers/${soldier.id}`}>
                    <Eye className="ms-2 h-3.5 w-3.5" />
                    הצג פרטי חייל
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
