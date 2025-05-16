
import { getArmoryItems, getArmoryItemTypes } from "@/actions/armoryActions";
import { getSoldiers } from "@/actions/soldierActions";
import type { ArmoryItem, ArmoryItemType, Soldier } from "@/types";
import { ArmoryManagementClient } from "./ArmoryManagementClient"; 

export const dynamic = 'force-dynamic';

export default async function ArmoryPage() {
  const armoryItemsData = getArmoryItems(); 
  const armoryItemTypesData = getArmoryItemTypes();
  const soldiersData = getSoldiers(); 

  const [initialArmoryItems, initialArmoryItemTypes, initialSoldiers] = await Promise.all([
    armoryItemsData, 
    armoryItemTypesData,
    soldiersData
  ]);
  
  // The enrichment of itemTypeName, isUniqueItem, linkedSoldierName, etc. is now handled within getArmoryItems
  return (
    <div className="container mx-auto py-8">
      <ArmoryManagementClient 
        initialArmoryItems={initialArmoryItems} 
        initialArmoryItemTypes={initialArmoryItemTypes} // Ensure this includes isUnique
        initialSoldiers={initialSoldiers} 
      />
    </div>
  );
}
