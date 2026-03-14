import { createServerSupabaseClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

/**
 * Binary BFF route for CMS-1500 PDF download.
 * Uses raw fetch() + arrayBuffer() — NOT proxyToFastAPI (which corrupts binary).
 */

const FASTAPI_URL = process.env.FASTAPI_URL ?? "http://127.0.0.1:8000";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ encounterId: string }> },
) {
  const { encounterId } = await params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const upstream = `${FASTAPI_URL}/api/encounters/${encounterId}/superbill/pdf/`;
  let res: Response;
  try {
    res = await fetch(upstream, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to reach billing service" },
      { status: 502 },
    );
  }

  if (!res.ok) {
    const err = await res
      .json()
      .catch(() => ({ detail: "PDF generation failed" }));
    return NextResponse.json(err, { status: res.status });
  }

  const buffer = await res.arrayBuffer();
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="claim-${encounterId.slice(0, 8)}.pdf"`,
    },
  });
}
