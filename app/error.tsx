"use client";

// Catches errors thrown in a page/segment BELOW the root layout. (The root-layout
// crash itself is handled by global-error.tsx.) Renders inside the root layout, so
// it can use the app's Tailwind theme tokens.
export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="grid min-h-[60vh] place-items-center px-6 text-center">
      <div className="max-w-md">
        <h1 className="mb-2 text-2xl font-semibold">Something went wrong.</h1>
        <p className="mb-6 text-muted-foreground">This page hit a snag. Give it another try.</p>
        <button onClick={() => reset()} className="rounded-full bg-primary px-5 py-2 text-primary-foreground">
          Try again
        </button>
      </div>
    </main>
  );
}
