
import { getDivisionById } from "@/actions/divisionActions";
import { getSoldiersByDivisionId } from "@/actions/soldierActions";
import { getArmoryItems } from "@/actions/armoryActions";
import { DivisionSoldiersClient } from "./DivisionSoldiersClient";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import type { Soldier, ArmoryItem, DivisionArmorySummary } from "@/types";

export const dynamic = 'force-dynamic';

interface DivisionPageProps {
  params: {
    divisionId: string;
  };
}

export default async function DivisionPage({ params }: DivisionPageProps) {
  const { divisionId } = params;

  const divisionData = getDivisionById(divisionId);
  const soldiersInDivisionData = getSoldiersByDivisionId(divisionId);
  const allArmoryItemsData = getArmoryItems();

  const [division, soldiersInDivision, allArmoryItems] = await Promise.all([
    divisionData,
    soldiersInDivisionData,
    allArmoryItemsData
  ]);

  if (!division) {
    notFound();
  }

  // Enrich soldiers with their specific armory summaries
  const enrichedSoldiers = soldiersInDivision.map(soldier => {
    const assignedUniqueArmoryItemsDetails: Soldier['assignedUniqueArmoryItemsDetails'] = [];
    const nonUniqueAssignmentsMap = new Map<string, { itemTypeName: string, quantity: number }>();

    allArmoryItems.forEach(item => {
      if (item.isUniqueItem && item.linkedSoldierId === soldier.id) {
        if (item.itemId) {
          assignedUniqueArmoryItemsDetails.push({
            id: item.id,
            itemTypeName: item.itemTypeName || "סוג לא ידוע",
            itemId: item.itemId,
          });
        }
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
      assignedUniqueArmoryItemsDetails,
      assignedNonUniqueArmoryItemsSummary
    };
  });

  // Calculate overall division armory summary
  let totalUniqueItemsInDivision = 0;
  const divisionNonUniqueSummaryMap = new Map<string, { itemTypeName: string, totalQuantityAssigned: number }>();

  enrichedSoldiers.forEach(soldier => {
    totalUniqueItemsInDivision += (soldier.assignedUniqueArmoryItemsDetails?.length || 0);
    soldier.assignedNonUniqueArmoryItemsSummary?.forEach(summary => {
      const existing = divisionNonUniqueSummaryMap.get(summary.itemTypeName);
      if (existing) {
        existing.totalQuantityAssigned += summary.quantity;
      } else {
        divisionNonUniqueSummaryMap.set(summary.itemTypeName, {
          itemTypeName: summary.itemTypeName,
          totalQuantityAssigned: summary.quantity
        });
      }
    });
  });

  const divisionArmorySummary: DivisionArmorySummary = {
    totalUniqueItemsInDivision,
    nonUniqueItemsSummaryInDivision: Array.from(divisionNonUniqueSummaryMap.values())
  };

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">חיילים בפלוגה: {division.name}</h1>
        <Button asChild variant="outline">
          <Link href="/divisions">
            <ArrowRight className="ms-2 h-4 w-4" />
            חזרה לכל הפלוגות
          </Link>
        </Button>
      </div>
      <DivisionSoldiersClient
        initialSoldiers={enrichedSoldiers}
        divisionName={division.name}
        divisionArmorySummary={divisionArmorySummary}
      />
    </div>
  );
}
