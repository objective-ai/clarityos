import * as Sentry from "@sentry/nextjs";
import { scrubEvent } from "@/lib/sentry/phi-scrubber";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
const vercelEnv = process.env.NEXT_PUBLIC_VERCEL_ENV;

// Prod-only: Vercel sets NEXT_PUBLIC_VERCEL_ENV to 'production' | 'preview' | 'development'.
// Init is suppressed in dev AND preview to avoid capturing synthetic PHI from test fixtures.
if (dsn && vercelEnv === "production") {
  Sentry.init({
    dsn,
    environment: "production",
    release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
    tracesSampleRate: 0.0,
    replaysSessionSampleRate: 0.0,
    replaysOnErrorSampleRate: 0.0,
    ignoreErrors: ["NEXT_REDIRECT"],
    beforeSend(event, hint) {
      return scrubEvent(event as any, hint as any) as any;
    },
  });
}
