
// Placeholder for Divisions List Page
// This will be implemented in the next step.

// import { getDivisionsWithDetails } from "@/actions/divisionActions"; // Action to be created
// import { DivisionsClient } from "./DivisionsClient";

export const dynamic = 'force-dynamic';

export default async function DivisionsPage() {
  // const divisionsWithDetails = await getDivisionsWithDetails();
  
  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-6">ניהול פלוגות</h1>
      {/* <DivisionsClient initialDivisions={divisionsWithDetails} /> */}
      <p className="text-muted-foreground">דף ניהול פלוגות ייושם בשלב הבא.</p>
      <p className="text-muted-foreground">יוצגו כאן הפלוגות עם כמות חיילים וציוד מקושר.</p>
    </div>
  );
}
