
import { getDivisionById } from "@/actions/divisionActions"; 
import { getSoldiersByDivisionId } from "@/actions/soldierActions"; 
import { DivisionSoldiersClient } from "./DivisionSoldiersClient";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

export const dynamic = 'force-dynamic';

interface DivisionPageProps {
  params: {
    divisionId: string;
  };
}

export default async function DivisionPage({ params }: DivisionPageProps) {
  const { divisionId } = params;
  const division = await getDivisionById(divisionId);
  
  if (!division) {
    notFound();
  }
  
  const soldiersInDivision = await getSoldiersByDivisionId(divisionId);

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">חיילים בפלוגה: {division.name}</h1>
        <Button asChild variant="outline">
          <Link href="/divisions">
            <ArrowRight className="ms-2 h-4 w-4" />
            חזרה לכל הפלוגות
          </Link>
        </Button>
      </div>
      <DivisionSoldiersClient initialSoldiers={soldiersInDivision} divisionName={division.name} />
    </div>
  );
}

