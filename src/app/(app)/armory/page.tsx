import { getArmoryItems } from "@/actions/armoryActions";
import type { ArmoryItem } from "@/types";
import { ArmoryManagementClient } from "./ArmoryManagementClient"; // Client component

export const dynamic = 'force-dynamic';

export default async function ArmoryPage() {
  const armoryItems = await getArmoryItems();
  
  return (
    <div className="container mx-auto py-8">
      <ArmoryManagementClient initialArmoryItems={armoryItems} />
    </div>
  );
}
