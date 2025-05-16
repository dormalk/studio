import { getArmoryItems, getArmoryItemTypes } from "@/actions/armoryActions";
import type { ArmoryItem, ArmoryItemType } from "@/types";
import { ArmoryManagementClient } from "./ArmoryManagementClient"; // Client component

export const dynamic = 'force-dynamic';

export default async function ArmoryPage() {
  const armoryItemsData = getArmoryItems();
  const armoryItemTypesData = getArmoryItemTypes();

  const [rawArmoryItems, armoryItemTypes] = await Promise.all([armoryItemsData, armoryItemTypesData]);

  // Enrich armory items with item type names
  const armoryItems = rawArmoryItems.map(item => {
    const type = armoryItemTypes.find(t => t.id === item.itemTypeId);
    return {
      ...item,
      itemTypeName: type ? type.name : "סוג לא ידוע"
    };
  });
  
  return (
    <div className="container mx-auto py-8">
      <ArmoryManagementClient initialArmoryItems={armoryItems} initialArmoryItemTypes={armoryItemTypes} />
    </div>
  );
}
