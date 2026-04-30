/**
 * Twilio webhook BFF passthrough.
 *
 * Twilio signs over the public URL + form body. We forward the raw body and
 * X-Twilio-Signature unchanged. FastAPI re-validates using X-Forwarded-Host
 * to reconstruct the URL Twilio originally signed (RESEARCH Pitfall 1).
 *
 * Adds X-Webhook-Internal HMAC seal so a bypass of Vercel cannot directly
 * invoke FastAPI's webhook routes.
 */
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";          // raw body needed
export const dynamic = "force-dynamic";   // no caching

export async function POST(request: NextRequest) {
  const FASTAPI_URL = process.env.FASTAPI_URL ?? "http://127.0.0.1:8000";
  const internal = process.env.WEBHOOK_INTERNAL_SECRET;
  if (!internal) {
    return new NextResponse("server misconfigured", { status: 500 });
  }
  const sig = request.headers.get("X-Twilio-Signature") ?? "";
  const body = await request.text();

  const upstream = await fetch(`${FASTAPI_URL}/api/webhooks/twilio`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Twilio-Signature": sig,
      "X-Webhook-Internal": internal,
      "X-Forwarded-Host": request.nextUrl.host,
      "X-Forwarded-Proto": request.nextUrl.protocol.replace(":", ""),
    },
    body,
  });

  return new NextResponse(await upstream.text(), {
    status: upstream.status,
    headers: { "Content-Type": upstream.headers.get("Content-Type") ?? "application/json" },
  });
}
