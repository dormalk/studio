
import { getSoldierById } from "@/actions/soldierActions";
import { getArmoryItemsBySoldierId, getArmoryItemTypes } from "@/actions/armoryActions"; // Added getArmoryItemTypes
import { SoldierDetailClient } from "./SoldierDetailClient";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";


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
  const armoryItemTypesData = getArmoryItemTypes(); // Fetch armory item types

  const [soldier, linkedArmoryItems, armoryItemTypes] = await Promise.all([
    soldierData,
    linkedArmoryItemsData,
    armoryItemTypesData
  ]);
  
  if (!soldier) {
    notFound();
  }
  
  // Enrich armory items with item type names if not already present
  // This might be redundant if getArmoryItemsBySoldierId already does this, but good for safety.
  const enrichedLinkedArmoryItems = linkedArmoryItems.map(item => {
    if (!item.itemTypeName) {
      const type = armoryItemTypes.find(t => t.id === item.itemTypeId);
      return { ...item, itemTypeName: type ? type.name : "סוג לא ידוע" };
    }
    return item;
  });
  
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
        initialArmoryItems={enrichedLinkedArmoryItems} 
        initialArmoryItemTypes={armoryItemTypes} // Pass item types to client
      />
    </div>
  );
}

    
