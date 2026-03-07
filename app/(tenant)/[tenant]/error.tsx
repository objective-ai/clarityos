"use client";

export default function TenantError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
      <h2 className="text-heading text-[var(--text-primary)]">Something went wrong</h2>
      <p className="text-body text-[var(--text-secondary)]">{error.message}</p>
      <button
        onClick={reset}
        className="px-4 py-2 rounded-xl bg-[var(--accent)] text-[var(--text-inverse)] text-sm font-medium"
      >
        Try again
      </button>
    </div>
  );
}
