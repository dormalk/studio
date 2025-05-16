
import { getSoldiers } from "@/actions/soldierActions";
import { getDivisions } from "@/actions/divisionActions"; // Still needed for the "Add/Edit Soldier" dialog
import type { Soldier, Division } from "@/types";
import { AllSoldiersClient } from "./AllSoldiersClient"; // Renamed/New client component

export const dynamic = 'force-dynamic';

export default async function AllSoldiersPage() {
  const soldiersData = getSoldiers();
  const divisionsData = getDivisions(); // For the dropdown in Add/Edit Soldier Dialog

  const [soldiers, divisions] = await Promise.all([soldiersData, divisionsData]);

  // Enrich soldiers with division names for easier display and sort them
  const soldiersWithDivisionNames = soldiers.map(soldier => {
    const division = divisions.find(d => d.id === soldier.divisionId);
    return {
      ...soldier,
      divisionName: division ? division.name : "לא משויך"
    };
  }).sort((a, b) => a.name.localeCompare(b.name)); // Ensure consistent sorting
  
  return (
    <div className="container mx-auto py-8">
      <AllSoldiersClient initialSoldiers={soldiersWithDivisionNames} initialDivisions={divisions} />
    </div>
  );
}

