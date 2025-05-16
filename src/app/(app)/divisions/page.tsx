
import { getDivisionsWithDetails } from "@/actions/divisionActions";
import { DivisionsClient } from "./DivisionsClient";
import type { DivisionWithDetails } from "@/types";

export const dynamic = 'force-dynamic';

export default async function DivisionsPage() {
  const divisionsWithDetails: DivisionWithDetails[] = await getDivisionsWithDetails();
  
  return (
    <div className="container mx-auto py-8">
      <DivisionsClient initialDivisions={divisionsWithDetails} />
    </div>
  );
}
