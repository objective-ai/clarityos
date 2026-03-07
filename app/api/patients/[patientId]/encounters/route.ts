import { NextRequest } from "next/server";
import { proxyToFastAPI } from "@/lib/bff";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ patientId: string }> }
) {
  const { patientId } = await params;
  return proxyToFastAPI(request, `/api/patients/${patientId}/encounters/`);
}
