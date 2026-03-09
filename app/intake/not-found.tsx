import Link from "next/link";

/**
 * app/intake/not-found.tsx
 *
 * Patient-friendly 404 for expired / invalid intake links.
 * Uses inline styles + Tailwind so it renders correctly even if
 * CSS custom-properties haven't loaded yet.
 */
export default function IntakeNotFound() {
  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center px-4">
      {/* Ambient glow */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[350px] bg-teal-400 opacity-[0.04] blur-[120px] rounded-full" />
      </div>

      <div className="relative z-10 w-full max-w-sm text-center">
        {/* Icon */}
        <div className="mx-auto mb-5 w-12 h-12 rounded-xl bg-teal-400/10 border border-teal-400/20 flex items-center justify-center">
          <svg
            className="w-6 h-6 text-teal-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
            />
          </svg>
        </div>

        {/* Card */}
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-md p-6 shadow-lg">
          <h1 className="text-lg font-semibold text-white mb-1.5">
            Link Expired
          </h1>
          <p className="text-sm text-gray-400 leading-relaxed mb-5">
            This intake link is no longer valid. It may have expired or already
            been completed.
          </p>

          <div className="rounded-lg bg-white/[0.04] border border-white/[0.06] px-4 py-3 text-left">
            <p className="text-xs font-medium text-gray-300 mb-1">
              What you can do
            </p>
            <ul className="text-xs text-gray-500 space-y-1">
              <li className="flex items-start gap-2">
                <span className="text-teal-400 mt-0.5">&#8226;</span>
                Contact your clinic to request a new link
              </li>
              <li className="flex items-start gap-2">
                <span className="text-teal-400 mt-0.5">&#8226;</span>
                Check your email or SMS for the latest link
              </li>
            </ul>
          </div>
        </div>

        <p className="text-[11px] text-gray-600 mt-5">
          Your information is encrypted and protected under HIPAA.
        </p>
      </div>
    </div>
  );
}
