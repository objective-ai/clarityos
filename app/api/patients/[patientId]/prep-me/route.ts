import { NextRequest } from "next/server";
import { proxyToFastAPI } from "@/lib/bff";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ patientId: string }> }
) {
  const { patientId } = await params;
  return proxyToFastAPI(request, `/api/patients/${patientId}/prep-me`, {
    timeout: 30_000,
  });
}
