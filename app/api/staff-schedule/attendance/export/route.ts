import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const FASTAPI_URL = process.env.FASTAPI_URL ?? "http://127.0.0.1:8000";

export async function GET(req: NextRequest) {
  // 1. Auth — validate user + session
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

  // 2. Build upstream URL — forward query string (date range params)
  const qs = req.nextUrl.searchParams.toString();
  const upstreamUrl = `${FASTAPI_URL}/api/staff-schedule/attendance/export/${qs ? `?${qs}` : ""}`;

  // 3. Fetch from FastAPI — stream directly, do NOT parse JSON
  try {
    const upstream = await fetch(upstreamUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
      signal: AbortSignal.timeout(30_000), // CSV export can be slow
    });

    if (!upstream.ok) {
      const errorText = await upstream.text();
      return new NextResponse(errorText, { status: upstream.status });
    }

    // 4. Forward the streaming body with CSV headers preserved
    return new NextResponse(upstream.body, {
      status: 200,
      headers: {
        "Content-Type":
          upstream.headers.get("Content-Type") ?? "text/csv; charset=utf-8",
        "Content-Disposition":
          upstream.headers.get("Content-Disposition") ??
          'attachment; filename="attendance.csv"',
      },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      return NextResponse.json({ error: "Gateway Timeout" }, { status: 504 });
    }
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { detail: "Internal server error", debug: msg },
      { status: 500 }
    );
  }
}
