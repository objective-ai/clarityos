import Link from "next/link";

/**
 * app/not-found.tsx — Global 404 page
 *
 * Uses hardcoded color fallbacks alongside CSS variables so the page
 * renders correctly even when custom properties haven't loaded.
 */
export default function NotFound() {
  return (
    <div className="min-h-screen bg-[var(--bg-base,#0a0a0f)] flex items-center justify-center px-4">
      {/* Ambient gradient */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[350px] bg-[var(--accent,#2dd4bf)] opacity-[0.04] blur-[120px] rounded-full" />
      </div>

      <div className="relative z-10 text-center max-w-xs">
        {/* Icon — intentionally small */}
        <div className="mx-auto mb-5 w-12 h-12 rounded-xl bg-[var(--accent,#2dd4bf)]/10 border border-[var(--accent,#2dd4bf)]/20 flex items-center justify-center">
          <svg
            className="w-6 h-6"
            style={{ color: "var(--accent, #2dd4bf)" }}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
            />
          </svg>
        </div>

        <h1
          className="text-3xl font-bold mb-1.5"
          style={{ color: "var(--text-primary, #f1f1f1)" }}
        >
          404
        </h1>
        <p
          className="text-sm mb-6"
          style={{ color: "var(--text-secondary, #a1a1aa)" }}
        >
          This page doesn&apos;t exist or has been moved.
        </p>

        <Link
          href="/"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-white text-sm font-semibold hover:brightness-110 transition-all no-underline"
          style={{ backgroundColor: "var(--accent, #2dd4bf)" }}
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M10 19l-7-7m0 0l7-7m-7 7h18"
            />
          </svg>
          Go Home
        </Link>
      </div>
    </div>
  );
}
