import { NextRequest } from "next/server";
import { proxyToFastAPI } from "@/lib/bff";

export async function GET(
  req: NextRequest,
  { params }: { params: { staffId: string } }
) {
  return proxyToFastAPI(req, `/api/staff-schedule/${params.staffId}/schedule/`);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { staffId: string } }
) {
  return proxyToFastAPI(req, `/api/staff-schedule/${params.staffId}/schedule/`);
}
