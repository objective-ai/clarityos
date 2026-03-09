import { NextRequest, NextResponse } from "next/server";

const FASTAPI_URL = process.env.FASTAPI_URL ?? "http://127.0.0.1:8000";

/** GET — clinic info + providers + bookable types (public, no auth) */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  try {
    const res = await fetch(`${FASTAPI_URL}/api/public/booking/${slug}/info/`, {
      signal: AbortSignal.timeout(10_000),
    });
    const data = await res.json().catch(() => null);
    return NextResponse.json(data ?? { error: "Empty response" }, {
      status: res.status,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[BFF] GET /api/public/booking/${slug}/info:`, msg);
    return NextResponse.json({ detail: "Internal server error" }, { status: 500 });
  }
}
