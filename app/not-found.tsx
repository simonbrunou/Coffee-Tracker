import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-[60vh] place-items-center px-6 text-center">
      <div className="max-w-md">
        <h1 className="mb-2 text-2xl font-semibold">Page not found</h1>
        <p className="mb-6 text-muted-foreground">That page has wandered off. Let&rsquo;s get you back.</p>
        <Link href="/" className="rounded-full bg-primary px-5 py-2 text-primary-foreground">
          Back to Cortado
        </Link>
      </div>
    </main>
  );
}
