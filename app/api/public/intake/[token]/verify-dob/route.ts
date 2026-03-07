import { NextRequest, NextResponse } from "next/server";

const FASTAPI_URL = process.env.FASTAPI_URL ?? "http://127.0.0.1:8000";

/** POST — verify patient DOB to unlock intake form (public, no auth) */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  try {
    const res = await fetch(
      `${FASTAPI_URL}/api/public/intake/${token}/verify-dob/`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: await request.text(),
        signal: AbortSignal.timeout(10_000),
      }
    );
    const data = await res.json().catch(() => null);
    return NextResponse.json(data ?? { error: "Empty response" }, {
      status: res.status,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[BFF] POST /api/public/intake/${token}/verify-dob:`, msg);
    return NextResponse.json({ detail: "Internal server error" }, { status: 500 });
  }
}
