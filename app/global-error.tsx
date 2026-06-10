"use client";

// Catches a crash in the minimal root layout itself. It REPLACES the root
// layout, so it must render its own <html>/<body> and cannot rely on app
// fonts/Tailwind layers → inline styles. (getAppData() now lives in
// app/(app)/layout.tsx, so a DB-unreachable failure bubbles to the root
// error.tsx instead of here.) Only fires in a production build (dev shows the
// Next overlay).
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          display: "grid",
          placeItems: "center",
          minHeight: "100vh",
          margin: 0,
          background: "#f7f3ee",
          color: "#2b2420",
        }}
      >
        <main style={{ textAlign: "center", padding: "2rem", maxWidth: "28rem" }}>
          <h1 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>Something spilled.</h1>
          <p style={{ opacity: 0.75, marginBottom: "1.5rem" }}>
            We couldn&rsquo;t load Cortado just now. Your data is safe &mdash; this one&rsquo;s on us.
          </p>
          <button
            onClick={() => reset()}
            style={{
              padding: "0.6rem 1.2rem",
              borderRadius: "999px",
              border: "none",
              background: "#7a4f2a",
              color: "white",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
