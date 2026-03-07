import { NextRequest, NextResponse } from "next/server";
import { proxyToFastAPI } from "@/lib/bff";

export async function POST(request: NextRequest) {
  // Must parse body to extract encounterId for the backend URL
  const body = await request.clone().json();
  const { encounterId } = body;

  if (!encounterId) {
    return NextResponse.json(
      { error: "encounterId is required" },
      { status: 400 }
    );
  }

  return proxyToFastAPI(
    request,
    `/api/encounters/${encounterId}/ai-scribe/accept`
  );
}
