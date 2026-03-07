import { NextRequest } from "next/server";
import { proxyToFastAPI } from "@/lib/bff";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ patientId: string; problemId: string }> }
) {
  const { patientId, problemId } = await params;
  return proxyToFastAPI(request, `/api/patients/${patientId}/problems/${problemId}`);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ patientId: string; problemId: string }> }
) {
  const { patientId, problemId } = await params;
  return proxyToFastAPI(request, `/api/patients/${patientId}/problems/${problemId}`);
}
