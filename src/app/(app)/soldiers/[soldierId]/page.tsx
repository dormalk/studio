
// Placeholder for Single Soldier Detail Page
// This will be implemented in a later step.

// import { getSoldierById } from "@/actions/soldierActions"; // Action to be created
// import { getArmoryItemsBySoldierId } from "@/actions/armoryActions"; // Action to be created
// import { SoldierDetailClient } from "./SoldierDetailClient";
// import { notFound } from "next/navigation";

export const dynamic = 'force-dynamic';

interface SoldierPageProps {
  params: {
    soldierId: string;
  };
}

export default async function SoldierPage({ params }: SoldierPageProps) {
  const { soldierId } = params;
  // const soldier = await getSoldierById(soldierId);
  // if (!soldier) {
  //   notFound();
  // }
  // const linkedArmoryItems = await getArmoryItemsBySoldierId(soldierId);
  
  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-6">פרטי חייל: {/*soldier.name*/} (ת.ז. {soldierId})</h1>
      {/* <SoldierDetailClient soldier={soldier} initialArmoryItems={linkedArmoryItems} /> */}
      <p className="text-muted-foreground">דף פרטי חייל ייושם בשלב הבא.</p>
      <p className="text-muted-foreground">יוצגו כאן פרטי החייל, רשימת מסמכים, ופריטי נשקייה מקושרים.</p>
    </div>
  );
}

