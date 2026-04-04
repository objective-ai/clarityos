import { NextRequest, NextResponse } from "next/server";

const FASTAPI_URL = process.env.FASTAPI_URL ?? "http://127.0.0.1:8000";

/** POST — create patient + appointment + intake token (public, no auth) */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  try {
    const res = await fetch(`${FASTAPI_URL}/api/public/booking/${slug}/book/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: await request.text(),
      signal: AbortSignal.timeout(30_000),
    });
    const data = await res.json().catch(() => null);

    // Rewrite intake_url: backend builds it with its own base URL (:8000).
    // Replace with the frontend origin so the link works in prod and dev.
    if (data?.intake_url) {
      try {
        const backendPath = new URL(data.intake_url).pathname;
        const appUrl = process.env.NEXT_PUBLIC_APP_URL;
        const appOrigin = appUrl ? new URL(appUrl).origin : new URL(request.url).origin;
        data.intake_url = `${appOrigin}${backendPath}`;
      } catch {
        // keep as-is if URL parsing fails
      }
    }

    return NextResponse.json(data ?? { error: "Empty response" }, {
      status: res.status,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[BFF] POST /api/public/booking/${slug}/book:`, msg);
    return NextResponse.json({ detail: "Internal server error" }, { status: 500 });
  }
}
