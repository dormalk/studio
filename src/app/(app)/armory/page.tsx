
import { getArmoryItems, getArmoryItemTypes } from "@/actions/armoryActions";
import { getSoldiers } from "@/actions/soldierActions"; // Still needed for linking
import type { ArmoryItem, ArmoryItemType, Soldier } from "@/types";
import { ArmoryManagementClient } from "./ArmoryManagementClient"; // Client component

export const dynamic = 'force-dynamic';

export default async function ArmoryPage() {
  // getArmoryItems will now handle full enrichment including type names, soldier names, and soldier division names
  const armoryItemsData = getArmoryItems(); 
  const armoryItemTypesData = getArmoryItemTypes();
  const soldiersData = getSoldiers(); // Soldiers list is needed for the "link to soldier" dropdown

  const [armoryItems, armoryItemTypes, soldiers] = await Promise.all([
    armoryItemsData, 
    armoryItemTypesData,
    soldiersData
  ]);
  
  return (
    <div className="container mx-auto py-8">
      <ArmoryManagementClient 
        initialArmoryItems={armoryItems} 
        initialArmoryItemTypes={armoryItemTypes}
        initialSoldiers={soldiers} 
      />
    </div>
  );
}

