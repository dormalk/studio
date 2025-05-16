
import { getArmoryItems, getArmoryItemTypes } from "@/actions/armoryActions";
import { getSoldiers } from "@/actions/soldierActions";
import type { ArmoryItem, ArmoryItemType, Soldier } from "@/types";
import { ArmoryManagementClient } from "./ArmoryManagementClient"; // Client component

export const dynamic = 'force-dynamic';

export default async function ArmoryPage() {
  const armoryItemsData = getArmoryItems();
  const armoryItemTypesData = getArmoryItemTypes();
  const soldiersData = getSoldiers();

  const [rawArmoryItems, armoryItemTypes, soldiers] = await Promise.all([
    armoryItemsData, 
    armoryItemTypesData,
    soldiersData
  ]);

  // Enrich armory items with item type names and linked soldier names
  const armoryItems = rawArmoryItems.map(item => {
    const type = armoryItemTypes.find(t => t.id === item.itemTypeId);
    const soldier = item.linkedSoldierId ? soldiers.find(s => s.id === item.linkedSoldierId) : undefined;
    return {
      ...item,
      itemTypeName: type ? type.name : "סוג לא ידוע",
      linkedSoldierName: soldier ? soldier.name : undefined
    };
  });
  
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
