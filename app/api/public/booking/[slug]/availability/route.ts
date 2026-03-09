import { NextRequest, NextResponse } from "next/server";

const FASTAPI_URL = process.env.FASTAPI_URL ?? "http://127.0.0.1:8000";

/** GET — available time slots for a date/provider/type (public, no auth) */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const qs = request.nextUrl.search; // includes leading '?'
  try {
    const res = await fetch(
      `${FASTAPI_URL}/api/public/booking/${slug}/availability/${qs}`,
      { signal: AbortSignal.timeout(10_000) }
    );
    const data = await res.json().catch(() => null);
    return NextResponse.json(data ?? { error: "Empty response" }, {
      status: res.status,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[BFF] GET /api/public/booking/${slug}/availability:`, msg);
    return NextResponse.json({ detail: "Internal server error" }, { status: 500 });
  }
}
