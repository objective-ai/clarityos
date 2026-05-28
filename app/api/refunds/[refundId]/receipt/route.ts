import { createServerSupabaseClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

/**
 * Plan 15-08 (POS-10) — refund receipt PDF binary stream.
 */
const FASTAPI_URL = process.env.FASTAPI_URL ?? "http://127.0.0.1:8000";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ refundId: string }> },
) {
  const { refundId } = await params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const upstream = `${FASTAPI_URL}/api/refunds/${refundId}/receipt/`;
  let res: Response;
  try {
    res = await fetch(upstream, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to reach receipt service" },
      { status: 502 },
    );
  }

  if (!res.ok) {
    const err = await res
      .json()
      .catch(() => ({ detail: "Refund receipt generation failed" }));
    return NextResponse.json(err, { status: res.status });
  }

  const buffer = await res.arrayBuffer();
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": res.headers.get("Content-Type") ?? "application/pdf",
      "Content-Disposition":
        res.headers.get("Content-Disposition") ??
        `inline; filename="refund-receipt-${refundId.slice(0, 8)}.pdf"`,
    },
  });
}
