import { createServerSupabaseClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

/**
 * Plan 15-08 (POS-04) — daily-close export (PDF or CSV).
 *
 * Forwards ``?format=pdf|csv`` to FastAPI and streams the resulting binary
 * (or text/csv) body. Uses raw fetch + arrayBuffer — proxyToFastAPI would
 * JSON-decode the response.
 */
const FASTAPI_URL = process.env.FASTAPI_URL ?? "http://127.0.0.1:8000";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const qs = request.nextUrl.searchParams.toString();
  const upstream = `${FASTAPI_URL}/api/pos/daily-close/${runId}/export/${qs ? `?${qs}` : ""}`;
  let res: Response;
  try {
    res = await fetch(upstream, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to reach daily-close export service" },
      { status: 502 },
    );
  }

  if (!res.ok) {
    const err = await res
      .json()
      .catch(() => ({ detail: "Daily-close export failed" }));
    return NextResponse.json(err, { status: res.status });
  }

  const buffer = await res.arrayBuffer();
  return new NextResponse(buffer, {
    headers: {
      "Content-Type":
        res.headers.get("Content-Type") ?? "application/octet-stream",
      "Content-Disposition":
        res.headers.get("Content-Disposition") ??
        `attachment; filename="daily-close-${runId.slice(0, 8)}"`,
    },
  });
}
