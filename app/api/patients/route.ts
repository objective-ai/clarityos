/**
 * BFF proxy: GET /api/patients (list + search) and POST /api/patients (create)
 *
 * Proxies to FastAPI backend with Supabase auth.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const FASTAPI_URL = process.env.FASTAPI_URL ?? "http://localhost:8000";

async function getAuthHeader(): Promise<string | null> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ? `Bearer ${session.access_token}` : null;
}

export async function GET(request: NextRequest) {
  const auth = await getAuthHeader();
  if (!auth) {
    return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const params = new URLSearchParams();
  if (searchParams.get("search")) params.set("search", searchParams.get("search")!);
  params.set("limit", searchParams.get("limit") ?? "20");
  params.set("offset", searchParams.get("offset") ?? "0");

  const res = await fetch(`${FASTAPI_URL}/api/patients?${params.toString()}`, {
    headers: { Authorization: auth },
    signal: AbortSignal.timeout(10_000),
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function POST(request: NextRequest) {
  const auth = await getAuthHeader();
  if (!auth) {
    return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
  }

  const body = await request.json();

  const res = await fetch(`${FASTAPI_URL}/api/patients`, {
    method: "POST",
    headers: {
      Authorization: auth,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
