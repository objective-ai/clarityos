import { createServerSupabaseClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

/**
 * Phase 14 OPT14-06 — Binary BFF route for optical job-ticket PDF.
 *
 * Uses raw fetch() + arrayBuffer() — NOT proxyToFastAPI (which JSON-decodes
 * the body and corrupts binary streams). Mirrors the CMS-1500 superbill PDF
 * BFF at app/api/encounters/[encounterId]/superbill/pdf/route.ts.
 */

const FASTAPI_URL = process.env.FASTAPI_URL ?? "http://127.0.0.1:8000";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const { orderId } = await params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Trailing slash is mandatory — FastAPI 307s without it and the redirect
  // drops the Authorization header (.claude/rules/bff-api.md).
  const upstream = `${FASTAPI_URL}/api/optical-orders/${orderId}/job-ticket/`;
  let res: Response;
  try {
    res = await fetch(upstream, {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to reach optical service" },
      { status: 502 },
    );
  }

  if (!res.ok) {
    const err = await res
      .json()
      .catch(() => ({ detail: "Job ticket generation failed" }));
    return NextResponse.json(err, { status: res.status });
  }

  const buffer = await res.arrayBuffer();
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": res.headers.get("Content-Type") ?? "application/pdf",
      "Content-Disposition":
        res.headers.get("Content-Disposition") ??
        `attachment; filename="job-ticket-${orderId.slice(0, 8)}.pdf"`,
    },
  });
}
