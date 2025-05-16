
import { getSoldierById } from "@/actions/soldierActions";
import { getArmoryItemsBySoldierId, getArmoryItemTypes, getArmoryItems } from "@/actions/armoryActions";
import { SoldierDetailClient } from "./SoldierDetailClient";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import type { ArmoryItem } from "@/types";

export const dynamic = 'force-dynamic';

interface SoldierPageProps {
  params: {
    soldierId: string;
  };
}

export default async function SoldierPage({ params }: SoldierPageProps) {
  const { soldierId } = params;
  
  const soldierData = getSoldierById(soldierId);
  const linkedArmoryItemsData = getArmoryItemsBySoldierId(soldierId);
  const armoryItemTypesData = getArmoryItemTypes();
  const allArmoryItemsData = getArmoryItems(); // Fetch all armory items

  const [soldier, linkedArmoryItems, armoryItemTypes, allArmoryItems] = await Promise.all([
    soldierData,
    linkedArmoryItemsData,
    armoryItemTypesData,
    allArmoryItemsData
  ]);
  
  if (!soldier) {
    notFound();
  }
  
  const availableNonUniqueItems = allArmoryItems.filter(item => !item.isUniqueItem).map(item => {
    const totalAssigned = item.assignments?.reduce((sum, asgn) => sum + asgn.quantity, 0) || 0;
    return {
      ...item,
      availableQuantity: (item.totalQuantity || 0) - totalAssigned,
    };
  }).filter(item => (item.availableQuantity || 0) > 0 || item.assignments?.some(a => a.soldierId === soldierId)); // Include if soldier has assignment even if stock is 0

  return (
    <div className="container mx-auto py-8 space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">פרטי חייל: {soldier.name} (ת.ז. {soldierId})</h1>
        <Button asChild variant="outline">
            <Link href="/soldiers">
                <ArrowRight className="ms-2 h-4 w-4" />
                חזרה לכל החיילים
            </Link>
        </Button>
      </div>
      
      <SoldierDetailClient 
        soldier={soldier} 
        initialArmoryItems={linkedArmoryItems} 
        initialArmoryItemTypes={armoryItemTypes}
        availableNonUniqueItems={availableNonUniqueItems as Array<ArmoryItem & { availableQuantity: number }>}
      />
    </div>
  );
}
