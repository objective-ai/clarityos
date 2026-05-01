/**
 * BFF proxy for GET /api/messaging/compliance-report (Plan 12-10, CRM-16).
 * Streams the PDF binary back to the browser as an attachment.
 *
 * proxyToFastAPI buffers JSON, so this route hand-rolls the upstream call
 * to preserve binary content (mirrors the Phase 10.4 CSV streaming pattern).
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const FASTAPI_URL = process.env.FASTAPI_URL ?? "http://127.0.0.1:8000";

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    return NextResponse.json({ error: "No active session" }, { status: 401 });
  }

  const url = new URL(request.url);
  const upstream = await fetch(
    `${FASTAPI_URL}/api/messaging/compliance-report/?${url.searchParams.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    },
  );

  if (!upstream.ok) {
    const body = await upstream.text();
    return new NextResponse(body, {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "application/json",
      },
    });
  }

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: {
      "Content-Type":
        upstream.headers.get("content-type") ?? "application/pdf",
      "Content-Disposition":
        upstream.headers.get("content-disposition") ?? "",
    },
  });
}
