/**
 * BFF proxy: GET /api/patients/:id (detail) and PATCH /api/patients/:id (update)
 *
 * Also proxies encounter timeline and flowsheet sub-resources.
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ patientId: string }> }
) {
  const auth = await getAuthHeader();
  if (!auth) {
    return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
  }

  const { patientId } = await params;

  // Check if this is a sub-resource request (encounters, flowsheet)
  const { searchParams } = new URL(request.url);
  const subResource = searchParams.get("sub");

  let url = `${FASTAPI_URL}/api/patients/${patientId}`;
  if (subResource === "encounters") {
    url = `${FASTAPI_URL}/api/patients/${patientId}/encounters`;
  } else if (subResource === "flowsheet") {
    url = `${FASTAPI_URL}/api/patients/${patientId}/flowsheet`;
  }

  const res = await fetch(url, {
    headers: { Authorization: auth },
    signal: AbortSignal.timeout(10_000),
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ patientId: string }> }
) {
  const auth = await getAuthHeader();
  if (!auth) {
    return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
  }

  const { patientId } = await params;
  const body = await request.json();

  const res = await fetch(`${FASTAPI_URL}/api/patients/${patientId}`, {
    method: "PATCH",
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

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ patientId: string }> }
) {
  const auth = await getAuthHeader();
  if (!auth) {
    return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
  }

  const { patientId } = await params;

  const res = await fetch(`${FASTAPI_URL}/api/patients/${patientId}`, {
    method: "DELETE",
    headers: { Authorization: auth },
    signal: AbortSignal.timeout(10_000),
  });

  if (res.status === 204) {
    return new NextResponse(null, { status: 204 });
  }

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
