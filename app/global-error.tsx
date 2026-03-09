"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#0a0a0f", color: "#e5e7eb" }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "100vh",
            fontFamily: "system-ui, -apple-system, sans-serif",
            padding: "1.5rem",
          }}
        >
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              background: "rgba(45, 212, 191, 0.08)",
              border: "1px solid rgba(45, 212, 191, 0.15)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 24,
              fontSize: 28,
            }}
          >
            !
          </div>
          <h2
            style={{
              fontSize: "1.25rem",
              fontWeight: 600,
              marginBottom: 8,
            }}
          >
            Something went wrong
          </h2>
          <p
            style={{
              fontSize: "0.875rem",
              color: "#9ca3af",
              marginBottom: 24,
            }}
          >
            An unexpected error occurred. Please try again.
          </p>
          <button
            onClick={reset}
            style={{
              padding: "0.625rem 1.25rem",
              borderRadius: 8,
              border: "none",
              background: "#2dd4bf",
              color: "#fff",
              fontSize: "0.875rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try Again
          </button>
        </div>
      </body>
    </html>
  );
}
