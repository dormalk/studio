import { getSoldiers } from "@/actions/soldierActions";
import { getDivisions } from "@/actions/divisionActions";
import type { Soldier, Division } from "@/types";
import { SoldiersManagementClient } from "./SoldiersManagementClient"; // Client component

export const dynamic = 'force-dynamic'; // Ensure data is fetched on each request

export default async function SoldiersPage() {
  const soldiersData = getSoldiers();
  const divisionsData = getDivisions();

  const [soldiers, divisions] = await Promise.all([soldiersData, divisionsData]);

  // Enrich soldiers with division names for easier display
  const soldiersWithDivisionNames = soldiers.map(soldier => {
    const division = divisions.find(d => d.id === soldier.divisionId);
    return {
      ...soldier,
      divisionName: division ? division.name : "לא משויך"
    };
  });
  
  return (
    <div className="container mx-auto py-8">
      <SoldiersManagementClient initialSoldiers={soldiersWithDivisionNames} initialDivisions={divisions} />
    </div>
  );
}
