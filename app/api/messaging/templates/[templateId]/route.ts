/**
 * BFF proxy for /api/messaging/templates/{templateId} (Phase 12-05).
 * PATCH: update body/subject. DELETE: soft-delete.
 */
import { NextRequest } from "next/server";
import { proxyToFastAPI } from "@/lib/bff";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { templateId: string } },
) {
  return proxyToFastAPI(req, `/api/messaging/templates/${params.templateId}/`);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { templateId: string } },
) {
  return proxyToFastAPI(req, `/api/messaging/templates/${params.templateId}/`);
}
