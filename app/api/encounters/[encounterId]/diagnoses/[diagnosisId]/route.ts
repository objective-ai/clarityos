import { NextRequest } from "next/server";
import { proxyToFastAPI } from "@/lib/bff";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ encounterId: string; diagnosisId: string }> }
) {
  const { encounterId, diagnosisId } = await params;
  return proxyToFastAPI(request, `/api/encounters/${encounterId}/diagnoses/${diagnosisId}`);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ encounterId: string; diagnosisId: string }> }
) {
  const { encounterId, diagnosisId } = await params;
  return proxyToFastAPI(request, `/api/encounters/${encounterId}/diagnoses/${diagnosisId}`);
}
