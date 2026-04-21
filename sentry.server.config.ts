import * as Sentry from "@sentry/nextjs";
import { scrubEvent } from "@/lib/sentry/phi-scrubber";

const dsn = process.env.SENTRY_DSN;
// On Vercel server-side, VERCEL_ENV is the non-public flag (same values).
const vercelEnv = process.env.VERCEL_ENV ?? process.env.NEXT_PUBLIC_VERCEL_ENV;

if (dsn && vercelEnv === "production") {
  Sentry.init({
    dsn,
    environment: "production",
    release:
      process.env.VERCEL_GIT_COMMIT_SHA ??
      process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
    tracesSampleRate: 0.0,
    ignoreErrors: ["NEXT_REDIRECT"],
    beforeSend(event, hint) {
      return scrubEvent(event as any, hint as any) as any;
    },
  });
}
