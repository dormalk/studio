
"use client";

import type { Soldier, DivisionArmorySummary } from "@/types";
import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Eye, UserCircle, Package, Archive, FileText, Users } from "lucide-react";
import { Separator } from "@/components/ui/separator";

interface DivisionSoldiersClientProps {
  initialSoldiers: Soldier[];
  divisionName: string;
  divisionArmorySummary: DivisionArmorySummary;
}

const ITEMS_PER_PAGE = 8;

export function DivisionSoldiersClient({
  initialSoldiers,
  divisionName,
  divisionArmorySummary
}: DivisionSoldiersClientProps) {
  const [soldiers, setSoldiers] = useState(initialSoldiers);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    setSoldiers(initialSoldiers);
    setCurrentPage(1); // Reset page when initial soldiers change (e.g. navigating to a new division)
  }, [initialSoldiers]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const filteredSoldiers = useMemo(() => {
    return soldiers.filter(soldier =>
        soldier.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        soldier.id.includes(searchTerm)
    ).sort((a,b) => a.name.localeCompare(b.name));
  }, [soldiers, searchTerm]);

  const totalPages = Math.ceil(filteredSoldiers.length / ITEMS_PER_PAGE);
  const paginatedSoldiers = filteredSoldiers.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );


  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>סיכום מחסן פלוגתי</CardTitle>
          <CardDescription>סה"כ פריטים המשויכים לחיילי הפלוגה "{divisionName}"</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm flex items-center">
            <Package className="w-4 h-4 me-2 text-muted-foreground" />
            סה"כ פריטים ייחודיים משויכים בפלוגה: <span className="font-semibold ms-1">{divisionArmorySummary.totalUniqueItemsInDivision}</span>
          </p>
          {divisionArmorySummary.nonUniqueItemsSummaryInDivision.length > 0 && (
            <div>
              <p className="text-sm flex items-center font-medium">
                <Archive className="w-4 h-4 me-2 text-muted-foreground" />
                סיכום פריטים כמותיים בפלוגה:
              </p>
              <ul className="list-disc ps-7 text-sm text-muted-foreground space-y-0.5 mt-1">
                {divisionArmorySummary.nonUniqueItemsSummaryInDivision.map(summary => (
                  <li key={summary.itemTypeName}>{summary.itemTypeName}: {summary.totalQuantityAssigned} יח'</li>
                ))}
              </ul>
            </div>
          )}
          {divisionArmorySummary.nonUniqueItemsSummaryInDivision.length === 0 && divisionArmorySummary.totalUniqueItemsInDivision === 0 && (
             <p className="text-sm text-muted-foreground">אין פריטי מחסן משויכים לחיילים בפלוגה זו.</p>
          )}
        </CardContent>
      </Card>

      <Input
        type="search"
        placeholder="חפש חייל לפי שם או מ.א..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="max-w-sm"
      />

      {filteredSoldiers.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">
          {searchTerm ? `לא נמצאו חיילים התואמים לחיפוש בפלוגה "${divisionName}".` : `אין חיילים משויכים לפלוגה "${divisionName}".`}
        </p>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {paginatedSoldiers.map((soldier) => (
              <Card key={soldier.id} className="flex flex-col">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <UserCircle className="h-10 w-10 text-muted-foreground" />
                    <div>
                      <CardTitle>{soldier.name}</CardTitle>
                      <CardDescription>מ.א. {soldier.id}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex-grow space-y-3">
                  <div>
                    <p className="text-xs font-medium mb-0.5">סיכום מחסן:</p>
                    {(!soldier.assignedUniqueArmoryItemsDetails || soldier.assignedUniqueArmoryItemsDetails.length === 0) &&
                     (!soldier.assignedNonUniqueArmoryItemsSummary || soldier.assignedNonUniqueArmoryItemsSummary.length === 0) ? (
                      <p className="text-xs text-muted-foreground">אין פריטי מחסן משויכים.</p>
                    ) : (
                      <>
                        {(soldier.assignedUniqueArmoryItemsDetails && soldier.assignedUniqueArmoryItemsDetails.length > 0) && (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            <p className="flex items-center font-medium"><Package className="inline h-3.5 w-3.5 me-1.5" />פריטים ייחודיים ({soldier.assignedUniqueArmoryItemsDetails.length}):</p>
                            <ul className="list-disc ps-6 space-y-0.5">
                              {soldier.assignedUniqueArmoryItemsDetails.slice(0, 2).map(detail => (
                                <li key={detail.id}>{detail.itemTypeName}: {detail.itemId}</li>
                              ))}
                              {soldier.assignedUniqueArmoryItemsDetails.length > 2 && (
                                <li>ועוד {soldier.assignedUniqueArmoryItemsDetails.length - 2}...</li>
                              )}
                            </ul>
                          </div>
                        )}
                        {soldier.assignedNonUniqueArmoryItemsSummary && soldier.assignedNonUniqueArmoryItemsSummary.length > 0 && (
                          <div className="text-xs text-muted-foreground mt-1">
                            <p className="flex items-center font-medium"><Archive className="inline h-3.5 w-3.5 me-1.5" />פריטים כמותיים:</p>
                            <ul className="list-disc ps-6 space-y-0.5">
                              {soldier.assignedNonUniqueArmoryItemsSummary.map(summary => (
                                <li key={summary.itemTypeName}>{summary.itemTypeName}: {summary.quantity}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                   <Separator className="my-2" />
                  <div>
                      <p className="text-xs font-medium mb-0.5">סיכום מסמכים:</p>
                      {soldier.documents && soldier.documents.length > 0 ? (
                      <>
                          <p className="text-xs text-muted-foreground flex items-center">
                              <FileText className="inline h-3.5 w-3.5 me-1.5" />
                              סה"כ מסמכים: {soldier.documents.length}
                          </p>
                           <ul className="space-y-0.5 ps-6 list-disc text-xs text-muted-foreground">
                          {soldier.documents.slice(0, 2).map(doc => (
                              <li key={doc.id} className="truncate">{doc.fileName}</li>
                          ))}
                          {soldier.documents.length > 2 && <li>ועוד...</li>}
                          </ul>
                      </>
                      ) : (
                      <p className="text-xs text-muted-foreground">אין מסמכים מצורפים.</p>
                      )}
                  </div>
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
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-6">
              <Button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                variant="outline"
              >
                הקודם
              </Button>
              <span className="text-sm">
                עמוד {currentPage} מתוך {totalPages}
              </span>
              <Button
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                variant="outline"
              >
                הבא
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
