import { NextRequest } from "next/server";
import { proxyToFastAPI } from "@/lib/bff";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ appointmentId: string }> }
) {
  const { appointmentId } = await params;
  return proxyToFastAPI(request, `/api/appointments/${appointmentId}/start-exam-phase`);
}
