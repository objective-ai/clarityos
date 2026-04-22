/**
 * tests/unit/sentry-errors-proxy.test.ts
 *
 * Unit tests for app/api/system/errors/route.ts (BFF Sentry proxy).
 *
 * NOTE on frontmatter drift: plan 10.3-05 originally declared this file
 * as backend/tests/test_sentry_errors_proxy.py. The actual implementation
 * under test is TypeScript (a Next.js route handler), so a Python pytest
 * is the wrong tool. We relocated the file to tests/unit/ per vitest's
 * include glob (tests slash star-star slash star.test.ts). Summary captures
 * this deviation.
 *
 * Run: npx vitest run tests/unit/sentry-errors-proxy.test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────
// createServerSupabaseClient needs to be mockable per-test. We use
// vi.mock with a factory that references a mutable holder so each test
// can swap the return shape.
const supabaseHolder = {
  user: null as unknown,
};

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: supabaseHolder.user } }),
    },
  }),
}));

// Helper to import the route AFTER env + mocks are configured.
// vi.resetModules() in beforeEach ensures a fresh module (and fresh cache) each test.
async function loadRoute() {
  return import("../../app/api/system/errors/route");
}

function fakeReq(): any {
  return {} as any;
}

// ── Env setup ────────────────────────────────────────────────────────────
beforeEach(() => {
  vi.resetModules(); // fresh module = fresh cache; replaces __resetCache()
  vi.restoreAllMocks();
  process.env.SENTRY_ORG = "org";
  process.env.SENTRY_PROJECT = "proj";
  process.env.SENTRY_API_TOKEN = "SECRET_TOKEN_ABC";
  supabaseHolder.user = { app_metadata: { role: "OWNER" } };
});

afterEach(() => {
  delete process.env.SENTRY_ORG;
  delete process.env.SENTRY_PROJECT;
  delete process.env.SENTRY_API_TOKEN;
});

// ── Tests ────────────────────────────────────────────────────────────────

describe("system/errors BFF proxy — OWNER gate", () => {
  it("returns 403 when no session", async () => {
    supabaseHolder.user = null;
    const { GET } = await loadRoute();
    const res = await GET(fakeReq());
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toEqual({ error: "forbidden" });
  });

  it("returns 403 for non-OWNER role (e.g. doctor)", async () => {
    supabaseHolder.user = { app_metadata: { role: "doctor" } };
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { GET } = await loadRoute();
    const res = await GET(fakeReq());
    expect(res.status).toBe(403);
    // OWNER gate must short-circuit BEFORE any Sentry fetch.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("allows OWNER role through to the upstream", async () => {
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      json: async () => [],
    }));
    vi.stubGlobal("fetch", fetchSpy);
    const { GET } = await loadRoute();
    const res = await GET(fakeReq());
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe("system/errors BFF proxy — 20s cache", () => {
  it("caches for 20 seconds: upstream called once across two calls within window", async () => {
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      json: async () => [
        {
          id: "1",
          title: "oops",
          count: 3,
          userCount: 2,
          lastSeen: "2026-04-21T00:00:00Z",
          firstSeen: "2026-04-20T00:00:00Z",
          permalink: "https://sentry.io/x",
        },
      ],
    }));
    vi.stubGlobal("fetch", fetchSpy);
    const { GET } = await loadRoute();

    const r1 = await GET(fakeReq());
    const r2 = await GET(fakeReq());

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const b1 = await r1.json();
    const b2 = await r2.json();
    expect(b1.cached).toBe(false);
    expect(b2.cached).toBe(true);
    expect(b2.issues).toHaveLength(1);
  });

  it("re-fetches after cache TTL expires (21s later)", async () => {
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      json: async () => [],
    }));
    vi.stubGlobal("fetch", fetchSpy);
    const nowSpy = vi.spyOn(Date, "now");
    nowSpy.mockReturnValue(1_000_000);

    const { GET } = await loadRoute();
    await GET(fakeReq());
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Advance 21s.
    nowSpy.mockReturnValue(1_000_000 + 21_000);
    await GET(fakeReq());
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});

describe("system/errors BFF proxy — token safety", () => {
  it("never includes SENTRY_API_TOKEN in the response body", async () => {
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      json: async () => [],
    }));
    vi.stubGlobal("fetch", fetchSpy);
    const { GET } = await loadRoute();

    const res = await GET(fakeReq());
    const text = await res.text();
    expect(text).not.toContain("SECRET_TOKEN_ABC");
    expect(text).not.toContain("Bearer");
  });

  it("sends Bearer token in upstream Authorization header (server-side only)", async () => {
    const fetchSpy = vi.fn(async (_url: string, init: RequestInit) => ({
      ok: true,
      json: async () => [],
      __seenAuth: (init.headers as Record<string, string>).Authorization,
    }));
    vi.stubGlobal("fetch", fetchSpy);
    const { GET } = await loadRoute();
    await GET(fakeReq());

    const call = fetchSpy.mock.calls[0];
    const headers = (call[1] as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer SECRET_TOKEN_ABC");
  });
});

describe("system/errors BFF proxy — upstream failure handling", () => {
  it("returns 200 + empty issues + x-sentry-upstream-status on Sentry 5xx", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 503,
        json: async () => ({}),
      }))
    );
    const { GET } = await loadRoute();
    const res = await GET(fakeReq());
    expect(res.status).toBe(200);
    expect(res.headers.get("x-sentry-upstream-status")).toBe("503");
    const body = await res.json();
    expect(body.issues).toEqual([]);
    expect(body.cached).toBe(false);
  });

  it("returns not-configured header when env vars missing", async () => {
    delete process.env.SENTRY_API_TOKEN;
    const { GET } = await loadRoute();
    const res = await GET(fakeReq());
    expect(res.status).toBe(200);
    expect(res.headers.get("x-sentry-upstream-status")).toBe("not-configured");
  });
});
