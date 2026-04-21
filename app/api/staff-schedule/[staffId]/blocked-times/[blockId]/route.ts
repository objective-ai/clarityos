import { NextRequest } from "next/server";
import { proxyToFastAPI } from "@/lib/bff";

export async function DELETE(
  req: NextRequest,
  { params }: { params: { staffId: string; blockId: string } }
) {
  return proxyToFastAPI(
    req,
    `/api/staff-schedule/${params.staffId}/blocked-times/${params.blockId}/`
  );
}
