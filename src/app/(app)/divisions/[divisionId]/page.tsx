
// Placeholder for Single Division Soldiers List Page
// This will be implemented in a later step.

// import { getDivisionById } from "@/actions/divisionActions"; // Action to be created
// import { getSoldiersByDivisionId } from "@/actions/soldierActions"; // Action to be created
// import { DivisionSoldiersClient } from "./DivisionSoldiersClient";
// import { notFound } from "next/navigation";

export const dynamic = 'force-dynamic';

interface DivisionPageProps {
  params: {
    divisionId: string;
  };
}

export default async function DivisionPage({ params }: DivisionPageProps) {
  const { divisionId } = params;
  // const division = await getDivisionById(divisionId);
  // if (!division) {
  //   notFound();
  // }
  // const soldiersInDivision = await getSoldiersByDivisionId(divisionId);

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-6">חיילים בפלוגה: {/*division.name*/} (ID: {divisionId})</h1>
      {/* <DivisionSoldiersClient initialSoldiers={soldiersInDivision} divisionName={division.name} /> */}
      <p className="text-muted-foreground">דף הצגת חיילים בפלוגה ספציפית ייושם בשלב הבא.</p>
    </div>
  );
}
