# Deferred Items — Phase 10.3

## Pre-existing TypeScript errors (out of scope for 10.3-02)

Discovered during Task 3 tsc verification. Not caused by Sentry wire-up — these were present on `main` before 10.3-02:

- `lib/scheduleUtils.test.ts` — multiple TS2345 errors: `checkedInAt` missing from `Pick<Appointment, "status" | "startTime" | "checkedInAt">` test fixtures. Test file stale relative to `Appointment` type evolution.
  - **Owner:** Phase 10.4 follow-up or dedicated test-debt plan
  - **Not fixed here** because this plan's scope is Sentry wiring only

## Parallel-wave dependency (expected)

- `@/lib/sentry/phi-scrubber` import resolves only after Plan 10.3-01 lands.
  - Plan 10.3-02 sentry.{client,server,edge}.config.ts import the module with the interface documented in the plan (`scrubEvent`).
  - Until 10.3-01 lands, `npx tsc --noEmit` reports 3× `TS2307: Cannot find module '@/lib/sentry/phi-scrubber'` errors in sentry configs.
  - **Expected** per plan's parallel-wave coordination; final phase verification covers this.
