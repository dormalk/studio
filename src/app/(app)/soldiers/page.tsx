
import { getSoldiers } from "@/actions/soldierActions";
import { getDivisions } from "@/actions/divisionActions";
import { getArmoryItems } from "@/actions/armoryActions";
import type { Soldier, Division, ArmoryItem } from "@/types";
import { AllSoldiersClient } from "./AllSoldiersClient";

export const dynamic = 'force-dynamic';

export default async function AllSoldiersPage() {
  const soldiersData = getSoldiers();
  const divisionsData = getDivisions();
  const armoryItemsData = getArmoryItems();

  const [soldiers, divisions, allArmoryItems] = await Promise.all([
    soldiersData,
    divisionsData,
    armoryItemsData
  ]);

  // Enrich soldiers with division names and armory summaries
  const soldiersWithDetails = soldiers.map(soldier => {
    const division = divisions.find(d => d.id === soldier.divisionId);
    
    let assignedUniqueArmoryItemsCount = 0;
    const nonUniqueAssignmentsMap = new Map<string, { itemTypeName: string, quantity: number }>();

    allArmoryItems.forEach(item => {
      if (item.isUniqueItem && item.linkedSoldierId === soldier.id) {
        assignedUniqueArmoryItemsCount++;
      } else if (!item.isUniqueItem && item.assignments) {
        item.assignments.forEach(assignment => {
          if (assignment.soldierId === soldier.id) {
            const existingSummary = nonUniqueAssignmentsMap.get(item.itemTypeId);
            if (existingSummary) {
              existingSummary.quantity += assignment.quantity;
            } else {
              nonUniqueAssignmentsMap.set(item.itemTypeId, {
                itemTypeName: item.itemTypeName || "סוג לא ידוע",
                quantity: assignment.quantity
              });
            }
          }
        });
      }
    });

    const assignedNonUniqueArmoryItemsSummary = Array.from(nonUniqueAssignmentsMap.values());

    return {
      ...soldier,
      divisionName: division ? division.name : "לא משויך",
      assignedUniqueArmoryItemsCount,
      assignedNonUniqueArmoryItemsSummary
    };
  }).sort((a, b) => a.name.localeCompare(b.name)); // Ensure consistent sorting
  
  return (
    <div className="container mx-auto py-8">
      <AllSoldiersClient initialSoldiers={soldiersWithDetails} initialDivisions={divisions} />
    </div>
  );
}
