import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  hydrateFromSupabaseSession,
  __resetPlanFeaturesFallbackWarnedForTest,
} from "@/lib/auth/session-hydrator";
import type { Session } from "@supabase/supabase-js";

function makeJwt(appMetadata: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ app_metadata: appMetadata })).toString("base64url");
  const signature = "x".repeat(43);
  return `${header}.${payload}.${signature}`;
}

function makeSession(
  jwtAppMeta: Record<string, unknown>,
  envelopeAppMeta: Record<string, unknown> = jwtAppMeta
): Session {
  return {
    access_token: makeJwt(jwtAppMeta),
    refresh_token: "rt",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: "bearer",
    user: {
      id: "user-1",
      email: "test@example.com",
      app_metadata: envelopeAppMeta,
      user_metadata: { full_name: "Test User" },
      aud: "authenticated",
      created_at: new Date().toISOString(),
    },
  } as unknown as Session;
}

const baseTenantClaims = {
  tenant_id: "t-1",
  tenant_slug: "sunview",
  schema_name: "public",
  clinic_name: "Test Clinic",
  plan_name: "Premium",
  role: "owner",
  staff_id: "s-1",
};

describe("session-hydrator PLAN_FEATURES fallback diagnostic", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    __resetPlanFeaturesFallbackWarnedForTest();
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("emits exactly one console.warn when JWT entitlements are empty", () => {
    const session = makeSession({ ...baseTenantClaims, entitlements: [] });
    hydrateFromSupabaseSession(session);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toMatch(/\[session-hydrator\]/);
    expect(warnSpy.mock.calls[0][0]).toMatch(/PLAN_FEATURES\[Premium\]/);
    expect(warnSpy.mock.calls[0][0]).toMatch(/debugging_supabase_jwt_entitlements\.md/);
  });

  it("emits exactly one console.warn when entitlements key is missing entirely", () => {
    const session = makeSession({ ...baseTenantClaims }, { ...baseTenantClaims });
    hydrateFromSupabaseSession(session);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("does NOT emit warn when JWT entitlements is non-empty", () => {
    const session = makeSession({
      ...baseTenantClaims,
      entitlements: ["retail_pos", "ai_scribe"],
    });
    hydrateFromSupabaseSession(session);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("only warns once even across multiple hydrate calls with empty entitlements", () => {
    const session = makeSession({ ...baseTenantClaims, entitlements: [] });
    hydrateFromSupabaseSession(session);
    hydrateFromSupabaseSession(session);
    hydrateFromSupabaseSession(session);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("returned AppSession.tenant.entitlements falls back to PLAN_FEATURES[Premium]", () => {
    const session = makeSession({ ...baseTenantClaims, entitlements: [] });
    const app = hydrateFromSupabaseSession(session);
    // Premium plan includes ai_scribe but NOT retail_pos
    expect(app.tenant.entitlements.has("ai_scribe")).toBe(true);
    expect(app.tenant.entitlements.has("retail_pos")).toBe(false);
  });
});
