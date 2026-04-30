/**
 * Postmark webhook BFF passthrough.
 *
 * Postmark uses HTTP Basic Auth (no HMAC / no Svix). The browser never hits
 * this endpoint — Postmark posts directly to it. We forward the raw JSON body
 * + Authorization header to FastAPI, which calls verify_postmark_basic_auth.
 *
 * X-Webhook-Internal seal blocks anyone from hitting FastAPI directly.
 */
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const FASTAPI_URL = process.env.FASTAPI_URL ?? "http://127.0.0.1:8000";
  const internal = process.env.WEBHOOK_INTERNAL_SECRET;
  if (!internal) {
    return new NextResponse("server misconfigured", { status: 500 });
  }
  const auth = request.headers.get("Authorization") ?? "";
  const body = await request.text();

  const upstream = await fetch(`${FASTAPI_URL}/api/webhooks/postmark`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": auth,
      "X-Webhook-Internal": internal,
    },
    body,
  });

  return new NextResponse(await upstream.text(), {
    status: upstream.status,
    headers: { "Content-Type": upstream.headers.get("Content-Type") ?? "application/json" },
  });
}
